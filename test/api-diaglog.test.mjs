import fs from 'fs'
import path from 'path'
import util from 'util'
import assert from 'assert'
import { createRequire } from 'module'
import Sequelize from 'sequelize'
import was from '../src/WAutoSequelize.mjs'
import AutoSequelize from '../src/auto-sequelize.js'
import { mkDb, capture, settle, PW, USER, mkSecretErr, withShowAllTablesFail, withDescribeFail, withForeignKeysFail } from './tools/diagFixture.mjs'


//接線測試(診斷輸出與遮罩由wsemi之getDiag提供, 形態類案與reject/throw之站點見api-diaglog-wire): 確認本套件之各站點已接上、串流與回傳契約正確
//rulebook R1~R7: 診斷輸出(console)與SQL紀錄(opt.logging)之預設安全與可控, 以sqlite實跑WAutoSequelize
//  R1 sequelize實例一律明給logging(未給即false), 不得落回預設logger(console.log)
//  R2 預設只輸出標籤與不含個資之摘要(不含SQL、表名、錯誤原文、帳密、路徑); 成功路徑預設無任何console輸出
//  R3 opt.logging為true時每條sql交給診斷輸出, 預設只輸出敘述種類; opt.logDetail為true時console輸出(label, 遮罩後細節)(sql全文以console.log、錯誤副本以console.error), 帳號與密碼仍遮罩
//  R4 opt.funLog(label, safe, detail)取代console; 型別錯誤之選項忽略並用預設
//  R5 診斷輸出不得影響resolve/reject內容與時機
//  R7 回傳契約不變: 成功時之resolve值、模型檔內容、固定詞彙reject訊息、缺驅動之同步拋錯(建表清單、描述表與外鍵查詢失敗自R10起reject, 見api-reject)


let golden = JSON.parse(fs.readFileSync(new URL('./tools/golden-contract.json', import.meta.url), 'utf8'))
let require = createRequire(import.meta.url)

let dir = path.resolve('./test/_tmp/api-diaglog')
let storage = ''
let nModels = 0


function getOpt(ex = {}) {
    nModels++
    return {
        database: storage,
        username: USER,
        password: PW,
        dialect: 'sqlite',
        directory: path.join(dir, `models-${nModels}`),
        port: 1,
        ...ex,
    }
}


function readModels(d) {
    let files = {}
    for (let f of fs.readdirSync(d).sort()) {
        files[f] = fs.readFileSync(path.join(d, f), 'utf8')
    }
    return files
}


function stmtOf(line) {
    //舊輸出行(log: Executing (default): SELECT ...)的敘述種類
    return line.replace(/^log: Executing \([^)]*\): /, '').match(/^[A-Za-z]+/)[0].toUpperCase()
}


//survive, 在指定失敗路徑下, funLog拋錯、回傳reject之promise、console.error拋錯皆不影響了結結果(失敗路徑為reject), 也不產生unhandledRejection; 回傳各次之{ isErr, v }(v為resolve值或reject值)
async function survive(withFail, optEx = {}) {
    let seen = []
    let onRej = (e) => seen.push(e)
    process.on('unhandledRejection', onRej)
    let results = []
    try {
        let funLogs = [() => {
            throw new Error('funLog boom')
        }, () => Promise.reject(new Error('async boom')), null]
        for (let funLog of funLogs) {
            let ex = funLog ? { ...optEx, funLog } : { ...optEx }
            let ks = ['log', 'info', 'warn', 'error', 'debug']
            let olds = ks.map((k) => console[k])
            if (!funLog) {
                ks.forEach((k) => {
                    console[k] = () => {
                        throw new Error('console boom')
                    }
                })
            }
            try {
                results.push(await withFail(() => was(getOpt(ex)).then((v) => ({ isErr: false, v }), (v) => ({ isErr: true, v }))))
            }
            finally {
                ks.forEach((k, i) => {
                    console[k] = olds[i]
                })
            }
        }
        await settle(60)
    }
    finally {
        process.off('unhandledRejection', onRej)
    }
    assert.deepStrictEqual(seen, [])
    return results
}


