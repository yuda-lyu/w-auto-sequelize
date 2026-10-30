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
| R7 | 成功路徑之回傳契約不變(失敗路徑自R10起reject) | `api-diaglog`(R2 R7)、`test/tools/golden-contract.json` |
| R8 | 依主控dspec〈診斷輸出與遮罩〉與wsemi R-DIAG-01:外來值經`diag.err`、固定詞彙reject不包、宣告、共用語料接線 | `test/api-diaglog-wire.test.mjs`、`unit-diaglog`(R8) |
| R9 | 輸出資料夾(`opt.directory`)建立失敗即reject、型別錯誤於連線前以固定字串reject;不懸置、無unhandledRejection | `test/api-reject.test.mjs`(R9)、`unit-diaglog`(R10) |
| R10 | 建表清單、描述表、外鍵查詢失敗即reject(記錄後以同一錯誤結束、關閉連線、不寫模型檔) | `test/api-reject.test.mjs`(R10)、`api-diaglog`(R2 R3 R4 R5 R10)、`api-diaglog-wire`(R8c R8d R10)、`unit-diaglog`(R8 R10) |

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

**規則**:成功路徑只有診斷輸出與外來值中的憑證可以改變.resolve值`{ tables, foreignKeys }`、模型檔內容、固定詞彙reject訊息(`need database`/`need username`/`need password`/`need dialect`/`need port`)、缺少驅動時同步拋出之Error(無憑證者為原物件)皆與修前相同.**失敗路徑自2026-10-31(autoseq,排程第188項)起改變**:建表清單、描述表與外鍵查詢失敗不再「只記錄」(修前:建表失敗resolve空結果、外鍵失敗照常建模),一律reject,見R10;`opt.directory`無法建立不再懸置,見R9.資料庫沒有表(清單為空)不是失敗,仍resolve`{ tables: {}, foreignKeys: {} }`(以`api-reject`〈R10 資料庫沒有表不是失敗〉鎖定).

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
| 5b | `WAutoSequelize.mjs` `pm.reject('invalid opt.directory: must be a string')`(`directory`為真值且非字串,連線前) | 本套件固定詞彙(不回顯值) | 不包`diag.err` | `api-reject` R9(8種非字串值)、`api-diaglog-wire` R8b(密碼為`invalid`時仍原字串);`unit-diaglog` R8 |
| 6 | `WAutoSequelize.mjs` `pm.reject(diag.err(err))`(`auto.run`之callback) | 建表清單、描述表、外鍵查詢(R10)、建立輸出資料夾(R9)與寫出模型檔之後端/fs錯誤(外來值;路徑中表名可含密碼) | `diag.err` | `api-diaglog-wire` R8a(EISDIR真實錯誤、含憑證副本、無憑證原物件)、R8c R01 R04 R11 R12(寫檔與建表清單兩路);`api-reject` R9 R10 |
| 7 | `WAutoSequelize.mjs` `throw diag.err(err)`(建構`AutoSequelize`之catch) | sequelize同步拋出(缺少驅動等,外來值) | `diag.err` | `api-diaglog-wire` R8a同步拋出;`api-diaglog` R7(缺少驅動) |
| 8 | `WAutoSequelize.mjs` `logSql`→`diag('sql', { stmt }, () => sql)` | sql紀錄 | 診斷輸出;level預設log;safe僅`stmt`;細節由`getDiag`以detail清單遮罩 | `api-diaglog` R3 R4 R6 |
| 9 | `auto-sequelize.js` `logErr('foreign keys catch', err)`→`diag(label, diag.brief(err), () => err, 'error')` | 外鍵查詢失敗(外來值) | 診斷輸出;level error;其後`callback(err)`即停(R10,不再描述表),由站6reject | `api-diaglog` R2 R3 R4 R5 R10;`api-diaglog-wire` R8c(經語料);`api-reject` R10 |
| 10 | `auto-sequelize.js` `logErr('tables catch', err)`(三處:`failTables`〔`showAllTables`與postgres指定schema之清單查詢失敗〕、描述表失敗) | 建表清單/描述表失敗(外來值) | 診斷輸出;level error;其後`callback(err)`,`generateText`遇err關閉連線並結束(不產生模型檔),由站6reject | 同上;postgres指定schema一處以`api-reject`〈R10 postgres指定schema〉模擬 |
| 11 | 結果物件逐筆`err` | 無此欄位 | 不適用 | `api-diaglog-wire` R8a(回傳值鍵僅`tables`、`foreignKeys`) |
| 12 | `'error'`事件 | 無 | 不適用 | — |
| 13 | console出口 | `src/`無console | 不適用 | `unit-diaglog` R1 |
| 14 | `auto-sequelize.js` `write()`之`fs.mkdirSync`(及typescript選項才有之`fs.writeFileSync`,本套件未轉傳) | 原:同步throw於promise `then`內之回呼鏈(懸置);**2026-10-31起**:`mkdirSync`置於try內,失敗`return callback(err)`,由站6reject(R9) | 已修(R9) | `api-reject` R9;`unit-diaglog` R10(`mkdirSync`全檔恰一處且於try內) |
| 15 | `src/sql-string.js`三處`throw new Error(… + 值)` | `escape`僅於`auto-sequelize.js`以`_.isString`守門後呼叫;`format`、`formatNamedParameters`無呼叫點(不刪除,只提出) | 不可達,不適用 | `unit-diaglog` R8(原始碼盤點) |

