# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

## 索引

| 規則 | 主題 | 對應測試 |
|---|---|---|
| R1 | 診斷輸出單一出口、sequelize實例一律明給logging | `test/unit-diaglog.test.mjs`(R1)、`test/api-diaglog.test.mjs`(R1) |
| R2 | 預設安全:成功路徑無輸出,失敗只輸出標籤+摘要 | `test/api-diaglog.test.mjs`(R2) |
| R3 | `opt.logging`與`opt.logDetail`:sql紀錄與舊輸出還原 | 同上(R3) |
| R4 | `opt.funLog(label, safe, detail)`與選項型別 | 同上(R4)、`unit-diaglog`(getOptLog、getDiag) |
| R5 | 診斷輸出不影響流程 | 同上(R5) |
| R6 | 帳號與密碼遮罩 | `unit-diaglog`(getSecrets、maskText、cpMask)、`api-diaglog`(R6) |
| R7 | 回傳契約不變 | `api-diaglog`(R2 R7)、`test/tools/golden-contract.json` |

## R1 診斷輸出單一出口

**規則**:`src/`內除`getDiag.mjs`外,程式碼不得出現`console`;所有診斷輸出(含傳給sequelize之`logging`函數、舊`console.error(err)`站點)皆經`getDiag.mjs`之`diag`;`new Sequelize(...)`一律明給`logging`:只接受函數,其餘(未給、`true`等)一律`false`,不得落回sequelize預設logger(`console.log`),亦不引發`SEQUELIZE0002`.呼叫端自帶之`Sequelize`實例(`database`傳實例,未文件化)保有其自身logger,不屬本套件可控範圍(README〈Not covered〉).`getDiag.mjs`不得`import`任何模組(dist由rollup打包,`toolg/gDistRollup.mjs`之external只列sequelize、async、fs、path、eslint,內建模組如`util`會被當成未解析之外部相依).

**盤點指令**(可重跑,期望只剩`getDiag.mjs`):

```
Grep pattern: \bconsole\b   path: src   (排除註解後只應出現在 src/getDiag.mjs)
Grep pattern: new Sequelize path: src   (只應出現在 src/auto-sequelize.js 之 AutoSequelize 建構函式)
```

**站點全集**(修前2026-10-28盤點,修後狀態):

| 站點 | 修前 | 判準 | 修後 |
|---|---|---|---|
| `src/auto-sequelize.js` `new Sequelize(...)`(建構函式) | 未給`logging`,sequelize以預設logger`console.log`輸出每條SQL全文 | 須改 | 已套:`_.defaults({}, options, { logging: false })`;`WAutoSequelize`依`opt.logging`給函數或`false` |
| `src/auto-sequelize.js` `mapTables`(外鍵查詢失敗)`console.error(err)` | 輸出完整錯誤物件 | 須改 | 已套:`self.logErr('foreign keys catch', err)` |
| `src/auto-sequelize.js` `generateText`(建表清單或描述表失敗)`console.error(err)` | 同上 | 須改 | 已套:`self.logErr('tables catch', err)` |
| `src/WAutoSequelize.mjs`、`dialects.js`、`sql-string.js`、`ts-helper.js` | 無console | 可留 | 不變 |

**注入方式**:`auto-sequelize.js`為CommonJS,無法同步`import`ESM的`getDiag.mjs`,故由`WAutoSequelize.mjs`建立`logErr(label, err)`(內部呼叫`diag(label, getBriefErr(err), () => err, true, 'error')`)以第5個建構參數傳入;未給者為空函數(`AutoSequelize`非套件匯出,僅內部使用).

**測試**:`unit-diaglog`〈R1 單一出口與sequelize實例日誌設定〉(掃`src/`程式碼無console)、`api-diaglog`〈R1〉(直接建構`AutoSequelize`驗`options.logging`只收函數、無`SEQUELIZE0002`警告;`WAutoSequelize`預設無任何輸出).

## R2 預設安全

**規則**:未給診斷選項時,成功路徑console完全無輸出;失敗路徑只輸出固定標籤與`safe`摘要(`{ errType, errCode }`:錯誤類別名稱限識別字樣式、機器代碼限`E…`/`ERR_…`/`SQLITE_…`/`ER_…`/`PROTOCOL_…`、前2碼為已知類別之SQLSTATE 5碼(postgres)或絕對值至99999之整數),不含SQL全文、表名、錯誤訊息、堆疊、路徑、帳號、密碼;舊版以`console.error`輸出者,預設摘要與還原細節仍走`console.error`(串流不變);SQL紀錄(舊走`console.log`)仍走`console.log`.

**標籤全集**:`sql`(SQL紀錄)、`foreign keys catch`(外鍵查詢失敗)、`tables catch`(建表清單或描述表失敗).新增站點須新增標籤並補測試與README.

## R3 opt.logging 與 opt.logDetail

**規則**:`opt.logging === true`才紀錄SQL(預設`false`);預設只輸出`sql { stmt: <白名單首字> }`,白名單見`getDiag.mjs`之`STMTS`(其餘`OTHER`);傳給sequelize者為函數(從不為`true`,故無`SEQUELIZE0002`棄用警告).`opt.logDetail === true`還原舊輸出:SQL全文以單一字串引數交給`console.log`(逐行與修前相同);錯誤以單一錯誤物件引數交給`console.error`,經`util.format`後與修前輸出原錯誤物件逐字相同(副本沿用原錯誤之建構子名稱,見`getDiag.mjs`之`mkErrCopy`).`logDetail`單獨(`logging`未開)不輸出SQL.

