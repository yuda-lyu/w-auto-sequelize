import fs from 'fs'
import assert from 'assert'
import { fileURLToPath } from 'url'
import getSqlStmt from '../src/getSqlStmt.mjs'


//rulebook R1、R2、R8: 診斷輸出由wsemi之getDiag提供(遮罩/摘要/出口之形態類案由wsemi內測與其共用語料_diagCases驅動, 本套件接線見api-diaglog與api-diaglog-wire)
//  R1 單一出口: src內程式碼不得呼叫console; 無自寫遮罩/診斷函數(src/getDiag.mjs已刪)
//  R2 safe摘要之敘述種類: getSqlStmt白名單
//  R8 站點全集盤點(R-DIAG-01): diag呼叫、pm.reject、throw與logErr各站點逐一鎖定, 新增站點須同步更新此處與rulebook


let dirSrc = fileURLToPath(new URL('../src/', import.meta.url))


function stripComments(s) {
    //粗略去除註解(區塊與單行), 供掃描程式碼本體; 引號內之//(如網址)不在src的掃描範圍內
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([;{},)\s])\/\/.*$/gm, '$1')
}


function codeOf(name) {
    return stripComments(fs.readFileSync(dirSrc + name, 'utf8'))
}


function linesOf(name, re) {
    //程式碼本體中符合re之行(去除前後空白)
    return codeOf(name).split('\n').map((s) => s.trim()).filter((s) => re.test(s))
}


describe('R1 單一出口與sequelize實例日誌設定', function() {

    it('R1 src內程式碼不得出現console(診斷輸出皆經wsemi之getDiag)', function() {
        let fns = fs.readdirSync(dirSrc).filter((n) => /\.(mjs|js)$/.test(n))
        assert.ok(fns.includes('auto-sequelize.js') && fns.includes('WAutoSequelize.mjs') && fns.includes('getSqlStmt.mjs'))
        let hits = []
        for (let n of fns) {
            codeOf(n).split('\n').forEach((line, i) => {
                if (/\bconsole\b/.test(line)) {
                    hits.push(`${n}:${i + 1}: ${line.trim()}`)
                }
            })
        }
        assert.deepStrictEqual(hits, [])
    })

    it('R1 診斷輸出與遮罩只用wsemi之共用實作: src/getDiag.mjs已刪, src無自寫之遮罩/摘要/出口函數, WAutoSequelize.mjs取自wsemi之getDiag與getDiagSecrets', function() {
        assert.ok(!fs.existsSync(dirSrc + 'getDiag.mjs'))
        let fns = fs.readdirSync(dirSrc).filter((n) => /\.(mjs|js)$/.test(n))
        for (let n of fns) {
            let code = codeOf(n)
            for (let k of ['getOptLog', 'getSecrets', 'maskText', 'cpMask', 'getBriefErr', 'mkErrCopy', 'swallow', 'maskSafe', 'getForms']) {
                assert.ok(!new RegExp(`\\b${k}\\b`).test(code), `${n}含自寫之${k}`)
            }
        }
        let code = codeOf('WAutoSequelize.mjs')
        assert.ok(/^import getDiag from 'wsemi\/src\/getDiag\.mjs'$/m.test(code))
        assert.ok(/^import getDiagSecrets from 'wsemi\/src\/getDiagSecrets\.mjs'$/m.test(code))
    })

    it('R1 package.json依賴之wsemi須含共用診斷模組(>=1.9.31)', function() {
        let pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
        let m = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(pkg.dependencies.wsemi)
        assert.ok(m, pkg.dependencies.wsemi)
        let v = [Number(m[1]), Number(m[2]), Number(m[3])]
        assert.ok(v[0] > 1 || (v[0] === 1 && (v[1] > 9 || (v[1] === 9 && v[2] >= 31))), pkg.dependencies.wsemi)
    })

})


