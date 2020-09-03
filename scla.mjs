import was from './src/WAutoSequelize.mjs'

//opt
let opt = {
    database: 'worm',
    username: 'username',
    password: 'password',
    dialect: 'mssql', //要測試才會依賴mssql
    directory: './models',
    host: 'localhost',
    port: 1433,
}

was(opt)
    .then((res) => {
        console.log(JSON.stringify(res, null, 4))
    })
    .catch((err) => {
        console.log(err)
    })

//node --experimental-modules --es-module-specifier-resolution=node scla.mjs
