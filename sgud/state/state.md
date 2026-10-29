# 狀態

本檔記載當前已開發功能之最新狀態:各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本.只記現況、不寫過程(過程寫入`sgud/exp/experience.md`).規則帳本(`sgud/rule/rulebook.md`)為藍圖、本檔為現況,兩者比對即知尚未做到者.過長時依功能類型拆為`state_<類型>.md`,本檔只留索引.

本套件為依資料庫結構自動產生Sequelize模型檔之工具(`WAutoSequelize(opt)`),`package.json`版本1.0.51(未於本輪更動).

## 功能現況

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| 依資料庫結構(sqlite、mysql、mariadb、postgres、mssql)產生各表模型檔,回傳`{ tables, foreignKeys }` | 已完成,行為與修前一致 | R7 | `test/api-diaglog.test.mjs`〈R2 R7〉以sqlite對照`test/tools/golden-contract.json`;其餘方言僅以既有的`test/all.test.mjs`冒煙(mssql另有`api-diaglog-wire`一案連`127.0.0.1:1`被拒之真實驅動錯誤) |
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
| README〈Diagnostic output〉〈Rejections and thrown errors〉〈Breaking changes〉、`WAutoSequelize` JSDoc | 已完成 | R1~R8 | 人工逐句對照實測(見報告) |

## 已知缺口與待辦

1. **建表清單/外鍵查詢失敗仍只記錄、不reject**(修前即如此;回傳契約不變).連不上資料庫時`WAutoSequelize`resolve空結果,使用者只能從診斷輸出(`tables catch`)得知.是否改為reject屬契約變更,待主控裁示(README已明寫此行為).
2. **w-orm-reladb之`genModelsByDB`尚未轉傳**`logging`/`logDetail`/`funLog`,並將轉入`diag.with`(第2波,依本套件新版);本輪對外介面變化(`logDetail`格式、`errType`值、`errCode`集合、reject/throw遮罩、sqlite路徑遮罩)已列報告供reladb輪參考.
3. **`package-lock.json`**由npm自動同步(版本欄位1.0.50→1.0.51、wsemi 1.9.25→1.9.31);`package.json`僅`wsemi: ^1.9.31`一行(保持原相依排序).
4. 非sqlite方言(mysql、mariadb、postgres)無實連測試(不得動docker容器);mssql僅有連`127.0.0.1:1`被拒之真實驅動錯誤案;診斷輸出之邏輯與方言無關,已以sqlite實跑與以覆寫`QueryInterface`之方式驗證各失敗路徑.
5. 既有觀察未修(範圍外):`auto-sequelize.js`的`write()`在`options.eslint`為真時`engine.lintFiles`回傳promise卻未await(ESLint 8),且`WAutoSequelize`未轉傳`eslint`選項,該分支實際不可達;產出模型檔含`unique: "true"`(字串)與`references: "[object Object]"`的既有怪異內容,golden已凍結為「契約不變」之基準;`directory`指向既有檔案時`mkdirSync`於async回呼內同步拋出,成為unhandledRejection且回傳之promise永遠pending(修前即如此,見規則帳本R8〈範圍外之觀察〉,待裁示).
6. 遮罩之已知限制(reject清單之短密碼<4字元不遮、私有欄位等)依dspec§5,不在本套件保證內.

## 最近一次驗證

- 2026-10-29 mig-autoseq:遷移至wsemi 1.9.31之共用診斷模組.三檔(`unit-diaglog` 9案、`api-diaglog` 39案、`api-diaglog-wire` 27案)共75案全綠、全套`npm test` 76案綠(含`all.test.mjs` 1案);新測試對修前`src/`紅27案(`api-diaglog-wire` 16案+`api-diaglog` 11案);變異驗證36個,35殺死、1個存活(多遮,非缺陷);UMD建置於`./tmp`驗證可載入並實跑sqlite.
- 發布:未發布(版本號與發布由主控處理).
