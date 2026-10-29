# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

## 索引

| 規則 | 主題 | 對應測試 |
|---|---|---|
| R1 | 診斷輸出單一出口(wsemi之`getDiag`)、sequelize實例一律明給logging | `test/unit-diaglog.test.mjs`(R1)、`test/api-diaglog.test.mjs`(R1) |
| R2 | 預設安全:成功路徑無輸出,失敗只輸出標籤+摘要 | `test/api-diaglog.test.mjs`(R2)、`unit-diaglog`(getSqlStmt) |
| R3 | `opt.logging`與`opt.logDetail`:sql紀錄與細節輸出 | 同上(R3) |
| R4 | `opt.funLog(label, safe, detail)`與選項型別 | 同上(R4) |
| R5 | 診斷輸出不影響流程 | 同上(R5) |
| R6 | 帳號、密碼與sqlite路徑遮罩(依wsemi) | `api-diaglog`(R6)、`api-diaglog-wire`(R8c、R8d) |
| R7 | 回傳契約不變 | `api-diaglog`(R2 R7)、`test/tools/golden-contract.json` |
| R8 | 依主控dspec〈診斷輸出與遮罩〉與wsemi R-DIAG-01:外來值經`diag.err`、固定詞彙reject不包、宣告、共用語料接線 | `test/api-diaglog-wire.test.mjs`、`unit-diaglog`(R8) |

## R1 診斷輸出單一出口

**規則**:`src/`內程式碼不得出現`console`;所有診斷輸出(傳給sequelize之`logging`函數、舊`console.error(err)`站點)皆經wsemi之`getDiag`(`wsemi/src/getDiag.mjs`)所回傳之`diag`,於`WAutoSequelize.mjs`建立;本套件**不得另寫**遮罩、摘要、出口或錯誤副本函數(`src/getDiag.mjs`於2026-10-29 mig-autoseq刪除;遮罩規則之單一擁有者為wsemi,見R8).`new Sequelize(...)`一律明給`logging`:只接受函數,其餘(未給、`true`等)一律`false`,不得落回sequelize預設logger(`console.log`),亦不引發`SEQUELIZE0002`.呼叫端自帶之`Sequelize`實例(`database`傳實例,未文件化)保有其自身logger,不屬本套件可控範圍(README〈Not covered〉).`WAutoSequelize.mjs`可`import`之模組須列於`toolg/gDistRollup.mjs`之external(sequelize、async、fs、path、eslint)或為相對路徑/wsemi(由rollup打包);wsemi之依賴閉包不靜態`import`Node內建模組(wsemi端保證),dist建置以`./tmp/<案名>/dist`驗證.

**盤點指令**(可重跑,期望`console`無任何命中):

```
Grep pattern: \bconsole\b   path: src   (排除註解後應為空)
Grep pattern: new Sequelize path: src   (只應出現在 src/auto-sequelize.js 之 AutoSequelize 建構函式)
```

**站點全集**(console出口與logging):

| 站點 | 處置 |
|---|---|
| `src/auto-sequelize.js` `new Sequelize(...)`(建構函式) | 已套:`_.assign({}, options, { logging: 函數或false })`;`WAutoSequelize`依`opt.logging`給函數或`false` |
| `src/auto-sequelize.js` `mapTables`(外鍵查詢失敗) | 已套:`self.logErr('foreign keys catch', err)` |
| `src/auto-sequelize.js` `generateText`(建表清單或描述表失敗) | 已套:`self.logErr('tables catch', err)` |
| `src/WAutoSequelize.mjs`、`dialects.js`、`sql-string.js`、`ts-helper.js`、`getSqlStmt.mjs` | 無console,可留 |

**注入方式**:`auto-sequelize.js`為CommonJS,無法同步`import`ESM,故由`WAutoSequelize.mjs`建立`logErr(label, err)`(內部呼叫`diag(label, diag.brief(err), () => err, 'error')`)以第5個建構參數傳入;未給者為空函數(`AutoSequelize`非套件匯出,僅內部使用).

**測試**:`unit-diaglog`〈R1〉(掃`src/`程式碼無console、無自寫遮罩函數名、`getDiag.mjs`已刪、wsemi相依版本≥1.9.31)、`api-diaglog`〈R1〉(直接建構`AutoSequelize`驗`options.logging`只收函數、無`SEQUELIZE0002`警告;`WAutoSequelize`預設無任何輸出).

## R2 預設安全