## R4 opt.funLog 與選項型別

**規則**:`opt.funLog(label, safe, detail)`為函數才生效;生效時診斷輸出只交給它(不寫console,`logDetail`亦不另寫);`detail`為遮罩後之副本(SQL字串或錯誤副本),無細節者只收兩個引數.型別錯誤之`logging`/`logDetail`/`funLog`、讀取選項時拋錯者,一律忽略並用預設,不使`WAutoSequelize`拋錯(與本套件其他選項一致:`port`以`toInteger`轉換、`directory`/`host`未給即用預設).

## R5 診斷輸出不影響流程

**規則**:`funLog`拋錯、回傳reject之promise或thenable、`getDetail`拋錯、console拋錯,皆吞下;不得影響resolve/reject內容與時機,不得產生unhandledRejection.

## R6 遮罩

**規則**:資料庫帳號與密碼於任何輸出(含`logDetail`、`funLog`之細節與`safe`)皆以`***`取代:密碼、`帳號:密碼`、帳號(單獨出現須≥3字元),各取`getForms`之各形式——原樣、SQL單引號加倍(sqlite/postgres/mssql)、反斜線跳脫(mysql/mariadb/JSON,`\\` `\'` `\"`)、`encodeURIComponent`、嚴格RFC3986形式(`!'()*`編碼,即`URLSearchParams`之`%27`)、空白為`+`之表單形式、十六進位小寫形式(`%2f`);`帳號:密碼`另取(帳號原樣或其URL編碼)×(密碼各形式)之組合,使帳號<3字元時(如`sa:p%40ss`)並列形式仍遮罩;`scheme://帳密@主機`(帳密含`@`時取至最後一個`@`,未知帳密之盡力遮罩);數值型別之帳號/密碼轉字串;數值樣式(整數、負數、小數)且數字≥4位之秘密,數值型別之同值亦遮罩;屬性鍵(含陣列之非索引鍵)與`Symbol`描述同樣遮罩;細節為副本,不改動原錯誤物件,不執行使用端程式(getter、繼承原型上的方法、`util.inspect.custom`、`Symbol.toStringTag`、二進位之`byteLength`存取器——位元組數只用內建getter取),副本原型一律為內建原型(Error副本為內建`Error.prototype`衍生,僅沿用建構子名稱字串;原錯誤無自有`stack`則副本亦無).

**已知限制**:①帳號<3字元單獨出現不遮罩(避免吞掉無關文字),但`帳號:密碼`並列形式仍遮罩;②`host`、`database`、`storage`不是憑證,不遮罩(`logDetail`/`funLog`細節可含之);③`safe`的`errType`取自建構子名稱(程式識別字),`errCode`限機器代碼樣式.

## R7 回傳契約不變

**規則**:只有診斷輸出可以改變.resolve值`{ tables, foreignKeys }`、模型檔內容、reject訊息(`need database`/`need username`/`need password`/`need dialect`/`need port`)、缺少驅動時同步拋出之Error、建表清單或外鍵查詢失敗時**只記錄不reject**(建表失敗照舊resolve空結果`{ tables: {}, foreignKeys: {} }`;外鍵失敗照常建模)皆與修前相同.

**對照基準**:`test/tools/golden-contract.json`為2026-10-28於修前`src/`對`test/tools/diagFixture.mjs`之夾具(depts/users兩表)產生之回傳值與模型檔內容,及修前console輸出行(`oldLines`).重產須有授權且須證明修前行為(用修前碼產生).

## 改動範圍 → 測試

本套件無瀏覽器e2e.改`src/getDiag.mjs`、`src/WAutoSequelize.mjs`、`src/auto-sequelize.js`任一者,跑`unit-diaglog`與`api-diaglog`兩檔(皆為sqlite,無docker);改`src/dialects.js`、`sql-string.js`、`ts-helper.js`(模型文字產生)另須比對`golden-contract.json`(R7).全套:`npm test`.

## 測試依賴

`sqlite3`為devDependencies(2026-10-28加入,供`api-diaglog`以真sqlite實跑).npm 12之`allowScripts`會擋下其install腳本,繫結缺失時`require('sqlite3')`拋`Could not locate the bindings file`;補建方式:於`node_modules/sqlite3`下執行`node ../prebuild-install/bin.js -r napi`.

## 變異驗證

2026-10-28對R1~R7共59個變異:58個殺死,1個存活(`W01 未開logging時給true`,為等價變異——`auto-sequelize.js`的`logging`只收函數之第二道防線將其收斂為`false`;兩層同時失效的組合變異`W01+A07`已殺死).腳本與結果存於主控任務資料夾`agent-out/autoseq-run01-evidence/`(`mutate.mjs`、`mutation-result-round2.json`、`mutation-result-rerun.json`,外審修補前另有45個變異全殺之第一輪結果`mutation-result.json`).變異清單涵蓋:logging預設開啟、logDetail/funLog型別放寬、funLog不生效/後仍寫console/拋錯不吞/回傳reject不吞、細節與摘要不遮罩、憑證清單缺帳號/帳號:密碼/單引號加倍/各URL編碼形式/數值型別、連線字串只取第一個`@`、Error副本不沿用類別名稱/不複製stack、屬性鍵不遮罩、執行getter、摘要含錯誤訊息、錯誤代碼不限樣式、敘述種類不限白名單、忽略method串流、bare無效、logDetail恆開/恆關、logging恆開、未帶憑證清單、未注入logErr、實例不補`logging:false`、外鍵站改回console.error、建表失敗改為reject、標籤錯置等.
