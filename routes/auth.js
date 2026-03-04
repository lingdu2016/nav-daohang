'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();
// 确保环境变量优先级最高，如果没有则使用默认（生产环境务必在 Render 配置 JWT_SECRET）
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';

/**
 * POST /api/login
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  try {
    console.log(`[auth] 收到登录请求: ${username}`);

    // 1. 将回调式查询包装为 Promise，确保后续 await 有效
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = $1', [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!user) {
      console.warn(`[auth] 登录失败: 用户 ${username} 不存在`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 2. 严谨的密码校验
    let isMatch = false;
    try {
      // 这里的 await 会阻塞进程，直到 bcrypt 计算出结果
      isMatch = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      console.error('[auth] Bcrypt 校验异常:', bcryptErr.message);
      // 仅用于极特殊情况下的明文兜底
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      console.warn(`[auth] 登录失败: 密码与用户 ${username} 不匹配`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 3. 生成 JWT Token
    // 注意：如果 JWT_SECRET 为空，这里会直接抛出异常进入 catch
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
    console.error('[auth] 🔥 登录接口内部崩溃:', err.message);
    return res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
