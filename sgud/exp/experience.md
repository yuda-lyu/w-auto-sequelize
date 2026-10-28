# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## autoseq-run01(2026-10-28):診斷輸出單一出口(第156項,第153項之延伸)

- **建表清單失敗不會reject**:`auto-sequelize.js`的`build`→`generateText(err)`只把錯誤`console.error`出來,其後照常產生(空的)models並以空結果完成;連不上資料庫、帳密錯誤、sqlite檔打不開,`WAutoSequelize`都resolve `{ tables: {}, foreignKeys: {} }`.這是修前行為,任務書要求回傳契約不變,故保留;診斷輸出因此成為使用者知道失敗的**唯一**管道,預設不能完全靜默,須至少留下標籤與`{ errType, errCode }`摘要.已列待裁示(是否改為reject).
- **真實驅動錯誤的觸發法(不需docker)**:把`database`(sqlite的storage)指向一個**既有資料夾**,sequelize的sqlite連線管理器拋`ConnectionError`(`SQLITE_CANTOPEN`),可實測失敗路徑;指向不存在的父目錄不會失敗(sequelize會自動建立父目錄).要驗證錯誤文字夾帶帳密的遮罩,暫時覆寫`QueryInterface`原型上的`showAllTables`(sqlite為`Object.getPrototypeOf(new Sequelize({dialect:'sqlite',storage:':memory:'}).getQueryInterface())`),或覆寫`Sequelize.prototype.query`並以`/foreign_key_list\(\w+\);/`比對(`mapForeignKeys`之查詢帶`;`且表名無反引號,`describeTable`內的同名查詢帶反引號,不受影響).
- **`new Sequelize('sqlite::memory:')`會觸發Node棄用警告DEP0170**(URL無效),警告在nextTick經console.error印出,會污染測試擷取;測試中建立暫用實例改用`new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })`.
- **`encodeURIComponent`不編碼`!'()*`**:密碼含單引號時,URL編碼形式仍含`'`;其他編碼器(`URLSearchParams`等)會編成`%27`、空白編成`+`,所以憑證清單同時列三種形式.
- **Error副本的console顯示**:Node的`util.inspect`顯示類別名稱取自建構子名稱;副本若直接用`new Error()`,顯示會由`ConnectionError [SequelizeConnectionError]: …`變成`Error [SequelizeConnectionError]: …`,與舊輸出不一致.解法是副本原型改為內建`Error.prototype`的衍生物件,其`constructor`為只帶名稱的空函數(`mkErrCopy`);名稱只取字串且限識別字樣式,不沿用使用端原型(其繼承屬性未遮罩,`util.inspect.custom`會在格式化時執行).驗證用`util.format(副本) === util.format(原錯誤)`.
- **舊輸出串流要保留**:舊版`console.error`站點的預設摘要與還原細節仍走`console.error`(`diag`第5參數`method`),SQL紀錄走`console.log`;只改串流會讓依stderr收集日誌的使用者失去錯誤線索.
- **CJS不能同步import ESM**:`auto-sequelize.js`是CommonJS(`require`),`getDiag.mjs`是ESM;以建構函式第5參數注入`logErr`,而不是在CJS內`require`ESM.`getDiag.mjs`不得`import`任何模組(rollup的external只列sequelize、async、fs、path、eslint).dist建置驗證:以相同設定把dist產到`./tmp/<案名>/dist`(不動repo之dist),再以UMD實跑sqlite.
- **sqlite3驅動**:本倉原無`sqlite3`;`npm install --save-dev sqlite3`會順帶重排`package.json`、重生`package-lock.json`(去`resolved`欄位、版本1.0.49→1.0.50、增40套件),且npm 12的`allowScripts`擋下install腳本使繫結沒建.處置:`package.json`手動只增一行devDependency(還原排序與無結尾換行),繫結以`node_modules/prebuild-install/bin.js -r napi`於`node_modules/sqlite3`下補建.
- **外審(Argon)找出的遮罩漏洞——自寫遮罩函式時的檢查表**:①陣列的非索引自有鍵與`Symbol`同樣要遮罩(不可因`isArr`整個跳過`maskKey`);②二進位的位元組數只能用內建getter(`ArrayBuffer.prototype`、`%TypedArray%.prototype`、`DataView.prototype`的`byteLength`描述子取`.get`再`.call`),讀實例上的`v.byteLength`會執行使用端覆寫的存取器;③憑證在輸出中的形式因來源而異:`URLSearchParams`得`%27`與`+`、mysql/mariadb的反斜線跳脫、帳號<3字元時 `sa:p%40ss` 要靠(帳號)×(密碼各形式)的組合、十六進位大小寫;④機器代碼白名單要涵蓋本套件支援的各方言(mysql的`ER_`/`PROTOCOL_`、postgres的SQLSTATE 5碼須檢類別),否則預設摘要失去`errCode`;⑤Error副本以`new Error()`建立後要`delete e.stack`,否則原錯誤無`stack`時會偽造指向本檔的堆疊;⑥`swallow`對原生promise用`Promise.prototype.then.call`,不讀可被覆寫的自有`then`;⑦測試的輸入要用各函式庫實際產生者(`URLSearchParams`、本套件的`sql-string`),不可照抄實作公式(同義反覆).
- **變異驗證的等價變異**:兩層防線(`WAutoSequelize`給`false`、`AutoSequelize`只收函數的`logging`)任一失效都被另一層擋住,單獨變異必存活;須以組合變異(兩層同時失效)證明測試抓得到.變異腳本在`mutate.mjs`支援第六欄第二處變異與`argv[2]`正則篩選重跑.
- **Codex額度用盡(2026-10-28 08:3x)**:`gpt-5.6-luna`探測回`You've hit your usage limit … try again at 10:56 AM`,離開碼1;terra同帳號,改派Argon(`agy gemini-4-argon-high`).探測的最小任務(讀中文檔第1行+寫`out/`)agy 16秒通過.
