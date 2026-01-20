const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

// 1. 确定数据库存放路径 (Render用 /tmp, 本地用 ../data/)
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data', 'nav.db')

// 2. 确保数据库目录存在
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// 3. 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite 连接失败:', err.message)
  } else {
    console.log('SQLite 已连接:', DB_PATH)
    
    // 4. 自动初始化逻辑
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
      if (err) return console.error('检查表结构失败:', err.message)

      if (!row) {
        console.log('检测到数据库表缺失，正在寻找 init.sql...')
        
        // 尝试多个可能的路径，确保能找到 init.sql
        const possibleSqlPaths = [
          path.join(__dirname, 'init.sql'),          // 路径1: database/init.sql
          path.join(__dirname, '../init.sql'),       // 路径2: 根目录/init.sql
          path.join(process.cwd(), 'init.sql'),      // 路径3: 工作目录/init.sql
          path.join(process.cwd(), 'database/init.sql') // 路径4
        ]

        let initSql = null
        let foundPath = ''

        for (const sqlPath of possibleSqlPaths) {
          if (fs.existsSync(sqlPath)) {
            initSql = fs.readFileSync(sqlPath, 'utf8')
            foundPath = sqlPath
            break
          }
        }

        if (initSql) {
          console.log(`找到初始化文件: ${foundPath}，开始执行...`)
          db.exec(initSql, (err) => {
            if (err) console.error('执行 init.sql 失败:', err.message)
            else console.log('数据库初始化成功！请使用 init.sql 中的默认账号登录。')
          })
        } else {
          console.error('错误：在以下路径均未找到 init.sql，请检查文件位置：', possibleSqlPaths)
        }
      } else {
        console.log('数据库表结构完整，无需初始化。')
      }
    })
  }
})

module.exports = db
