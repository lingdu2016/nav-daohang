const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data', 'nav.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (!err) {
    console.log('SQLite 已连接:', DB_PATH);
    
    // 关键点：检查 users 表是否存在，如果不存在则运行初始化脚本
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
      if (!row) {
        console.log('检测到新数据库，正在初始化表结构...');
        const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
        db.exec(initSql, (err) => {
          if (err) console.error('初始化失败:', err.message);
          else console.log('数据库初始化成功！请使用默认账号登录。');
        });
      }
    });
  }
});

module.exports = db;
