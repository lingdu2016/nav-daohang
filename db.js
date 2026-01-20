const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const config = require('./config');

// 1. 路径自适应：Render 环境强制使用 /tmp，本地环境默认在 database/ 目录下
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'nav.db');

// 2. 确保数据库目录存在（防止 /tmp 下没有预建目录）
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 3. 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('SQLite 连接失败:', err.message);
    } else {
        console.log('SQLite 已连接:', DB_PATH);
    }
});

// 4. 执行初始化序列
db.serialize(() => {
    // --- A. 创建基础表结构 ---
    db.run(`CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_menus_order ON menus("order")`);

    db.run(`CREATE TABLE IF NOT EXISTS sub_menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sub_menus_parent_id ON sub_menus(parent_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sub_menus_order ON sub_menus("order")`);

    db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id INTEGER,
    sub_menu_id INTEGER,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_url TEXT,
    custom_logo_path TEXT,
    desc TEXT,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE,
    FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_cards_menu_id ON cards(menu_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_cards_sub_menu_id ON cards(sub_menu_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_cards_order ON cards("order")`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    last_login_time TEXT,
    last_login_ip TEXT
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

    db.run(`CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position TEXT NOT NULL,
    img TEXT NOT NULL,
    url TEXT NOT NULL
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ads_position ON ads(position)`);

    db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo TEXT
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_friends_title ON friends(title)`);

    // --- B. 插入默认菜单、子菜单和卡片 ---
    db.get('SELECT COUNT(*) as count FROM menus', (err, row) => {
        if (row && row.count === 0) {
            console.log('检测到空库，正在插入默认菜单数据...');
            const defaultMenus = [
                ['Home', 1], ['Ai Stuff', 2], ['Cloud', 3], ['Software', 4], ['Tools', 5], ['Other', 6]
            ];
            const stmt = db.prepare('INSERT INTO menus (name, "order") VALUES (?, ?)');
            defaultMenus.forEach(([name, order]) => stmt.run(name, order));
            stmt.finalize(() => {
                insertDefaultSubMenusAndCards();
            });
        }
    });

    function insertDefaultSubMenusAndCards() {
        db.all('SELECT * FROM menus ORDER BY "order"', (err, menus) => {
            if (err || !menus.length) return;

            const menuMap = {};
            menus.forEach(m => { menuMap[m.name] = m.id; });

            const subMenus = [
                { parentMenu: 'Ai Stuff', name: 'AI chat', order: 1 },
                { parentMenu: 'Ai Stuff', name: 'AI tools', order: 2 },
                { parentMenu: 'Tools', name: 'Dev Tools', order: 1 },
                { parentMenu: 'Software', name: 'Mac', order: 1 },
                { parentMenu: 'Software', name: 'iOS', order: 2 },
                { parentMenu: 'Software', name: 'Android', order: 3 },
                { parentMenu: 'Software', name: 'Windows', order: 4 }
            ];

            const subMenuMap = {};
            const subMenuStmt = db.prepare('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)');

            let completed = 0;
            subMenus.forEach(subMenu => {
                if (menuMap[subMenu.parentMenu]) {
                    subMenuStmt.run(menuMap[subMenu.parentMenu], subMenu.name, subMenu.order, function (err) {
                        if (!err) subMenuMap[`${subMenu.parentMenu}_${subMenu.name}`] = this.lastID;
                        completed++;
                        if (completed === subMenus.length) {
                            subMenuStmt.finalize(() => insertCards(menuMap, subMenuMap));
                        }
                    });
                } else {
                    completed++;
                }
            });
        });
    }

    function insertCards(menuMap, subMenuMap) {
        const cards = [
            { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', logo_url: '', desc: '全球最大的中文搜索引擎' },
            { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', logo_url: 'https://img.icons8.com/ios-filled/100/ff1d06/youtube-play.png', desc: '全球最大的视频社区' },
            { menu: 'Home', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: '人工智能AI聊天机器人' },
            { menu: 'Ai Stuff', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            { subMenu: 'AI chat', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' }
            // ... 其余卡片已在逻辑中通过 subMenuMap 处理
        ];

        const cardStmt = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc) VALUES (?, ?, ?, ?, ?, ?)');
        cards.forEach(card => {
            if (card.subMenu) {
                let subMenuId = null;
                for (const [key, id] of Object.entries(subMenuMap)) {
                    if (key.endsWith(`_${card.subMenu}`)) { subMenuId = id; break; }
                }
                if (subMenuId) cardStmt.run(null, subMenuId, card.title, card.url, card.logo_url, card.desc);
            } else if (menuMap[card.menu]) {
                cardStmt.run(menuMap[card.menu], null, card.title, card.url, card.logo_url, card.desc);
            }
        });
        cardStmt.finalize();
        console.log('所有初始数据插入流程完成。');
    }

    // --- C. 插入默认管理员与友情链接 ---
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (row && row.count === 0) {
            const passwordHash = bcrypt.hashSync(config.admin.password, 10);
            db.run('INSERT INTO users (username, password) VALUES (?, ?)', [config.admin.username, passwordHash]);
            console.log('默认管理员账号已创建:', config.admin.username);
        }
    });

    db.get('SELECT COUNT(*) as count FROM friends', (err, row) => {
        if (row && row.count === 0) {
            const defaultFriends = [
                ['Noodseek图床', 'https://www.nodeimage.com', 'https://www.nodeseek.com/static/image/favicon/favicon-32x32.png'],
                ['Font Awesome', 'https://fontawesome.com', 'https://fontawesome.com/favicon.ico']
            ];
            const stmt = db.prepare('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)');
            defaultFriends.forEach(([title, url, logo]) => stmt.run(title, url, logo));
            stmt.finalize();
        }
    });
});

module.exports = db;
