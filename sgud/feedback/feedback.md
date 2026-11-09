# 回饋

本檔記載任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(全域設定§12.2).只增不改,處置結果另記一列,供主控核實、盤點與整合.一條一列:日期、類別、對象、內容、依據.

| 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|
| 2026-11-09 | 自有套件 | w-auto-sequelize(`package.json`、`g.mjs`) | devDependencies之`mssql`在本套件中實際只用來取得`tedious`(sequelize 6之mssql方言載入`tedious`,不載入`mssql`);建議評估改以`tedious`直接列為devDependencies(宣告與實際依賴一致,免受`mssql`主版號與其`tedious`範圍連動之影響),並修正`g.mjs`註解「要測試故devDependencies才需安裝mssql」.本輪依派工只升`mssql`,未改此結構 | `node_modules/sequelize/lib/dialects/mssql/connection-manager.js:14`(`_loadDialectModule("tedious")`);執行期載入模組統計:`mssql/` 0檔、`tedious/` 112檔 |
| 2026-11-09 | 自有套件 | w-auto-sequelize(`src/auto-sequelize.js`) | 回傳值`{ tables, foreignKeys }`之物件鍵順序隨各表非同步查詢完成順序而變(同一資料庫連跑兩次不同;模型檔不受影響),與原則2(結果與順序無關)有出入;建議評估於回傳前依表名排序鍵(屬對外行為變更,須主控裁示,本輪未動) | `src/auto-sequelize.js:91`(`async.each(tables, mapForeignKeys, …)`)、`:100`(`async.each(tables, mapTable, …)`);前後對照時同碼兩次之`result-mssql.json`鍵序不同 |
| 2026-11-09 | 自有套件 | w-auto-sequelize(測試) | `npm test`無入庫之真實MSSQL成功路徑測試(僅`127.0.0.1:1`被拒案),mssql方言之型別轉換與預設值分支(`src/auto-sequelize.js`之mssql分支)升版時只能靠臨時Docker前後對照;若要入庫,建議做成「偵測到Docker與既有映像才執行」之可略過案,避免`npm test`與CI強依賴Docker | `sgud/state/state.md`已知缺口4;`sgud/rule/rulebook.md` R11 |
