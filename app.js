const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

// 路由
const menuRoutes = require('./routes/menu');
const cardRoutes = require('./routes/card');
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const adRoutes = require('./routes/ad');
const friendRoutes = require('./routes/friend');
const userRoutes = require('./routes/user');

const app = express();

/**
 * ===============================
 * HF Spaces 端口（必须 7860）
 * ===============================
 */
const PORT = process.env.PORT || 3000;

/**
 * ===============================
 * 基础中间件
 * ===============================
 */
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

/**
 * ===============================
 * 静态资源
 * ===============================
 */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'web/dist')));

/**
 * ===============================
 * SPA 路由兜底（保持你原逻辑）
 * ===============================
 */
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

/**
 * ===============================
 * API 路由
 * ===============================
 */
app.use('/api/menus', menuRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', authRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);

/**
 * ===============================
 * 健康检查（HF 推荐）
 * ===============================
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
  });
});

/**
 * ===============================
 * 全局错误兜底
 * （修复“点了没反应”）
 * ===============================
 */
app.use((err, req, res, next) => {
  console.error('🔥 Express Error');
  console.error(err);

  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: err.message,
  });
});

/**
 * ===============================
 * 启动服务
 * ===============================
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 SQLite DB path: /tmp/nav.db`);
});
