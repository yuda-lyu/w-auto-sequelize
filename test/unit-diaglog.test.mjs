import fs from 'fs'
import util from 'util'
import assert from 'assert'
import { fileURLToPath } from 'url'
import { getOptLog, getSecrets, maskText, cpMask, getDiag, getBriefErr, getSqlStmt } from '../src/getDiag.mjs'
import SqlString from '../src/sql-string.js'


//rulebook R1~R6: 診斷輸出(console)與SQL紀錄(opt.logging)之預設安全與可控
//  R1 單一出口: src內除getDiag.mjs外不得呼叫console; sequelize實例一律明給logging
//  R2 預設只輸出標籤與不含個資之摘要(不含資料值、id、錯誤原文、帳密、路徑)
//  R3 opt.logDetail為true還原舊版細節輸出, 帳號與密碼一律以***遮罩
//  R4 opt.funLog(label, safe, detail)取代console收完整細節(憑證仍遮罩); 型別錯誤之選項忽略並用預設
//  R5 診斷輸出不得影響呼叫端流程(funLog/getDetail/console拋錯與funLog回傳reject之promise皆吞下)
//  R6 遮罩範圍: 值、屬性鍵、Symbol描述、數字密碼、含@與單引號之密碼、繼承原型與getter不得執行


let PW = 'S3cretPw'
let USER = 'tuser'
let SECRETS = getSecrets(USER, PW)


//capture, 擷取console各方法之呼叫(含引數)
function capture(fn) {
    let calls = []
    let ks = ['log', 'info', 'warn', 'error', 'debug']
    let olds = ks.map((k) => console[k])
    ks.forEach((k) => {
        console[k] = (...a) => calls.push({ m: k, args: a })
    })
    try {
        fn()
    }
    finally {
        ks.forEach((k, i) => {
            console[k] = olds[i]
        })
    }
    return calls
}


function stripComments(s) {
    //粗略去除註解(區塊與單行), 供掃描程式碼本體; 引號內之//(如網址)不在src的console掃描範圍內
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([;{},)\s])\/\/.*$/gm, '$1')
}


describe('R1 單一出口與sequelize實例日誌設定', function() {

    let dirSrc = fileURLToPath(new URL('../src/', import.meta.url))

    it('R1 src內除getDiag.mjs外, 程式碼不得出現console', function() {
        let fns = fs.readdirSync(dirSrc).filter((n) => /\.(mjs|js)$/.test(n) && n !== 'getDiag.mjs')
        assert.ok(fns.includes('auto-sequelize.js') && fns.includes('WAutoSequelize.mjs'))
        let hits = []
        for (let n of fns) {
            let code = stripComments(fs.readFileSync(dirSrc + n, 'utf8'))
            code.split('\n').forEach((line, i) => {
                if (/\bconsole\b/.test(line)) {
                    hits.push(`${n}:${i + 1}: ${line.trim()}`)
                }
            })
        }
        assert.deepStrictEqual(hits, [])
    })

    it('R1 getDiag.mjs為唯一的console使用處(不使用Node內建模組: dist由rollup打包, 內建模組未列於external)', function() {
        let code = stripComments(fs.readFileSync(dirSrc + 'getDiag.mjs', 'utf8'))
        assert.ok(/console\[method\]/.test(code))
        assert.ok(!/^\s*import\s/m.test(code), 'getDiag.mjs不得import任何模組')
    })

})


