'use strict';

/**
 * db.js — Neon (PostgreSQL) 增强适配层
 * 完美模拟 SQLite 接口，同时支持异步日志调试
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[Neon] 数据库连接池错误:', err.message);
});

// 工具函数：转换占位符
function convertPlaceholders(sql) {
  // 如果已经包含 $1，说明是原生 PG 语法，不进行转换
  if (sql.includes('$1')) return sql;
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// 工具函数：判断 INSERT
function isInsert(sql) {
  return /^\s*INSERT\s+INTO/i.test(sql);
}

// 兼容接口：db.run
function run(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  params = params || [];

  let pgSql = convertPlaceholders(sql);
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
      console.error('[db.run] 错误:', err.message, '\nSQL:', pgSql);
      if (callback) callback(err);
    });
}

// 兼容接口：db.get (重点修复)
function get(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  params = params || [];

  const pgSql = convertPlaceholders(sql);

  pool.query(pgSql, params)
    .then((result) => {
      const row = result.rows?.[0] || null;
      // 调试日志：帮助确认是否查到了用户
      console.log(`[db.get] SQL: ${pgSql.substring(0, 50)}... | 结果: ${row ? '找到记录' : '未找到'}`);
      if (callback) callback(null, row);
    })
    .catch((err) => {
      console.error('[db.get] 错误:', err.message);
      if (callback) callback(err);
    });
}

// 兼容接口：db.all
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
      console.error('[db.all] 错误:', err.message);
      if (callback) callback(err);
    });
}

function serialize(fn) {
  if (typeof fn === 'function') fn();
}

async function healthCheck() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

module.exports = {
  run,
  get,
  all,
  serialize,
  pool,
  healthCheck,
};
