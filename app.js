'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

// 路由
const menuRoutes  = require('./routes/menu');
const cardRoutes  = require('./routes/card');
const uploadRoutes = require('./routes/upload');
const authRoutes  = require('./routes/auth');
const adRoutes    = require('./routes/ad');
const friendRoutes = require('./routes/friend');
const userRoutes  = require('./routes/user');

// Neon 数据库（用于健康检查）
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── 中间件 ───────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ─── 静态资源 ─────────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'web/dist')));

// ─── SPA 路由兜底 ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api') &&
    !req.path.startsWith('/uploads') &&
    !fs.existsSync(path.join(__dirname, 'web/dist', req.path))
  ) {
    res.sendFile(path.join(__dirname, 'web/dist', 'index.html'));
  } else {
    next();
  }
});

// ─── API 路由 ─────────────────────────────────────────────────────────────────
app.use('/api/menus',   menuRoutes);
app.use('/api/cards',   cardRoutes);
app.use('/api/upload',  uploadRoutes);
app.use('/api',         authRoutes);
app.use('/api/ads',     adRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users',   userRoutes);

// ─── 健康检查（含 Neon 连接状态）────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const neon = await db.healthCheck();

  const status = neon.ok ? 'ok' : 'degraded';
  const httpCode = neon.ok ? 200 : 503;

  if (!neon.ok) {
    console.error(`[health] ⚠️  Neon 连接失败: ${neon.error}`);
  }

  res.status(httpCode).json({
    status,
    time: new Date().toISOString(),
    database: {
      provider: 'neon-postgresql',
      connected: neon.ok,
      latencyMs: neon.latencyMs,
      ...(neon.error && { error: neon.error }),
    },
  });
});

// ─── 全局错误处理 ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('🔥 Express 全局错误:', err.message);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: err.message,
  });
});

// ─── 启动服务 ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 服务启动，端口: ${PORT}`);
  console.log(`🗄️  数据库: Neon PostgreSQL`);

  // 启动时做一次连接确认
  const check = await db.healthCheck();
  if (check.ok) {
    console.log(`✅ Neon 连接正常 (${check.latencyMs}ms)`);
  } else {
    console.error(`❌ 启动后 Neon 连接失败: ${check.error}`);
    console.error('   请检查 DATABASE_URL 是否正确配置');
    // 不 exit，给 health check 机会暴露状态，由监控系统决策
  }
});
