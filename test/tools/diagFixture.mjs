import fs from 'fs'
import path from 'path'
import util from 'util'
import sqlite3 from 'sqlite3'
import Sequelize from 'sequelize'


//共用測試夾具: 建立sqlite資料庫、擷取console輸出; 暫存檔放test/_tmp/<案名>/(由各測試於after刪除)

let ks = ['log', 'info', 'warn', 'error', 'debug']


function run(db, sql) {
    return new Promise((resolve, reject) => {
        db.run(sql, (e) => {
            if (e) {
                reject(e)
            }
            else {
                resolve()
            }
        })
    })
}


//mkDb, 建立sqlite檔並回傳其絕對路徑; 未給sqls者建立depts、users兩表(users.deptId參照depts.id), 給了則改為依序執行sqls
async function mkDb(dir, name = 'fixture.sqlite', sqls = null) {
    fs.mkdirSync(dir, { recursive: true })
    let storage = path.resolve(path.join(dir, name))
    fs.rmSync(storage, { force: true })
    let db = new sqlite3.Database(storage)
    for (let sql of sqls || [
        'CREATE TABLE depts (id VARCHAR(50) PRIMARY KEY NOT NULL, title NVARCHAR(50))',
        'CREATE TABLE users (id VARCHAR(50) PRIMARY KEY NOT NULL, name NVARCHAR(50), score FLOAT DEFAULT 1.5, note TEXT, deptId VARCHAR(50) REFERENCES depts(id))',
    ]) {
        await run(db, sql)
    }
    await new Promise((resolve) => db.close(resolve))
    return storage
}


//capture, 擷取console各方法之輸出: lines為以util.format格式化之字串(與實際輸出一致, 前綴方法名), calls為{ m, args }
async function capture(fn) {
    let lines = []
    let calls = []
    let olds = ks.map((k) => console[k])
    ks.forEach((k) => {
        console[k] = (...a) => {
            calls.push({ m: k, args: a })
            lines.push(`${k}: ${util.format(...a)}`)
        }
    })
    let res
    let err
    let isErr = false
    try {
        res = await fn()
    }
    catch (e) {
        isErr = true
        err = e
    }
    finally {
        ks.forEach((k, i) => {
            console[k] = olds[i]
        })
    }
    return { res, err, isErr, lines, calls }
}


//settle, 讓背景的promise與回呼有機會執行完(funLog回傳之promise reject等)
function settle(ms = 30) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}


//patch, 暫時覆寫物件上的方法, 回傳還原函數
function patch(obj, name, fn) {
    let had = Object.prototype.hasOwnProperty.call(obj, name)
    let old = obj[name]
    obj[name] = fn
    return () => {
        if (had) {
            obj[name] = old
        }
        else {
            delete obj[name]
        }
    }
}


//測試用帳密
const PW = 'S3cretPw'
const USER = 'tuser'


//mkSecretErr, 錯誤文字、屬性值、屬性鍵與Symbol描述皆夾帶帳密
function mkSecretErr() {
    let e = new Error(`Login failed for user '${USER}' pw ${PW} url mssql://${USER}:${PW}@db.local:1433`)
    e.code = 'ELOGIN'
    e.sql = `SELECT '${PW}'`
    e[`key_${PW}`] = 2
    e[Symbol(`sym_${PW}`)] = 3
    return e
}


//withShowAllTablesFail, 使showAllTables(建表清單)失敗: mkErr回傳之值為reject值, 預設錯誤文字夾帶帳密
async function withShowAllTablesFail(fn, mkErr = mkSecretErr) {
    let qi = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }).getQueryInterface()
    let restore = patch(Object.getPrototypeOf(qi), 'showAllTables', () => Promise.reject(mkErr()))
    try {
        return await fn()
    }
    finally {
        restore()
    }
}


//withDescribeFail, 使指定表的describeTable失敗(其餘表照常): mkErr回傳之值為reject值, 預設錯誤文字夾帶帳密
async function withDescribeFail(fn, table = 'users', mkErr = mkSecretErr) {
    let qi = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }).getQueryInterface()
    let proto = Object.getPrototypeOf(qi)
    let orig = qi.describeTable
    let restore = patch(proto, 'describeTable', function(t, ...a) {
        if (t === table) {
            return Promise.reject(mkErr())
        }
        return orig.call(this, t, ...a)
    })
    try {
        return await fn()
    }
    finally {
        restore()
    }
}


//withForeignKeysFail, 使mapForeignKeys之PRAGMA foreign_key_list(表名);查詢失敗(describeTable內之同名查詢帶反引號, 不受影響): mkErr回傳之值為reject值, 預設錯誤文字夾帶帳密
async function withForeignKeysFail(fn, mkErr = mkSecretErr) {
    let orig = Sequelize.prototype.query
    let restore = patch(Sequelize.prototype, 'query', function(sql, ...a) {
        if (typeof sql === 'string' && /foreign_key_list\(\w+\);/.test(sql)) {
            return Promise.reject(mkErr())
        }
        return orig.call(this, sql, ...a)
    })
    try {
        return await fn()
    }
    finally {
        restore()
    }
}


//outcome, 取promise之了結結果: { state: 'resolved'|'rejected'|'pending', v }; 了結即回, 逾ms仍未了結者為pending(僅為懸置之防護上限, 非斷言之同步點)
function outcome(pm, ms = 10000) {
    let timer = null
    let guard = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ state: 'pending', v: undefined }), ms)
    })
    let done = pm.then((v) => ({ state: 'resolved', v }), (v) => ({ state: 'rejected', v }))
    return Promise.race([done, guard]).finally(() => clearTimeout(timer))
}


//watchUnhandled, 執行fn期間(含其後短暫觀察窗)收集unhandledRejection之值: 回傳{ res, seen }
async function watchUnhandled(fn, ms = 60) {
    let seen = []
    let onRej = (e) => seen.push(e)
    process.on('unhandledRejection', onRej)
    try {
        let res = await fn()
        await settle(ms)
        return { res, seen }
    }
    finally {
        process.off('unhandledRejection', onRej)
    }
}


//countClose, 執行fn期間計算Sequelize.prototype.close之呼叫次數(連線是否關閉): 回傳{ res, n }
async function countClose(fn) {
    let n = 0
    let orig = Sequelize.prototype.close
    let restore = patch(Sequelize.prototype, 'close', function(...a) {
        n++
        return orig.apply(this, a)
    })
    try {
        let res = await fn()
        return { res, n }
    }
    finally {
        restore()
    }
}


//withWriteFileFail, 使fs.writeFile(寫出模型檔)以給定之值失敗: 值由mkErr回傳, 送回auto.run之callback, 本套件由pm.reject交出
async function withWriteFileFail(fn, mkErr) {
    let restore = patch(fs, 'writeFile', (p, data, cb) => {
        cb(mkErr())
    })
    try {
        return await fn()
    }
    finally {
        restore()
    }
}


export { mkDb, capture, settle, patch, PW, USER, mkSecretErr, withShowAllTablesFail, withDescribeFail, withForeignKeysFail, outcome, watchUnhandled, countClose, withWriteFileFail }