**規則**:未給診斷選項時,成功路徑console完全無輸出;失敗路徑只輸出固定標籤與`safe`摘要(`{ errType, errCode }`),不含SQL全文、表名、錯誤訊息、堆疊、路徑、帳號、密碼;摘要由wsemi之`getDiagBriefErr`(經`diag.brief`)產生:`errType`為內建錯誤類別名或本套件宣告之`types`(sequelize連線與查詢類錯誤之`name`,如`SequelizeConnectionError`),其餘一律`Error`;`errCode`限系統錯誤名、Node代碼與本套件宣告之集合(`sqlite`、`mysql`、`mssql`、`sqlstate`,自身或`original`、`parent`之`code`),不用樣式、整數只收集合明列者;`safe`之鍵白名單為`stmt`、`errType`、`errCode`(`safeKeys`).舊版以`console.error`輸出者,預設摘要與細節仍走`console.error`(`level: 'error'`);SQL紀錄(舊走`console.log`)仍走`console.log`(預設level).

**標籤全集**:`sql`(SQL紀錄)、`foreign keys catch`(外鍵查詢失敗)、`tables catch`(建表清單或描述表失敗).新增站點須新增標籤並補測試與README.

## R3 opt.logging 與 opt.logDetail

**規則**:`opt.logging === true`才紀錄SQL(預設`false`);預設只輸出`sql { stmt: <白名單首字> }`,白名單見`getSqlStmt.mjs`之`STMTS`(其餘`OTHER`);傳給sequelize者為函數(從不為`true`,故無`SEQUELIZE0002`棄用警告).`opt.logDetail === true`時console輸出`(label, 遮罩後細節)`:SQL全文為`console.log('sql', sql全文)`(sql全文與修前逐條相同),錯誤為`console.error(label, 錯誤副本)`(副本由wsemi之`maskDiagCopy`產生,為`Error`,類別名保留於`name`);`logDetail`單獨(`logging`未開)不輸出SQL.**2026-10-29起不再有`bare`**(舊版光杆輸出格式不保留,README〈Breaking changes〉).

## R4 opt.funLog 與選項型別

**規則**:`opt.funLog(label, safe, detail)`為函數才生效;生效時診斷輸出只交給它(不寫console,`logDetail`亦不另寫);`detail`為遮罩後之副本(SQL字串或錯誤副本),無細節者只收兩個引數.型別錯誤之`logging`/`logDetail`/`funLog`、讀取選項時拋錯者,一律忽略並用預設,不使`WAutoSequelize`拋錯(`logDetail`/`funLog`由`getDiag`各自try讀取;`logging`由`WAutoSequelize`以try讀取;與本套件其他選項一致:`port`以`toInteger`轉換、`directory`/`host`未給即用預設).

## R5 診斷輸出不影響流程

**規則**:`funLog`拋錯、回傳reject之promise、`getDetail`拋錯、console拋錯,皆吞下(wsemi之`getDiag`保證);不得影響resolve/reject內容與時機,不得產生unhandledRejection.

## R6 遮罩

**規則**:遮罩規則之單一擁有者為wsemi(`getDiagSecrets`、`maskDiagText`、`maskDiagCopy`、`maskDiagErr`;wsemi `sgud/rule/rulebook_diag.md` R-DIAG-01),本套件只宣告秘密來源:`getDiagSecrets({ username, password, paths })`,其中`paths`為sqlite檔案路徑(`storage`未給時為`database`)之原樣、正規化與絕對路徑(`getStoragePaths`);非sqlite方言無路徑.診斷輸出(`logDetail`、`funLog`之細節)用`detail`清單:密碼(不設長度下限)、`帳號:密碼`、單獨帳號(≥3字元)、sqlite路徑,各取編碼形式;對外錯誤值(R8)用`reject`清單:只含憑證(密碼≥4字元、`帳號:密碼`、連線字串帳密),不含單獨帳號與儲存路徑.

**已知限制**:①帳號<3字元單獨出現不遮罩(`帳號:密碼`並列形式仍遮罩);②`host`、非sqlite之`database`名稱不是憑證,不遮罩(`logDetail`/`funLog`細節可含之);③`reject`清單之短密碼(<4字元)不遮(對外錯誤值);④其餘見dspec〈診斷輸出與遮罩〉§5與wsemi R-DIAG-01.

## R7 回傳契約不變

