const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

/**
 * 数据库路径
 * 线上：通过环境变量 DATABASE_PATH=/tmp/nav.db
 * 本地：fallback 到项目内 database/nav.db
 */
const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(__dirname, 'nav.db');

/**
 * 确保数据库目录存在
 * /tmp 本身就存在
 * 本地 database/ 不存在则创建
 */
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * 创建数据库连接
 */
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite:', err.message);
  } else {
    console.log('✅ SQLite connected:', DB_PATH);
  }
});

/**
 * 初始化表结构 & 默认数据
 * ⚠️ restore 成功后，表已存在且有数据，不会重复插入
 */
db.serialize(() => {
  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // 菜单表
  db.run(`
    CREATE TABLE IF NOT EXISTS menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      url TEXT,
      category TEXT,
      parent_id INTEGER DEFAULT NULL
    )
  `);

  // 友链表
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT
    )
  `);

  // 默认数据（只在空表时插入）
  db.get(`SELECT COUNT(*) AS count FROM menus`, (err, row) => {
    if (err) return;
    if (row.count === 0) {
      console.log('📦 初始化默认导航数据...');
      // 这里调用你原来的插入逻辑（不需要改）
      // initMenus(db)
    }
  });
});

module.exports = db;
