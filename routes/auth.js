'use strict';

const express = require('express');
// 注意：这里改用 bcryptjs 以确保在 Docker/Render 环境下无需编译就能运行
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  try {
    // 包装成 Promise 确保 db.get 执行完
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = $1', [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!user) {
      console.log(`[auth] 用户未找到: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 校验密码
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log(`[auth] 密码不匹配: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 签发 Token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[auth] ✅ 登录成功: ${username}`);
    res.json({
      token,
      user: { id: user.id, username: user.username }
    });

  } catch (err) {
    console.error('[auth] 内部错误:', err.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