describe('getOptLog', function() {

    it('R4 未給或型別錯誤者忽略並用預設(不拋錯): logging非true、logDetail非true、funLog非函數', function() {
        let def = { logging: false, logDetail: false, funLog: null }
        for (let opt of [undefined, null, {}, 0, 'x']) {
            assert.deepStrictEqual(getOptLog(opt), def)
        }
        for (let v of ['true', 1, {}, [], 'yes', null, undefined, 0]) {
            assert.deepStrictEqual(getOptLog({ logging: v, logDetail: v, funLog: v }), def)
        }
    })

    it('R4 logging與logDetail為true、funLog為函數才生效', function() {
        let f = () => {}
        let r = getOptLog({ logging: true, logDetail: true, funLog: f })
        assert.strictEqual(r.logging, true)
        assert.strictEqual(r.logDetail, true)
        assert.strictEqual(r.funLog, f)
    })

    it('R4 讀取選項拋錯者忽略該選項, 不連累另一個有效選項', function() {
        let f = () => {}
        let opt = {}
        Object.defineProperty(opt, 'logging', {
            get() {
                throw new Error('boom')
            },
            enumerable: true
        })
        Object.defineProperty(opt, 'logDetail', {
            get() {
                throw new Error('boom')
            },
            enumerable: true
        })
        opt.funLog = f
        assert.deepStrictEqual(getOptLog(opt), { logging: false, logDetail: false, funLog: f })
        let opt2 = { logging: true, logDetail: true }
        Object.defineProperty(opt2, 'funLog', {
            get() {
                throw new Error('boom')
            },
            enumerable: true
        })
        assert.deepStrictEqual(getOptLog(opt2), { logging: true, logDetail: true, funLog: null })
    })

})


