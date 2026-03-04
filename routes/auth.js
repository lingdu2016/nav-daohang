'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();

// 严格获取环境变量
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  // 检查服务端配置
  if (!JWT_SECRET) {
    console.error('[auth] 严重错误: 环境变量 JWT_SECRET 未设置');
    return res.status(500).json({ error: '服务器配置错误，请联系管理员' });
  }

  try {
    // 使用 Promise 包装 db.get 确保同步执行
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = $1', [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!user) {
      console.warn(`[auth] 登录失败: 用户 [${username}] 不存在`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (e) {
      console.error('[auth] Bcrypt 校验出错:', e.message);
      isMatch = (password === user.password); // 兜底明文比对
    }

    if (!isMatch) {
      console.warn(`[auth] 登录失败: 用户 [${username}] 密码错误`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 签发 Token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[auth] ✅ 登录成功: ${username}`);
    
    return res.json({
      token,
      user: { id: user.id, username: user.username },
    });

  } catch (err) {
    console.error('[auth] 接口异常:', err.message);
    return res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
