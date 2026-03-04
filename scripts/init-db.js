#!/usr/bin/env node
/**
 * scripts/init-db.js — Neon 数据库初始化脚本
 *
 * 在服务启动前（Dockerfile CMD / Render Start Command）执行。
 * 执行顺序：
 *   1. 验证 DATABASE_URL 环境变量存在
 *   2. 连接 Neon，连接失败则 exit(1)（防止数据静默丢失）
 *   3. 创建所有表（IF NOT EXISTS，幂等安全）
 *   4. 查询 menus 表记录数：
 *      - 为 0  → 第一次部署，写入默认种子数据
 *      - 大于 0 → Neon 已有数据，跳过种子，直接退出
 *   5. 全部成功后 exit(0)，app.js 随即启动
 *
 * 严禁用本地文件存在性判断"是否首次部署"——必须查 Neon 记录数。
 */

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

// ─── 环境变量检查 ─────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('❌ [init-db] 致命错误：DATABASE_URL 环境变量未设置');
  console.error('   请在 Render Dashboard → Environment 中添加 DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

// ─── DDL：创建所有表 ──────────────────────────────────────────────────────────
const CREATE_TABLES_SQL = `
  -- 主菜单
  CREATE TABLE IF NOT EXISTS menus (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  );

  -- 子菜单
  CREATE TABLE IF NOT EXISTS sub_menus (
    id        SERIAL PRIMARY KEY,
    parent_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    "order"   INTEGER DEFAULT 0
  );

  -- 导航卡片
  CREATE TABLE IF NOT EXISTS cards (
    id               SERIAL PRIMARY KEY,
    menu_id          INTEGER REFERENCES menus(id) ON DELETE SET NULL,
    sub_menu_id      INTEGER REFERENCES sub_menus(id) ON DELETE SET NULL,
    title            TEXT NOT NULL,
    url              TEXT NOT NULL,
    logo_url         TEXT,
    custom_logo_path TEXT,
    desc             TEXT,
    "order"          INTEGER DEFAULT 0
  );

  -- 管理员用户
  CREATE TABLE IF NOT EXISTS users (
    id       SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  -- 友情链接
  CREATE TABLE IF NOT EXISTS friends (
    id    SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    url   TEXT NOT NULL,
    logo  TEXT
  );

  -- 广告位
  CREATE TABLE IF NOT EXISTS ads (
    id       SERIAL PRIMARY KEY,
    position TEXT,
    img      TEXT,
    url      TEXT
  );
`;

// ─── 默认种子数据（与原 db.js 保持一致）─────────────────────────────────────
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
  { menu: 'Home',    title: 'Baidu',    url: 'https://www.baidu.com',  desc: '搜索引擎' },
  { menu: 'Home',    title: 'YouTube',  url: 'https://www.youtube.com', desc: '视频'    },
  { menu: 'Home',    title: 'GitHub',   url: 'https://github.com',     desc: '代码托管' },
  { subMenu: 'AI chat', title: 'DeepSeek', url: 'https://www.deepseek.com', desc: 'AI 搜索' },
];

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  let client;

  // ① 连接验证——失败即停止
  console.log('[init-db] 正在连接 Neon PostgreSQL ...');
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('[init-db] ✅ Neon 连接成功');
  } catch (err) {
    console.error('❌ [init-db] 致命错误：无法连接到 Neon 数据库');
    console.error('   错误详情:', err.message);
    console.error('   服务启动已中止，防止数据静默丢失。');
    console.error('   请检查：DATABASE_URL 是否正确 / Neon 项目是否正常运行');
    process.exit(1);
  }

  try {
    // ② 建表（幂等）
    console.log('[init-db] 正在创建/验证数据库表结构 ...');
    await client.query(CREATE_TABLES_SQL);
    console.log('[init-db] ✅ 表结构就绪');

    // ③ 检查 Neon 是否已有数据（严禁用本地文件判断）
    const { rows } = await client.query('SELECT COUNT(*) AS count FROM menus');
    const recordCount = parseInt(rows[0].count, 10);
    console.log(`[init-db] Neon menus 表当前记录数: ${recordCount}`);

    if (recordCount > 0) {
      // Neon 已有数据 → 非首次启动，跳过种子
      console.log('[init-db] ✅ 检测到 Neon 中存在数据，跳过种子写入，直接启动服务');
      return; // 进入 finally 释放连接后正常退出
    }

    // ④ 首次部署：写入默认种子数据
    console.log('[init-db] Neon 数据库为空，开始写入默认种子数据 ...');
    await client.query('BEGIN');

    // 写入主菜单，并记录 name → id 映射
    const menuMap = {};
    for (const m of DEFAULT_MENUS) {
      const res = await client.query(
        'INSERT INTO menus (name, "order") VALUES ($1, $2) RETURNING id',
        [m.name, m.order]
      );
      menuMap[m.name] = res.rows[0].id;
    }
    console.log(`[init-db]   → 菜单写入完成 (${DEFAULT_MENUS.length} 条)`);

    // 写入子菜单
    const subMenuMap = {}; // "ParentName_SubName" → id
    for (const s of DEFAULT_SUB_MENUS) {
      const parentId = menuMap[s.parent];
      const res = await client.query(
        'INSERT INTO sub_menus (parent_id, name, "order") VALUES ($1, $2, $3) RETURNING id',
        [parentId, s.name, s.order]
      );
      subMenuMap[`${s.parent}_${s.name}`] = res.rows[0].id;
    }
    console.log(`[init-db]   → 子菜单写入完成 (${DEFAULT_SUB_MENUS.length} 条)`);

    // 写入卡片
    for (const c of DEFAULT_CARDS) {
      let menuId = null;
      let subMenuId = null;

      if (c.menu) {
        menuId = menuMap[c.menu];
      }
      if (c.subMenu) {
        // 找到第一个匹配该子菜单名的 key
        const key = Object.keys(subMenuMap).find(k => k.endsWith(`_${c.subMenu}`));
        if (key) {
          subMenuId = subMenuMap[key];
          // 通过子菜单 key 反推 parentName → menuId
          const parentName = key.split('_')[0];
          menuId = menuMap[parentName];
        }
      }

      await client.query(
        `INSERT INTO cards (menu_id, sub_menu_id, title, url, desc)
         VALUES ($1, $2, $3, $4, $5)`,
        [menuId, subMenuId, c.title, c.url, c.desc]
      );
    }
    console.log(`[init-db]   → 卡片写入完成 (${DEFAULT_CARDS.length} 条)`);

    // 写入默认管理员账号（密码使用 bcrypt hash，对应明文 '123456'）
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD_HASH
      || '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // bcrypt('123456')

    await client.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [adminUsername, adminPassword]
    );
    console.log(`[init-db]   → 管理员账号写入完成 (username: ${adminUsername})`);

    await client.query('COMMIT');
    console.log('[init-db] ✅ 种子数据写入成功，服务即将启动');

  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('❌ [init-db] 数据初始化失败，已回滚');
    console.error('   错误详情:', err.message);
    console.error('   服务启动已中止。');
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
