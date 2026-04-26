const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../config/db');
const { createLocalAdminAuth, localAdminCors } = require('../middleware/localAdminAuth');
const {
  checkAccount,
  listLanzouAccounts,
  listSyncLogs,
  saveLanzouAccount,
  syncAccount
} = require('../services/lanzouSyncService');

const router = express.Router();

router.use(localAdminCors);
router.use(createLocalAdminAuth());

function sanitizeSource(row) {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider || 'ilanzou',
    root_folder_id: row.root_folder_id || 0,
    login_type: row.login_type,
    account: row.account || '',
    has_password: !!row.password_text,
    has_cookie: !!row.cookie_text,
    status: row.status,
    last_check_at: row.last_check_at,
    last_sync_at: row.last_sync_at,
    remark: row.remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

router.get('/ping', asyncHandler(async (req, res) => {
  res.json({ ok: true, service: 'personal-resource-library' });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const [[sources]] = await pool.query('SELECT COUNT(*) AS total FROM lanzou_accounts');
  const [[resources]] = await pool.query("SELECT COUNT(*) AS total FROM resources WHERE is_deleted = 0 AND status <> 'deleted'");
  const [[hidden]] = await pool.query("SELECT COUNT(*) AS total FROM resources WHERE is_deleted = 0 AND status = 'hidden'");
  const [[logs]] = await pool.query('SELECT COUNT(*) AS total FROM sync_logs');

  res.json({
    sources: Number(sources.total || 0),
    resources: Number(resources.total || 0),
    hidden: Number(hidden.total || 0),
    syncLogs: Number(logs.total || 0)
  });
}));

router.get('/sources', asyncHandler(async (req, res) => {
  const rows = await listLanzouAccounts();
  res.json({ items: rows.map(sanitizeSource) });
}));

router.post('/sources', asyncHandler(async (req, res) => {
  const item = await saveLanzouAccount(req.body || {});
  res.json({ message: 'Source saved', item: sanitizeSource(item) });
}));

router.post('/sources/:id/check', asyncHandler(async (req, res) => {
  const result = await checkAccount(Number(req.params.id));
  res.json({ message: 'Check finished', ...result });
}));

router.post('/sources/:id/sync', asyncHandler(async (req, res) => {
  const result = await syncAccount(Number(req.params.id));
  res.json({ message: 'Sync finished', ...result });
}));

router.delete('/sources/:id', asyncHandler(async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ message: 'Invalid source id' });
  }

  await pool.query('DELETE FROM resources WHERE account_id = ?', [sourceId]);
  await pool.query('DELETE FROM sync_logs WHERE account_id = ?', [sourceId]);
  await pool.query('DELETE FROM lanzou_accounts WHERE id = ?', [sourceId]);
  res.json({ message: 'Source deleted' });
}));

router.get('/sync-logs', asyncHandler(async (req, res) => {
  const rows = await listSyncLogs(Number(req.query.limit || 100));
  res.json({ items: rows });
}));

router.delete('/sync-logs', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM sync_logs');
  res.json({ message: 'Sync logs cleared' });
}));

router.get('/resources', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.max(1, Math.min(Number(req.query.pageSize || 50), 100));
  const offset = (page - 1) * pageSize;

  const where = ['is_deleted = 0'];
  const params = [];

  if (q) {
    where.push('file_name LIKE ?');
    params.push(`%${q}%`);
  }

  if (['visible', 'hidden'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  } else {
    where.push("status <> 'deleted'");
  }

  const whereSql = where.join(' AND ');
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM resources WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id, account_id, parent_folder_id, file_id, file_name, file_size, file_type, file_time,
            share_url, category, tags, note, status, created_at, updated_at
       FROM resources
      WHERE ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({
    items: rows,
    total: Number(countRow.total || 0),
    page,
    pageSize
  });
}));

router.patch('/resources/:id', asyncHandler(async (req, res) => {
  const resourceId = Number(req.params.id);
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    return res.status(400).json({ message: 'Invalid resource id' });
  }

  const payload = req.body || {};
  const allowed = {
    file_name: 'file_name',
    share_url: 'share_url',
    category: 'category',
    tags: 'tags',
    note: 'note',
    status: 'status'
  };
  const updates = [];
  const values = [];

  for (const [inputKey, column] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(payload, inputKey)) continue;
    const value = String(payload[inputKey] ?? '').trim();
    if (column === 'status' && !['visible', 'hidden', 'deleted'].includes(value)) {
      return res.status(400).json({ message: 'Invalid resource status' });
    }
    updates.push(`${column} = ?`);
    values.push(value);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No resource fields to update' });
  }

  values.push(resourceId);
  await pool.query(`UPDATE resources SET ${updates.join(', ')} WHERE id = ?`, values);
  const [rows] = await pool.query('SELECT * FROM resources WHERE id = ? LIMIT 1', [resourceId]);
  res.json({ message: 'Resource updated', item: rows[0] || null });
}));

router.delete('/resources/:id', asyncHandler(async (req, res) => {
  const resourceId = Number(req.params.id);
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    return res.status(400).json({ message: 'Invalid resource id' });
  }

  await pool.query("UPDATE resources SET status = 'deleted', is_deleted = 1 WHERE id = ?", [resourceId]);
  res.json({ message: 'Resource deleted' });
}));

router.get('/tokens', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, scope, enabled, expires_at, last_used_at, created_at FROM api_tokens ORDER BY id DESC LIMIT 200'
  );
  res.json({ items: rows });
}));

router.post('/tokens', asyncHandler(async (req, res) => {
  const name = String((req.body || {}).name || 'API Token').trim();
  const scope = String((req.body || {}).scope || 'read').trim();
  const expiresAt = String((req.body || {}).expires_at || '').trim() || null;
  const token = crypto.randomBytes(24).toString('base64url');

  const [result] = await pool.query(
    'INSERT INTO api_tokens (name, token_hash, scope, expires_at, enabled) VALUES (?, ?, ?, ?, 1)',
    [name, hashToken(token), scope, expiresAt]
  );

  res.json({
    message: 'Token created',
    token,
    item: {
      id: result.insertId,
      name,
      scope,
      enabled: 1,
      expires_at: expiresAt
    }
  });
}));

router.patch('/tokens/:id', asyncHandler(async (req, res) => {
  const tokenId = Number(req.params.id);
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return res.status(400).json({ message: 'Invalid token id' });
  }

  const payload = req.body || {};
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    updates.push('name = ?');
    values.push(String(payload.name || '').trim());
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'scope')) {
    updates.push('scope = ?');
    values.push(String(payload.scope || 'read').trim());
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'enabled')) {
    updates.push('enabled = ?');
    values.push(payload.enabled ? 1 : 0);
  }

  if (!updates.length) return res.status(400).json({ message: 'No token fields to update' });

  values.push(tokenId);
  await pool.query(`UPDATE api_tokens SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ message: 'Token updated' });
}));

router.delete('/tokens/:id', asyncHandler(async (req, res) => {
  const tokenId = Number(req.params.id);
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return res.status(400).json({ message: 'Invalid token id' });
  }

  await pool.query('DELETE FROM api_tokens WHERE id = ?', [tokenId]);
  res.json({ message: 'Token deleted' });
}));

module.exports = router;
