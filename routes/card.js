'use strict';

const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const router = express.Router();

/**
 * 获取指定菜单的卡片
 */
router.get('/:menuId', (req, res) => {
  const { subMenuId } = req.query;
  let query, params;

  if (subMenuId) {
    query = 'SELECT * FROM cards WHERE sub_menu_id = ? ORDER BY "order"';
    params = [subMenuId];
  } else {
    query = 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
    params = [req.params.menuId];
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows.forEach(card => {
      if (!card.custom_logo_path) {
        card.display_logo = card.logo_url || card.url.replace(/\/+$/, '') + '/favicon.ico';
      } else {
        card.display_logo = '/uploads/' + card.custom_logo_path;
      }
    });

    res.json(rows);
  });
});

/**
 * 新增卡片
 */
router.post('/', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, order } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'title 和 url 必填' });
  }

  // 情况 1：属于子菜单
  if (sub_menu_id) {
    db.get(
      'SELECT parent_id FROM sub_menus WHERE id = ?',
      [sub_menu_id],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(400).json({ error: '子菜单不存在' });

        db.run(
          `INSERT INTO cards
           (menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, "order")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.parent_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, order || 0],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
          }
        );
      }
    );
  }
  // 情况 2：属于一级菜单
  else if (menu_id) {
    db.run(
      `INSERT INTO cards
       (menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, "order")
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      [menu_id, title, url, logo_url, custom_logo_path, description, order || 0],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  } else {
    return res.status(400).json({ error: '必须指定 menu_id 或 sub_menu_id' });
  }
});

/**
 * 修改卡片
 */
router.put('/:id', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, order } = req.body;

  if (sub_menu_id) {
    db.get(
      'SELECT parent_id FROM sub_menus WHERE id = ?',
      [sub_menu_id],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(400).json({ error: '子菜单不存在' });

        db.run(
          `UPDATE cards SET
            menu_id=?,
            sub_menu_id=?,
            title=?,
            url=?,
            logo_url=?,
            custom_logo_path=?,
            description=?,
            "order"=?
           WHERE id=?`,
          [row.parent_id, sub_menu_id, title, url, logo_url, custom_logo_path, description, order || 0, req.params.id],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ changed: this.changes });
          }
        );
      }
    );
  } else {
    db.run(
      `UPDATE cards SET
        menu_id=?,
        sub_menu_id=NULL,
        title=?,
        url=?,
        logo_url=?,
        custom_logo_path=?,
        description=?,
        "order"=?
       WHERE id=?`,
      [menu_id, title, url, logo_url, custom_logo_path, description, order || 0, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changed: this.changes });
      }
    );
  }
});

/**
 * 删除卡片
 */
router.delete('/:id', auth, (req, res) => {
  db.run('DELETE FROM cards WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
