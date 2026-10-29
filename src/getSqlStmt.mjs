//SQL紀錄之敘述種類(診斷輸出之safe摘要): 只取白名單內之首字, 不含表名與值; 遮罩與診斷出口皆由wsemi之getDiag提供(見WAutoSequelize.mjs)


//SQL敘述種類白名單(sequelize產生之敘述首字), 其餘一律OTHER
const STMTS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'PRAGMA', 'BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'WITH', 'MERGE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'DECLARE', 'SET', 'USE', 'IF', 'SHOW', 'DESCRIBE']


function getSqlStmt(sql) {
    //SQL紀錄的敘述種類(白名單首字, 去除sequelize加上之Executing (連線代號): 前綴), 不含表名與值; 其餘為OTHER
    if (typeof sql !== 'string') {
        return 'OTHER'
    }
    let m = sql.replace(/^\s*Executing \([^)]*\):\s*/, '').match(/^\s*([A-Za-z]+)/)
    let w = m === null ? '' : m[1].toUpperCase()
    return STMTS.indexOf(w) >= 0 ? w : 'OTHER'
}


export default getSqlStmt
