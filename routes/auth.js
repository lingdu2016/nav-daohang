'use strict';

const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip;
}

function getShanghaiTime() {
  const date = new Date();
  const shanghaiTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const y = shanghaiTime.getFullYear();
  const mo = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const d = String(shanghaiTime.getDate()).padStart(2, '0');
  const h = String(shanghaiTime.getHours()).padStart(2, '0');
  const mi = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const s = String(shanghaiTime.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  db.get('SELECT * FROM users WHERE username=?', [username], (err, user) => {
    if (err) {
      console.error('[auth] 查询用户失败:', err.message);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error('[auth] bcrypt 比对失败:', err.message);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (result) {
        const lastLoginTime = user.last_login_time;
        const lastLoginIp = user.last_login_ip;
        const now = getShanghaiTime();
        const ip = getClientIp(req);
        db.run('UPDATE users SET last_login_time=?, last_login_ip=? WHERE id=?', [now, ip, user.id]);
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, lastLoginTime, lastLoginIp });
      } else {
        res.status(401).json({ error: '用户名或密码错误' });
      }
    });
  });
});

module.exports = router;