**規則**:只有診斷輸出與外來值中的憑證可以改變.resolve值`{ tables, foreignKeys }`、模型檔內容、固定詞彙reject訊息(`need database`/`need username`/`need password`/`need dialect`/`need port`)、缺少驅動時同步拋出之Error(無憑證者為原物件)、建表清單或外鍵查詢失敗時**只記錄不reject**(建表失敗照舊resolve空結果`{ tables: {}, foreignKeys: {} }`;外鍵失敗照常建模)皆與修前相同.

**對照基準**:`test/tools/golden-contract.json`為2026-10-28於修前`src/`對`test/tools/diagFixture.mjs`之夾具(depts/users兩表)產生之回傳值與模型檔內容,及修前console輸出行(`oldLines`;2026-10-29起僅用其sql全文,輸出格式已變).重產須有授權且須證明修前行為(用修前碼產生).

## R8 診斷輸出與遮罩(依dspec〈診斷輸出與遮罩〉、wsemi R-DIAG-01)

依據:主控`C:\opensrcOper\dspec\診斷輸出與遮罩.md`(原則D1~D5、裁定Q1~Q3與P1~P9)、wsemi `sgud/rule/rulebook_diag.md` R-DIAG-01(共用模組之行為).本套件之規則:

1. **外來值經`diag.err`**(D3、設計§6.5):後端/驅動/fs回呼拋出或reject之值,於catch站點包`diag.err(v)`;**套件自身以固定詞彙組成之reject不包**(固定字串挖空可反推短密碼).含憑證者為保型副本、無憑證者為原物件(身分不變);只遮憑證,不遮單獨帳號與儲存路徑(Q3).
2. **逐筆`err`於建立時`diag.mask`**:本套件之回傳值無逐筆`err`(僅`{ tables, foreignKeys }`),不適用;`'error'`事件無.
3. **宣告**(`WAutoSequelize.mjs`):`secrets`(帳號、密碼、sqlite路徑)、`codes: ['sqlite', 'mysql', 'mssql', 'sqlstate']`、`nested: ['original', 'parent']`、`types`(12個Sequelize…Error之`name`)、`safeKeys: ['stmt']`;label只用固定識別字.設計表(§4.1)僅列`codes: ['sqlite','mysql','sqlstate']`與`nested`,本套件支援mssql方言(`ELOGIN`等為既有摘要、既有測試)故加`mssql`,並因wsemi以`name`判類別名而宣告`types`(否則`errType`由`ConnectionError`退為`Error`).
4. **`bare`/`method`/`isErr`換為`level`**:`logSql`用預設(`log`,stdout)、`logErr`用`'error'`(stderr),逐站由`api-diaglog`驗串流.
5. **共用語料接線**:`api-diaglog-wire`以`wsemi/src/_diagCases.mjs`之wire案(20案)驅動:適用16案(T01 T07 K01 K09 V02 E01 E07 P01 S07 C01 R01 R04 R07 R11 R12 O01)經本套件真實站點,不適用4案(R02 O15 A01 A07,原因見該檔);語料新增wire案時分類斷言失敗而須歸類.

**站點 × 處置表**(盤點指令:`Grep pm\.reject|\bthrow\b|logErr|\bdiag\(|\bconsole\b path: src`;2026-10-29盤點):

