# 狀態

本檔記載當前已開發功能之最新狀態:各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本.只記現況、不寫過程(過程寫入`sgud/exp/experience.md`).規則帳本(`sgud/rule/rulebook.md`)為藍圖、本檔為現況,兩者比對即知尚未做到者.過長時依功能類型拆為`state_<類型>.md`,本檔只留索引.

本套件為依資料庫結構自動產生Sequelize模型檔之工具(`WAutoSequelize(opt)`),`package.json`版本1.0.50(未於本輪更動).

## 功能現況

| 功能 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| 依資料庫結構(sqlite、mysql、mariadb、postgres、mssql)產生各表模型檔,回傳`{ tables, foreignKeys }` | 已完成,行為與修前一致 | R7 | `test/api-diaglog.test.mjs`〈R2 R7〉以sqlite對照`test/tools/golden-contract.json`;其餘方言僅以既有的`test/all.test.mjs`冒煙(無實連測試) |
| 診斷輸出單一出口(`src/getDiag.mjs`);sequelize實例一律明給`logging` | 已完成 | R1 | `unit-diaglog`〈R1〉、`api-diaglog`〈R1〉 |
| `opt.logging`(SQL紀錄,預設`false`,預設只輸出敘述種類) | 已完成 | R3 | `api-diaglog`〈R3〉 |
| `opt.logDetail`(還原舊輸出,串流不變,錯誤物件經`util.format`與舊輸出逐字相同) | 已完成 | R3 | `api-diaglog`〈R3〉〈R2 R3 R4 R7 建表失敗〉 |
| `opt.funLog(label, safe, detail)`(取代console,收完整細節副本) | 已完成 | R4 | `unit-diaglog`〈getDiag〉、`api-diaglog`〈R4〉 |
| 選項型別錯誤/讀取拋錯一律忽略用預設 | 已完成 | R4 | `unit-diaglog`〈getOptLog〉、`api-diaglog`〈R4〉 |
| 診斷輸出不影響流程(funLog/console拋錯、reject之promise) | 已完成 | R5 | `unit-diaglog`〈getDiag〉、`api-diaglog`〈R5〉 |
| 帳號與密碼遮罩(值、屬性鍵、Symbol描述、各編碼形式、數值型別、連線字串) | 已完成 | R6 | `unit-diaglog`〈getSecrets 與 maskText〉〈cpMask〉、`api-diaglog`〈R2 R3 R4 R6〉〈R6 數字密碼〉 |
| README〈Diagnostic output〉與〈Breaking changes: diagnostic output〉、`WAutoSequelize` JSDoc(`opt.logging`、`opt.logDetail`、`opt.funLog`) | 已完成 | R1~R7 | 人工逐句對照實測(見報告) |

## 已知缺口與待辦

1. **建表清單/外鍵查詢失敗仍只記錄、不reject**(修前即如此;任務書要求回傳契約不變).連不上資料庫時`WAutoSequelize`resolve空結果,使用者只能從診斷輸出(`tables catch`)得知.是否改為reject屬契約變更,待主控裁示(README已明寫此行為).
2. **w-orm-reladb之`genModelsByDB`尚未轉傳**`logging`/`logDetail`/`funLog`(見報告建議);轉傳前其繞過呼叫端診斷出口之問題仍在(主控於reladb下一輪接上).
3. **`package-lock.json`**由npm 12重生(去`resolved`欄位、版本欄位1.0.49→1.0.50、增sqlite3相依共40套件),已列報告待裁示;`package.json`僅增devDependency`sqlite3: ^6.0.1`一行.
4. 非sqlite方言(mssql、mysql、mariadb、postgres)無實連測試(不得動docker容器);診斷輸出之邏輯與方言無關,已以sqlite實跑與以覆寫`QueryInterface`之方式驗證各失敗路徑.
5. 既有觀察未修(範圍外):`auto-sequelize.js`的`write()`在`options.eslint`為真時`engine.lintFiles`回傳promise卻未await(ESLint 8),且`WAutoSequelize`未轉傳`eslint`選項,該分支實際不可達;產出模型檔含`unique: "true"`(字串)與`references: "[object Object]"`的既有怪異內容,golden已凍結為「契約不變」之基準.

## 最近一次驗證

- 2026-10-28 autoseq-run01:`unit-diaglog`+`api-diaglog`共79案綠、全套`npm test`80案綠(含既有`all.test.mjs` 1案);修前紅21案(對修前`src/`);外審(Argon)10條,採納後之外審對應測試於送審版`src/`紅11案;變異驗證59個,58殺死、1個等價存活(見規則帳本〈變異驗證〉).
- 外審:Codex terra額度用盡(2026-10-28 08:3x)改派Argon(`agy gemini-4-argon-high`),21分鐘完成;逐條核對結果見報告〈外審評分表〉.
- 發布:未發布(版本號與發布由主控處理).
