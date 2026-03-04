/**
 * db.js — Neon (PostgreSQL) 适配层
 *
 * 对外暴露与原 SQLite 完全一致的 db.run / db.get / db.all 接口，
 * 所有现有路由文件无需任何改动即可直接使用。
 *
 * 内部将：
 *  1. SQLite 的 ? 占位符自动转换为 PG 的 $1 $2 ...
 *  2. INSERT 语句自动追加 RETURNING id 以支持 this.lastID
 *  3. 以 this.changes / this.lastID 的形式回调，与 SQLite API 保持一致
 */

'use strict';

const { Pool } = require('pg');

// ─── 连接池 ───────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // 连接池参数，适合 Render Free 单实例
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[Neon] 连接池意外错误:', err.message);
});

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 将 SQLite 风格的 ? 占位符转换为 PostgreSQL 风格的 $1, $2 ...
 */
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * 判断是否为 INSERT 语句（需要追加 RETURNING id）
 */
function isInsert(sql) {
  return /^\s*INSERT\s+INTO/i.test(sql);
}

// ─── SQLite 兼容接口 ──────────────────────────────────────────────────────────

/**
 * db.run(sql, params, callback)
 * 对应 SQLite db.run：执行写操作（INSERT / UPDATE / DELETE）
 * callback(err) — this 上下文包含 lastID 和 changes
 */
function run(sql, params, callback) {
  // 支持省略 params 的调用方式：db.run(sql, callback)
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  params = params || [];

  let pgSql = convertPlaceholders(sql);

  // INSERT 追加 RETURNING id 以获取自增主键
  if (isInsert(pgSql) && !/RETURNING/i.test(pgSql)) {
    pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
  }

  pool.query(pgSql, params)
    .then((result) => {
      const ctx = {
        lastID: result.rows?.[0]?.id ?? null,
        changes: result.rowCount ?? 0,
      };
      if (callback) callback.call(ctx, null);
    })
    .catch((err) => {
      console.error('[db.run] SQL 执行错误:', err.message, '\nSQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * db.get(sql, params, callback)
 * 对应 SQLite db.get：查询单行
 * callback(err, row)
 */
function get(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  params = params || [];

  const pgSql = convertPlaceholders(sql);

  pool.query(pgSql, params)
    .then((result) => {
      const row = result.rows?.[0] ?? undefined;
      if (callback) callback(null, row);
    })
    .catch((err) => {
      console.error('[db.get] SQL 执行错误:', err.message, '\nSQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * db.all(sql, params, callback)
 * 对应 SQLite db.all：查询多行
 * callback(err, rows)
 */
function all(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  params = params || [];

  const pgSql = convertPlaceholders(sql);

  pool.query(pgSql, params)
    .then((result) => {
      if (callback) callback(null, result.rows || []);
    })
    .catch((err) => {
      console.error('[db.all] SQL 执行错误:', err.message, '\nSQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * db.serialize(fn)
 * SQLite 中用于强制串行执行，PG 不需要，提供空实现保持兼容
 */
function serialize(fn) {
  if (typeof fn === 'function') fn();
}

// ─── 暴露原始连接池（供 health check 使用）──────────────────────────────────

/**
 * 健康检查：测试 Neon 是否可达
 * @returns {Promise<{ok: boolean, latencyMs: number, error?: string}>}
 */
async function healthCheck() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// ─── 导出 ─────────────────────────────────────────────────────────────────────
module.exports = {
  run,
  get,
  all,
  serialize,   // 空实现，保持兼容
  pool,        // 暴露给 init-db 直接使用
  healthCheck, // 暴露给 /health 端点
};
