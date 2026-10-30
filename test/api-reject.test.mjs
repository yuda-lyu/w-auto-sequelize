import fs from 'fs'
import path from 'path'
import assert from 'assert'
import Sequelize from 'sequelize'
import was from '../src/WAutoSequelize.mjs'
import AutoSequelize from '../src/auto-sequelize.js'
import { mkDb, capture, patch, PW, USER, mkSecretErr, withShowAllTablesFail, withDescribeFail, withForeignKeysFail, outcome, watchUnhandled, countClose } from './tools/diagFixture.mjs'


//rulebook R9、R10: 失敗一律reject(不懸置、不以空結果或部分結果resolve), 以sqlite實跑WAutoSequelize
//  R9  輸出資料夾(opt.directory)建立失敗(為既有檔案、父層為既有檔案)即reject: 值為fs之錯誤(經diag.err, 訊息只帶路徑), 不懸置、不產生unhandledRejection;
//      opt.directory非字串(且非空值)者於連線前以固定字串reject, 訊息不回顯該值
//  R10 建表清單、描述表與外鍵查詢失敗即reject(值為後端錯誤, 經diag.err), 診斷輸出(標籤與摘要)照舊, 關閉連線, 不寫出任何模型檔; 資料庫沒有表不是失敗


let dir = path.resolve('./test/_tmp/api-reject')
let storage = ''
let nModels = 0

const MSG_DIR = 'invalid opt.directory: must be a string'


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


function mkFile(name) {
    let f = path.join(dir, name)
    fs.writeFileSync(f, 'x')
    return f
}


//plainErr, 不含憑證之外來值(其reject須為原物件); code為本套件宣告之sqlite代碼集合內者, 使診斷輸出之摘要有errCode
function plainErr(msg) {
    return Object.assign(new Error(msg), { code: 'SQLITE_BUSY' })
}