function assertNoLeak(lines, extra = []) {
    //輸出不含密碼、帳號(含帳號:密碼)與extra所列文字
    let s = lines.join('\n')
    for (let x of [PW, `${USER}:${PW}`, USER, ...extra]) {
        assert.ok(!s.includes(x), `輸出含 ${x}: ${s.slice(0, 400)}`)
    }
}


describe('api-diaglog', function() {
    this.timeout(60000)

    before(async function() {
        fs.rmSync(dir, { recursive: true, force: true })
        storage = await mkDb(dir)
    })

    after(function() {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    describe('R1 sequelize實例之日誌設定', function() {

        it('R1 AutoSequelize建立sequelize實例時未給logging者為false(不落回預設logger console.log)', async function() {
            let { res: auto, calls } = await capture(() => new AutoSequelize(storage, USER, PW, { dialect: 'sqlite' }))
            try {
                assert.strictEqual(auto.sequelize.options.logging, false)
                assert.deepStrictEqual(calls, [])
            }
            finally {
                await auto.sequelize.close()
            }
        })

        it('R1 AutoSequelize的logging只接受函數: 給true等非函數者一律落為false(不落回預設logger、不引發SEQUELIZE0002), 函數原樣', async function() {
            let seen = []
            let onWarn = (w) => seen.push(`${w.code || ''} ${w.message}`)
            process.on('warning', onWarn)
            try {
                for (let v of [true, 'x', 1, {}, null, undefined, false]) {
                    let { res: auto, lines } = await capture(() => new AutoSequelize(storage, USER, PW, { dialect: 'sqlite', logging: v }))
                    try {
                        assert.strictEqual(auto.sequelize.options.logging, false, String(v))
                        assert.deepStrictEqual(lines, [])
                    }
                    finally {
                        await auto.sequelize.close()
                    }
                }
                let fn = () => {}
                let { res: auto2 } = await capture(() => new AutoSequelize(storage, USER, PW, { dialect: 'sqlite', logging: fn }))
                try {
                    assert.strictEqual(auto2.sequelize.options.logging, fn)
                }
                finally {
                    await auto2.sequelize.close()
                }
                await settle(60)
            }
            finally {
                process.off('warning', onWarn)
            }
            assert.deepStrictEqual(seen.filter((x) => /SEQUELIZE|logging/i.test(x)), [])
        })

        it('R1 WAutoSequelize預設與logging:false時, 執行期間console無任何輸出(含sql)', async function() {
            for (let ex of [{}, { logging: false }]) {
                let { lines } = await capture(() => was(getOpt(ex)))
                assert.deepStrictEqual(lines, [], JSON.stringify(ex))
            }
        })

    })

    describe('R2 R7 預設安全且回傳契約不變', function() {

        it('R2 R7 預設: console無輸出; resolve值與模型檔內容與修前一致(golden)', async function() {
            let opt = getOpt()
            let { res, lines, isErr } = await capture(() => was(opt))
            assert.strictEqual(isErr, false)
            assert.deepStrictEqual(lines, [])
            assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
            assert.deepStrictEqual(readModels(opt.directory), golden.files)
        })

        it('R7 reject訊息不變且無console輸出: need database/username/password/dialect/port', async function() {
            let ex = [['database', 'need database'], ['username', 'need username'], ['password', 'need password'], ['dialect', 'need dialect'], ['port', 'need port']]
            for (let [k, msg] of ex) {
                let { err, isErr, lines } = await capture(() => was(getOpt({ [k]: null })))
                assert.strictEqual(isErr, true, k)
                assert.strictEqual(err, msg)
                assert.deepStrictEqual(lines, [], k)
            }
            let { err } = await capture(() => was())
            assert.strictEqual(err, 'need database')
        })

        it('R7 缺少資料庫驅動時仍同步拋出Error(建構sequelize時), 不改為reject, 且無console輸出', async function() {
            let miss = [['mysql', 'mysql2'], ['postgres', 'pg'], ['mariadb', 'mariadb']].find(([d, m]) => {
                try {
                    require.resolve(m)
                    return false
                }
                catch (e) {
                    return true
                }
            })
            if (!miss) {
                this.skip()
            }
            let threw = false
            let { err, isErr, lines } = await capture(() => {
                try {
                    return was(getOpt({ dialect: miss[0] }))
                }
                catch (e) {
                    threw = true
                    throw e
                }
            })
            assert.strictEqual(threw, true)
            assert.strictEqual(isErr, true)
            assert.ok(err instanceof Error)
            assert.ok(err.message.includes(miss[1]), err.message)
            assert.deepStrictEqual(lines, [])
        })

    })

    describe('R3 opt.logging', function() {

        it('R3 logging:true單獨: 每條sql只輸出敘述種類(console.log("sql", { stmt })), 無sql全文、表名', async function() {
            let { res, calls, lines } = await capture(() => was(getOpt({ logging: true })))
            assert.strictEqual(calls.length, golden.oldLines.length)
            for (let c of calls) {
                assert.strictEqual(c.m, 'log')
                assert.strictEqual(c.args.length, 2)
                assert.strictEqual(c.args[0], 'sql')
                assert.deepStrictEqual(Object.keys(c.args[1]), ['stmt'])
            }
            assert.deepStrictEqual(calls.map((c) => c.args[1].stmt).sort(), golden.oldLines.map(stmtOf).sort())
            let s = lines.join('\n')
            for (let x of ['Executing', 'users', 'depts', 'sqlite_master', 'FROM', 'foreign_key_list']) {
                assert.ok(!s.includes(x), `輸出含 ${x}`)
            }
            assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
        })

        it('R3 logging:true不再引發sequelize的logging:true棄用警告(SEQUELIZE0002)', async function() {
            let seen = []
            let onWarn = (w) => seen.push(`${w.code || ''} ${w.message}`)
            process.on('warning', onWarn)
            try {
                await capture(() => was(getOpt({ logging: true })))
                await settle(60)
            }
            finally {
                process.off('warning', onWarn)
            }
            assert.deepStrictEqual(seen.filter((x) => /SEQUELIZE|logging/i.test(x)), [])
        })

        it('R3 logging:true加logDetail:true: 每條sql全文交給console.log(\'sql\', sql全文), sql全文與修前逐條相同', async function() {
            let { calls } = await capture(() => was(getOpt({ logging: true, logDetail: true })))
            assert.ok(calls.every((c) => c.m === 'log' && c.args.length === 2 && c.args[0] === 'sql' && typeof c.args[1] === 'string'))
            assert.deepStrictEqual(calls.map((c) => `log: ${c.args[1]}`).sort(), [...golden.oldLines].sort())
        })

        it('R3 logDetail:true單獨(logging未開)不輸出sql: logging才決定是否紀錄sql', async function() {
            let { lines } = await capture(() => was(getOpt({ logDetail: true })))
            assert.deepStrictEqual(lines, [])
        })

    })

    describe('R4 opt.funLog 與選項型別', function() {

        it('R4 funLog搭配logging:true: 收(label, safe, detail)=(sql, { stmt }, sql全文), console無輸出', async function() {
            let got = []
            let { res, lines } = await capture(() => was(getOpt({ logging: true, funLog: (...a) => got.push(a) })))
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, golden.oldLines.length)
            for (let g of got) {
                assert.strictEqual(g.length, 3)
                assert.strictEqual(g[0], 'sql')
                assert.deepStrictEqual(Object.keys(g[1]), ['stmt'])
                assert.ok(g[2].startsWith('Executing ('), g[2])
            }
            assert.deepStrictEqual(got.map((g) => `log: ${g[2]}`).sort(), [...golden.oldLines].sort())
            assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
        })

        it('R4 funLog未開logging且成功路徑: 無診斷事件, 不被呼叫', async function() {
            let got = []
            let { lines } = await capture(() => was(getOpt({ funLog: (...a) => got.push(a) })))
            assert.deepStrictEqual(got, [])
            assert.deepStrictEqual(lines, [])
        })

        it('R4 型別錯誤之選項(logging、logDetail、funLog)忽略並用預設: 成功路徑無console輸出', async function() {
            for (let v of ['true', 1, {}, [], 'yes', null]) {
                let { res, lines, isErr } = await capture(() => was(getOpt({ logging: v, logDetail: v, funLog: v })))
                assert.strictEqual(isErr, false, String(v))
                assert.deepStrictEqual(lines, [], String(v))
                assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
            }
        })

        it('R4 讀取選項拋錯者忽略該選項(不使WAutoSequelize拋錯)', async function() {
            let opt = getOpt()
            for (let k of ['logging', 'logDetail', 'funLog']) {
                Object.defineProperty(opt, k, {
                    get() {
                        throw new Error('getter boom')
                    },
                    enumerable: true
                })
            }
            let { res, lines, isErr } = await capture(() => was(opt))
            assert.strictEqual(isErr, false)
            assert.deepStrictEqual(lines, [])
            assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
        })

        it('R4 診斷設定每次呼叫各自獨立: 一次呼叫的funLog、logDetail不影響其後的預設呼叫', async function() {
            let got = []
            await capture(() => was(getOpt({ logging: true, logDetail: true, funLog: (...a) => got.push(a) })))
            let n = got.length
            assert.ok(n > 0)
            let { lines } = await capture(() => was(getOpt()))
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, n)
        })

    })

    describe('R5 診斷輸出不影響流程', function() {

        it('R5 funLog拋錯、回傳reject之promise、console拋錯: resolve值不變, 不產生unhandledRejection', async function() {
            let seen = []
            let onRej = (e) => seen.push(e)
            process.on('unhandledRejection', onRej)
            try {
                for (let funLog of [() => {
                    throw new Error('funLog boom')
                }, () => Promise.reject(new Error('async boom'))]) {
                    let { res, isErr } = await capture(() => was(getOpt({ logging: true, funLog })))
                    assert.strictEqual(isErr, false)
                    assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
                }
                await settle(60)
            }
            finally {
                process.off('unhandledRejection', onRej)
            }
            assert.deepStrictEqual(seen, [])

            let ks = ['log', 'info', 'warn', 'error', 'debug']
            let olds = ks.map((k) => console[k])
            ks.forEach((k) => {
                console[k] = () => {
                    throw new Error('console boom')
                }
            })
            let res
            try {
                res = await was(getOpt({ logging: true, logDetail: true }))
            }
            finally {
                ks.forEach((k, i) => {
                    console[k] = olds[i]
                })
            }
            assert.deepStrictEqual(JSON.parse(JSON.stringify(res)), golden.res)
        })

    })

    describe('R2 R3 R4 R10 建表失敗(showAllTables): 修前以console.error輸出整個錯誤物件(其後以空結果resolve), 現輸出標籤與摘要並reject', function() {

        it('R2 R10 sqlite無法開檔(storage為資料夾, 真實驅動錯誤): 預設只輸出標籤與{ errType, errCode }(console.error), 並reject該錯誤', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let { err, calls, lines, isErr } = await capture(() => was(getOpt({ database: bad })))
            assert.strictEqual(isErr, true)
            assert.strictEqual(err.name, 'SequelizeConnectionError')
            assert.deepStrictEqual(calls, [{ m: 'error', args: ['tables catch', { errType: 'SequelizeConnectionError', errCode: 'SQLITE_CANTOPEN' }] }])
            let s = lines.join('\n')
            for (let x of ['unable to open', 'at Database', 'connection-manager', 'original', 'parent']) {
                assert.ok(!s.includes(x), `輸出含 ${x}`)
            }
        })

        it('R3 sqlite無法開檔: logDetail:true輸出console.error(\'tables catch\', 錯誤副本), 含原始訊息與original/parent', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let { isErr, calls } = await capture(() => was(getOpt({ database: bad, logDetail: true })))
            assert.strictEqual(isErr, true)
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].m, 'error')
            assert.strictEqual(calls[0].args.length, 2)
            assert.strictEqual(calls[0].args[0], 'tables catch')
            let e = calls[0].args[1]
            assert.ok(e instanceof Error)
            assert.ok(e.message.includes('SQLITE_CANTOPEN: unable to open database file'), e.message)
            assert.strictEqual(e.original.code, 'SQLITE_CANTOPEN')
            assert.strictEqual(e.parent.code, 'SQLITE_CANTOPEN')

            //副本經格式化後顯示類別名與原始訊息、original/parent之代碼
            let orig
            try {
                await new Sequelize({ dialect: 'sqlite', storage: bad, logging: false }).getQueryInterface().showAllTables()
            }
            catch (err) {
                orig = err
            }
            assert.ok(orig !== e && orig instanceof Error, '副本非原物件')
            let f = util.format(e)
            assert.ok(f.includes('SequelizeConnectionError') && f.includes('SQLITE_CANTOPEN: unable to open database file') && f.includes('original') && f.includes('parent'), f)
        })

        it('R4 失敗路徑上選項型別錯誤(logDetail非true、funLog非函數)亦忽略並用預設: 只輸出標籤與摘要', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            for (let v of ['true', 1, {}, 'yes']) {
                let { isErr, calls } = await capture(() => was(getOpt({ database: bad, logDetail: v, funLog: v })))
                assert.strictEqual(isErr, true, String(v))
                assert.deepStrictEqual(calls, [{ m: 'error', args: ['tables catch', { errType: 'SequelizeConnectionError', errCode: 'SQLITE_CANTOPEN' }] }], String(v))
            }
        })

        it('R1 R5 R10 AutoSequelize(內部類別)未給logErr時失敗路徑不輸出也不拋錯, 以該錯誤呼叫run之callback', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let { err, lines, isErr } = await capture(() => new Promise((resolve, reject) => {
                let auto = new AutoSequelize(bad, USER, PW, { dialect: 'sqlite', directory: path.join(dir, 'models-nolog') })
                auto.run((err) => {
                    if (err) {
                        reject(err)
                    }
                    else {
                        resolve({ tables: auto.tables, foreignKeys: auto.foreignKeys })
                    }
                })
            }))
            assert.strictEqual(isErr, true)
            assert.strictEqual(err.name, 'SequelizeConnectionError')
            assert.deepStrictEqual(lines, [])
        })

        it('R4 sqlite無法開檔: funLog收(label, safe, detail)=(tables catch, { errType, errCode }, 錯誤副本), console無輸出', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let got = []
            let { isErr, lines } = await capture(() => was(getOpt({ database: bad, funLog: (...a) => got.push(a) })))
            assert.strictEqual(isErr, true)
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][0], 'tables catch')
            assert.deepStrictEqual(got[0][1], { errType: 'SequelizeConnectionError', errCode: 'SQLITE_CANTOPEN' })
            assert.ok(got[0][2] instanceof Error)
            assert.ok(got[0][2].message.includes('SQLITE_CANTOPEN'))
        })

        it('R2 R6 錯誤文字夾帶帳密: 預設輸出不含密碼、帳號、錯誤原文', async function() {
            let { isErr, calls, lines } = await withShowAllTablesFail(() => capture(() => was(getOpt())))
            assert.strictEqual(isErr, true)
            assert.deepStrictEqual(calls, [{ m: 'error', args: ['tables catch', { errType: 'Error', errCode: 'ELOGIN' }] }])
            assertNoLeak(lines, ['Login failed', 'db.local'])
        })

        it('R3 R6 錯誤文字夾帶帳密: logDetail:true輸出細節(含訊息、屬性、鍵), 帳號與密碼(含屬性值、屬性鍵、Symbol描述、連線字串)皆以***遮罩', async function() {
            let { calls, lines } = await withShowAllTablesFail(() => capture(() => was(getOpt({ logDetail: true }))))
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].m, 'error')
            assert.strictEqual(calls[0].args.length, 2)
            assert.strictEqual(calls[0].args[0], 'tables catch')
            let e = calls[0].args[1]
            assert.ok(e instanceof Error)
            assert.strictEqual(e.message, 'Login failed for user \'***\' pw *** url mssql://***@db.local:1433')
            assert.strictEqual(e.code, 'ELOGIN')
            assert.strictEqual(e.sql, 'SELECT \'***\'')
            assert.strictEqual(e['key_***'], 2)
            assert.ok(Object.getOwnPropertySymbols(e).map(String).includes('Symbol(sym_***)'))
            assertNoLeak(lines, ['sym_S3', 'key_S3'])
        })

        it('R4 R6 錯誤文字夾帶帳密: funLog之detail同樣遮罩, 且不改動sequelize拋出之原錯誤物件', async function() {
            let got = []
            let origErr = null
            let { isErr, lines } = await withShowAllTablesFail(() => capture(() => was(getOpt({ funLog: (...a) => got.push(a) }))), () => {
                origErr = mkSecretErr()
                return origErr
            })
            assert.strictEqual(isErr, true)
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
            assert.deepStrictEqual(got[0][1], { errType: 'Error', errCode: 'ELOGIN' })
            assert.ok(!JSON.stringify([got[0][2].message, got[0][2].sql, Reflect.ownKeys(got[0][2]).map(String)]).includes(PW))
            assert.ok(origErr.message.includes(PW), '原物件不被原地遮罩')
        })

    })

    describe('R2 R3 R4 R10 外鍵查詢失敗(mapForeignKeys): 修前以console.error輸出錯誤(其後照常建模), 現輸出標籤與摘要並reject', function() {

        it('R2 R10 預設: 標籤foreign keys catch加{ errType, errCode }, 不含帳密與原文; reject(不再照常建模)', async function() {
            let { calls, lines, isErr } = await withForeignKeysFail(() => capture(() => was(getOpt())))
            assert.strictEqual(isErr, true)
            assert.deepStrictEqual(calls, [{ m: 'error', args: ['foreign keys catch', { errType: 'Error', errCode: 'ELOGIN' }] }])
            assertNoLeak(lines, ['Login failed', 'db.local'])
        })

        it('R3 R6 logDetail:true: console.error(\'foreign keys catch\', Error副本), 帳密遮罩', async function() {
            let { calls, lines } = await withForeignKeysFail(() => capture(() => was(getOpt({ logDetail: true }))))
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].m, 'error')
            assert.strictEqual(calls[0].args[0], 'foreign keys catch')
            assert.ok(calls[0].args[1] instanceof Error)
            assert.ok(calls[0].args[1].message.startsWith('Login failed for user \'***\''))
            assertNoLeak(lines, ['sym_S3', 'key_S3'])
        })

        it('R4 funLog: 收(foreign keys catch, safe, detail), console無輸出', async function() {
            let got = []
            let { lines } = await withForeignKeysFail(() => capture(() => was(getOpt({ funLog: (...a) => got.push(a) }))))
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][0], 'foreign keys catch')
            assert.deepStrictEqual(got[0][1], { errType: 'Error', errCode: 'ELOGIN' })
            assert.ok(!JSON.stringify([got[0][2].message, got[0][2].sql]).includes(PW))
        })

    })

    describe('R3 R4 錯誤站點與logging並用: sql與錯誤各走各的串流/函數', function() {

        it('R3 logging:true單獨 + 外鍵查詢失敗: sql走console.log(只含敘述種類), 錯誤走console.error(只含標籤與摘要)', async function() {
            let { calls, lines } = await withForeignKeysFail(() => capture(() => was(getOpt({ logging: true }))))
            let logs = calls.filter((c) => c.m === 'log')
            let errs = calls.filter((c) => c.m === 'error')
            assert.ok(logs.length > 0)
            assert.ok(logs.every((c) => c.args.length === 2 && c.args[0] === 'sql' && Object.keys(c.args[1]).join() === 'stmt'))
            assert.deepStrictEqual(errs, [{ m: 'error', args: ['foreign keys catch', { errType: 'Error', errCode: 'ELOGIN' }] }])
            assert.strictEqual(logs.length + errs.length, calls.length)
            assertNoLeak(lines, ['Login failed', 'Executing'])
        })

        it('R3 logging:true加logDetail:true + 外鍵查詢失敗: sql全文走console.log(\'sql\', 全文), 錯誤走console.error(label, Error副本)(帳密遮罩)', async function() {
            let { calls, lines } = await withForeignKeysFail(() => capture(() => was(getOpt({ logging: true, logDetail: true }))))
            let logs = calls.filter((c) => c.m === 'log')
            let errs = calls.filter((c) => c.m === 'error')
            assert.ok(logs.length > 0 && logs.every((c) => c.args.length === 2 && c.args[0] === 'sql' && typeof c.args[1] === 'string' && c.args[1].startsWith('Executing (')))
            assert.strictEqual(errs.length, 1)
            assert.strictEqual(errs[0].args.length, 2)
            assert.strictEqual(errs[0].args[0], 'foreign keys catch')
            assert.ok(errs[0].args[1] instanceof Error)
            assertNoLeak(lines, ['sym_S3', 'key_S3'])
        })

        it('R4 logging:true加funLog + 外鍵查詢失敗: sql與錯誤都交給funLog(標籤sql、foreign keys catch), console無輸出', async function() {
            for (let logDetail of [false, true]) {
                let got = []
                let { lines } = await withForeignKeysFail(() => capture(() => was(getOpt({ logging: true, logDetail, funLog: (...a) => got.push(a) }))))
                assert.deepStrictEqual(lines, [], `logDetail=${logDetail}: funLog存在時logDetail不另寫console`)
                assert.ok(got.filter((g) => g[0] === 'sql').length > 0)
                assert.deepStrictEqual(got.filter((g) => g[0] !== 'sql').map((g) => g[0]), ['foreign keys catch'])
                assert.ok(!JSON.stringify(got.map((g) => g[2] instanceof Error ? [g[2].message, g[2].sql] : g[2])).includes(PW))
            }
        })

        it('R2 R10 外鍵查詢與describeTable同輪失敗: 外鍵查詢先失敗即停, 只輸出foreign keys catch一筆摘要(不再描述表), reject, 無帳密', async function() {
            let { calls, lines, isErr } = await withForeignKeysFail(() => withDescribeFail(() => capture(() => was(getOpt()))))
            assert.strictEqual(isErr, true)
            assert.deepStrictEqual(calls, [
                { m: 'error', args: ['foreign keys catch', { errType: 'Error', errCode: 'ELOGIN' }] },
            ])
            assertNoLeak(lines, ['Login failed', 'db.local'])
        })

        it('R2 R3 R4 R10 describeTable失敗(部分表已成功): 預設只輸出tables catch摘要; logDetail輸出(label, Error副本)(遮罩); funLog收摘要與遮罩副本; 皆reject', async function() {
            let r1 = await withDescribeFail(() => capture(() => was(getOpt())))
            assert.strictEqual(r1.isErr, true)
            assert.deepStrictEqual(r1.calls, [{ m: 'error', args: ['tables catch', { errType: 'Error', errCode: 'ELOGIN' }] }])
            assertNoLeak(r1.lines, ['Login failed'])

            let r2 = await withDescribeFail(() => capture(() => was(getOpt({ logDetail: true }))))
            assert.strictEqual(r2.calls.length, 1)
            assert.strictEqual(r2.calls[0].m, 'error')
            assert.strictEqual(r2.calls[0].args[0], 'tables catch')
            assert.ok(r2.calls[0].args[1] instanceof Error)
            assert.ok(r2.calls[0].args[1].message.startsWith('Login failed for user \'***\''))
            assertNoLeak(r2.lines, ['sym_S3', 'key_S3'])

            let got = []
            let r3 = await withDescribeFail(() => capture(() => was(getOpt({ funLog: (...a) => got.push(a) }))))
            assert.deepStrictEqual(r3.lines, [])
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][0], 'tables catch')
            assert.ok(!JSON.stringify([got[0][2].message, got[0][2].sql]).includes(PW))
        })

    })

    describe('R5 錯誤站點下診斷輸出異常不影響流程', function() {

        it('R5 R10 建表清單失敗(tables catch): funLog拋錯、回傳reject之promise、console.error拋錯, 皆仍reject該後端錯誤(SQLITE_CANTOPEN)', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let rs = await survive((fn) => fn(), { database: bad })
            assert.strictEqual(rs.length, 3)
            rs.forEach((r) => {
                assert.strictEqual(r.isErr, true)
                assert.strictEqual(r.v.original.code, 'SQLITE_CANTOPEN')
            })
        })

        it('R5 R10 外鍵查詢失敗(foreign keys catch): funLog拋錯、回傳reject之promise、console.error拋錯, 皆仍reject該後端錯誤(code保留)', async function() {
            let rs = await survive(withForeignKeysFail)
            assert.strictEqual(rs.length, 3)
            rs.forEach((r) => {
                assert.strictEqual(r.isErr, true)
                assert.strictEqual(r.v.code, 'ELOGIN')
            })
        })

        it('R5 R10 describeTable失敗(tables catch)與外鍵查詢同輪失敗: 三種異常皆仍reject(外鍵之錯誤)', async function() {
            let rs = await survive((fn) => withForeignKeysFail(() => withDescribeFail(fn)))
            assert.strictEqual(rs.length, 3)
            rs.forEach((r) => {
                assert.strictEqual(r.isErr, true)
                assert.strictEqual(r.v.code, 'ELOGIN')
            })
        })

    })

    describe('R6 R7 SQL內含憑證(表名恰含密碼): 輸出遮罩, 但回傳值與模型檔保持原名', function() {

        let storagePw = ''
        let TAB = `t_${PW}`

        before(async function() {
            storagePw = await mkDb(dir, 'pw.sqlite', [`CREATE TABLE ${TAB} (id VARCHAR(50) PRIMARY KEY NOT NULL, v FLOAT)`])
        })

        it('R2 預設與logging:true: 無輸出 / 只有{ stmt }; R7 回傳值與模型檔保留含密碼的原表名(只動診斷輸出)', async function() {
            let opt = getOpt({ database: storagePw })
            let r0 = await capture(() => was(opt))
            assert.deepStrictEqual(r0.lines, [])
            assert.deepStrictEqual(Object.keys(r0.res.tables), [TAB])
            let files = readModels(opt.directory)
            assert.deepStrictEqual(Object.keys(files), [`${TAB}.js`])
            assert.ok(files[`${TAB}.js`].includes(`'${TAB}'`))

            let r1 = await capture(() => was(getOpt({ database: storagePw, logging: true })))
            assert.ok(r1.calls.length > 0 && r1.calls.every((c) => c.args.length === 2 && c.args[0] === 'sql' && Object.keys(c.args[1]).join() === 'stmt'))
            assertNoLeak(r1.lines, ['t_'])
        })

        it('R3 R6 logging:true加logDetail:true: sql全文中的密碼以***遮罩(t_***), 其餘文字保留', async function() {
            let { lines, res } = await capture(() => was(getOpt({ database: storagePw, logging: true, logDetail: true })))
            assertNoLeak(lines)
            assert.ok(lines.some((l) => l.includes('t_***')), lines.join('\n').slice(0, 400))
            assert.ok(lines.some((l) => l.startsWith('log: sql Executing (default): PRAGMA TABLE_INFO(')))
            assert.deepStrictEqual(Object.keys(res.tables), [TAB])
        })

        it('R4 R6 logging:true加funLog: detail(sql全文)中的密碼以***遮罩', async function() {
            let got = []
            let { lines, res } = await capture(() => was(getOpt({ database: storagePw, logging: true, funLog: (...a) => got.push(a) })))
            assert.deepStrictEqual(lines, [])
            assert.ok(got.length > 0)
            assert.ok(got.every((g) => g[0] === 'sql' && typeof g[2] === 'string' && !g[2].includes(PW)))
            assert.ok(got.some((g) => g[2].includes('t_***')))
            assert.deepStrictEqual(Object.keys(res.tables), [TAB])
        })

    })

    describe('R6 數字密碼', function() {

        it('R6 密碼為數字型別: 錯誤文字中的同值字串與屬性值於detail中亦遮罩', async function() {
            let { calls, lines } = await withShowAllTablesFail(() => capture(() => was(getOpt({ password: 98765432, logDetail: true }))), () => {
                let e = new Error('pw is 98765432 here')
                e.code = 'ELOGIN'
                e.pw = 98765432
                return e
            })
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].args[1].message, 'pw is *** here')
            assert.strictEqual(calls[0].args[1].pw, '***')
            assert.ok(!lines.join('\n').includes('98765432'))
        })

    })

})
