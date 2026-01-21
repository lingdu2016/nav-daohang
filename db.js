const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * ================================
 * Hugging Face + litestream 专用配置
 * ================================
 */

// 数据库只能放在 /tmp（HF 唯一可写）
const DB_PATH = process.env.DATABASE_PATH || '/tmp/nav.db';

/**
 * ================================
 * 启动阶段：从 B2 恢复数据库
 * ================================
 * 只在本地数据库不存在时执行
 */
if (!fs.existsSync(DB_PATH)) {
    try {
        console.log('[DB] 本地无数据库，尝试从 B2 恢复...');
        execSync(
            `litestream restore -if-db-not-exists -config /app/litestream.yml ${DB_PATH}`,
            { stdio: 'inherit' }
        );
        console.log('[DB] 数据库恢复完成');
    } catch (err) {
        console.log('[DB] 未发现远端数据库，进入首次初始化');
    }
}

/**
 * ================================
 * 打开 SQLite 数据库
 * ================================
 */
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[DB] 打开数据库失败:', err);
        process.exit(1);
    }
    console.log('[DB] 数据库已打开:', DB_PATH);
});

/**
 * ================================
 * SQLite 初始化（非常关键）
 * ================================
 */
db.serialize(() => {
    /**
     * ⚠️ HF + litestream 必须配置
     * 否则会出现：能登录但不能增删
     */
    db.run('PRAGMA journal_mode=DELETE;');   // 禁用 WAL
    db.run('PRAGMA synchronous=FULL;');
    db.run('PRAGMA busy_timeout=5000;');     // 等锁 5 秒，防止 SQLITE_BUSY

    /**
     * ================================
     * 建表
     * ================================
     */
    db.run(`
        CREATE TABLE IF NOT EXISTS menus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            "order" INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS sub_menus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            "order" INTEGER DEFAULT 0,
            FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id INTEGER,
            sub_menu_id INTEGER,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            logo_url TEXT,
            desc TEXT,
            "order" INTEGER DEFAULT 0,
            FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE,
            FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            last_login_time TEXT,
            last_login_ip TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            logo TEXT
        )
    `);

    /**
     * ================================
     * 判断是否需要初始化数据
     * ================================
     */
    db.get('SELECT COUNT(*) AS count FROM menus', (err, row) => {
        if (err) {
            console.error('[DB] 检查数据库失败:', err);
            return;
        }
        if (row.count === 0) {
            console.log('[DB] 数据库为空，开始初始化默认数据');
            initDefaultData();
        }
    });
});

/**
 * ================================
 * 初始化默认数据
 * ================================
 */
function initDefaultData() {
    const menus = [
        ['Home', 1],
        ['Ai Stuff', 2],
        ['Cloud', 3],
        ['Software', 4],
        ['Tools', 5],
        ['Other', 6]
    ];

    const menuMap = {};
    let finished = 0;

    menus.forEach(([name, order]) => {
        db.run(
            'INSERT INTO menus (name, "order") VALUES (?, ?)',
            [name, order],
            function (err) {
                if (err) {
                    console.error('[DB] 初始化菜单失败:', err);
                    return;
                }
                menuMap[name] = this.lastID;
                finished++;
                if (finished === menus.length) {
                    initSubMenus(menuMap);
                }
            }
        );
    });
}

function initSubMenus(menuMap) {
    const subs = [
        { parent: 'Ai Stuff', name: 'AI chat', order: 1 },
        { parent: 'Ai Stuff', name: 'AI tools', order: 2 },
        { parent: 'Tools', name: 'Dev Tools', order: 1 },
        { parent: 'Software', name: 'Mac', order: 1 },
        { parent: 'Software', name: 'Windows', order: 2 }
    ];

    const subMap = {};
    let finished = 0;

    subs.forEach(sub => {
        db.run(
            'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)',
            [menuMap[sub.parent], sub.name, sub.order],
            function (err) {
                if (err) {
                    console.error('[DB] 初始化子菜单失败:', err);
                    return;
                }
                subMap[`${sub.parent}_${sub.name}`] = this.lastID;
                finished++;
                if (finished === subs.length) {
                    initCards(menuMap, subMap);
                }
            }
        );
    });
}

function initCards(menuMap, subMap) {
    const cards = [
        { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', desc: '搜索引擎' },
        { menu: 'Home', title: 'GitHub', url: 'https://github.com', desc: '代码托管' },
        { menu: 'Home', title: 'YouTube', url: 'https://www.youtube.com', desc: '视频平台' },
        { sub: 'AI chat', title: 'DeepSeek', url: 'https://www.deepseek.com', desc: 'AI 搜索' }
    ];

    const stmt = db.prepare(
        'INSERT INTO cards (menu_id, sub_menu_id, title, url, desc) VALUES (?, ?, ?, ?, ?)'
    );

    cards.forEach(card => {
        let menuId = card.menu ? menuMap[card.menu] : null;
        let subId = null;

        if (card.sub) {
            for (const key in subMap) {
                if (key.endsWith(`_${card.sub}`)) {
                    subId = subMap[key];
                    break;
                }
            }
        }

        stmt.run(menuId, subId, card.title, card.url, card.desc);
    });

    stmt.finalize(() => {
        console.log('[DB] 默认数据初始化完成');
    });
}

module.exports = db;