describe('R8 站點全集(R-DIAG-01)', function() {

    it('R8 diag呼叫站點恰兩處: sql紀錄(level預設log, safe只有stmt)與錯誤(label為logErr傳入之固定標籤, safe只來自diag.brief, level為error)', function() {
        let ls = linesOf('WAutoSequelize.mjs', /(^|[^.\w])diag\(/)
        assert.deepStrictEqual(ls, [
            'diag(\'sql\', { stmt: getSqlStmt(sql) }, () => sql)',
            'diag(label, diag.brief(err), () => err, \'error\')',
        ])
        //logErr之呼叫端(auto-sequelize.js)只有兩個固定標籤, 共三個站點(建表清單失敗、外鍵查詢失敗、描述表失敗), 皆於記錄後以同一錯誤呼叫callback(R10)
        assert.deepStrictEqual(linesOf('auto-sequelize.js', /\blogErr\(/), [
            'self.logErr(\'tables catch\', err)',
            'self.logErr(\'foreign keys catch\', err)',
            'if (err) self.logErr(\'tables catch\', err)',
        ])
        let code = codeOf('auto-sequelize.js')
        assert.ok(/function failTables\(err\) \{\s*self\.logErr\('tables catch', err\)\s*callback\(err\)\s*\}/.test(code))
        assert.ok(/if \(err\) \{\s*self\.logErr\('foreign keys catch', err\)\s*return callback\(err\)\s*\}/.test(code))
        assert.ok(/if \(err\) self\.logErr\('tables catch', err\)\s*callback\(err\)/.test(code))
    })

    it('R10 失敗以同一錯誤結束: generateText遇err即關閉連線並callback(err)(不產生模型檔); write之建立輸出資料夾於try內, 失敗以該fs錯誤callback(不同步拋出)', function() {
        let code = codeOf('auto-sequelize.js')
        assert.ok(/function generateText\(err\) \{\s*let quoteWrapper = '"'\s*if \(err\) \{\s*self\.sequelize\.close\(\)\s*return callback\(err\)\s*\}/.test(code))
        assert.ok(/try \{\s*fs\.mkdirSync\(path\.resolve\(self\.options\.directory\), \{ recursive: true \}\)\s*\}\s*catch \(err\) \{\s*return callback\(err\)\s*\}/.test(code))
        //fs.mkdirSync全檔恰一處(於上述try內)
        assert.strictEqual(linesOf('auto-sequelize.js', /\bmkdirSync\(/).length, 1)
    })

    it('R8 pm.reject站點: 固定詞彙(need xxx、invalid opt.directory)不經遮罩, 其餘(後端/fs之外來值)一律經diag.err', function() {
        let ls = linesOf('WAutoSequelize.mjs', /\bpm\.reject\(/)
        assert.deepStrictEqual(ls, [
            'pm.reject(\'need database\')',
            'pm.reject(\'need username\')',
            'pm.reject(\'need password\')',
            'pm.reject(\'need dialect\')',
            'pm.reject(\'need port\')',
            'pm.reject(\'invalid opt.directory: must be a string\')',
            'pm.reject(diag.err(err))',
        ])
    })

    it('R8 throw站點: 只有建構AutoSequelize之catch內throw diag.err(err)', function() {
        assert.deepStrictEqual(linesOf('WAutoSequelize.mjs', /\bthrow\b/), ['throw diag.err(err)'])
        let code = codeOf('WAutoSequelize.mjs')
        assert.ok(/try\s*\{\s*auto = new AutoSequelize\([^)]*\)\s*\}\s*catch \(err\) \{\s*throw diag\.err\(err\)\s*\}/.test(code))
    })

    it('R8 sql-string.js之throw站點(訊息含值)不可達: escape只在auto-sequelize.js以_.isString守門後呼叫, format與formatNamedParameters無呼叫點', function() {
        let ls = linesOf('auto-sequelize.js', /\bSqlString\./)
        assert.strictEqual(ls.length, 1, ls.join('\n'))
        assert.ok(/_\.isString\(val_text\)[^?]*\? SqlString\.escape\(/.test(ls[0]), ls[0])
        let fns = fs.readdirSync(dirSrc).filter((n) => /\.(mjs|js)$/.test(n))
        for (let n of fns) {
            assert.ok(!/\bSqlString\.(format|formatNamedParameters)\b/.test(codeOf(n)), n)
        }
        //sql-string.js內之throw恰三處(escape非字串值、format非字串sql、formatNamedParameters缺值), 新增者須重新分類
        assert.strictEqual(linesOf('sql-string.js', /\bthrow\b/).length, 3)
    })

    it('R8 getDiag宣告: secrets含帳號/密碼/sqlite路徑, codes為sqlite/mysql/mssql/sqlstate, nested為original/parent, safeKeys為stmt, types為Sequelize…類別名', function() {
        let code = codeOf('WAutoSequelize.mjs')
        assert.ok(/secrets: getDiagSecrets\(\{ username, password, paths: getStoragePaths\(dialect, storage, database\) \}\)/.test(code))
        assert.ok(/const ERR_CODES = \['sqlite', 'mysql', 'mssql', 'sqlstate'\]/.test(code))
        assert.ok(/const ERR_NESTED = \['original', 'parent'\]/.test(code))
        assert.ok(/const SAFE_KEYS = \['stmt'\]/.test(code))
        let m = /const ERR_TYPES = \[([^\]]*)\]/.exec(code)
        assert.ok(m)
        let names = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
        assert.strictEqual(names.length, 12)
        assert.ok(names.every((s) => /^Sequelize[A-Za-z]+Error$/.test(s)), names.join())
        assert.ok(/codes: ERR_CODES,\s*types: ERR_TYPES,\s*nested: ERR_NESTED,\s*safeKeys: SAFE_KEYS/.test(code))
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
