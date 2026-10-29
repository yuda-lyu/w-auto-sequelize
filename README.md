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

Everything this package prints goes through **one exit**: the shared diagnostic module of [wsemi](https://github.com/yuda-lyu/wsemi) (`getDiag`, wsemi 1.9.31 and later; its masking, summary and copy rules are documented there, and the options below behave as described for `getDiag`). By default that exit writes **nothing** while the run goes well, and only a fixed label and a short summary that holds **no SQL text, no table name, no error text of the back end and no path** when a step fails — the console of a service is often collected by a log system, and a driver error can carry the host, the login and file paths. The database user name, the password and (for sqlite) the database file path are **never** printed, not even in the detailed forms below (`opt.logDetail`, `opt.funLog`): they are replaced by `***`.

| Option | Default | Effect |
|---|---|---|
| `opt.logging` | `false` | `true` records the SQL that sequelize runs (table structure queries). By default only the kind of statement is printed (`sql { stmt: 'PRAGMA' }`); the full SQL needs `logDetail` or `funLog`. Anything other than `true` is ignored. |
| `opt.logDetail` | `false` | `true` prints the masked detail with its label: `console.log('sql', <full SQL>)` for `opt.logging`, `console.error(<label>, <masked copy of the error>)` for a failed step. It can show table names, host and driver text: **for debugging only**. Anything other than `true` is ignored. |
| `opt.funLog` | none | A function `(label, safe, detail)`. When given, diagnostic output goes **only** to it, the console is not written. `label` is the fixed label (`'sql'`, `'foreign keys catch'`, `'tables catch'`), `safe` the summary without personal data (`{ stmt }` for `'sql'`, `{ errType, errCode }` for the others), `detail` the full detail (the SQL string, or a copy of the error), with the user name, the password and the sqlite file path already replaced by `***`. `detail` of an error is a masked **copy**, bounded in size (see `maskDiagCopy` of wsemi): own properties (`original`, `parent`, `sql`, `parameters`, …), the stack and `cause` are copied, deep or large structures are cut, and functions, binary data and getters become markers; no code of yours (getters, custom `inspect`) is run to build it. Anything but a function is ignored; a function that throws, or returns a promise that rejects, never affects the run. |

What is printed by default:

| Where | Before (1.0.50 and earlier) | Now |
|---|---|---|
| every query sequelize runs | `Executing (default): SELECT name FROM …` with `console.log`, one line per query (11 lines for a database of two tables) | nothing; with `logging: true`: `sql { stmt: 'SELECT' }` per statement |
| the list of tables or the description of a table cannot be read (wrong host or login, unreachable file, …) | `console.error(err)`: the whole error, with the driver text, host and paths | `tables catch { errType: 'SequelizeConnectionError', errCode: 'SQLITE_CANTOPEN' }` with `console.error`: the error class and a machine code when there is one (the class is one of the sequelize connection and query error names, otherwise `Error`; the code is one of the listed names of system errors, sqlite `SQLITE_…`, mysql and mariadb `ER_…` and `PROTOCOL_…`, mssql `ELOGIN`, `ESOCKET`, … and a few listed numbers, PostgreSQL SQLSTATE such as `28P01`) |
| the foreign keys of a table cannot be read | `console.error(err)` | `foreign keys catch { errType, errCode }` with `console.error` |

```alias
// production: nothing on the console while it goes well, only a label and a summary when a step fails
let res = await was(opt)

// debugging: label and detail (SQL text, error copy), credentials masked
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

What is masked (the rules are those of `getDiagSecrets` and `maskDiagText` of wsemi): in the **diagnostic output** (`logDetail`, `funLog` detail) the password, `user:password`, the user name (on its own only when it has at least 3 characters) and, for sqlite, the database file path, each in the forms it takes in SQL text and URLs (as is, doubled single quotes, backslash escapes, URL encoded, …), any `scheme://user:password@host`, credential-like keys (`password`, `token`, `authorization`, …) and `Bearer` tokens. In a **rejection value or a thrown error** that comes from the back end or the file system (see below) only credentials are masked (the password with at least 4 characters, `user:password`, the credentials of a connection string): the user name on its own and the storage path are not masked there, so that `err.path` stays usable.

### Rejections and thrown errors

The messages this package builds itself (`need database`, `need username`, `need password`, `need dialect`, `need port`) are fixed strings and are never altered. A value that comes from outside — the error of writing a model file, or the exception sequelize throws synchronously while the instance is created (for example a missing driver package) — passes `diag.err` of wsemi before it is rejected or thrown: when it holds no credential it is the **same object**, otherwise it is a copy of the same class with the credentials replaced by `***` (the message, the stack and the own properties, for example the `path` of a model file whose name contains the password). The returned value of the promise has no per-item `err` field (`{ tables, foreignKeys }` only).

### Breaking changes: shared diagnostic module (wsemi)

The diagnostic code of this package (`src/getDiag.mjs`) is replaced by the shared module of wsemi (`wsemi` must be 1.9.31 or later). What changes for users:

- **`opt.logDetail: true` prints the label too**: `console.log('sql', <full SQL>)` instead of the bare SQL string, `console.error('tables catch', <error copy>)` instead of the bare error object. A log scraper that matched the bare lines has to match the label.
- **The error copy is made by wsemi**: it is an `Error` (the class name is kept in `name`, so the console shows `Error [SequelizeConnectionError]: …`), with the stack, `original`, `parent` and other own properties; the prototype of your own classes is not carried over.
- **`errType` and `errCode` of the summary come from fixed lists**: `errType` is the sequelize class `name` (`SequelizeConnectionError`, `SequelizeAccessDeniedError`, …, instead of the constructor name `ConnectionError`) or `Error`; `errCode` is only a listed name (system errors, sqlite, mysql and mariadb, mssql, PostgreSQL SQLSTATE) or a listed mssql error number, no longer any text of a pattern or any integer below 100000.
- **The summary (`safe`) is no longer text-masked**: it holds only the fixed identifiers `stmt`, `errType` and `errCode`; any other key is dropped.
- **sqlite file paths are masked** in `logDetail` and `funLog` details (they were shown before).
- **Rejections and synchronous throws are credential-free** (see above); before, the back end error was passed on as it was.

### Breaking changes: diagnostic output (1.0.51)

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
- The error objects that were written with `console.error` are now written as a label and a summary (`opt.logDetail: true` prints the label and a masked copy of the error object with its class name, message, stack and properties).
- **A step that fails is still only reported, not rejected** (as before): when the list of tables cannot be read, the promise still resolves, with empty `tables` and `foreignKeys`, and the only trace of the failure is the diagnostic output above. Watch for `tables catch` on the console or in `funLog`, or check the result. If you relied on a log scraper that matched the former `console.error` text, match the label instead.
- The summary may name the error class and machine code (`errType`, `errCode`); they are program identifiers, not data.
- Not covered: a `Sequelize` instance passed as `database` (not documented; the option is a string) keeps its own logger, which this package cannot reach; `host` and the database name (other than a sqlite file path) are not credentials and can appear in `logDetail` and `funLog` details; a password of fewer than 4 characters is not masked in rejection values (it is in details); warnings that Node.js or a driver raises itself (for example a deprecation warning, `process.emitWarning`).

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