站點盤點由`unit-diaglog`〈R8〉以原始碼逐行鎖定:`diag(`呼叫恰2行、`pm.reject(`恰7行(5固定+1`invalid opt.directory`固定+1`diag.err`)、`throw`恰1行、`logErr(`於`auto-sequelize.js`恰3行(`failTables`、外鍵、描述表)且各接`callback(err)`、宣告字面值、`sql-string.js`之throw恰3處且不可達.新增站點須同步更新該測試與此表.

**(已修,2026-10-31 autoseq)** 原〈範圍外之觀察〉:`directory`指向既有檔案時`write()`內同步`fs.mkdirSync`拋`EEXIST`,成為`unhandledRejection`且promise永遠pending(2026-10-29 mig-autoseq實測,修前即如此)——已依R9修正.

## R9 輸出資料夾建立失敗即reject(排程第188項①,2026-10-31)

**規則**:①`opt.directory`為真值而非字串(數字、物件、陣列、函數、`true`、Symbol、包裝字串、帶`toString`之物件)者,於連線前以固定字串`'invalid opt.directory: must be a string'`reject(`pm.reject`,不經`diag.err`;訊息不回顯該值,不執行任何sql);空值(`null`、`''`、`0`、`false`)維持原義:不建立資料夾、不寫出模型檔,只回傳結果.②`write()`內`fs.mkdirSync`置於try,失敗(既有檔案、父層為檔案、無權限等)以`return callback(err)`交出該fs錯誤,經`pm.reject(diag.err(err))`reject:`code`、`path`保留,訊息只含系統呼叫與路徑(`EEXIST: file already exists, mkdir '<path>'`),不含帳號、密碼等其他選項之值;不懸置、不產生`unhandledRejection`、無console輸出.③建立失敗時不寫出任何檔案,輸出夾位置之既有檔案內容不變.④`directory`為既有資料夾:照常寫出(不受try影響).

**why**:`write()`在`async`/promise之`then`回呼鏈內執行,同步拋出會成為`unhandledRejection`,呼叫端promise不再有人結算(依主控〈輸入參數之檢測機制〉§5.1:Promise入口reject不同步throw、V20不回顯輸入值).`path.resolve(非字串)`亦同步拋`TypeError`且訊息帶出該值(`The "paths[0]" argument must be of type string. Received …`),故型別錯誤於連線前以固定字串拒收,不留此第二條懸置路徑.只做本項範圍所需,未擴大為全套件參數檢測(其餘opt鍵之種類檢測屬依該dspec之另案).

**盤點指令**(可重跑):`Grep pattern: mkdirSync|writeFileSync|path\.resolve path: src`——`fs.mkdirSync`全檔恰1處且於try內;`fs.writeFileSync`僅typescript分支(本套件未轉傳該選項,不可達,見state已知缺口).

**測試**:`test/api-reject.test.mjs`〈R9〉(6案:既有檔案、父層為檔案、不回傳部分結果且檔案內容不變、非字串8種、空值4種不寫檔、既有資料夾照常);修前紅:既有檔案、父層為檔案、不回傳部分結果、非字串共4案(以`outcome()`之逾時上限判`pending`);`unit-diaglog`〈R10〉鎖原始碼形態.

## R10 建表清單、描述表、外鍵查詢失敗即reject(排程第188項②,2026-10-31)

**規則**:`AutoSequelize.build`、`run`之三類查詢失敗(建表清單`showAllTables`/postgres指定schema之`SHOWTABLES`、外鍵`mapForeignKeys`、描述表`describeTable`),皆先`logErr`(標籤`tables catch`、`foreign keys catch`;診斷輸出不變),再以**該後端錯誤**呼叫`callback(err)`:①外鍵查詢先於描述表,外鍵失敗即停,不再描述表(只有一筆`foreign keys catch`);②`generateText`遇err即`sequelize.close()`並`callback(err)`,**不產生也不寫出任何模型檔**(含已描述成功之表;不建立輸出夾);③`WAutoSequelize`以`pm.reject(diag.err(err))`交出:不含憑證者為原物件(身分不變)、含憑證者為遮罩副本(同類、`code`保留、原物件不被改動);三個失敗站點一致;④診斷輸出之`funLog`拋錯、回傳reject之promise不影響reject值,無`unhandledRejection`(R5);⑤資料庫沒有表(清單為空)不是失敗,resolve`{ tables: {}, foreignKeys: {} }`;⑥失敗路徑關閉連線恰一次.

