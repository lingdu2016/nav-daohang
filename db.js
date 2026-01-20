const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');
const config = require('./config');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'nav.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) { fs.mkdirSync(dbDir, { recursive: true }); }

// 1. 恢复逻辑
if (!fs.existsSync(DB_PATH)) {
    try {
        console.log('检测到本地无数据库，尝试从云端恢复...');
        execSync(`litestream restore -if-db-not-exists -config /app/litestream.yml ${DB_PATH}`, { stdio: 'inherit' });
    } catch (e) { console.log('跳过恢复，准备初始化'); }
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // 2. 建表
    db.run(`CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "order" INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS sub_menus (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER NOT NULL, name TEXT NOT NULL, "order" INTEGER DEFAULT 0, FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, menu_id INTEGER, sub_menu_id INTEGER, title TEXT NOT NULL, url TEXT NOT NULL, logo_url TEXT, desc TEXT, "order" INTEGER DEFAULT 0, FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE, FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, last_login_time TEXT, last_login_ip TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, logo TEXT)`);

    // 3. 检查并全量初始化
    db.get('SELECT COUNT(*) as count FROM menus', (err, row) => {
        if (row && row.count === 0) {
            console.log('数据库为空，开始全量初始化 35+ 网址...');
            runFullInit();
        } else {
            console.log('数据库已存在数据，跳过初始化。');
        }
    });
});

function runFullInit() {
    const defaultMenus = [['Home', 1], ['Ai Stuff', 2], ['Cloud', 3], ['Software', 4], ['Tools', 5], ['Other', 6]];
    let menuMap = {};
    let completedMenus = 0;

    defaultMenus.forEach(([name, order]) => {
        db.run('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order], function() {
            menuMap[name] = this.lastID;
            if (++completedMenus === defaultMenus.length) insertSubAndCards(menuMap);
        });
    });
}

function insertSubAndCards(menuMap) {
    const subMenus = [
        { parentMenu: 'Ai Stuff', name: 'AI chat', order: 1 },
        { parentMenu: 'Ai Stuff', name: 'AI tools', order: 2 },
        { parentMenu: 'Tools', name: 'Dev Tools', order: 1 },
        { parentMenu: 'Software', name: 'Mac', order: 1 }
    ];

    let subMenuMap = {};
    let completedSubs = 0;
    subMenus.forEach(sub => {
        db.run('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)', [menuMap[sub.parentMenu], sub.name, sub.order], function() {
            subMenuMap[`${sub.parentMenu}_${sub.name}`] = this.lastID;
            if (++completedSubs === subMenus.length) finalInsert(menuMap, subMenuMap);
        });
    });
}

function finalInsert(menuMap, subMenuMap) {
    const cards = [
        { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', desc: '全球最大的中文搜索引擎' },
        { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', desc: '全球最大的视频社区' },
        { menu: 'Home', title: 'Gmail', url: 'https://mail.google.com', desc: 'Google邮箱' },
        { menu: 'Home', title: 'GitHub', url: 'https://github.com', desc: '全球最大的代码托管平台' },
        { menu: 'Home', title: 'ip.sb', url: 'https://ip.sb', desc: 'ip地址查询' },
        { menu: 'Home', title: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: '全球最大的cdn服务商' },
        { menu: 'Home', title: 'ChatGPT', url: 'https://chat.openai.com', desc: '人工智能AI聊天机器人' },
        { menu: 'Home', title: 'Huggingface', url: 'https://huggingface.co', desc: '模型托管平台' },
        { menu: 'Home', title: 'ITDOG', url: 'https://www.itdog.cn/tcping', desc: '在线tcping' },
        { menu: 'Home', title: 'Ping0', url: 'https://ping0.cc', desc: 'ip地址查询' },
        { menu: 'Home', title: '浏览器指纹', url: 'https://www.browserscan.net/zh', desc: '指纹查询' },
        { menu: 'Home', title: 'nezha面板', url: 'https://ssss.nyc.mn', desc: 'nezha面板' },
        { menu: 'Home', title: 'NodeSeek', url: 'https://www.nodeseek.com', desc: '主机论坛' },
        { menu: 'Home', title: 'Linux do', url: 'https://linux.do', desc: '新的理想型社区' },
        { menu: 'Home', title: '在线音乐', url: 'https://music.eooce.com', desc: '在线音乐' },
        { menu: 'Home', title: '在线电影', url: 'https://libretv.eooce.com', desc: '在线电影' },
        { menu: 'Home', title: '订阅转换', url: 'https://sublink.eooce.com', desc: '订阅转换工具' },
        { menu: 'Home', title: 'webssh', url: 'https://ssh.eooce.com', desc: 'webssh终端' },
        { menu: 'Home', title: '文件快递柜', url: 'https://filebox.nnuu.nyc.mn', desc: '文件分享' },
        { menu: 'Home', title: '真实地址生成', url: 'https://address.nnuu.nyc.mn', desc: '地址生成器' },
        { menu: 'Ai Stuff', title: 'Claude', url: 'https://claude.ai', desc: 'Anthropic AI' },
        { menu: 'Ai Stuff', title: 'Gemini', url: 'https://gemini.google.com', desc: 'Google AI' },
        { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', desc: 'AI搜索' },
        { subMenu: 'AI tools', title: 'Kimi', url: 'https://www.kimi.com', desc: 'Moonshot AI' },
        { menu: 'Cloud', title: '阿里云', url: 'https://www.aliyun.com', desc: '阿里云官网' },
        { menu: 'Cloud', title: '腾讯云', url: 'https://cloud.tencent.com', desc: '腾讯云官网' },
        { menu: 'Software', title: 'Hellowindows', url: 'https://hellowindows.cn', desc: '系统下载' },
        { menu: 'Software', title: 'Macwk', url: 'https://www.macwk.com', desc: '精品Mac软件' },
        { menu: 'Tools', title: 'JSON工具', url: 'https://www.json.cn', desc: '格式化校验' },
        { subMenu: 'Dev Tools', title: 'Uiverse', url: 'https://uiverse.io/elements', desc: 'CSS设计' },
        { menu: 'Other', title: 'Proton Mail', url: 'https://account.proton.me', desc: '安全邮箱' }
    ];

    const stmt = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, desc) VALUES (?, ?, ?, ?, ?)');
    cards.forEach(card => {
        let mId = card.menu ? menuMap[card.menu] : null;
        let sId = null;
        if (card.subMenu) {
            for (const key in subMenuMap) {
                if (key.endsWith(`_${card.subMenu}`)) { sId = subMenuMap[key]; break; }
            }
        }
        stmt.run(mId, sId, card.title, card.url, card.desc);
    });
    stmt.finalize(() => {
        console.log('所有卡片插入完成！');
        // 插入管理员
        const passwordHash = bcrypt.hashSync(config.admin.password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [config.admin.username, passwordHash]);
    });
}

module.exports = db;
