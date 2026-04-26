 const express = require("express");
 const asyncHandler = require("../utils/asyncHandler");
 const { requireAdmin } = require("../middleware/auth");
 const { pool } = require("../config/db");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
 const { createCards, listCards, disableCard, getCardStats, deleteCard, cleanupCards } = require("../services/cardService");
 const { verifyLogin, extendMembership } = require("../services/userService");
 const {
   listLanzouAccounts,
   saveLanzouAccount,
   syncAccount,
   checkAccount,
   listSyncLogs
 } = require("../services/lanzouSyncService");
 
 const router = express.Router();

function readLocalVersion() {
  const versionPath = path.join(__dirname, "..", "version.json");
  if (!fs.existsSync(versionPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(versionPath, "utf8"));
  } catch (_) {
    return {};
  }
}

function compareVersion(a, b) {
  const pa = String(a || "0").split(".").map(x => Number(x) || 0);
  const pb = String(b || "0").split(".").map(x => Number(x) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
 
 router.post("/login", asyncHandler(async (req, res) => {
   const { username, password } = req.body || {};
 
   const user = await verifyLogin(
     String(username || "").trim(),
     String(password || ""),
     {
       ip: req.ip,
       userAgent: req.headers["user-agent"] || ""
     }
   );
 
   if (user.role !== "admin") {
     return res.status(403).json({ message: "无后台权限" });
   }
 
   req.session.admin = {
     id: user.id,
     role: user.role
   };
 
   res.json({ message: "后台登录成功" });
 }));
 
 router.use(requireAdmin);
 
 router.get("/stats", asyncHandler(async (req, res) => {
   const [[users]] = await pool.query("SELECT COUNT(*) AS total FROM users");
   const [[resources]] = await pool.query("SELECT COUNT(*) AS total FROM resources");
   const [[cards]] = await pool.query("SELECT COUNT(*) AS total FROM card_codes");
 
   res.json({
     users: users.total,
     resources: resources.total,
     cards: cards.total
   });
 }));
 
router.get("/version", asyncHandler(async (req, res) => {
  const versionPath = path.join(__dirname, "..", "version.json");
  if (!fs.existsSync(versionPath)) {
    return res.status(404).json({ message: "版本文件不存在" });
  }
  const raw = fs.readFileSync(versionPath, "utf8");
  res.json(JSON.parse(raw));
}));

router.get("/check-update", asyncHandler(async (req, res) => {
  const current = readLocalVersion();
  const updateUrl = String(process.env.UPDATE_MANIFEST_URL || "").trim();

  if (!updateUrl) {
    return res.json({
      configured: false,
      current,
      hasUpdate: false,
      message: "未配置远程更新源"
    });
  }

  let remote = {};
  try {
    const resp = await axios.get(updateUrl, {
      timeout: 8000,
      headers: { "User-Agent": "lanzou-site-update-check" }
    });
    remote = resp.data || {};
  } catch (e) {
    return res.status(502).json({
      configured: true,
      current,
      hasUpdate: false,
      message: "远程更新源访问失败",
      detail: e && e.message ? e.message : String(e)
    });
  }

  const remoteVersion = String(remote.version || "").trim();
  const currentVersion = String(current.version || "0.0.0").trim();
  const hasUpdate = remoteVersion ? compareVersion(remoteVersion, currentVersion) > 0 : false;

  res.json({
    configured: true,
    current,
    remote,
    hasUpdate,
    update_url: updateUrl,
    message: hasUpdate ? "发现新版本" : "当前已是最新版本"
  });
}));

router.get("/site-settings", asyncHandler(async (req, res) => {   const [rows] = await pool.query(     "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (?, ?, ?)",     ["site_buy_url", "site_video_url", "site_contact_text"]   );   const map = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value || ""]));   res.json({     buyUrl: map.site_buy_url || "",     videoUrl: map.site_video_url || "",     contactText: map.site_contact_text || "客服微信 / QQ / Telegram"   }); }));  router.post("/site-settings", asyncHandler(async (req, res) => {   const payload = req.body || {};   const buyUrl = String(payload.buyUrl || "").trim();   const videoUrl = String(payload.videoUrl || "").trim();   const contactText = String(payload.contactText || "").trim();    await pool.query(     `INSERT INTO site_settings (setting_key, setting_value)      VALUES (?, ?), (?, ?), (?, ?)      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,     ["site_buy_url", buyUrl, "site_video_url", videoUrl, "site_contact_text", contactText]   );    res.json({ message: "站点配置保存成功" }); }));  router.get("/cards/stats", asyncHandler(async (req, res) => {
  const stats = await getCardStats();
  res.json(stats);
}));

router.get("/cards", asyncHandler(async (req, res) => {
  const cards = await listCards(200);
  res.json({ items: cards });
}));
 
 router.post("/cards", asyncHandler(async (req, res) => {
   const { cardType, count } = req.body || {};
   const codes = await createCards(cardType, count, "admin");
   res.json({ message: "制卡成功", codes });
 }));
 
 router.post("/cards/:id/disable", asyncHandler(async (req, res) => {
  const card = await disableCard(Number(req.params.id));
  res.json({ message: "停卡成功", item: card });
}));

router.delete("/cards/:id", asyncHandler(async (req, res) => {
  const card = await deleteCard(Number(req.params.id));
  res.json({ message: "删除成功", item: card });
}));

router.post("/cards/cleanup", asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const result = await cleanupCards(String(status || "").trim());
  res.json({ message: "清理成功，已删除 " + result.deleted + " 张" + result.status + "卡密", ...result });
}));
 
 router.get("/lanzou-accounts", asyncHandler(async (req, res) => {
   const rows = await listLanzouAccounts();
   res.json({
     items: rows.map((row) => ({
       ...row,
       password_text: row.password_text ? "******" : "",
       cookie_text: row.cookie_text ? "******" : ""
     }))
   });
 }));
 
 router.post("/lanzou-accounts", asyncHandler(async (req, res) => {
   const row = await saveLanzouAccount(req.body || {});
   res.json({ message: "蓝奏账号保存成功", item: row });
 }));
 
 router.post("/lanzou-accounts/:id/sync", asyncHandler(async (req, res) => {
   const result = await syncAccount(Number(req.params.id));
   res.json({ message: "同步完成", ...result });
 }));
 
 router.post("/lanzou-accounts/:id/check", asyncHandler(async (req, res) => {
   const result = await checkAccount(Number(req.params.id));
   res.json({ message: "检测完成", ...result });
 }));
 
 router.delete("/lanzou-accounts/:id", asyncHandler(async (req, res) => {
   const accountId = Number(req.params.id);
 
   if (!Number.isInteger(accountId) || accountId <= 0) {
     return res.status(400).json({ message: "账号ID不合法" });
   }
 
   const [[row]] = await pool.query("SELECT id, title FROM lanzou_accounts WHERE id = ? LIMIT 1", [accountId]);
   if (!row) {
     return res.status(404).json({ message: "蓝奏账号不存在" });
   }
 
   await pool.query("DELETE FROM resources WHERE account_id = ?", [accountId]);
   await pool.query("DELETE FROM sync_logs WHERE account_id = ?", [accountId]);
   await pool.query("DELETE FROM lanzou_accounts WHERE id = ?", [accountId]);
 
   res.json({ message: "蓝奏账号已删除" });
 }));
 
 router.delete("/sync-logs", asyncHandler(async (req, res) => {
   await pool.query("DELETE FROM sync_logs");
   res.json({ message: "同步日志已清空" });
 }));
 
 router.get("/sync-logs", asyncHandler(async (req, res) => {
   const rows = await listSyncLogs(100);
   res.json({ items: rows });
 }));
 
 router.get("/users", asyncHandler(async (req, res) => {
   const [rows] = await pool.query(
     "SELECT id, username, role, status, membership_expire_at, free_membership_granted, created_at, updated_at FROM users ORDER BY id DESC LIMIT 200"
   );
   res.json({ items: rows });
 }));
 
 router.delete("/users/:id", asyncHandler(async (req, res) => {
   const userId = Number(req.params.id);
 
   if (!Number.isInteger(userId) || userId <= 0) {
     return res.status(400).json({ message: "用户ID不合法" });
   }
 
   const [[user]] = await pool.query("SELECT id, username, role FROM users WHERE id = ? LIMIT 1", [userId]);
   if (!user) {
     return res.status(404).json({ message: "用户不存在" });
   }
   if (user.role === "admin") {
     return res.status(400).json({ message: "管理员账号不允许删除" });
   }
 
   await pool.query("DELETE FROM users WHERE id = ?", [userId]);
   res.json({ message: "用户已删除" });
 }));
 
 router.post("/users/:id/toggle-status", asyncHandler(async (req, res) => {
   const userId = Number(req.params.id);
 
   if (!Number.isInteger(userId) || userId <= 0) {
     return res.status(400).json({ message: "用户ID不合法" });
   }
 
   const [[user]] = await pool.query("SELECT id, username, role, status FROM users WHERE id = ? LIMIT 1", [userId]);
   if (!user) {
     return res.status(404).json({ message: "用户不存在" });
   }
   if (user.role === "admin") {
     return res.status(400).json({ message: "管理员账号不允许停用或恢复" });
   }
 
   const nextStatus = user.status === 1 ? 0 : 1;
   await pool.query("UPDATE users SET status = ? WHERE id = ?", [nextStatus, userId]);
 
   res.json({
     message: nextStatus === 1 ? "用户已恢复" : "用户已停用",
     status: nextStatus
   });
 }));
 
 router.post("/users/:id/extend", asyncHandler(async (req, res) => {
   const userId = Number(req.params.id);
   const hours = Number((req.body || {}).hours);
 
   if (!Number.isInteger(userId) || userId <= 0) {
     return res.status(400).json({ message: "用户ID不合法" });
   }
   if (!Number.isFinite(hours) || hours <= 0) {
     return res.status(400).json({ message: "加时时长必须大于0" });
   }
 
   const [[user]] = await pool.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [userId]);
   if (!user) {
     return res.status(404).json({ message: "用户不存在" });
   }
   if (user.role === "admin") {
     return res.status(400).json({ message: "管理员账号不需要加时" });
   }
 
   const updated = await extendMembership(userId, hours);
   res.json({ message: "加时成功", item: updated });
 }));
 
 module.exports = router;