**判定依據(「只記錄」是否刻意設計)**:讀碼判定為**非刻意設計**——①`auto-sequelize.js`原`build`之失敗分支把`callback`直接當錯誤回呼(`.then(processTables, callback)`),`callback`即`generateText(err)`,原始設計(sequelize-auto)即以err傳遞失敗,`generateText`卻把err只轉成`logErr`後續行(舊版為`console.error(err)`);②`WAutoSequelize`之`run` callback已有`if (err) pm.reject(...)`分支,契約上本就預期失敗以err交出;③README與帳本之「只記錄」為修前現況之如實記載(mig-autoseq/autoseq-run01列為待裁示缺口),非設計意圖;④依主控〈輸入參數之檢測機制〉§5.1(Promise入口失敗一律reject)與專案原則14(不留舊行為);⑤實害:連不上資料庫resolve空結果使下游(w-orm-reladb `genModelsByDB`)誤以為成功,外鍵查詢失敗寫出缺`references`之模型檔而無人察覺.

**盤點指令**:`Grep pattern: logErr\( path: src`(期望3行,各接`callback(err)`);`Grep pattern: callback\( path: src/auto-sequelize.js`.

**測試**:`test/api-reject.test.mjs`〈R10〉(10案)、`api-diaglog`(R2 R3 R4 R5 R10:原「仍resolve空結果」之斷言全改為reject)、`api-diaglog-wire`(R8c R10:寫檔失敗與建表清單失敗兩路共用語料R01 R04;R8d真實mssql連線被拒改為reject)、`unit-diaglog`〈R8 R10〉;修前紅(最終版測試對修前`src/`副本):`api-reject`13案(R9 4、R10 9)、`api-diaglog` 13、`api-diaglog-wire` 4、`unit-diaglog` 3,共33案敗、61案過(見報告).

**postgres指定schema之清單失敗**未實連(不得動docker容器),以sqlite實例加覆寫`dialect.showTablesQuery`與`sequelize.query`模擬(`api-reject`〈R10 postgres指定schema〉).

## 改動範圍 → 測試

本套件無瀏覽器e2e.改`src/WAutoSequelize.mjs`、`src/auto-sequelize.js`、`src/getSqlStmt.mjs`任一者,跑`unit-diaglog`、`api-diaglog`、`api-diaglog-wire`與`api-reject`四檔(皆為sqlite,另`api-diaglog-wire`含一案連`127.0.0.1:1`被拒之mssql真實驅動錯誤,無docker、不動使用者容器);改`src/dialects.js`、`sql-string.js`、`ts-helper.js`(模型文字產生)另須比對`golden-contract.json`(R7).升版wsemi後三檔須重跑(`_diagCases`語料隨wsemi更新).全套:`npm test`.

## 測試依賴

`sqlite3`為devDependencies(2026-10-28加入,供`api-diaglog`以真sqlite實跑).npm 12之`allowScripts`會擋下其install腳本,繫結缺失時`require('sqlite3')`拋`Could not locate the bindings file`;補建方式:於`node_modules/sqlite3`下執行`node ../prebuild-install/bin.js -r napi`.

## 變異驗證

2026-10-28(autoseq-run01)對R1~R7共59個變異:58個殺死,1個等價存活;腳本與結果存於主控任務資料夾`agent-out/autoseq-run01-evidence/`.2026-10-29(mig-autoseq)對遷移後之`src/`共36個變異(reject/throw站點漏包或誤包固定詞彙、codes/nested/types/safeKeys/secrets/paths宣告缺漏、level錯置、logging恆開恆關、getDiag不讀opt、safe含錯誤訊息或sql、外鍵與建表站點、getSqlStmt白名單):35殺死(其中33個被`api-`行為測試殺死、1個被`unit-getSqlStmt`殺死、1個等價變異`M26`〔`diag.mask`取代`diag.err`,行為相同〕僅被原始碼盤點殺死),1個存活(`M19`非sqlite方言亦遮路徑,為多遮之fail-closed方向,不構成缺陷).結果見主控任務資料夾`agent-out/mig-autoseq-evidence/`之`mutation-result.json`與報告;腳本`mutate.mjs`為一次性(存於證據夾),重跑方式為對`src/`逐一套用變異後跑三個測試檔,離開碼非0即殺死.2026-10-31(autoseq)對R9、R10共23個變異(型別檢核移除/縮小/擴大/回顯值、reject不經`diag.err`、三個失敗站點不記錄/不呼叫callback/吞錯、外鍵失敗不即停、`generateText`不處理err、失敗不return、不關閉連線、建立輸出夾無try/吞錯/不return/重新拋出、postgres schema與一般清單站點不記錄、外鍵錯誤被丟棄):23殺死、0存活(首跑W4、W5因字串在註解中重複出現而NOAPPLY,以更精確之上下文重跑後殺死);變異對`./tmp/autoseq/mut`之副本套用,不動repo`src/`;腳本與結果存於主控任務資料夾`agent-out/autoseq-evidence/`.
