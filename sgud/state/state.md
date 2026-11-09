# 狀態

本檔記載當前已開發功能之最新狀態:各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本.只記現況、不寫過程(過程寫入`sgud/exp/experience.md`).規則帳本(`sgud/rule/rulebook.md`)為藍圖、本檔為現況,兩者比對即知尚未做到者.過長時依功能類型拆為`state_<類型>.md`,本檔只留索引.

本套件為依資料庫結構自動產生Sequelize模型檔之工具(`WAutoSequelize(opt)`),`package.json`版本1.0.62(未於本輪更動).相依宣告下限(2026-11-09起):`sequelize ^6.37.8`、`lodash ^4.18.1`、`eslint ^8.57.1`(dependencies);`mssql ^12.7.13`(devDependencies,實裝12.7.14,其相依`tedious`實裝20.3.8).

## 功能現況

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| 依資料庫結構(sqlite、mysql、mariadb、postgres、mssql)產生各表模型檔,回傳`{ tables, foreignKeys }`(成功路徑) | 已完成,成功路徑行為與修前一致(失敗路徑見下兩列) | R7 | `test/api-diaglog.test.mjs`〈R2 R7〉以sqlite對照`test/tools/golden-contract.json`;其餘方言僅以既有的`test/all.test.mjs`冒煙(mssql另有`api-diaglog-wire`一案連`127.0.0.1:1`被拒之真實驅動錯誤) |
| 診斷輸出單一出口(wsemi之`getDiag`,宣告於`WAutoSequelize.mjs`);sequelize實例一律明給`logging`;`src/getDiag.mjs`已刪 | 已完成(mig-autoseq) | R1 | `unit-diaglog`〈R1〉、`api-diaglog`〈R1〉 |
| `opt.logging`(SQL紀錄,預設`false`,預設只輸出敘述種類) | 已完成 | R3 | `api-diaglog`〈R3〉 |
| `opt.logDetail`(console輸出`(label, 遮罩後細節)`:`console.log('sql', 全文)`、`console.error(label, 錯誤副本)`;無`bare`) | 已完成(格式於mig-autoseq變更) | R3 | `api-diaglog`〈R3〉〈R2 R3 R4 R7 建表失敗〉 |
| `opt.funLog(label, safe, detail)`(取代console,收完整細節副本) | 已完成 | R4 | `api-diaglog`〈R4〉 |
| 選項型別錯誤/讀取拋錯一律忽略用預設 | 已完成 | R4 | `api-diaglog`〈R4〉 |
| 診斷輸出不影響流程(funLog/console拋錯、reject之promise) | 已完成(wsemi保證,本套件接線) | R5 | `api-diaglog`〈R5〉 |
| 診斷輸出遮罩:帳號、密碼、sqlite檔案路徑(`getDiagSecrets`),細節為副本 | 已完成(遮罩實作改由wsemi) | R6 | `api-diaglog`〈R6〉、`api-diaglog-wire`〈R8c〉〈R8d〉 |
| 外來值經`diag.err`:寫檔失敗之reject、建構sequelize失敗之同步throw;固定詞彙reject不包 | 已完成(mig-autoseq) | R8 | `api-diaglog-wire`〈R8a〉〈R8b〉〈R8c〉 |
| 摘要宣告:`codes`(sqlite/mysql/mssql/sqlstate)、`nested`(original/parent)、`types`(12個Sequelize…Error)、`safeKeys`(stmt) | 已完成 | R2 R8 | `api-diaglog-wire`〈R8d〉、`unit-diaglog`〈R8〉 |
| 共用語料(wsemi `_diagCases`)接線:wire案20案,適用16、不適用4 | 已完成 | R8 | `api-diaglog-wire`〈R8c〉 |
| 輸出資料夾(`opt.directory`)建立失敗即reject:既有檔案、父層為檔案、無權限→reject fs錯誤(`code`、`path`保留);非字串且非空值→連線前reject固定字串`invalid opt.directory: must be a string`;空值(null、''、0、false)不寫檔;不再懸置、無unhandledRejection(autoseq,排程第188項①) | 已完成 | R9 | `api-reject`〈R9〉、`unit-diaglog`〈R10〉 |
| 建表清單、描述表、外鍵查詢失敗即reject(記錄後以同一錯誤結束;外鍵先於描述表,外鍵失敗即停;關閉連線;不寫任何模型檔);資料庫沒有表仍resolve空結果(autoseq,排程第188項②;判定「只記錄」非刻意設計,見規則帳本R10) | 已完成 | R10 | `api-reject`〈R10〉、`api-diaglog`、`api-diaglog-wire`〈R8c R8d R10〉、`unit-diaglog`〈R8 R10〉 |
| README〈Diagnostic output〉〈Rejections and thrown errors〉〈Breaking changes: failures reject the promise〉〈Breaking changes〉、`WAutoSequelize` JSDoc | 已完成 | R1~R10 | 人工逐句對照實測(見報告) |
| 相依升版(`mssql`10→12、`sequelize`6.37.1→6.37.8、`lodash`4.17.21→4.18.1、`eslint`8.37→8.57.1)後,對真實MSSQL(Docker)與sqlite所產生之模型檔與升版前逐位元組相同;診斷摘要(`errType`/`errCode`)與SQL敘述於真實連線情境不變 | 已完成(ms116,2026-11-09) | R11 | 前後對照(無入庫測試,見R11之取法);`npm test`全套95案 |

## 已知缺口與待辦

