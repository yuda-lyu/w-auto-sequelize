# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## autoseq(2026-10-31):失敗改reject、輸出夾建立失敗(排程第188項)

- **懸置之根因是「同步throw落在promise回呼鏈內」**:`write()`由`generateText`之`async.each`完成回呼呼叫,而整條鏈在`showAllTables().then(...)`內;同步`fs.mkdirSync`拋錯無人接,成為`unhandledRejection`,`pm`永不結算.修法不是在`WAutoSequelize`外包try,而是在拋出點(`write()`)try/catch後走`callback(err)`——失敗通道只能是`callback`.同理`path.resolve(非字串)`亦同步拋且訊息帶值,故型別錯誤須於連線前以固定字串拒收.
- **「只記錄」不是設計,是err傳遞被截斷**:`build`之失敗分支本就把`callback`當錯誤回呼,`generateText(err)`卻只`logErr`後續行;改法是在三個站點(清單、外鍵、描述表)記錄後`callback(err)`.外鍵查詢先於描述表,故外鍵失敗須即停(不再描述表),否則同輪會有兩筆診斷輸出而reject值只有一個.
- **失敗路徑要自己關連線**:`generateText`原只在成功路徑(`async.each`完成回呼)`sequelize.close()`;失敗改早退後須補`close()`(測試以`Sequelize.prototype.close`計次斷言恰1次).
- **測試以`outcome()`判「懸置」**:`Promise.race([done, 逾時])`,逾時上限只作防護(10秒)而非同步點;修前紅為pending(真實),修後立即結算.「promise是否永不結束」不能用`await`直接寫(測試本身會掛住).
- **`ECUSTOM`之類自訂code不進摘要**:`errCode`只收宣告集合(sqlite/mysql/mssql/sqlstate),測試之`plainErr`用`SQLITE_BUSY`才能同時斷言摘要有`errCode`.
- **外鍵查詢對每個表各查一次**:覆寫`Sequelize.prototype.query`使`foreign_key_list`失敗時,`mkErr`被呼叫表數次(此處2次),reject者為先失敗者;斷言用「`origs.length >= 1`且reject值不在origs內」,不寫死次數.
- **wsemi升版後共用語料會新增wire案**:1.9.33新增A11、C14、U22,`api-diaglog-wire`之「wire案皆已分類」測試即失敗(此為設計);逐案讀語料判定適用與否再補`NOT_APPLICABLE`(本套件三案皆不適用,理由已寫於測試).
- **變異腳本之NOAPPLY**:被比對字串若同時出現於註解(如`pm.reject(diag.err(err))`於註解與程式碼各一)則「恰出現1次」檢查擋下;改用含前後行之上下文字串.變異用`--bail`:懸置類變異無需等整套逾時(每個變異約1~5秒,23個共約30秒).
- **修前紅之取法同mig-autoseq**:`git archive HEAD src test package.json | tar -x -C ./tmp/autoseq/pre`,再把最終版測試複製進去、以repo根為cwd跑`./tmp/autoseq/pre/test/*.test.mjs`;須同時複製`test/tools/`(夾具新增了`outcome`等).
- **`npm i wsemi@latest`之副作用同前**:重排`package.json`相依字母序並補結尾換行,收尾以Edit還原,使diff只剩`wsemi`一行.

## mig-autoseq(2026-10-29):遷移至wsemi共用診斷模組(第161項)

- **wsemi以`name`判類別名,不是建構子名**:`getDiagBriefErr`取「原型鏈首個`name`字串資料屬性,非`Error`即取之」,sequelize於建構時設`this.name = 'SequelizeConnectionError'`,所以`types`要宣告`Sequelize…Error`這批`name`值(grep `node_modules/sequelize/lib/errors`的`this.name =`),宣告`ConnectionError`(建構子名)不生效;不宣告則`errType`全退為`Error`(失去既有摘要).`errType`值由`ConnectionError`變`SequelizeConnectionError`列入Breaking changes.
- **`codes`要涵蓋方言**:設計表只列`sqlite/mysql/sqlstate`,但既有測試與摘要用`ELOGIN`(mssql,本套件支援該方言),不宣告`mssql`則`errCode`消失;`mssql`集合另明列整數(18456等),未明列整數不收.
- **真實外來值洩漏路徑不需mock**:表名含密碼時,`fs.writeFile`的模型檔路徑含密碼;把`<directory>/<表名>.js`先建成資料夾,寫檔即真實`EISDIR`錯誤,訊息與`err.path`皆含密碼——修前`pm.reject(err)`原樣交出.這比patch`fs.writeFile`更能證明站點接上;patch版(`withWriteFileFail`)用來送入語料的任意形態值.
- **sqlite路徑變體要用相對路徑才分得出**:`database`給絕對路徑時原樣/正規化/絕對三種相同,漏掉任一種的變異存活;須另給相對路徑(`./test/_tmp/…`),且讓錯誤訊息同時帶三種形式.
- **語料wire案的接線法**:`make(ctx)`產生之值當「後端拋出之值」送入真實站點(patch `QueryInterface.showAllTables`→`tables catch`站取funLog之detail;patch `fs.writeFile`→`pm.reject`站取reject值),再以語料的`verify(c, out, ctx)`判定;`check`吃的`out`形狀依`call`而定(R01為`[原值, 結果]`、R11/R12為`{ p, e, r, c }`),須依案轉接.另加「wire案皆已分類」測試,使wsemi日後新增wire案時此處失敗而須分類.
- **舊版對照取法**:`git archive HEAD src test package.json | tar -x -C ./tmp/<案名>/pre`取修前副本,把新測試複製進去,以repo根為cwd執行`node ./node_modules/mocha/bin/mocha.js <pre內測試路徑>`(副本在repo的`tmp/`下,模組解析會往上找到repo的`node_modules`);quiet-run的鎖以cwd目錄名識別套件,故cwd不要換成副本夾.
- **變異腳本與換行**:工作樹為CRLF(`.editorconfig` `end_of_line = crlf`、git autocrlf),含`\n`的多行比對須先轉LF,否則回報NOAPPLY(此次M02、M19即因此第一輪未套用);腳本對每個變異都檢查「old字串恰出現1次」,未套用不計存活.
- **測試鎖排隊久**:`--lock`常等2分鐘以上(他套件持鎖);基準與變異包成同一個腳本一次取鎖,避免兩次排隊.
- **npm會重排`package.json`相依**:`npm i wsemi@latest`把相依改為字母序並補結尾換行,收尾時手動還原原順序與無結尾換行,使diff只剩`wsemi`一行.

## autoseq-run01(2026-10-28):診斷輸出單一出口(第156項,第153項之延伸)

(2026-10-29起`src/getDiag.mjs`已刪、遮罩改由wsemi提供;下列涉及自寫遮罩/副本函式之條目〔`mkErrCopy`、`getForms`、外審檢查表等〕僅供歷史參考,其教訓已併入wsemi之共用語料.)

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
