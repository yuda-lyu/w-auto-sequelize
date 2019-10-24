import was from './src/WAutoSequelize.mjs'

//opt
let opt = {
    database: 'worm',
    username: 'username',
    password: 'password',
    dialect: 'mssql',
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
