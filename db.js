const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { execSync } = require('child_process');

const DB_PATH = process.env.DATABASE_PATH || '/data/nav.db';

// 启动时 restore
if (!fs.existsSync(DB_PATH)) {
  try {
    execSync(
      `litestream restore -if-replica-exists -config /app/litestream.yml ${DB_PATH}`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    console.log('[DB] 首次启动，无远端数据库');
  }
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run('PRAGMA journal_mode = DELETE;');
  db.run('PRAGMA busy_timeout = 5000;');
});

module.exports = db;




db.serialize(() => {
    // 1. 建表
    db.run(`CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "order" INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS sub_menus (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER NOT NULL, name TEXT NOT NULL, "order" INTEGER DEFAULT 0, FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, menu_id INTEGER, sub_menu_id INTEGER, title TEXT NOT NULL, url TEXT NOT NULL, logo_url TEXT, desc TEXT, "order" INTEGER DEFAULT 0, FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE, FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, last_login_time TEXT, last_login_ip TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, logo TEXT)`);

    // 2. 检查并初始化数据
    db.get('SELECT COUNT(*) as count FROM menus', (err, row) => {
        if (row && row.count === 0) {
            console.log('数据库为空，开始初始化...');
            startInitialization();
        }
    });
});

function startInitialization() {
    const defaultMenus = [['Home', 1], ['Ai Stuff', 2], ['Cloud', 3], ['Software', 4], ['Tools', 5], ['Other', 6]];
    
    // 串行插入菜单
    let menuMap = {};
    let completedMenus = 0;

    defaultMenus.forEach(([name, order]) => {
        db.run('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order], function(err) {
            menuMap[name] = this.lastID;
            completedMenus++;
            if (completedMenus === defaultMenus.length) {
                console.log('菜单完成，开始子菜单');
                insertSubMenus(menuMap);
            }
        });
    });
}

function insertSubMenus(menuMap) {
    const subMenus = [
        { parentMenu: 'Ai Stuff', name: 'AI chat', order: 1 },
        { parentMenu: 'Ai Stuff', name: 'AI tools', order: 2 },
        { parentMenu: 'Tools', name: 'Dev Tools', order: 1 },
        { parentMenu: 'Software', name: 'Mac', order: 1 },
        { parentMenu: 'Software', name: 'Windows', order: 4 }
    ];

    let subMenuMap = {};
    let completedSub = 0;

    subMenus.forEach(sub => {
        db.run('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)', 
        [menuMap[sub.parentMenu], sub.name, sub.order], function(err) {
            subMenuMap[`${sub.parentMenu}_${sub.name}`] = this.lastID;
            completedSub++;
            if (completedSub === subMenus.length) {
                console.log('子菜单完成，开始卡片');
                insertCards(menuMap, subMenuMap);
            }
        });
    });
}

function insertCards(menuMap, subMenuMap) {
    const cards = [
        { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', desc: '搜索引擎' },
        { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', desc: '视频' },
        { menu: 'Home', title: 'GitHub', url: 'https://github.com', desc: '代码托管' },
        { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', desc: 'AI搜索' }
        // ... 此处省略你其他的卡片数据，请自行补充完整 ...
    ];

    const stmt = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, desc) VALUES (?, ?, ?, ?, ?)');
    cards.forEach(card => {
        let mId = card.menu ? menuMap[card.menu] : null;
        let sId = card.subMenu ? null : null;
        
        // 查找子菜单ID逻辑
        if (card.subMenu) {
            for (const key in subMenuMap) {
                if (key.endsWith(`_${card.subMenu}`)) {
                    sId = subMenuMap[key];
                    break;
                }
            }
        }

        stmt.run(mId, sId, card.title, card.url, card.desc);
    });
    stmt.finalize(() => console.log('所有数据初始化完成！'));
}

module.exports = db;