1. (已結,autoseq 2026-10-31)原「建表清單/外鍵查詢失敗只記錄、不reject」與「`directory`為既有檔案時promise懸置」兩項已依R9、R10修正,不再列待辦.
2. **下游w-orm-reladb之`genModelsByDB`**直接回傳本套件之promise(`WOrmReladb.mjs` `return WAutoSequelize({...})`),故失敗時改為reject(修前:連不上資料庫resolve空結果);其帳本R17-7f與README所載「只記錄不reject」須於reladb下次更新時修正(本輪未動他套件,列報告供主控派工).`logging`/`logDetail`/`funLog`之轉傳已由reladb完成.
3. **`package-lock.json`**由npm自動同步(wsemi 1.9.31→1.9.33);`package.json`僅`wsemi: ^1.9.33`一行(保持原相依排序與無結尾換行).
4. 非sqlite方言(mysql、mariadb、postgres)無實連測試(不得動docker容器);mssql於`npm test`內僅有連`127.0.0.1:1`被拒之真實驅動錯誤案(R10起為reject),**成功路徑(產生模型檔)無入庫之真實MSSQL測試**(2026-11-09以Docker臨時容器做前後對照,見R11,未入庫以免`npm test`依賴Docker);postgres指定`schema`之清單查詢失敗站點以sqlite實例加覆寫`dialect`與`query`模擬;診斷輸出與失敗路徑之邏輯與方言無關,已以sqlite實跑與以覆寫`QueryInterface`之方式驗證各失敗路徑.
5. 既有觀察未修(範圍外):`auto-sequelize.js`的`write()`在`options.eslint`為真時`engine.lintFiles`回傳promise卻未await(ESLint 8),且`WAutoSequelize`未轉傳`eslint`選項,該分支實際不可達;`typescript`選項分支之`fs.writeFileSync`亦同(本套件未轉傳該選項,不可達);產出模型檔含`unique: "true"`(字串)與`references: "[object Object]"`的既有怪異內容,golden已凍結為「契約不變」之基準;`npx eslint src/auto-sequelize.js`有3個既有錯誤(`n/no-callback-literal`於`callback(false, text)`、`multiline-ternary`於`write()`之`async.each`,修前副本同樣存在,不屬本輪改動).
6. 遮罩之已知限制(reject清單之短密碼<4字元不遮、私有欄位等)依dspec§5,不在本套件保證內.

7. **`mssql`僅為載體**:sequelize 6之mssql方言載入的是`tedious`(`lib/dialects/mssql/connection-manager.js`),本套件與測試皆不直接載入`mssql`(執行期實測0個檔);devDependencies列`mssql`只為取得`tedious`.`tedious` 20要求Node>=22(本機24、CI 24.x符合);較舊Node僅開發環境受影響,對使用端無影響(驅動由使用端自裝).

8. 既有觀察未修(範圍外,ms116發現):回傳值`{ tables, foreignKeys }`之物件鍵順序取決於各表非同步查詢之完成順序(`auto-sequelize.js`之`async.each`),同一資料庫連跑兩次鍵順序即不同(模型檔內容不受影響,逐位元組穩定);與主控原則2(結果與順序無關)有出入,是否排序待主控裁示(排序會改變回傳值鍵順序,屬對外行為變更,本輪不動).

## 最近一次驗證

- 2026-11-09 ms116(外部依賴升版):`npm install`後實裝mssql 12.7.14、tedious 20.3.8、sequelize 6.37.8、lodash 4.18.1、eslint 8.57.1(wsemi 1.9.52未動).全套`npm test` 95案全綠(升版前後皆95案);對Docker之MSSQL 2022容器與sqlite夾具前後各產生一次,模型檔與回傳值(排序鍵後)逐位元組相同(MSSQL 6表含25欄型別表、sqlite 3表);真實連線之5情境(成功、密碼錯、資料庫不存在、埠關閉、主機不存在)之`errType`/`errCode`/訊息/SQL敘述前後相同,僅`DEP0123`棄用警告(tedious 16對IP設TLS ServerName)消失;eslint 8.37.0與8.57.1對src、test、toolg、g.mjs輸出相同(13錯1警告,皆既有於未改動之src).`version`、`dist/`、`script.txt`、`src/`未動,未發布.

- 2026-10-31 autoseq(排程第188項):`npm i wsemi@latest`(1.9.31→1.9.33);R9、R10修正.四檔(`unit-diaglog` 10案、`api-diaglog` 39案、`api-diaglog-wire` 29案、`api-reject` 16案)加`all.test.mjs` 1案共95案全綠(全套`npm test`,`quiet-run --lock`);最終版測試對修前`src/`副本33案敗、61案過;變異23個全殺死、0存活;`api-diaglog-wire`之語料新增3個wire案(A11、C14、U22,wsemi 1.9.33)已歸類為不適用.`package.json`之`version`未動(仍1.0.52),發布由主控處理.

- 2026-10-29 mig-autoseq:遷移至wsemi 1.9.31之共用診斷模組.三檔(`unit-diaglog` 9案、`api-diaglog` 39案、`api-diaglog-wire` 27案)共75案全綠、全套`npm test` 76案綠(含`all.test.mjs` 1案);新測試對修前`src/`紅27案(`api-diaglog-wire` 16案+`api-diaglog` 11案);變異驗證36個,35殺死、1個存活(多遮,非缺陷);UMD建置於`./tmp`驗證可載入並實跑sqlite.
- 發布:未發布(版本號與發布由主控處理).
