// db.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_PATH = '/tmp/nav.db';

/**
 * ===============================
 * 准备数据库文件
 * ===============================
 */
if (!fs.existsSync('/tmp')) {
  fs.mkdirSync('/tmp', { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
  fs.closeSync(fs.openSync(DB_PATH, 'w'));
}

/**
 * ===============================
 * 打开数据库
 * ===============================
 */
const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('[SQLite] 打开数据库失败:', err);
      process.exit(1);
    }
  }
);

/**
 * ===============================
 * SQLite 配置（HF + Litestream 必须）
 * ===============================
 */
db.serialize(() => {
  db.run('PRAGMA journal_mode = DELETE;');
  db.run('PRAGMA busy_timeout = 5000;');
  db.run('PRAGMA synchronous = NORMAL;');
});

/**
 * ===============================
 * 建表
 * ===============================
 */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sub_menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id INTEGER,
    sub_menu_id INTEGER,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_url TEXT,
    desc TEXT,
    "order" INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo TEXT
  )`);
});

/**
 * ===============================
 * 初始化数据（严格串行）
 * ===============================
 */
db.get('SELECT COUNT(*) AS count FROM menus', (err, row) => {
  if (err) {
    console.error(err);
    return;
  }
  if (row.count === 0) {
    console.log('数据库为空，开始初始化...');
    initMenus();
  }
});

/**
 * ===============================
 * 1️⃣ 初始化菜单（串行）
 * ===============================
 */
const defaultMenus = [
  ['Home', 1],
  ['Ai Stuff', 2],
  ['Cloud', 3],
  ['Software', 4],
  ['Tools', 5],
  ['Other', 6],
];

const menuMap = {};
const subMenuMap = {};

function initMenus() {
  let i = 0;

  function next() {
    if (i >= defaultMenus.length) {
      console.log('菜单完成，开始子菜单');
      return initSubMenus();
    }

    const [name, order] = defaultMenus[i];

    db.run(
      'INSERT INTO menus (name, "order") VALUES (?, ?)',
      [name, order],
      function (err) {
        if (err) return console.error(err);
        menuMap[name] = this.lastID;
        i++;
        next();
      }
    );
  }

  next();
}

/**
 * ===============================
 * 2️⃣ 初始化子菜单（串行）
 * ===============================
 */
const subMenus = [
  { parent: 'Ai Stuff', name: 'AI chat', order: 1 },
  { parent: 'Ai Stuff', name: 'AI tools', order: 2 },
  { parent: 'Tools', name: 'Dev Tools', order: 1 },
  { parent: 'Software', name: 'Mac', order: 1 },
  { parent: 'Software', name: 'Windows', order: 4 },
];

function initSubMenus() {
  let i = 0;

  function next() {
    if (i >= subMenus.length) {
      console.log('子菜单完成，开始卡片');
      return initCards();
    }

    const sub = subMenus[i];
    const parentId = menuMap[sub.parent];

    db.run(
      'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)',
      [parentId, sub.name, sub.order],
      function (err) {
        if (err) return console.error(err);
        subMenuMap[`${sub.parent}_${sub.name}`] = this.lastID;
        i++;
        next();
      }
    );
  }

  next();
}

/**
 * ===============================
 * 3️⃣ 初始化卡片（串行）
 * ===============================
 */
const cards = [
  { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', desc: '搜索引擎' },
  { menu: 'Home', title: 'YouTube', url: 'https://www.youtube.com', desc: '视频' },
  { menu: 'Home', title: 'GitHub', url: 'https://github.com', desc: '代码托管' },
  { subMenu: 'AI chat', title: 'DeepSeek', url: 'https://www.deepseek.com', desc: 'AI 搜索' },
];

function initCards() {
  let i = 0;

  function next() {
    if (i >= cards.length) {
      console.log('所有数据初始化完成！');
      return;
    }

    const card = cards[i];
    const menuId = card.menu ? menuMap[card.menu] : null;

    let subMenuId = null;
    if (card.subMenu) {
      for (const key in subMenuMap) {
        if (key.endsWith(`_${card.subMenu}`)) {
          subMenuId = subMenuMap[key];
          break;
        }
      }
    }

    db.run(
      'INSERT INTO cards (menu_id, sub_menu_id, title, url, desc) VALUES (?, ?, ?, ?, ?)',
      [menuId, subMenuId, card.title, card.url, card.desc],
      (err) => {
        if (err) return console.error(err);
        i++;
        next();
      }
    );
  }

  next();
}

module.exports = db;
