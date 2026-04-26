const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { pool } = require('../config/db');

const FREE_HOURS = Number(process.env.FREE_MEMBERSHIP_HOURS || 24);

async function getUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

async function getUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function registerUser(username, password) {
  const exists = await getUserByUsername(username);
  if (exists) {
    const err = new Error('用户名已存在');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const expireAt = dayjs().add(FREE_HOURS, 'hour').format('YYYY-MM-DD HH:mm:ss');

  const [result] = await pool.query(
    `INSERT INTO users (username, password_hash, role, membership_expire_at, free_membership_granted, status)
     VALUES (?, ?, 'user', ?, 1, 1)`,
    [username, passwordHash, expireAt]
  );

  return getUserById(result.insertId);
}

async function verifyLogin(username, password, meta = {}) {
  const user = await getUserByUsername(username);
  if (!user) {
    await createLoginLog(null, username, meta.ip, meta.userAgent, 0);
    const err = new Error("用户名或密码错误");
    err.status = 400;
    throw err;
  }
  if (user.status !== 1) {
    await createLoginLog(user.id, username, meta.ip, meta.userAgent, 0);
    const err = new Error("账号已停用，请联系管理员");
    err.status = 400;
    throw err;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  await createLoginLog(user.id, username, meta.ip, meta.userAgent, ok ? 1 : 0);
  if (!ok) {
    const err = new Error('用户名或密码错误');
    err.status = 400;
    throw err;
  }

  return user;
}

async function createLoginLog(userId, username, ip, userAgent, success) {
  await pool.query(
    'INSERT INTO login_logs (user_id, username, ip, user_agent, success) VALUES (?, ?, ?, ?, ?)',
    [userId, username, ip || '', String(userAgent || '').slice(0, 240), success ? 1 : 0]
  );
}

async function ensureAdminUser() {
  const username = process.env.ADMIN_INIT_USERNAME || 'admin';
  const password = process.env.ADMIN_INIT_PASSWORD || 'admin123456';

  const [rows] = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
  if (rows[0]) return rows[0];

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    `INSERT INTO users (username, password_hash, role, membership_expire_at, free_membership_granted, status)
     VALUES (?, ?, 'admin', NULL, 1, 1)`,
    [username, hash]
  );
  return getUserById(result.insertId);
}

async function extendMembership(userId, hours) {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('用户不存在');
    err.status = 404;
    throw err;
  }

  const now = dayjs();
  const base = user.membership_expire_at && dayjs(user.membership_expire_at).isAfter(now)
    ? dayjs(user.membership_expire_at)
    : now;

  const expireAt = base.add(Number(hours), 'hour').format('YYYY-MM-DD HH:mm:ss');
  await pool.query('UPDATE users SET membership_expire_at = ? WHERE id = ?', [expireAt, userId]);
  return getUserById(userId);
}

module.exports = {
  getUserByUsername,
  getUserById,
  registerUser,
  verifyLogin,
  ensureAdminUser,
  extendMembership
};
