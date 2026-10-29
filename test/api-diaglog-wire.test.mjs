import fs from 'fs'
import path from 'path'
import assert from 'assert'
import Sequelize from 'sequelize'
import diagCases from 'wsemi/src/_diagCases.mjs'
import was from '../src/WAutoSequelize.mjs'
import { mkDb, capture, patch, PW, USER, mkSecretErr, withShowAllTablesFail, withWriteFileFail } from './tools/diagFixture.mjs'


//rulebook R8(依主控 dspec〈診斷輸出與遮罩〉與 wsemi R-DIAG-01): 診斷輸出與遮罩由wsemi之getDiag提供, 本檔只驗本套件之接線
//  R8a 外來值(後端/驅動/fs回呼拋出或reject之值)於catch站點經diag.err: reject(寫出模型檔失敗)與同步throw(建構sequelize失敗)含憑證者為遮罩副本, 無憑證者為原物件; 單獨帳號與儲存路徑不遮(Q3)
//  R8b 本套件自身以固定詞彙組成之reject(need database等)不經遮罩(密碼為其子字串時亦原樣)
//  R8c 站點之診斷輸出: 後端錯誤值經共用語料(wsemi _diagCases之wire案)走tables catch站點, detail與safe依語料期望; 適用子集與不適用者逐一列明
//  R8d 本套件宣告: codes(sqlite、mysql、mssql、sqlstate)、nested(original、parent)、types(Sequelize…錯誤類別名)、secrets(帳號、密碼、sqlite檔案路徑)、safeKeys(stmt)
//  逐筆err: 本套件之回傳值僅{ tables, foreignKeys }, 無逐筆err欄位, 不適用


let { cases, mkCtx, verify } = diagCases
let byId = (id) => cases.find((c) => c.id === id)

let dir = path.resolve('./test/_tmp/api-diaglog-wire')
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


//適用本套件之語料wire案(外來值經tables catch站點之detail與safe、經寫檔失敗之reject)與不適用者及其原因; 語料新增wire案時須於此分類
const APPLICABLE = ['T01', 'T07', 'K01', 'K09', 'V02', 'E01', 'E07', 'P01', 'S07', 'C01', 'R01', 'R04', 'R07', 'R11', 'R12', 'O01']
const NOT_APPLICABLE = {
    R02: '需urls來源(畸形連線字串片段); 本套件之帳密以選項分別給予, 無連線字串來源',
    O15: 'safe之鍵只有本套件固定組成之stmt/errType/errCode, 無呼叫端可控之鍵可注入; 以source盤點鎖定(unit-diaglog)',
    A01: '本套件不使用genDiagFunLog(伺服端轉接器)',
    A07: '本套件不使用genDiagFunLog(伺服端轉接器)',
}

//語料之detail型案: 外來值以建表清單失敗(tables catch)交出, 斷言funLog收到之detail
const DETAIL_IDS = ['T01', 'T07', 'K01', 'K09', 'V02', 'E01', 'E07', 'P01', 'S07']


function newCtx() {
    //語料之秘密組: 帳號dbuser、密碼Pw9xQ!z7
    let ctx = mkCtx({})
    return ctx
}


function opt0(ctx, ex = {}) {
    return getOpt({ username: ctx.sec.username, password: ctx.sec.password, ...ex })
}


async function runDetail(ctx, value, ex = {}) {
    //外來值value作為showAllTables之reject值: 回傳funLog收到之呼叫
    let got = []
    await withShowAllTablesFail(() => was(opt0(ctx, { funLog: (...a) => got.push(a), ...ex })), () => value)
    return got
}


async function runReject(ctx, value, ex = {}) {
    //外來值value作為寫出模型檔之錯誤: 回傳was之reject值(未reject則拋出)
    let r = await withWriteFileFail(() => was(opt0(ctx, ex)).then((res) => ({ ok: true, res }), (err) => ({ ok: false, err })), () => value)
    assert.strictEqual(r.ok, false, '寫出模型檔失敗時須reject')
    return r.err
}


