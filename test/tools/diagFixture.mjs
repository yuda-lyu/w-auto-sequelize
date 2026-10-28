import fs from 'fs'
import path from 'path'
import util from 'util'
import sqlite3 from 'sqlite3'


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


export { mkDb, capture, settle }
