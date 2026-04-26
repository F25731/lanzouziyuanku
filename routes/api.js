const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../config/db');
const { requireLogin, isMembershipActive } = require('../middleware/auth');
const { registerUser, verifyLogin, getUserById } = require('../services/userService');
const { redeemCard } = require('../services/cardService');
const { getLanzouAccount } = require('../services/lanzouSyncService');
const { dedupeSearchResults } = require('../services/dedupeService');
const { LanZouYClient } = require('@netdrive-sdk/ilanzou');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const captchaRedis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined
});

function publicUserShape(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    membershipExpireAt: user.membership_expire_at,
    membershipActive: isMembershipActive(user)
  };
}

function makeCaptchaText() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeCaptchaSvg(text) {
  const chars = String(text).split('');
  const colors = ['#1d4ed8', '#047857', '#b45309', '#9333ea'];
  const pieces = chars.map((ch, i) => {
    const x = 18 + i * 22;
    const y = 28 + (i % 2 === 0 ? 0 : 4);
    const rotate = (i % 2 === 0 ? -12 : 10);
    return `<text x="${x}" y="${y}" font-size="24" fill="${colors[i % colors.length]}" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="42" viewBox="0 0 120 42"><rect width="120" height="42" rx="8" fill="#f8fafc"/><path d="M6 32 C20 8, 40 8, 56 30 S92 36, 114 12" stroke="#cbd5e1" fill="none"/>${pieces}</svg>`;
}

router.get('/health', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT 1 AS ok');
  res.json({ ok: row.ok === 1 });
}));

router.get('/site-config', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (?, ?, ?)",
    ['site_buy_url', 'site_video_url', 'site_contact_text']
  );
  const map = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value || '' ]));
  res.json({
    buyUrl: map.site_buy_url || '',
    videoUrl: map.site_video_url || '',
    contactText: map.site_contact_text || '客服微信 / QQ / Telegram'
  });
}));

router.get('/captcha', asyncHandler(async (req, res) => {
  const text = makeCaptchaText();
  const token = uuidv4();
  await captchaRedis.setex(`lanzou:captcha:${token}`, 300, text.toUpperCase());
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.json({ svg: makeCaptchaSvg(text), token });
}));

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const user = await getUserById(req.session.user.id);
  res.json({ user: publicUserShape(user) });
}));

router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, captcha } = req.body || {};
  if (!username || !password || !captcha) {
    return res.status(400).json({ message: '用户名、密码、验证码必填' });
  }
  if (String(username).length < 3 || String(password).length < 6) {
    return res.status(400).json({ message: '用户名至少 3 位，密码至少 6 位' });
  }
  const captchaToken = String((req.body || {}).captchaToken || '').trim();
  const got = String(captcha || '').trim().toUpperCase();
  const redisKey = `lanzou:captcha:${captchaToken}`;
  const expected = String(await captchaRedis.get(redisKey) || '').toUpperCase();
  if (captchaToken) {
    await captchaRedis.del(redisKey);
  }
  if (!expected || expected != got) {
    return res.status(400).json({ message: '验证码错误或已过期' });
  }

  const user = await registerUser(String(username).trim(), String(password));
  req.session.user = { id: user.id, role: user.role };
  res.json({
    message: '注册成功，已自动赠送 1 天会员',
    user: publicUserShape(user)
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await verifyLogin(
    String(username || '').trim(),
    String(password || ''),
    {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    }
  );
  req.session.user = { id: user.id, role: user.role };
  res.json({
    message: '登录成功',
    user: publicUserShape(user)
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  req.session.destroy(() => {
    res.json({ message: '已退出登录' });
  });
}));

router.post('/redeem-card', requireLogin, asyncHandler(async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ message: '请输入卡密' });
  }
  const result = await redeemCard(req.session.user.id, String(code));
  res.json({
    message: '兑换成功',
    user: publicUserShape(result.user)
  });
}));

function extractNovelAuthor(name) {
  const m = String(name || "").match(/(?:作者|著)\s*[:：]?\s*([A-Za-z0-9_\-一-龥·・]+)/i);
  return m ? String(m[1]).trim().toLowerCase() : "";
}

function isNovelLike(name) {
  return /(?:作者|著)\s*[:：]?|[《》]|(完结|全集|全本|精校版?|校对版|番外|典藏版|修订版|未删减版)/i.test(String(name || ""));
}

function normalizeNovelTitle(name) {
  let s = String(name || "");
  s = s.replace(/\.[A-Za-z0-9]{1,8}$/i, "");
  s = s.replace(/[《》]/g, " ");
  s = s.replace(/[【\[\(（][^】\]\)）]{0,20}[】\]\)）]/g, " ");
  s = s.replace(/(?:作者|著)\s*[:：]?\s*[A-Za-z0-9_\-一-龥·・]+/gi, " ");
  s = s.replace(/(完结|全集|全本|精校版?|校对版|番外|插图版|文字版|典藏版|未删减版|修订版|精排版|epub|txt|pdf|mobi|azw3)/gi, " ");
  s = s.replace(/[·•・:_：\-—\s]+/g, "");
  return s.toLowerCase();
}

function buildNovelDedupeKey(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (!isNovelLike(name)) return raw;
  const title = normalizeNovelTitle(name);
  const author = extractNovelAuthor(name);
  return title ? (title + "|" + author) : raw;
}

