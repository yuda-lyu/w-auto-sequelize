import get from 'lodash-es/get'
import toInteger from 'lodash-es/toInteger'
import genPm from 'wsemi/src/genPm.mjs'
import AutoSequelize from './auto-sequelize.js'


/**
 * 由指定資料庫生成各表的models資料
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.database=null] 輸入資料庫名稱字串，預設null
 * @param {String} [opt.username=null] 輸入使用者名稱字串，預設null
 * @param {String} [opt.password=null] 輸入密碼字串，預設null
 * @param {String} [opt.dialect=null] 輸入資料庫種類字串，預設null，可選'mysql', 'mariadb', 'sqlite', 'postgres', 'mssql'
 * @param {String} [opt.directory='./models'] 輸入models儲存的資料夾名稱字串，預設'./models'
 * @param {String} [opt.host='localhost'] 輸入連線主機host位址字串，預設'localhost'
 * @param {Integer} [opt.port=null] 輸入連線主機port整數，預設null
 * @param {String} [opt.storage=''] 輸入sqlite檔案位置字串，預設''
 * @returns {Promise} 回傳Promise，resolve回傳產生的models資料，reject回傳錯誤訊息
 */
function WAutoSequelize(opt = {}) {
    let pm = genPm()

    //params
    let database = get(opt, 'database', null)
    let username = get(opt, 'username', null)
    let password = get(opt, 'password', null)
    let dialect = get(opt, 'dialect', null)
    let directory = get(opt, 'directory', './models')
    let host = get(opt, 'host', 'localhost')
    let port = toInteger(get(opt, 'port', null))
    let storage = get(opt, 'storage', '')
    let options = {
        dialect,
        directory,
        host,
        port,
        storage,
        // additional: {
        //     timestamps: false
        // },
        // lang: 'esm' //使用sequelize-auto最新版可使用lang="es5" | "es6" | "esm" | "ts", 待測試, 但其對nvarchar(MAX)無法轉回TEXT
    }

    //check
    if (!database) {
        pm.reject('need database')
        return pm
    }
    if (!username) {
        pm.reject('need username')
        return pm
    }
    if (!password) {
        pm.reject('need password')
        return pm
    }
    if (!dialect) {
        pm.reject('need dialect')
        return pm
    }
    if (!port) {
        pm.reject('need port')
        return pm
    }

    //auto
    let auto = new AutoSequelize(database, username, password, options)

    //run
    auto.run(function (err) {
        if (err) {
            pm.reject(err)
        }
        else {
            pm.resolve({
                tables: auto.tables,
                foreignKeys: auto.foreignKeys,
            })
        }
    })

    return pm
}


export default WAutoSequelize
