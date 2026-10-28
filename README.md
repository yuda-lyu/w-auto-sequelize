# w-auto-sequelize
A wrapper for sequelize-auto.

Fork from: [sequelize-auto](https://github.com/sequelize/sequelize-auto)

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-auto-sequelize.svg?style=flat)](https://npmjs.org/package/w-auto-sequelize) 
[![license](https://img.shields.io/npm/l/w-auto-sequelize.svg?style=flat)](https://npmjs.org/package/w-auto-sequelize) 
[![npm download](https://img.shields.io/npm/dt/w-auto-sequelize.svg)](https://npmjs.org/package/w-auto-sequelize) 
[![npm download](https://img.shields.io/npm/dm/w-auto-sequelize.svg)](https://npmjs.org/package/w-auto-sequelize) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-auto-sequelize.svg)](https://www.jsdelivr.com/package/npm/w-auto-sequelize)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-auto-sequelize/WAutoSequelize.html).

### Diagnostic output: `opt.logging`, `opt.logDetail` and `opt.funLog`

Everything this package prints goes through **one exit**. By default that exit writes **nothing** while the run goes well, and only a fixed label and a short summary that holds **no SQL text, no table name, no error text of the back end and no path** when a step fails — the console of a service is often collected by a log system, and a driver error can carry the host, the login and file paths. The database user name and password are **never** printed, not even in the detailed forms below (`opt.logDetail`, `opt.funLog`): they are replaced by `***` (a user name of fewer than 3 characters is masked only together with the password, as `user:password`; see the masking rules below).

| Option | Default | Effect |
|---|---|---|
| `opt.logging` | `false` | `true` records the SQL that sequelize runs (table structure queries). By default only the kind of statement is printed (`sql { stmt: 'PRAGMA' }`); the full SQL needs `logDetail` or `funLog`. Anything other than `true` is ignored. |
| `opt.logDetail` | `false` | `true` restores the former detailed console output (the full SQL of `opt.logging` with `console.log`, the error object of a failed step with `console.error`). It can show table names, host and driver text: **for debugging only**. Anything other than `true` is ignored. |
| `opt.funLog` | none | A function `(label, safe, detail)`. When given, diagnostic output goes **only** to it, the console is not written. `label` is the fixed label (`'sql'`, `'foreign keys catch'`, `'tables catch'`), `safe` the summary without personal data (`{ stmt }` for `'sql'`, `{ errType, errCode }` for the others), `detail` the full detail (the SQL string, or a copy of the error), with the user name and the password already replaced by `***`. `detail` of an error is a masked **copy**, bounded in size: own properties (`original`, `parent`, `sql`, `parameters`, …), the stack and `cause` are copied, nesting deeper than 6 levels becomes `'[Truncated]'` and the keys beyond the first 2000 nodes are left out, and functions, binary data, `Map`/`Set` and getters become markers; no code of yours (getters, custom `inspect`) is run to build it. Anything but a function is ignored; a function that throws, or returns a promise that rejects, never affects the run. |

What is printed by default:

| Where | Before (1.0.50 and earlier) | Now |
|---|---|---|
| every query sequelize runs | `Executing (default): SELECT name FROM …` with `console.log`, one line per query (11 lines for a database of two tables) | nothing; with `logging: true`: `sql { stmt: 'SELECT' }` per statement |
| the list of tables or the description of a table cannot be read (wrong host or login, unreachable file, …) | `console.error(err)`: the whole error, with the driver text, host and paths | `tables catch { errType: 'ConnectionError', errCode: 'SQLITE_CANTOPEN' }` with `console.error`: the error class and a machine code (`ENOENT`, `ELOGIN`, `SQLITE_…`, `ER_…` and `PROTOCOL_…` of mysql and mariadb, a PostgreSQL SQLSTATE such as `28P01`, a small integer) when there is one |
| the foreign keys of a table cannot be read | `console.error(err)` | `foreign keys catch { errType, errCode }` with `console.error` |

```alias
// production: nothing on the console while it goes well, only a label and a summary when a step fails
let res = await was(opt)

// debugging: the former detail, credentials still masked
let resd = await was({ ...opt, logging: true, logDetail: true })

// forward everything to your own logger, masking what you must
let resf = await was({
    ...opt,
    logging: true,
    funLog: (label, safe, detail) => {
        logger.info({ label, safe }) // safe holds no personal data
        // `detail` has the full text (SQL, error): mask it before it leaves your process
    },
})
```

The credentials are masked as the password, `user:password` and the user name (as a name on its own only when it has at least 3 characters, shorter ones would blot out unrelated text; a shorter name is still masked in `user:password`). Each is masked in the forms it takes in SQL text and URLs: as is, with doubled single quotes (sqlite, postgres, mssql), with backslash escapes (mysql, mariadb), and URL encoded (`encodeURIComponent`, the strict form with `%27`, a space as `+`, lower case hex). Any `scheme://user:password@host` is masked too, as a best effort for credentials that are not the configured ones (everything up to the last `@`). A password given as a number is masked as text, and as a number value when it has at least 4 digits (a shorter number would blot out unrelated values). Property names (also on arrays) and `Symbol` descriptions of a detail are masked like values.

### Breaking changes: diagnostic output

Only what is printed changes. The value the returned promise resolves with, the model files that are written and the rejections (`need database`, `need username`, `need password`, `need dialect`, `need port`) are the same as before.

- The sequelize query log is off now: sequelize used its default logger (`console.log`) before. **To see the SQL again add `logging: true` and `logDetail: true`, or read it from `funLog`.** `logging: true` by itself prints only the kind of statement. It is passed to sequelize as a function (never as `true`), so the sequelize deprecation warning about `logging: true` cannot occur.

  ```alias
  // before (1.0.50 and earlier): the SQL of every query on the console, always
  was(opt)

  // now: the same output, asked for explicitly
  was({ ...opt, logging: true, logDetail: true })
  // or receive it yourself: funLog('sql', { stmt: 'SELECT' }, 'Executing (default): SELECT …')
  was({ ...opt, logging: true, funLog: (label, safe, detail) => { /* … */ } })
  ```
- The error objects that were written with `console.error` are now written as a label and a summary (`opt.logDetail: true` restores the error object, its class name, message, stack and properties as printed before, with credentials masked).
- **A step that fails is still only reported, not rejected** (as before): when the list of tables cannot be read, the promise still resolves, with empty `tables` and `foreignKeys`, and the only trace of the failure is the diagnostic output above. Watch for `tables catch` on the console or in `funLog`, or check the result. If you relied on a log scraper that matched the former `console.error` text, match the label instead.
- The summary may name the error class and machine code (`errType`, `errCode`); they are program identifiers, not data.
- Not covered: a `Sequelize` instance passed as `database` (not documented; the option is a string) keeps its own logger, which this package cannot reach; `host`, `database` and `storage` are not credentials and can appear in `logDetail` and `funLog` details; warnings that Node.js or a driver raises itself (for example a deprecation warning, `process.emitWarning`); and the exception that `was` throws synchronously when the driver package of the dialect is not installed (unchanged, and it carries no credentials).

## Installation

### Using npm(ES6 module):
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