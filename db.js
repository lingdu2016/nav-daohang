const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

// 新增：从环境变量读路径，默认 /data/nav.db
const DB_PATH = process.env.DATABASE_PATH || path.join('/data', 'nav.db')

const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite 连接失败:', err.message)
  } else {
    console.log('SQLite 已连接:', DB_PATH)
  }
})

module.exports = db