describe('getDiag', function() {

    it('R2 預設只輸出標籤與摘要, 不呼叫getDetail(細節在預設路徑不被取得)', function() {
        let n = 0
        let diag = getDiag(getOptLog({}), SECRETS)
        let calls = capture(() => {
            diag('lab', { a: 1 }, () => {
                n++
                return 'DETAIL'
            })
            diag('lab2', undefined, () => 'DETAIL')
        })
        assert.strictEqual(n, 0)
        assert.deepStrictEqual(calls, [{ m: 'log', args: ['lab', { a: 1 }] }, { m: 'log', args: ['lab2'] }])
    })

    it('R3 logDetail為true時還原細節: 標籤加細節; bare者只輸出細節(與舊版該站之console.xxx(細節)相同); method指定console方法', function() {
        let diag = getDiag(getOptLog({ logDetail: true }), SECRETS)
        let calls = capture(() => {
            diag('lab', { a: 1 }, () => 'DETAIL')
            diag('lab', { a: 1 }, () => 'DETAIL', true)
            diag('lab', undefined, () => 'DETAIL', true, 'error')
            diag('lab')
        })
        assert.deepStrictEqual(calls, [
            { m: 'log', args: ['lab', 'DETAIL'] },
            { m: 'log', args: ['DETAIL'] },
            { m: 'error', args: ['DETAIL'] },
            { m: 'log', args: ['lab'] },
        ])
    })

    it('R2 預設路徑之method參數: 舊版以console.error輸出之站點, 預設摘要亦走console.error', function() {
        let diag = getDiag(getOptLog({}), SECRETS)
        let calls = capture(() => {
            diag('lab', { a: 1 }, () => 'DETAIL', true, 'error')
        })
        assert.deepStrictEqual(calls, [{ m: 'error', args: ['lab', { a: 1 }] }])
    })

    it('R4 funLog收(label, safe, detail), 不寫console; 無細節者只收兩個引數; funLog存在時logDetail不另寫console', function() {
        for (let logDetail of [false, true]) {
            let got = []
            let diag = getDiag(getOptLog({ logDetail, funLog: (...a) => got.push(a) }), SECRETS)
            let calls = capture(() => {
                diag('lab', { a: 1 }, () => 'DETAIL')
                diag('lab2', { b: 2 })
                diag('lab3', undefined, undefined)
            })
            assert.deepStrictEqual(calls, [])
            assert.deepStrictEqual(got, [['lab', { a: 1 }, 'DETAIL'], ['lab2', { b: 2 }], ['lab3', undefined]])
        }
    })

    it('R2 摘要(safe)亦防禦性遮罩: 值含已知憑證(字串、同值數字)者以***取代, 不含者原樣', function() {
        let sec = getSecrets('tuser', 12345678)
        let got = []
        let diag = getDiag(getOptLog({ funLog: (...a) => got.push(a) }), sec)
        diag('lab', { errType: 'tuser', errCode: 12345678, n: 7, ok: 'ENOENT', s: 'x12345678x' })
        assert.deepStrictEqual(got[0][1], { errType: '***', errCode: '***', n: 7, ok: 'ENOENT', s: 'x***x' })
    })

    it('R5 輸出不得使呼叫端拋錯: funLog拋錯、getDetail拋錯、console拋錯皆吞下', function() {
        let d1 = getDiag(getOptLog({
            funLog: () => {
                throw new Error('funLog boom')
            }
        }), SECRETS)
        d1('lab', { a: 1 }, () => 'D')

        let got = []
        let d2 = getDiag(getOptLog({ funLog: (...a) => got.push(a) }), SECRETS)
        d2('lab', { a: 1 }, () => {
            throw new Error('detail boom')
        })
        assert.deepStrictEqual(got, [['lab', { a: 1 }, '(unprintable)']])

        let d3 = getDiag(getOptLog({ logDetail: true }), SECRETS)
        let calls = capture(() => {
            d3('lab', { a: 1 }, () => {
                throw new Error('detail boom')
            })
        })
        assert.deepStrictEqual(calls, [{ m: 'log', args: ['lab', '(unprintable)'] }])

        let olds = console.log
        console.log = () => {
            throw new Error('console boom')
        }
        try {
            getDiag(getOptLog({}), SECRETS)('lab', { a: 1 })
            getDiag(getOptLog({ logDetail: true }), SECRETS)('lab', { a: 1 }, () => 'D')
        }
        finally {
            console.log = olds
        }
    })

    it('R5 funLog回傳reject之promise(含thenable、自有then被覆寫之原生promise)不成為unhandledRejection', async function() {
        let seen = []
        let onRej = (e) => seen.push(e)
        process.on('unhandledRejection', onRej)
        try {
            let p = Promise.reject(new Error('own then boom'))
            p.then = () => 'overridden'
            getDiag(getOptLog({ funLog: () => p }), SECRETS)('lab', { a: 1 })
            let diag = getDiag(getOptLog({ funLog: () => Promise.reject(new Error('async boom')) }), SECRETS)
            diag('lab', { a: 1 })
            let diag2 = getDiag(getOptLog({
                funLog: () => ({
                    then(ok, ng) {
                        return Promise.reject(new Error('thenable boom')).then(ok, ng)
                    }
                })
            }), SECRETS)
            diag2('lab', { a: 1 })
            await new Promise((resolve) => setTimeout(resolve, 60))
        }
        finally {
            process.off('unhandledRejection', onRej)
        }
        assert.deepStrictEqual(seen, [])
    })

    it('R3 憑證遮罩: 細節(console與funLog)中之密碼、帳號:密碼、帳號一律以***取代, 其餘細節保留', function() {
        let detail = () => ({ msg: `Login failed for user '${USER}' with ${PW} (${USER}:${PW})`, keep: 'table users', n: 3 })
        let got = []
        let d1 = getDiag(getOptLog({ funLog: (...a) => got.push(a) }), SECRETS)
        d1('lab', { a: 1 }, detail)
        let calls = capture(() => {
            getDiag(getOptLog({ logDetail: true }), SECRETS)('lab', { a: 1 }, detail)
        })
        for (let d of [got[0][2], calls[0].args[1]]) {
            assert.deepStrictEqual(d, { msg: 'Login failed for user \'***\' with *** (***)', keep: 'table users', n: 3 })
        }
    })

})


