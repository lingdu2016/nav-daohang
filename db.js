const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

/**
 * 核心逻辑：
 * 1. 在 Render 生产环境，我们会设置 DATABASE_PATH 为 /tmp/nav.db
 * 2. 在本地开发环境，它会默认在项目根目录生成 data/nav.db，方便你调试
 */
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data', 'nav.db')

// 自动创建数据库文件夹，防止目录不存在报错
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite 连接失败:', err.message)
  } else {
    console.log('SQLite 已连接:', DB_PATH)
    // 权限加固：确保数据库文件可读写
    try {
        fs.chmodSync(DB_PATH, 0o666)
    } catch (e) {
        // 忽略在某些环境下的权限修改失败
    }
  }
})

module.exports = db
