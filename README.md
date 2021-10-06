# w-auto-sequelize
A wrapper for sequelize-auto.

Fork from: [sequelize-auto](https://github.com/sequelize/sequelize-auto)

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-auto-sequelize.svg?style=flat)](https://npmjs.org/package/w-auto-sequelize) 
[![license](https://img.shields.io/npm/l/w-auto-sequelize.svg?style=flat)](https://npmjs.org/package/w-auto-sequelize) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-auto-sequelize/master/dist/w-auto-sequelize.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-auto-sequelize)
[![npm download](https://img.shields.io/npm/dt/w-auto-sequelize.svg)](https://npmjs.org/package/w-auto-sequelize) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-auto-sequelize.svg)](https://www.jsdelivr.com/package/npm/w-auto-sequelize)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-auto-sequelize/WAutoSequelize.html).

## Installation
### Using npm(ES6 module):
> **Note:** `w-auto-sequelize` is mainly dependent on `sequelize`, `async`, `eslint`, `fs` and `path`
```alias
npm i w-auto-sequelize
```
#### Example for generate:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-auto-sequelize/blob/master/g.mjs)]
```alias
import was from 'w-auto-sequelize'

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

// then => {
//     "tables": {
//         "users": {
//             "id": {
//                 "type": "VARCHAR(50)",
//                 "allowNull": false,
//                 "defaultValue": null,
//                 "primaryKey": true,
//                 "autoIncrement": false,
//                 "comment": null,
//                 "foreignKey": {
//                     "source_table": "users",
//                     "constraint_name": "PK_users",
//                     "source_column": "id",
//                     "target_table": null,
//                     "target_column": null,
//                     "constraint_type": "PRIMARY KEY",
//                     "is_identity": false,
//                     "isPrimaryKey": true
//                 }
//             },
//             "name": {
//                 "type": "NVARCHAR(50)",
//                 "allowNull": true,
//                 "defaultValue": null,
//                 "primaryKey": false,
//                 "autoIncrement": false,
//                 "comment": null
//             },
//             "value": {
//                 "type": "FLOAT",
//                 "allowNull": true,
//                 "defaultValue": null,
//                 "primaryKey": false,
//                 "autoIncrement": false,
//                 "comment": null
//             }
//         }
//     },
//     "foreignKeys": {
//         "users": {
//             "id": {
//                 "source_table": "users",
//                 "constraint_name": "PK_users",
//                 "source_column": "id",
//                 "target_table": null,
//                 "target_column": null,
//                 "constraint_type": "PRIMARY KEY",
//                 "is_identity": false,
//                 "isPrimaryKey": true
//             }
//         }
//     }
// }
```