describe('getSecrets 與 maskText', function() {

    it('R6 getSecrets: 含密碼、帳號:密碼、帳號與其URL編碼、單引號加倍形式, 長者在前; 無帳密者為空', function() {
        assert.deepStrictEqual(getSecrets('', ''), [])
        assert.deepStrictEqual(getSecrets(undefined, null), [])
        let s = getSecrets('tuser', 'it\'s p@ss')
        for (let x of ['tuser:it\'s p@ss', 'it\'s p@ss', 'it\'\'s p@ss', 'it\'s%20p%40ss', 'it%27s%20p%40ss', 'it\'s+p%40ss', 'tuser']) {
            assert.ok(s.includes(x), `缺 ${x}`)
        }
        for (let k = 1; k < s.length; k++) {
            assert.ok(s[k - 1].length >= s[k].length, '長者在前')
        }
    })

    it('R6 getSecrets: 帳號單獨出現時至少3字元才列入(過短會吞掉無關文字); 帳號:密碼之並列形式不受限', function() {
        let s = getSecrets('sa', 'pw99')
        assert.ok(!s.includes('sa'))
        assert.ok(s.includes('sa:pw99') && s.includes('pw99'))
    })

    it('R6 getSecrets: 數值型別之帳號與密碼轉為字串形式; 物件等其他型別視為未給', function() {
        assert.ok(getSecrets('tuser', 12345678).includes('12345678'))
        assert.ok(getSecrets(12345, 'pw99').includes('12345'))
        assert.ok(getSecrets('tuser', 12345678n).includes('12345678'))
        assert.deepStrictEqual(getSecrets({}, []), [])
    })

    it('R6 maskText: 非字串原樣; 已知秘密(含URL編碼與單引號加倍形式)遮罩', function() {
        let sec = getSecrets('tuser', 'it\'s p@ss')
        assert.strictEqual(maskText(5, sec), 5)
        assert.strictEqual(maskText('pw=it\'s p@ss;', sec), 'pw=***;')
        assert.strictEqual(maskText('SET pw=\'it\'\'s p@ss\'', sec), 'SET pw=\'***\'')
        assert.strictEqual(maskText('?pw=it\'s%20p%40ss&u=1', sec), '?pw=***&u=1')
        assert.strictEqual(maskText('?pw=it%27s%20p%40ss&u=1', sec), '?pw=***&u=1')
        assert.strictEqual(maskText('pw=it\'s+p%40ss', sec), 'pw=***')
    })

    it('R6 maskText: 連線字串內嵌之帳密(不依賴已知秘密), 帳密含未編碼之@時取至最後一個@, 不吞掉其後以空白分隔之文字', function() {
        assert.strictEqual(maskText('connect mssql://u1:p1@db.local:1433/x failed'), 'connect mssql://***@db.local:1433/x failed')
        assert.strictEqual(maskText('mssql://u1:pa@ss@db.local:1433'), 'mssql://***@db.local:1433')
        assert.strictEqual(maskText('mssql://u1:p@a@b@db.local'), 'mssql://***@db.local')
        assert.strictEqual(maskText('see mssql://u1:p1@h and https://example.com/x'), 'see mssql://***@h and https://example.com/x')
    })

})