describe('api-diaglog-wire', function() {
    this.timeout(60000)

    before(async function() {
        fs.rmSync(dir, { recursive: true, force: true })
        storage = await mkDb(dir)
    })

    after(function() {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    describe('R8c 共用語料(wsemi _diagCases)之wire案經本套件真實站點', function() {

        it('R8c 語料之wire案皆已分類為適用或不適用(語料新增wire案時此處失敗而須分類)', function() {
            let wires = cases.filter((c) => c.wire).map((c) => c.id).sort()
            let known = [...APPLICABLE, ...Object.keys(NOT_APPLICABLE)].sort()
            assert.deepStrictEqual(wires, known)
            for (let id of APPLICABLE) {
                assert.ok(byId(id), id)
            }
        })

        for (let id of DETAIL_IDS) {
            let c = byId(id)
            it(`R8c ${id} ${c.fn}: ${c.label} (外來值經tables catch, funLog之detail依語料期望)`, async function() {
                let ctx = newCtx()
                let value = c.make(ctx)
                let got = await runDetail(ctx, value)
                assert.strictEqual(got.length, 1)
                assert.strictEqual(got[0][0], 'tables catch')
                assert.strictEqual(got[0].length, 3)
                assert.strictEqual(verify(c, got[0][2], ctx), null)
            })
        }

        it('R8c C01 getDiagBriefErr: ECONNREFUSED、EAI_AGAIN、E2BIG經tables catch之safe為{ errType, errCode }', async function() {
            let c = byId('C01')
            let ctx = newCtx()
            let es = c.make(ctx)
            let out = []
            for (let e of es) {
                let got = await runDetail(ctx, e)
                assert.strictEqual(got.length, 1)
                out.push(got[0][1])
            }
            assert.strictEqual(verify(c, out, ctx), null)
        })

        it('R8c O01 getDiag: logDetail:true時console.error(\'tables catch\', 遮罩後細節)', async function() {
            let c = byId('O01')
            let ctx = newCtx()
            let { detail } = c.make(ctx)
            let { calls } = await withShowAllTablesFail(() => capture(() => was(opt0(ctx, { logDetail: true }))), () => detail)
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].m, 'error')
            assert.strictEqual(calls[0].args[0], 'tables catch')
            assert.ok(calls[0].args[1] instanceof Error)
            //語料之noSecret判定(以detail清單): 輸出之一切字串、鍵、Symbol描述與單字元串接皆不含秘密
            assert.strictEqual(verify({ expect: { noSecret: c.expect.noSecret } }, calls, ctx), null)
        })

        for (let id of ['R01', 'R04']) {
            let c = byId(id)
            it(`R8c ${id} ${c.fn}: ${c.label} (外來值經寫檔失敗之reject)`, async function() {
                let ctx = newCtx()
                let value = c.make(ctx)
                let err = await runReject(ctx, value)
                //R01之判定為[原值, 結果]同一物件; R04為結果字串
                let out = id === 'R01' ? [value, err] : err
                assert.strictEqual(verify(c, out, ctx), null)
            })
        }

        for (let id of ['R11', 'R12']) {
            let c = byId(id)
            it(`R8c ${id} ${c.fn}: ${c.label} (同一錯誤: reject不遮、tables catch之detail遮)`, async function() {
                let ctx = newCtx()
                let value = c.make(ctx)
                let got = await runDetail(ctx, value)
                let r = await runReject(ctx, value)
                assert.strictEqual(got.length, 1)
                let o = { p: value.path, e: value, r, c: got[0][2] }
                assert.strictEqual(verify(c, o, ctx), null)
            })
        }

        it('R8b R07 固定詞彙之reject不經遮罩: 密碼為need時, need database等仍為原字串(經遮罩會被切碎為*** database)', async function() {
            let ex = [['database', 'need database'], ['username', 'need username'], ['dialect', 'need dialect'], ['port', 'need port']]
            for (let [k, msg] of ex) {
                let { err, isErr } = await capture(() => was(getOpt({ [k]: null, password: 'need' })))
                assert.strictEqual(isErr, true, k)
                assert.strictEqual(err, msg, k)
            }
            //need password: 無密碼可為子字串, 仍為原字串
            let { err } = await capture(() => was(getOpt({ password: null })))
            assert.strictEqual(err, 'need password')
        })

    })

    describe('R8a reject與throw之站點', function() {

        let TAB = `t_${PW}`
        let storagePw = ''

        before(async function() {
            storagePw = await mkDb(dir, 'pw.sqlite', [`CREATE TABLE ${TAB} (id VARCHAR(50) PRIMARY KEY NOT NULL, v FLOAT)`])
        })

        it('R8a 真實fs錯誤: 模型檔路徑(表名含密碼)為資料夾使writeFile以EISDIR失敗, reject之訊息與path遮罩密碼, 類別與code保留, 資料夾路徑不遮', async function() {
            let directory = path.join(dir, 'models-eisdir')
            fs.mkdirSync(path.join(directory, `${TAB}.js`), { recursive: true })
            let { err, isErr } = await capture(() => was(getOpt({ database: storagePw, directory })))
            assert.strictEqual(isErr, true)
            assert.ok(err instanceof Error, String(err))
            assert.strictEqual(err.code, 'EISDIR')
            assert.ok(err.message.includes('t_***.js'), err.message)
            assert.ok(!err.message.includes(PW), err.message)
            assert.ok(typeof err.path === 'string' && err.path.includes('t_***.js') && !err.path.includes(PW), err.path)
            assert.ok(err.path.includes('models-eisdir'), '資料夾路徑不遮')
        })

        it('R8a 含憑證之reject為遮罩副本(instanceof同類、屬性保留), 單獨帳號與儲存路徑不遮(Q3); 原物件不被原地改動', async function() {
            class DbErr extends Error {}
            let orig = null
            let ctx = newCtx()
            let value = () => {
                orig = new DbErr(`db ${storage} user ${ctx.sec.username} pw ${ctx.sec.password}`)
                orig.code = 'EACCES'
                return orig
            }
            let err = await withWriteFileFail(() => was(opt0(ctx)).then(() => null, (e) => e), value)
            assert.ok(err !== orig && err instanceof DbErr && err.code === 'EACCES')
            assert.strictEqual(err.message, `db ${storage} user ${ctx.sec.username} pw ***`)
            assert.ok(orig.message.includes(ctx.sec.password), '原物件不被原地遮罩')
        })

        it('R8a 不含憑證之reject為原物件(身分不變), 字串reject無憑證者原樣', async function() {
            let e = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
            let err = await withWriteFileFail(() => was(getOpt()).then(() => null, (x) => x), () => e)
            assert.strictEqual(err, e)
            let s = await withWriteFileFail(() => was(getOpt()).then(() => null, (x) => x), () => 'plain failure')
            assert.strictEqual(s, 'plain failure')
        })

        it('R8a 同步拋出(建構sequelize失敗)為外來值: 含憑證者拋遮罩副本, 無憑證者拋原物件', function() {
            let restore = patch(Sequelize.prototype, 'getQueryInterface', () => {
                throw mkSecretErr()
            })
            try {
                assert.throws(() => was(getOpt()), (e) => {
                    assert.ok(e instanceof Error && e.code === 'ELOGIN')
                    assert.ok(!e.message.includes(PW) && e.message.includes('mssql://***'), e.message)
                    return true
                })
            }
            finally {
                restore()
            }

            let plain = new Error('Please install pg package manually')
            let restore2 = patch(Sequelize.prototype, 'getQueryInterface', () => {
                throw plain
            })
            let thrown = null
            try {
                was(getOpt())
            }
            catch (e) {
                thrown = e
            }
            finally {
                restore2()
            }
            assert.strictEqual(thrown, plain)
        })

        it('R8a 回傳值無逐筆err欄位(resolve值僅tables與foreignKeys)', async function() {
            let res = await was(getOpt())
            assert.deepStrictEqual(Object.keys(res).sort(), ['foreignKeys', 'tables'])
        })

    })

    describe('R8d 本套件宣告', function() {

        it('R8d codes與nested: sqlite、mysql、mssql(含明列整數)、sqlstate之代碼於自身、original、parent皆收; 未宣告之集合(level、lmdb、mongoServer)、未明列整數、非代碼字串不收', async function() {
            let ctx = newCtx()
            let brief = async (e) => (await runDetail(ctx, e))[0][1]
            for (let code of ['SQLITE_BUSY', 'ER_ACCESS_DENIED_ERROR', 'ELOGIN', 18456, '28P01']) {
                for (let where of ['self', 'original', 'parent']) {
                    let e = new Error('x')
                    if (where === 'self') {
                        e.code = code
                    }
                    else {
                        e[where] = { code }
                    }
                    assert.deepStrictEqual(await brief(e), { errType: 'Error', errCode: code }, `${code} ${where}`)
                }
            }
            for (let code of ['LEVEL_DATABASE_NOT_OPEN', 'MDB_NOTFOUND', 11000, 12345, 'USER1', PW]) {
                let e = Object.assign(new Error('x'), { original: { code } })
                assert.deepStrictEqual(await brief(e), { errType: 'Error' }, String(code))
            }
        })

        it('R8d types: sequelize之連線與查詢類錯誤類別名(name)照列, 其餘類別名一律Error', async function() {
            let ctx = newCtx()
            let brief = async (e) => (await runDetail(ctx, e))[0][1]
            for (let name of ['SequelizeConnectionError', 'SequelizeAccessDeniedError', 'SequelizeConnectionAcquireTimeoutError', 'SequelizeConnectionRefusedError', 'SequelizeConnectionTimedOutError', 'SequelizeHostNotFoundError', 'SequelizeHostNotReachableError', 'SequelizeInvalidConnectionError', 'SequelizeDatabaseError', 'SequelizeTimeoutError', 'SequelizeQueryError', 'SequelizeBaseError']) {
                assert.deepStrictEqual(await brief(Object.assign(new Error('x'), { name })), { errType: name }, name)
            }
            for (let name of ['AliceError', `Err_${PW}`, 'SequelizeValidationError']) {
                assert.deepStrictEqual(await brief(Object.assign(new Error('x'), { name })), { errType: 'Error' }, name)
            }
        })

        it('R8d secrets(sqlite檔案路徑): 診斷輸出之細節遮罩資料庫檔案路徑(原樣、正斜線形式), 對外reject不遮(Q3)', async function() {
            let ctx = newCtx()
            let fwd = storage.replace(/\\/g, '/')
            let value = () => new Error(`SQLITE_CANTOPEN: open '${storage}' or '${fwd}' as ${ctx.sec.username}`)
            let got = []
            await withShowAllTablesFail(() => was(opt0(ctx, { database: storage, funLog: (...a) => got.push(a) })), value)
            assert.strictEqual(got.length, 1)
            let m = got[0][2].message
            assert.ok(!m.includes(storage) && !m.includes(fwd) && !m.includes(ctx.sec.username), m)
            assert.strictEqual(m, 'SQLITE_CANTOPEN: open \'***\' or \'***\' as ***')

            let r = await withWriteFileFail(() => was(opt0(ctx, { database: storage })).then(() => null, (e) => e), value)
            assert.ok(r.message.includes(storage) && r.message.includes(ctx.sec.username), r.message)
        })

        it('R8d secrets(sqlite檔案路徑)給相對路徑時: 診斷輸出之細節遮罩其原樣、正規化與絕對路徑三種形式(驅動回顯之路徑常為絕對路徑)', async function() {
            let ctx = newCtx()
            let rel = `./${path.relative(process.cwd(), storage).replace(/\\/g, '/')}`
            let nrm = path.normalize(rel)
            assert.ok(rel !== nrm && rel !== storage && nrm !== storage, `${rel} ${nrm} ${storage}`)
            let got = []
            let value = () => new Error(`SQLITE_CANTOPEN: open '${rel}' / '${nrm}' / '${storage}'`)
            await withShowAllTablesFail(() => was(opt0(ctx, { database: rel, funLog: (...a) => got.push(a) })), value)
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][2].message, 'SQLITE_CANTOPEN: open \'***\' / \'***\' / \'***\'')
        })

        it('R8d 真實驅動(mssql連線127.0.0.1:1被拒): tables catch之safe為{ errType: SequelizeConnectionError, errCode: ESOCKET }(代碼取自original), 帳密不外流, 仍resolve空結果', async function() {
            let got = []
            let { res, lines } = await capture(() => was({ database: 'somedb', username: USER, password: PW, dialect: 'mssql', host: '127.0.0.1', port: 1, directory: path.join(dir, 'models-mssql'), funLog: (...a) => got.push(a) }))
            assert.deepStrictEqual(res, { tables: {}, foreignKeys: {} })
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][0], 'tables catch')
            assert.deepStrictEqual(got[0][1], { errType: 'SequelizeConnectionError', errCode: 'ESOCKET' })
            assert.ok(got[0][2] instanceof Error)
            assert.ok(!JSON.stringify([got[0][2].message, got[0][2].original && got[0][2].original.message]).includes(PW))
        })

    })

})