function getFormatScore(name, fileType) {
  const ext = (String(name || "").match(/\.([A-Za-z0-9]{1,8})$/) || [null, ""])[1].toLowerCase();
  const ft = String(fileType || "").trim().toLowerCase();
  const fmt = ft || ext;
  if (fmt === "txt") return 3;
  if (fmt === "epub") return 2;
  if (fmt === "azw3" || fmt === "mobi") return 1;
  if (fmt === "pdf") return 0;
  return 0;
}

function getNovelPriorityScore(name, fileType) {
  const text = String(name || "");
  let score = 0;
  if (/精校版?|校对版/i.test(text)) score += 50;
  if (/全本|全集|完结/i.test(text)) score += 40;
  if (/典藏版|修订版|未删减版/i.test(text)) score += 30;
  if (/插图版|文字版/i.test(text)) score += 10;
  if (/番外/i.test(text)) score -= 20;
  score += getFormatScore(name, fileType);
  return score;
}

router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  if (!q) {
    return res.json({ items: [], total: 0, rawTotal: 0, page, pageSize, membershipActive: false, deduped: true });
  }

  const searchLike = `%${q}%`;
  const [[countRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM resources WHERE is_deleted = 0 AND status = 'visible' AND file_name LIKE ?",
    [searchLike]
  );

  const rawTotal = Number(countRow.total || 0);
  const fetchLimit = Math.min(Math.max(rawTotal, pageSize), 800);
  const [rows] = await pool.query(
    `SELECT id, file_name, file_size, file_type, file_time,
            IFNULL(share_url, '') AS share_url
      FROM resources
      WHERE is_deleted = 0 AND status = 'visible' AND file_name LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET 0`,
    [searchLike, fetchLimit]
  );

  const deduped = dedupeSearchResults(rows);
  const dedupedItems = deduped.items
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(offset, offset + pageSize)
    .map((item) => item);

  res.json({
    items: dedupedItems,
    total: deduped.total,
    rawTotal,
    page,
    pageSize,
    membershipActive: true,
    deduped: true,
    truncated: rawTotal > fetchLimit
  });
}));

router.get('/download/:id', asyncHandler(async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({ message: '请先登录' });
  }

  const user = await getUserById(userId);
  if (!user) {
    return res.status(401).json({ message: '请先登录' });
  }

  const isUnlimited = user.role === 'admin' || isMembershipActive(user);
  const dailyLimit = 3;
  let usedToday = null;
  let remainingToday = null;

  if (!isUnlimited) {
    const [[countRow]] = await pool.query(
      'SELECT COUNT(*) AS total FROM download_logs WHERE user_id = ? AND success = 1 AND created_at >= CURDATE()',
      [userId]
    );
    usedToday = Number(countRow.total || 0);
    remainingToday = Math.max(dailyLimit - usedToday, 0);
    if (usedToday >= dailyLimit) {
      return res.status(403).json({
        message: '普通用户每天最多查看 3 次下载链接，请明天再试或开通会员',
        daily_limit: dailyLimit,
        used_today: usedToday,
        remaining_today: 0
      });
    }
  }

  const [rows] = await pool.query('SELECT * FROM resources WHERE id = ? LIMIT 1', [req.params.id]);
  const item = rows[0];
  if (!item) {
    return res.status(404).json({ message: '资源不存在' });
  }

  let shareUrl = String(item.share_url || '').trim();

  if (!shareUrl && item.file_id && item.account_id) {
    try {
      const account = await getLanzouAccount(item.account_id);
      if (account && account.provider === 'ilanzou' && account.login_type === 'account' && account.account && account.password_text) {
        const client = new LanZouYClient({
          username: account.account,
          password: account.password_text
        });

        client.config.apiUrl = 'https://apis.ilanzou.com';
        client.client = client.client.extend({ prefixUrl: client.config.apiUrl });

        const loginRes = await client.login();
        if (loginRes && loginRes.code === 200) {
          try {
            const shareRes = await client.shareUrl(String(item.file_id));
            if (shareRes && shareRes.code === 200 && shareRes.shareUrl) {
              shareUrl = String(shareRes.shareUrl).trim();
            }
          } catch (_) {}

          if (!shareUrl) {
            try {
              shareUrl = String(await client.downloadFile(String(item.file_id), true) || '').trim();
            } catch (_) {}
          }

          if (shareUrl) {
            await pool.query('UPDATE resources SET share_url = ? WHERE id = ?', [shareUrl, item.id]);
          }
        }
      }
    } catch (_) {}
  }

  if (!isUnlimited) {
    const success = shareUrl ? 1 : 0;
    await pool.query(
      'INSERT INTO download_logs (user_id, resource_id, ip, success) VALUES (?, ?, ?, ?)',
      [userId, item.id, String(req.ip || ''), success]
    );
    if (success) {
      usedToday += 1;
      remainingToday = Math.max(dailyLimit - usedToday, 0);
    }
  }

  res.json({
    id: item.id,
    file_name: item.file_name,
    share_url: shareUrl,
    membership_active: isUnlimited,
    daily_limit: isUnlimited ? null : dailyLimit,
    used_today: isUnlimited ? null : usedToday,
    remaining_today: isUnlimited ? null : remainingToday
  });
}));

module.exports = router;
