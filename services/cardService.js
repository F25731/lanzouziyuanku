const { randomUUID } = require('crypto');
const { pool } = require('../config/db');
const { extendMembership } = require('./userService');

const CARD_TYPES = {
  day: 24,
  week: 24 * 7,
  month: 24 * 30
};

function makeCardCode() {
  return randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
}

async function createCards(cardType, count = 1, createdBy = 'admin') {
  const durationHours = CARD_TYPES[cardType];
  if (!durationHours) {
    const err = new Error('卡密类型错误');
    err.status = 400;
    throw err;
  }

  const total = Math.max(1, Math.min(Number(count) || 1, 100));
  const codes = [];
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    for (let i = 0; i < total; i += 1) {
      const code = makeCardCode();
      await conn.query(
        'INSERT INTO card_codes (code, card_type, duration_hours, created_by, status) VALUES (?, ?, ?, ?, "unused")',
        [code, cardType, durationHours, createdBy]
      );
      codes.push(code);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return codes;
}

async function redeemCard(userId, code) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM card_codes WHERE code = ? LIMIT 1 FOR UPDATE',
      [code.trim().toUpperCase()]
    );
    const card = rows[0];
    if (!card) {
      const err = new Error('卡密不存在');
      err.status = 404;
      throw err;
    }
    if (card.status !== 'unused') {
      const err = new Error('卡密已使用或已失效');
      err.status = 400;
      throw err;
    }

    await conn.query(
      'UPDATE card_codes SET status = "used", used_by_user_id = ?, used_at = NOW() WHERE id = ?',
      [userId, card.id]
    );
    await conn.commit();

    const user = await extendMembership(userId, card.duration_hours);
    return { card, user };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function disableCard(cardId) {
  const id = Number(cardId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("卡密ID不合法");
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query("SELECT * FROM card_codes WHERE id = ? LIMIT 1", [id]);
  const card = rows[0];
  if (!card) {
    const err = new Error("卡密不存在");
    err.status = 404;
    throw err;
  }
  if (card.status === "used") {
    const err = new Error("已使用的卡密不能停用");
    err.status = 400;
    throw err;
  }
  if (card.status === "disabled") {
    return card;
  }

  await pool.query("UPDATE card_codes SET status = 'disabled' WHERE id = ?", [id]);
  const [rows2] = await pool.query("SELECT * FROM card_codes WHERE id = ? LIMIT 1", [id]);
  return rows2[0];
}

async function listCards(limit = 100) {
  const [rows] = await pool.query(
    'SELECT * FROM card_codes ORDER BY id DESC LIMIT ?',
    [Math.min(Number(limit) || 100, 500)]
  );
  return rows;
}

async function getCardStats() {
  const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes");
  const [[unusedRow]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes WHERE status = 'unused'");
  const [[usedRow]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes WHERE status = 'used'");
  const [[disabledRow]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes WHERE status = 'disabled'");
  return {
    total: totalRow.total || 0,
    unused: unusedRow.total || 0,
    used: usedRow.total || 0,
    disabled: disabledRow.total || 0
  };
}

async function deleteCard(cardId) {
  const id = Number(cardId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("卡密ID不合法");
    err.status = 400;
    throw err;
  }
  const [rows] = await pool.query("SELECT * FROM card_codes WHERE id = ? LIMIT 1", [id]);
  const card = rows[0];
  if (!card) {
    const err = new Error("卡密不存在");
    err.status = 404;
    throw err;
  }
  await pool.query("DELETE FROM card_codes WHERE id = ?", [id]);
  return card;
}

async function cleanupCards(status) {
  const allow = ["used", "disabled"];
  if (!allow.includes(String(status))) {
    const err = new Error("仅支持清理 used 或 disabled 状态的卡密");
    err.status = 400;
    throw err;
  }
  const [[countRow]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes WHERE status = ?", [status]);
  await pool.query("DELETE FROM card_codes WHERE status = ?", [status]);
  return { deleted: countRow.total || 0, status };
}

module.exports = {
  createCards,
  redeemCard,
  disableCard,
  listCards,
  getCardStats,
  deleteCard,
  cleanupCards,
  CARD_TYPES
};
