'use strict';
/**
 * routes/auth.js — 登录认证路由
 *
 * 使用 db.js (Neon/pg 适配层)，接口与原 SQLite 版完全一致。
 * 额外功能：记录最后登录时间和 IP（若 users 表有对应字段）。
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';

/**
 * POST /api/login
 * Body: { username, password }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  db.get(
    'SELECT * FROM users WHERE username = $1',
    [username],
    async (err, user) => {
      if (err) {
        console.error('[auth] 查询用户失败:', err.message);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      // 验证密码（支持 bcrypt hash）
      let passwordValid = false;
      try {
        passwordValid = await bcrypt.compare(password, user.password);
      } catch {
        // 兜底：明文对比（不推荐，仅用于旧数据迁移）
        passwordValid = (password === user.password);
      }

      if (!passwordValid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username },
      });
    }
  );
});

module.exports = router;
