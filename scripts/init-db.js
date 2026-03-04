#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('❌ [init-db] 致命错误：DATABASE_URL 环境变量未设置');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS menus (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sub_menus (
    id        SERIAL PRIMARY KEY,
    parent_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    "order"   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cards (
    id               SERIAL PRIMARY KEY,
    menu_id          INTEGER REFERENCES menus(id) ON DELETE SET NULL,
    sub_menu_id      INTEGER REFERENCES sub_menus(id) ON DELETE SET NULL,
    title            TEXT NOT NULL,
    url              TEXT NOT NULL,
    logo_url         TEXT,
    custom_logo_path TEXT,
    description      TEXT,
    "order"          INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password        TEXT NOT NULL,
    last_login_time TEXT,
    last_login_ip   TEXT
  );

  CREATE TABLE IF NOT EXISTS friends (
    id    SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    url   TEXT NOT NULL,
    logo  TEXT
  );

  CREATE TABLE IF NOT EXISTS ads (
    id       SERIAL PRIMARY KEY,
    position TEXT,
    img      TEXT,
    url      TEXT
  );
`;

const DEFAULT_MENUS = [
  { name: 'Home',     order: 1 },
  { name: 'Ai Stuff', order: 2 },
  { name: 'Cloud',    order: 3 },
  { name: 'Software', order: 4 },
  { name: 'Tools',    order: 5 },
  { name: 'Other',    order: 6 },
];

const DEFAULT_SUB_MENUS = [
  { parent: 'Ai Stuff', name: 'AI chat',   order: 1 },
  { parent: 'Ai Stuff', name: 'AI tools',  order: 2 },
  { parent: 'Tools',    name: 'Dev Tools', order: 1 },
  { parent: 'Software', name: 'Mac',       order: 1 },
  { parent: 'Software', name: 'Windows',   order: 4 },
];

const DEFAULT_CARDS = [
  { menu: 'Home',       title: 'Baidu',    url: 'https://www.baidu.com',    description: '搜索引擎' },
  { menu: 'Home',       title: 'YouTube',  url: 'https://www.youtube.com',  description: '视频'    },
  { menu: 'Home',       title: 'GitHub',   url: 'https://github.com',       description: '代码托管' },
  { subMenu: 'AI chat', title: 'DeepSeek', url: 'https://www.deepseek.com', description: 'AI 搜索' },
];

async function main() {
  let client;

  console.log('[init-db] 正在连接 Neon PostgreSQL ...');
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('[init-db] ✅ Neon 连接成功');
  } catch (err) {
    console.error('❌ [init-db] 致命错误：无法连接到 Neon 数据库');
    console.error('   错误详情:', err.message);
    process.exit(1);
  }

  try {
    console.log('[init-db] 正在创建/验证数据库表结构 ...');
    await client.query(CREATE_TABLES_SQL);
    console.log('[init-db] ✅ 表结构就绪');

    const { rows } = await client.query('SELECT COUNT(*) AS count FROM menus');
    const recordCount = parseInt(rows[0].count, 10);
    console.log(`[init-db] Neon menus 表当前记录数: ${recordCount}`);

    if (recordCount > 0) {
      console.log('[init-db] ✅ 检测到 Neon 中存在数据，跳过种子写入，直接启动服务');
      return;
    }

    console.log('[init-db] Neon 数据库为空，开始写入默认种子数据 ...');
    await client.query('BEGIN');

    const menuMap = {};
    for (const m of DEFAULT_MENUS) {
      const res = await client.query(
        'INSERT INTO menus (name, "order") VALUES ($1, $2) RETURNING id',
        [m.name, m.order]
      );
      menuMap[m.name] = res.rows[0].id;
    }
    console.log(`[init-db]   → 菜单写入完成 (${DEFAULT_MENUS.length} 条)`);

    const subMenuMap = {};
    for (const s of DEFAULT_SUB_MENUS) {
      const res = await client.query(
        'INSERT INTO sub_menus (parent_id, name, "order") VALUES ($1, $2, $3) RETURNING id',
        [menuMap[s.parent], s.name, s.order]
      );
      subMenuMap[`${s.parent}_${s.name}`] = res.rows[0].id;
    }
    console.log(`[init-db]   → 子菜单写入完成 (${DEFAULT_SUB_MENUS.length} 条)`);

    for (const c of DEFAULT_CARDS) {
      let menuId = c.menu ? menuMap[c.menu] : null;
      let subMenuId = null;
      if (c.subMenu) {
        const key = Object.keys(subMenuMap).find(k => k.endsWith(`_${c.subMenu}`));
        if (key) {
          subMenuId = subMenuMap[key];
          menuId = menuMap[key.split('_')[0]];
        }
      }
      await client.query(
        'INSERT INTO cards (menu_id, sub_menu_id, title, url, description) VALUES ($1, $2, $3, $4, $5)',
        [menuId, subMenuId, c.title, c.url, c.description]
      );
    }
    console.log(`[init-db]   → 卡片写入完成 (${DEFAULT_CARDS.length} 条)`);

    // 运行时动态生成 bcrypt hash，避免硬编码 hash 出错
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPlainPassword = process.env.ADMIN_PASSWORD || '123456';
    const adminPasswordHash = await bcrypt.hash(adminPlainPassword, 10);

    await client.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [adminUsername, adminPasswordHash]
    );
    console.log(`[init-db]   → 管理员账号写入完成 (username: ${adminUsername}, password: ${adminPlainPassword})`);

    await client.query('COMMIT');
    console.log('[init-db] ✅ 种子数据写入成功，服务即将启动');

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [init-db] 数据初始化失败，已回滚');
    console.error('   错误详情:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().then(() => {
  console.log('[init-db] 初始化完成，退出脚本');
  process.exit(0);
}).catch((err) => {
  console.error('❌ [init-db] 未捕获的异常:', err);
  process.exit(1);
});