describe('getSecrets 各編碼形式(R6)', function() {

    //以各方言/函式庫實際產生的形式為輸入, 不以實作的公式反推
    let PWD = 'it\'s p@ss'

    it('R6 URLSearchParams產生的表單編碼(%27與+)遮罩', function() {
        let sec = getSecrets(USER, PWD)
        let s = new URLSearchParams({ pw: PWD }).toString()
        assert.strictEqual(s, 'pw=it%27s+p%40ss')
        assert.strictEqual(maskText(s, sec), 'pw=***')
    })

    it('R6 mysql與mariadb的反斜線跳脫(\\\')、postgres/sqlite/mssql的單引號加倍皆遮罩(以本套件sql-string產生)', function() {
        let sec = getSecrets(USER, PWD)
        for (let dialect of ['mysql', 'mariadb', 'postgres', 'sqlite', 'mssql']) {
            let s = `SELECT ${SqlString.escape(PWD, null, dialect)}`
            assert.strictEqual(maskText(s, sec), `SELECT ${dialect === 'mssql' ? 'N' : ''}'***'`, dialect) //mssql的字串字面值帶N前綴
        }
        assert.strictEqual(maskText('x = \'bs\\\\\'', getSecrets(USER, 'bs\\')), 'x = \'***\'', '密碼含反斜線時mysql跳脫為雙反斜線')
    })

    it('R6 帳號短於3字元(如sa)而密碼為URL編碼形式時, 並列的 帳號:密碼 仍遮罩', function() {
        let sec = getSecrets('sa', PWD)
        assert.strictEqual(maskText('login sa:p%40ss failed', getSecrets('sa', 'p@ss')), 'login *** failed')
        assert.strictEqual(maskText('login sa:it%27s+p%40ss failed', sec), 'login *** failed')
        assert.strictEqual(maskText('login sa:it\'s p@ss failed', sec), 'login *** failed')
    })

    it('R6 帳號:密碼 整串經encodeURIComponent(冒號編成%3A)後亦整串遮罩', function() {
        let sec = getSecrets(USER, PWD)
        let s = `?cred=${encodeURIComponent(`${USER}:${PWD}`)}&x=1`
        assert.ok(s.includes('%3A'))
        assert.strictEqual(maskText(s, sec), '?cred=***&x=1')
    })

    it('R6 十六進位小寫的百分比編碼亦遮罩', function() {
        let sec = getSecrets(USER, 'a/b?c=d')
        assert.strictEqual(maskText('x=a%2Fb%3Fc%3Dd', sec), 'x=***')
        assert.strictEqual(maskText('x=a%2fb%3fc%3dd', sec), 'x=***')
    })

})


