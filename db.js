const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');
const config = require('./config');

/**
 * ================================
 * 数据库路径（HF + litestream 专用）
 * ================================
 * 只能使用 /tmp
 */
const DB_PATH = process.env.DATABASE_PATH || '/tmp/nav.db';

/**
 * ================================
 * 启动前：从 B2 恢复数据库
 * ================================
 */
if (!fs.existsSync(DB_PATH)) {
    try {
        console.log('[DB] 本地无数据库，尝试从云端恢复...');
        execSync(
            `litestream restore -if-db-not-exists -config /app/litestream.yml ${DB_PATH}`,
            { stdio: 'inherit' }
        );
        console.log('[DB] 数据库恢复完成');
    } catch (e) {
        console.log('[DB] 跳过恢复（可能是首次启动）');
    }
}

/**
 * ================================
 * 打开数据库
 * ================================
 */
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[DB] 打开数据库失败:', err);
    } else {
        console.log('[DB] 数据库已打开:', DB_PATH);
    }
});

/**
 * ================================
 * 数据库初始化
 * ================================
 */
db.serialize(() => {
    /**
     * ⚠️ 非常重要
     * HF + litestream 环境必须关闭 WAL
     */
    db.run('PRAGMA journal_mode=DELETE;');
    db.run('PRAGMA synchronous=FULL;');

    // 1. 建表
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

    // 2. 检查是否需要初始化
    db.get('SELECT COUNT(*) AS count FROM menus', (err, row) => {
        if (err) {
            console.error('[DB] 查询失败:', err);
            return;
        }
        if (row && row.count === 0) {
            console.log('[DB] 数据库为空，开始初始化...');
            startInitialization();
        }
    });
});

/**
 * ================================
 * 初始化默认数据
 * ================================
 */
function startInitialization() {
    const defaultMenus = [
        ['Home', 1],
        ['Ai Stuff', 2],
        ['Cloud', 3],
        ['Software', 4],
        ['Tools', 5],
        ['Other', 6]
    ];

    let menuMap = {};
    let completedMenus = 0;

    defaultMenus.forEach(([name, order]) => {
        db.run(
            'INSERT INTO menus (name, "order") VALUES (?, ?)',
            [name, order],
            function (err) {
                if (err) {
                    console.error('[DB] 插入菜单失败:', err);
                    return;
                }
                menuMap[name] = this.lastID;
                completedMenus++;
                if (completedMenus === defaultMenus.length) {
                    console.log('[DB] 菜单初始化完成');
                    insertSubMenus(menuMap);
                }
            }
        );
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
        db.run(
            'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)',
            [menuMap[sub.parentMenu], sub.name, sub.order],
            function (err) {
                if (err) {
                    console.error('[DB] 插入子菜单失败:', err);
                    return;
                }
                subMenuMap[`${sub.parentMenu}_${sub.name}`] = this.lastID;
                completedSub++;
                if (completedSub === subMenus.length) {
                    console.log('[DB] 子菜单初始化完成');
                    insertCards(menuMap, subMenuMap);
                }
            }
        );
    });
}

function insertCards(menuMap, subMenuMap) {
    const cards = [
        { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', desc: '搜索引擎' },
        { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', desc: '视频' },
        { menu: 'Home', title: 'GitHub', url: 'https://github.com', desc: '代码托管' },
        { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', desc: 'AI搜索' }
    ];

    const stmt = db.prepare(
        'INSERT INTO cards (menu_id, sub_menu_id, title, url, desc) VALUES (?, ?, ?, ?, ?)'
    );

    cards.forEach(card => {
        let menuId = card.menu ? menuMap[card.menu] : null;
        let subMenuId = null;

        if (card.subMenu) {
            for (const key in subMenuMap) {
                if (key.endsWith(`_${card.subMenu}`)) {
                    subMenuId = subMenuMap[key];
                    break;
                }
            }
        }

        stmt.run(menuId, subMenuId, card.title, card.url, card.desc);
    });

    stmt.finalize(() => {
        console.log('[DB] 初始化卡片完成');
    });
}

module.exports = db;
