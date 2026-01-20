const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

// 1. 路径自适应：Render 环境用 /tmp，本地开发用项目根目录 data/
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
    
    // 4. 【核心功能】自动初始化表结构
    // 检查 users 表是否存在（以此判断是否是新库）
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
      if (err) {
        console.error('检查表结构失败:', err.message)
        return
      }

      if (!row) {
        console.log('检测到数据库表缺失，正在根据 init.sql 初始化...')
        try {
          // 找到你项目里的 init.sql 文件路径
          const sqlPath = path.join(__dirname, 'init.sql') 
          const initSql = fs.readFileSync(sqlPath, 'utf8')
          
          // 执行初始化脚本
          db.exec(initSql, (err) => {
            if (err) {
              console.error('执行 init.sql 失败:', err.message)
            } else {
              console.log('数据库表初始化成功！请使用默认账号登录。')
            }
          })
        } catch (fileErr) {
          console.error('找不到 init.sql 文件，请确认路径是否正确:', fileErr.message)
        }
      } else {
        console.log('数据库表结构完整，无需初始化。')
      }
    })
  }
})

module.exports = db