describe('cpMask', function() {

    it('R6 陣列上的非索引自有鍵與Symbol描述亦遮罩, 索引鍵與長度不變', function() {
        let a = ['x', PW]
        a[`bind_${PW}`] = 1
        a[Symbol(`sym_${PW}`)] = 2
        let r = cpMask(a, SECRETS)
        assert.ok(Array.isArray(r))
        assert.strictEqual(r.length, 2)
        assert.deepStrictEqual([r[0], r[1]], ['x', '***'])
        let keys = Reflect.ownKeys(r).map(String)
        assert.deepStrictEqual(keys, ['0', '1', 'length', 'bind_***', 'Symbol(sym_***)'])
        assert.ok(!util.format(r).includes(PW))
    })

    it('R6 R5 二進位資料: 只用內建getter取位元組數, 使用端覆寫的byteLength存取器不被執行也不外帶', function() {
        let ran = false
        let mk = (x) => {
            Object.defineProperty(x, 'byteLength', {
                get() {
                    ran = true
                    return PW
                }
            })
            return x
        }
        let r = cpMask({ b: mk(Buffer.from('12345678')), u: mk(new Uint16Array(3)), d: mk(new DataView(new ArrayBuffer(5))), a: mk(new ArrayBuffer(7)) }, SECRETS)
        assert.deepStrictEqual(r, { b: '[Binary 8 bytes]', u: '[Binary 6 bytes]', d: '[Binary 5 bytes]', a: '[Binary 7 bytes]' })
        assert.strictEqual(ran, false)
    })

    it('R3 無自有stack的Error: 副本不偽造指向本模組的堆疊, console格式化與原物件相同', function() {
        let e = new Error('no stack')
        delete e.stack
        let r = cpMask(e, SECRETS)
        assert.strictEqual(util.format(r), util.format(e))
        assert.ok(!util.format(r).includes('getDiag'))
    })

    it('R6 數值型別密碼為負數、小數時, 同值數值亦遮罩(數字至少4位); 少於4位不遮罩數值', function() {
        assert.strictEqual(cpMask({ pw: -12345 }, getSecrets(USER, -12345)).pw, '***')
        assert.strictEqual(cpMask({ pw: 1234.56 }, getSecrets(USER, 1234.56)).pw, '***')
        assert.strictEqual(cpMask({ pw: 123 }, getSecrets(USER, 123)).pw, 123)
        assert.strictEqual(cpMask({ pw: '123' }, getSecrets(USER, 123)).pw, '***', '字串形式仍遮罩')
    })

    it('R6 不改動原物件, 循環參照與過深/過大結構有界, 函數與二進位以標記字串代替', function() {
        let o = { a: PW, b: [PW, { c: PW }], f() {}, buf: Buffer.from(PW) }
        o.self = o
        let r = cpMask(o, SECRETS)
        assert.strictEqual(o.a, PW)
        assert.strictEqual(o.b[1].c, PW)
        assert.strictEqual(r.a, '***')
        assert.deepStrictEqual(r.b, ['***', { c: '***' }])
        assert.strictEqual(r.f, '[Function]')
        assert.strictEqual(r.buf, '[Binary 8 bytes]')
        assert.strictEqual(r.self, r)
        assert.notStrictEqual(r, o)

        let deep = {}
        let x = deep
        for (let k = 0; k < 30; k++) {
            x.n = {}
            x = x.n
        }
        assert.ok(JSON.stringify(cpMask(deep, SECRETS)).includes('[Truncated]'))

        let wide = {}
        for (let k = 0; k < 5000; k++) {
            wide['k' + k] = PW
        }
        let rw = cpMask(wide, SECRETS)
        assert.ok(Object.keys(rw).length <= 2000)
        assert.ok(Object.values(rw).every((v) => v === '***'))
    })

    it('R6 Error之副本仍為Error: message、stack、cause、自有屬性皆遮罩', function() {
        let e = new Error(`failed for ${USER}:${PW}`, { cause: new Error(`inner ${PW}`) })
        e.sql = `SELECT '${PW}'`
        e.parameters = [PW]
        let r = cpMask(e, SECRETS)
        assert.ok(r instanceof Error)
        assert.ok(!JSON.stringify([r.message, r.stack, r.cause.message, r.cause.stack, r.sql, r.parameters]).includes(PW))
        assert.ok(!r.message.includes(USER))
        assert.strictEqual(r.message, 'failed for ***')
        assert.strictEqual(r.sql, 'SELECT \'***\'')
        assert.deepStrictEqual(r.parameters, ['***'])
        assert.strictEqual(e.message, `failed for ${USER}:${PW}`, '原物件不被改動')
        assert.ok(!util.inspect(r).includes(PW))
    })

    it('R3 Error副本經console格式化後與原物件相同(類別名稱、訊息、堆疊、自有屬性與巢狀original), 但不沿用原型(其方法與繼承屬性不外帶)', function() {
        class DbError extends Error {
            constructor(m) {
                super(m)
                this.name = 'SequelizeDbError'
                this.parent = Object.assign(new Error('inner'), { code: 'SQLITE_CANTOPEN', errno: 14 })
                this.sql = 'SELECT 1'
            }
        }
        DbError.prototype.inheritedMethod = function() {}
        let e = new DbError('SQLITE_CANTOPEN: unable to open database file')
        let r = cpMask(e, SECRETS)
        assert.strictEqual(util.format(r), util.format(e))
        assert.ok(util.format(r).startsWith('DbError [SequelizeDbError]: SQLITE_CANTOPEN'), util.format(r).slice(0, 80))
        assert.ok(r instanceof Error)
        assert.notStrictEqual(Object.getPrototypeOf(r), DbError.prototype)
        assert.ok(!(r instanceof DbError))
        assert.strictEqual(r.inheritedMethod, undefined)

        //類別名稱不合識別字樣式者不沿用(退回Error)
        class X extends Error {}
        Object.defineProperty(X, 'name', { value: `bad name ${PW}` })
        assert.ok(!util.format(cpMask(new X('m'), SECRETS)).includes(PW))
        assert.ok(util.format(cpMask(new X('m'), SECRETS)).startsWith('Error: m'))
    })

    it('R6 屬性鍵與Symbol描述含憑證者亦遮罩; 數字密碼之同值數字亦遮罩(至少4位)', function() {
        let o = { [`k_${PW}`]: 1, [Symbol(`s_${PW}`)]: 2, code: 12345678, small: 12 }
        let r = cpMask(o, getSecrets(USER, 12345678))
        let r2 = cpMask(o, SECRETS)
        for (let x of [r2]) {
            let keys = Reflect.ownKeys(x).map(String)
            assert.ok(keys.every((k) => !k.includes(PW)), keys.join())
            assert.ok(keys.includes('k_***') && keys.includes('Symbol(s_***)'))
        }
        assert.strictEqual(r.code, '***')
        assert.strictEqual(r.small, 12)
        assert.strictEqual(r2.code, 12345678, '非憑證之數字原樣')

        //過短之數字密碼(少於4位)不遮罩同值數字(會吞掉大量無關數值), 但字串中的同值文字仍遮罩
        let r3 = cpMask({ n: 12, s: 'a12b' }, getSecrets(USER, 12))
        assert.strictEqual(r3.n, 12)
        assert.strictEqual(r3.s, 'a***b')
    })

    it('R6 副本不沿用原型: 繼承屬性不外帶, 繼承之util.inspect.custom不被執行; Error之name取原型鏈上之資料屬性', function() {
        let ran = false
        class Base {
            [util.inspect.custom]() {
                ran = true
                return `custom ${PW}`
            }
        }
        Base.prototype.inherited = PW
        let o = new Base()
        o.own = PW
        let r = cpMask(o, SECRETS)
        assert.strictEqual(r.own, '***')
        assert.ok(!('inherited' in r))
        assert.ok(!util.inspect(r).includes(PW))
        assert.strictEqual(ran, false)

        class MyError extends Error {}
        MyError.prototype.name = 'MyError'
        let r2 = cpMask(new MyError('x'), SECRETS)
        assert.strictEqual(r2.name, 'MyError')
    })

    it('R5 不執行使用端程式: getter、Symbol.toStringTag之getter、自訂stack與message存取器皆不被執行, 拋錯之getter不使其拋錯', function() {
        let ran = []
        let o = {}
        Object.defineProperty(o, 'g', {
            get() {
                ran.push('g')
                return PW
            },
            enumerable: true
        })
        Object.defineProperty(o, Symbol.toStringTag, {
            get() {
                ran.push('tag')
                return 'X'
            }
        })
        Object.defineProperty(o, 'boom', {
            get() {
                throw new Error('boom')
            },
            enumerable: true
        })
        let r = cpMask(o, SECRETS)
        assert.strictEqual(r.g, '[Getter/Setter]')
        assert.strictEqual(r.boom, '[Getter/Setter]')

        let e = new Error('m')
        Object.defineProperty(e, 'stack', {
            get() {
                ran.push('stack')
                return PW
            }
        })
        Object.defineProperty(e, 'message', {
            get() {
                ran.push('message')
                return PW
            }
        })
        let r2 = cpMask(e, SECRETS)
        assert.ok(r2 instanceof Error)
        assert.deepStrictEqual(ran, [])
    })

    it('R5 Proxy與陷阱拋錯之值不使其拋錯', function() {
        let p = new Proxy({}, {
            getPrototypeOf() {
                throw new Error('trap')
            },
            ownKeys() {
                throw new Error('trap')
            },
            get() {
                throw new Error('trap')
            },
        })
        let r = cpMask({ p }, SECRETS)
        assert.strictEqual(r.p, '[Uncopyable]')
        getBriefErr(p)
    })

})