| # | 站點 | 值來源 | 處置 | 測試 |
|---|---|---|---|---|
| 1~5 | `WAutoSequelize.mjs` `pm.reject('need database'/'need username'/'need password'/'need dialect'/'need port')` | 本套件固定詞彙 | 不包`diag.err` | `api-diaglog-wire` R07;`api-diaglog` R7;`unit-diaglog` R8(原始碼盤點) |
| 6 | `WAutoSequelize.mjs` `pm.reject(diag.err(err))`(`auto.run`之callback) | 寫出模型檔之fs錯誤(外來值;路徑中表名可含密碼) | `diag.err` | `api-diaglog-wire` R8a(EISDIR真實錯誤、含憑證副本、無憑證原物件)、R8c R01 R04 R11 R12 |
| 7 | `WAutoSequelize.mjs` `throw diag.err(err)`(建構`AutoSequelize`之catch) | sequelize同步拋出(缺少驅動等,外來值) | `diag.err` | `api-diaglog-wire` R8a同步拋出;`api-diaglog` R7(缺少驅動) |
| 8 | `WAutoSequelize.mjs` `logSql`→`diag('sql', { stmt }, () => sql)` | sql紀錄 | 診斷輸出;level預設log;safe僅`stmt`;細節由`getDiag`以detail清單遮罩 | `api-diaglog` R3 R4 R6 |
| 9 | `auto-sequelize.js` `logErr('foreign keys catch', err)`→`diag(label, diag.brief(err), () => err, 'error')` | 外鍵查詢失敗(外來值,不reject) | 診斷輸出;level error | `api-diaglog` R2 R3 R4 R5;`api-diaglog-wire` R8c(經語料) |
| 10 | `auto-sequelize.js` `logErr('tables catch', err)` | 建表清單/描述表失敗(外來值,不reject) | 診斷輸出;level error | 同上 |
| 11 | 結果物件逐筆`err` | 無此欄位 | 不適用 | `api-diaglog-wire` R8a(回傳值鍵僅`tables`、`foreignKeys`) |
| 12 | `'error'`事件 | 無 | 不適用 | — |
| 13 | console出口 | `src/`無console | 不適用 | `unit-diaglog` R1 |
| 14 | `auto-sequelize.js` `write()`之`fs.mkdirSync`(及typescript選項才有之`fs.writeFileSync`,本套件未轉傳) | 同步throw於promise `then`內之回呼鏈 | 不在`pm.reject`路徑(見下〈範圍外之觀察〉),未改 | probe(`directory`指向既有檔案) |
| 15 | `src/sql-string.js`三處`throw new Error(… + 值)` | `escape`僅於`auto-sequelize.js`以`_.isString`守門後呼叫;`format`、`formatNamedParameters`無呼叫點(不刪除,只提出) | 不可達,不適用 | `unit-diaglog` R8(原始碼盤點) |

站點盤點由`unit-diaglog`〈R8〉以原始碼逐行鎖定:`diag(`呼叫恰2行、`pm.reject(`恰6行(5固定+1`diag.err`)、`throw`恰1行、宣告字面值、`sql-string.js`之throw恰3處且不可達.新增站點須同步更新該測試與此表.

**範圍外之觀察(未修,未改變行為;2026-10-29實測)**:`directory`指向既有檔案時,`write()`內同步`fs.mkdirSync`拋`EEXIST`,因嵌在promise `then`回呼鏈內而成為`unhandledRejection`,`WAutoSequelize`回傳之promise**永遠pending**(不reject).修前即如此,與遮罩無關;證據:`agent-out/mig-autoseq-evidence/probeMkdir.txt`.是否改為reject屬回傳契約變更,待主控裁示.

## 改動範圍 → 測試

本套件無瀏覽器e2e.改`src/WAutoSequelize.mjs`、`src/auto-sequelize.js`、`src/getSqlStmt.mjs`任一者,跑`unit-diaglog`、`api-diaglog`與`api-diaglog-wire`三檔(皆為sqlite,另`api-diaglog-wire`含一案連`127.0.0.1:1`被拒之mssql真實驅動錯誤,無docker、不動使用者容器);改`src/dialects.js`、`sql-string.js`、`ts-helper.js`(模型文字產生)另須比對`golden-contract.json`(R7).升版wsemi後三檔須重跑(`_diagCases`語料隨wsemi更新).全套:`npm test`.

## 測試依賴

`sqlite3`為devDependencies(2026-10-28加入,供`api-diaglog`以真sqlite實跑).npm 12之`allowScripts`會擋下其install腳本,繫結缺失時`require('sqlite3')`拋`Could not locate the bindings file`;補建方式:於`node_modules/sqlite3`下執行`node ../prebuild-install/bin.js -r napi`.

## 變異驗證

2026-10-28(autoseq-run01)對R1~R7共59個變異:58個殺死,1個等價存活;腳本與結果存於主控任務資料夾`agent-out/autoseq-run01-evidence/`.2026-10-29(mig-autoseq)對遷移後之`src/`共36個變異(reject/throw站點漏包或誤包固定詞彙、codes/nested/types/safeKeys/secrets/paths宣告缺漏、level錯置、logging恆開恆關、getDiag不讀opt、safe含錯誤訊息或sql、外鍵與建表站點、getSqlStmt白名單):35殺死(其中33個被`api-`行為測試殺死、1個被`unit-getSqlStmt`殺死、1個等價變異`M26`〔`diag.mask`取代`diag.err`,行為相同〕僅被原始碼盤點殺死),1個存活(`M19`非sqlite方言亦遮路徑,為多遮之fail-closed方向,不構成缺陷).結果見主控任務資料夾`agent-out/mig-autoseq-evidence/`之`mutation-result.json`與報告;腳本`mutate.mjs`為一次性(存於證據夾),重跑方式為對`src/`逐一套用變異後跑三個測試檔,離開碼非0即殺死.