describe('api-reject', function() {
    this.timeout(60000)

    before(async function() {
        fs.rmSync(dir, { recursive: true, force: true })
        storage = await mkDb(dir)
    })

    after(function() {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    describe('R9 輸出資料夾建立失敗即reject', function() {

        it('R9 directory為既有檔案: reject(fs之EEXIST類錯誤, 訊息只帶路徑), 不懸置、不產生unhandledRejection、無console輸出', async function() {
            let file = mkFile('iamfile')
            let { res: { res: out, lines }, seen } = await watchUnhandled(() => capture(() => outcome(was(getOpt({ directory: file })))))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}(pending為懸置)`)
            let err = out.v
            assert.ok(err instanceof Error, String(err))
            assert.ok(['EEXIST', 'ENOTDIR'].includes(err.code), err.code)
            assert.strictEqual(err.path, file)
            //訊息只帶fs之系統呼叫與路徑, 不帶帳號、密碼等其他選項之值
            assert.ok(/^[A-Z]+: [a-z ]+, mkdir '<path>'$/.test(err.message.replace(file, '<path>')), err.message)
            assert.deepStrictEqual(seen, [])
            assert.deepStrictEqual(lines, [])
        })

        it('R9 directory之父層為既有檔案: reject(fs錯誤, 有code與path), 不懸置、不產生unhandledRejection', async function() {
            let file = mkFile('iamfile2')
            let sub = path.join(file, 'sub')
            let { res: out, seen } = await watchUnhandled(() => outcome(was(getOpt({ directory: sub }))))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}(pending為懸置)`)
            assert.ok(out.v instanceof Error, String(out.v))
            assert.strictEqual(typeof out.v.code, 'string')
            assert.ok(typeof out.v.path === 'string' && out.v.path.startsWith(file), out.v.path)
            assert.ok(!out.v.message.includes(PW) && !out.v.message.includes(USER), out.v.message)
            assert.deepStrictEqual(seen, [])
        })

        it('R9 建立失敗時不回傳部分結果: 為reject而非resolve, 輸出夾所在位置之檔案內容不變', async function() {
            let file = mkFile('iamfile3')
            let out = await outcome(was(getOpt({ directory: file })))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}`)
            assert.strictEqual(fs.readFileSync(file, 'utf8'), 'x')
        })

        it('R9 directory為非字串(且非空值): 於連線前以固定字串reject, 訊息不回顯該值, 不執行任何sql', async function() {
            for (let v of [123456789, true, {}, [], () => {}, Symbol('sv987'), Object('sv654'), { toString: () => 'sv321' }]) {
                let got = []
                let { res: out, seen } = await watchUnhandled(() => outcome(was(getOpt({ directory: v, logging: true, funLog: (...a) => got.push(a) }))))
                assert.strictEqual(out.state, 'rejected', `${typeof v}: ${out.state}`)
                assert.strictEqual(out.v, MSG_DIR, typeof v)
                assert.deepStrictEqual(got, [], `${typeof v}: 連線前即拒收, 不執行sql`)
                assert.deepStrictEqual(seen, [], typeof v)
            }
        })

        it('R9 directory為空值(null、\'\'、0、false): 不建立資料夾、不寫出模型檔, 只回傳結果(JSDoc: 空值者不寫出模型檔)', async function() {
            for (let v of [null, '', 0, false]) {
                let writes = []
                let restore = patch(fs, 'writeFile', (p, ...a) => {
                    writes.push(p)
                    return a[a.length - 1](null)
                })
                let out
                try {
                    out = await outcome(was(getOpt({ directory: v })))
                }
                finally {
                    restore()
                }
                assert.strictEqual(out.state, 'resolved', `${JSON.stringify(v)}: ${out.state}`)
                assert.deepStrictEqual(Object.keys(out.v.tables).sort(), ['depts', 'users'])
                assert.deepStrictEqual(writes, [], JSON.stringify(v))
            }
        })

        it('R9 directory為既有資料夾: 照常resolve並寫出模型檔(建立資料夾之失敗處理不影響既有資料夾)', async function() {
            let d = path.join(dir, 'existing-dir')
            fs.mkdirSync(d, { recursive: true })
            let out = await outcome(was(getOpt({ directory: d })))
            assert.strictEqual(out.state, 'resolved', String(out.v))
            assert.deepStrictEqual(Object.keys(out.v.tables).sort(), ['depts', 'users'])
            assert.deepStrictEqual(fs.readdirSync(d).sort(), ['depts.js', 'users.js'])
        })

    })

    describe('R10 建表清單、描述表與外鍵查詢失敗即reject', function() {

        it('R10 建表清單失敗(真實驅動: sqlite之storage為資料夾, SQLITE_CANTOPEN): reject後端錯誤(SequelizeConnectionError), 診斷輸出仍為標籤與摘要, 不寫出任何檔案', async function() {
            let bad = path.join(dir, 'isadir')
            fs.mkdirSync(bad, { recursive: true })
            let opt = getOpt({ database: bad })
            let { res: { res: out, calls }, seen } = await watchUnhandled(() => capture(() => outcome(was(opt))))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}(resolved為舊行為: 以空結果完成)`)
            let err = out.v
            assert.ok(err instanceof Error, String(err))
            assert.strictEqual(err.name, 'SequelizeConnectionError')
            assert.strictEqual(err.original.code, 'SQLITE_CANTOPEN')
            assert.deepStrictEqual(calls, [{ m: 'error', args: ['tables catch', { errType: 'SequelizeConnectionError', errCode: 'SQLITE_CANTOPEN' }] }])
            assert.strictEqual(fs.existsSync(opt.directory), false, '失敗時不建立輸出夾')
            assert.deepStrictEqual(seen, [])
        })

        it('R10 描述表失敗(describeTable, 部分表已成功): reject, 不寫出任何檔案(含已描述成功之表), 關閉連線一次', async function() {
            let opt = getOpt()
            let { res: out, n } = await countClose(() => withDescribeFail(() => outcome(was(opt)), 'users', () => plainErr('describe failed')))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}`)
            assert.strictEqual(out.v.message, 'describe failed')
            assert.strictEqual(fs.existsSync(opt.directory), false, '失敗時不建立輸出夾、不寫出部分表')
            assert.strictEqual(n, 1, '失敗路徑亦關閉連線')
        })

        it('R10 外鍵查詢失敗(mapForeignKeys): reject, 只有foreign keys catch一筆診斷輸出(不再往下描述表), 不寫出任何檔案, 關閉連線一次', async function() {
            let opt = getOpt()
            let { res: { res: out, calls }, n } = await countClose(() => withForeignKeysFail(() => capture(() => outcome(was(opt))), () => plainErr('fk failed')))
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}(resolved為舊行為: 缺references而照常建模)`)
            assert.strictEqual(out.v.message, 'fk failed')
            assert.deepStrictEqual(calls, [{ m: 'error', args: ['foreign keys catch', { errType: 'Error', errCode: 'SQLITE_BUSY' }] }])
            assert.strictEqual(fs.existsSync(opt.directory), false)
            assert.strictEqual(n, 1)
        })

        it('R10 建表清單失敗: 關閉連線一次, reject值為後端錯誤原物件(不含憑證者身分不變)', async function() {
            let e = plainErr('list failed')
            let opt = getOpt()
            let { res: out, n } = await countClose(() => withShowAllTablesFail(() => outcome(was(opt)), () => e))
            assert.strictEqual(out.state, 'rejected')
            assert.strictEqual(out.v, e)
            assert.strictEqual(fs.existsSync(opt.directory), false)
            assert.strictEqual(n, 1)
        })

        it('R10 外鍵查詢與描述表同輪失敗: 外鍵查詢先行, reject外鍵之錯誤, 不再描述表(describeTable未被呼叫)', async function() {
            let descCalled = false
            let fkErr = plainErr('fk first')
            let out = await withForeignKeysFail(() => withDescribeFail(() => outcome(was(getOpt())), 'users', () => {
                descCalled = true
                return plainErr('desc second')
            }), () => fkErr)
            assert.strictEqual(out.state, 'rejected')
            assert.strictEqual(out.v, fkErr)
            assert.strictEqual(descCalled, false)
        })

        it('R10 reject值經diag.err: 含憑證者為遮罩副本(同類、code保留, 原物件不被改動), 三個失敗站點(建表清單、描述表、外鍵)一致', async function() {
            let sites = [withShowAllTablesFail, (fn, mk) => withDescribeFail(fn, 'users', mk), withForeignKeysFail]
            for (let [i, site] of sites.entries()) {
                //外鍵查詢對每個表各失敗一次(mk被呼叫多次), reject者為其中先失敗者
                let origs = []
                let out = await site(() => outcome(was(getOpt())), () => {
                    let e = mkSecretErr()
                    origs.push(e)
                    return e
                })
                assert.strictEqual(out.state, 'rejected', String(i))
                let e = out.v
                assert.ok(origs.length >= 1, String(i))
                assert.ok(e instanceof Error && !origs.includes(e) && e.code === 'ELOGIN', String(i))
                assert.ok(!e.message.includes(PW) && e.message.includes('mssql://***'), e.message)
                assert.ok(origs.every((o) => o.message.includes(PW)), '原物件不被原地遮罩')
            }
        })

        it('R10 不含憑證之字串或物件值: reject為原值(身分不變)', async function() {
            let o = { code: 'X' }
            let outs = [
                await withShowAllTablesFail(() => outcome(was(getOpt())), () => 'plain failure'),
                await withShowAllTablesFail(() => outcome(was(getOpt())), () => o),
            ]
            assert.strictEqual(outs[0].state, 'rejected')
            assert.strictEqual(outs[0].v, 'plain failure')
            assert.strictEqual(outs[1].state, 'rejected')
            assert.strictEqual(outs[1].v, o)
        })

        it('R10 診斷輸出異常(funLog拋錯、回傳reject之promise)不改變reject值, 不產生unhandledRejection', async function() {
            let e = plainErr('list failed 2')
            for (let funLog of [() => {
                throw new Error('funLog boom')
            }, () => Promise.reject(new Error('async boom'))]) {
                let { res: out, seen } = await watchUnhandled(() => withShowAllTablesFail(() => outcome(was(getOpt({ funLog }))), () => e))
                assert.strictEqual(out.state, 'rejected')
                assert.strictEqual(out.v, e)
                assert.deepStrictEqual(seen, [])
            }
        })

        it('R10 postgres指定schema之建表清單查詢失敗(內部類別AutoSequelize之第四個失敗站點; 以sqlite實例與覆寫之dialect、query模擬, 不需pg驅動): 記錄tables catch後以該錯誤呼叫callback, 關閉連線, 不寫出檔案', async function() {
            let seq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
            let opt = { dialect: 'postgres', schema: 'public', directory: path.join(dir, 'models-pgschema') }
            let logs = []
            let auto = new AutoSequelize(seq, null, null, opt, (label, err) => logs.push([label, err]))
            let e = plainErr('pg schema list failed')
            let sqls = []
            auto.dialect = { showTablesQuery: (s) => `SHOW TABLES IN ${s}` }
            seq.query = (sql) => {
                sqls.push(sql)
                return Promise.reject(e)
            }
            let { res: out, n } = await countClose(() => outcome(new Promise((resolve, reject) => {
                auto.run((err) => (err ? reject(err) : resolve({ tables: auto.tables })))
            })))
            assert.deepStrictEqual(sqls, ['SHOW TABLES IN public'])
            assert.strictEqual(out.state, 'rejected', `了結狀態為${out.state}`)
            assert.strictEqual(out.v, e)
            assert.deepStrictEqual(logs, [['tables catch', e]])
            assert.strictEqual(n, 1)
            assert.strictEqual(fs.existsSync(opt.directory), false)
        })

        it('R10 資料庫沒有表不是失敗: resolve空結果(與連不上資料庫之reject可區分)', async function() {
            let empty = await mkDb(dir, 'empty.sqlite', [])
            let out = await outcome(was(getOpt({ database: empty })))
            assert.strictEqual(out.state, 'resolved', String(out.v))
            assert.deepStrictEqual(out.v, { tables: {}, foreignKeys: {} })
        })

    })

})