describe('getBriefErr', function() {

    it('R2 只列類別與機器代碼, 不含訊息文字', function() {
        class ConnectionError extends Error {}
        let e = new ConnectionError(`Login failed for ${USER} ${PW}`)
        e.code = 'ELOGIN'
        assert.deepStrictEqual(getBriefErr(e), { errType: 'ConnectionError', errCode: 'ELOGIN' })
        assert.deepStrictEqual(getBriefErr(new Error('x')), { errType: 'Error' })
    })

    it('R2 sequelize包裝驅動程式之錯誤: 代碼取自original.code與parent.code(機器代碼樣式), 資料值樣式者不列', function() {
        let e = new Error('w')
        e.original = { code: 'SQLITE_CANTOPEN' }
        assert.deepStrictEqual(getBriefErr(e), { errType: 'Error', errCode: 'SQLITE_CANTOPEN' })
        let e2 = new Error('w')
        e2.parent = { code: 18456 }
        assert.deepStrictEqual(getBriefErr(e2), { errType: 'Error', errCode: 18456 })
        for (let c of ['a@b.c', 'u-secret-001', 123456789012, 1.5, 'select', '']) {
            let e3 = new Error('w')
            e3.code = c
            assert.deepStrictEqual(getBriefErr(e3), { errType: 'Error' }, String(c))
        }
    })

    it('R2 各方言的機器代碼: mysql與mariadb的ER_與PROTOCOL_、postgres的SQLSTATE 5碼(前2碼為已知類別)、mssql的ELOGIN/ESOCKET; 非已知類別之5碼大寫字串不列', function() {
        let brief = (code) => getBriefErr(Object.assign(new Error('m'), { original: { code } }))
        for (let c of ['ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST', '28P01', '3D000', '42P01', '08006', 'ELOGIN', 'ESOCKET', 'ECONNREFUSED']) {
            assert.deepStrictEqual(brief(c), { errType: 'Error', errCode: c }, c)
        }
        for (let c of ['USER1', 'ABCDE', 'S3cretPw', 'er_lower', 'ER_', 'PROTOCOL_has space']) {
            assert.deepStrictEqual(brief(c), { errType: 'Error' }, c)
        }
    })

    it('R2 字串或非物件之reject值只列型別(字串內容可能夾帶資料)', function() {
        assert.deepStrictEqual(getBriefErr(`bad ${PW}`), { errType: 'string' })
        assert.deepStrictEqual(getBriefErr(null), { errType: 'null' })
        assert.deepStrictEqual(getBriefErr(undefined), { errType: 'undefined' })
        assert.deepStrictEqual(getBriefErr(5), { errType: 'number' })
        assert.deepStrictEqual(getBriefErr({ code: 'ENOENT' }), { errType: 'object', errCode: 'ENOENT' })
    })

    it('R2 建構子名稱不合識別字樣式者列為Error; 不執行getter與使用端程式', function() {
        class X extends Error {}
        Object.defineProperty(X, 'name', { value: `bad name ${PW}` })
        assert.deepStrictEqual(getBriefErr(new X('m')), { errType: 'Error' })

        let ran = false
        let e = new Error('m')
        Object.defineProperty(e, 'code', {
            get() {
                ran = true
                return 'ENOENT'
            }
        })
        Object.defineProperty(e, 'original', {
            get() {
                ran = true
                return { code: 'ENOENT' }
            }
        })
        assert.deepStrictEqual(getBriefErr(e), { errType: 'Error' })
        assert.strictEqual(ran, false)
    })

})


describe('getSqlStmt', function() {

    it('R2 只取敘述種類(白名單, 去除sequelize加上之Executing前綴), 不含表名與值; 其餘為OTHER', function() {
        assert.strictEqual(getSqlStmt('Executing (default): SELECT * FROM `users` WHERE id=\'a@b.c\''), 'SELECT')
        assert.strictEqual(getSqlStmt('Executing (default): PRAGMA TABLE_INFO(`users`);'), 'PRAGMA')
        assert.strictEqual(getSqlStmt('  select 1'), 'SELECT')
        assert.strictEqual(getSqlStmt('Executing (abc-123): INSERT INTO t VALUES (1)'), 'INSERT')
        assert.strictEqual(getSqlStmt('Executing (default): secret_proc 1'), 'OTHER')
        assert.strictEqual(getSqlStmt(''), 'OTHER')
        assert.strictEqual(getSqlStmt(null), 'OTHER')
        assert.strictEqual(getSqlStmt({}), 'OTHER')
    })

})
