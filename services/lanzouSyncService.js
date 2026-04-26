const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');

function toSyncHash(item) {
  return crypto.createHash('md5')
    .update([item.file_id || '', item.file_name || '', item.share_url || ''].join('|'))
    .digest('hex');
}

async function listLanzouAccounts() {
  const [rows] = await pool.query('SELECT * FROM lanzou_accounts ORDER BY id DESC');
  return rows;
}

async function getLanzouAccount(id) {
  const [rows] = await pool.query('SELECT * FROM lanzou_accounts WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function saveLanzouAccount(payload) {
  const {
    title,
    provider,
    rootFolderId,
    loginType,
    account,
    passwordText,
    cookieText,
    remark
  } = payload;

  if (!title || !loginType) {
    const err = new Error('标题和登录类型必填');
    err.status = 400;
    throw err;
  }
  if (!['cookie', 'account'].includes(loginType)) {
    const err = new Error('登录类型错误');
    err.status = 400;
    throw err;
  }
  if (loginType === 'cookie' && !cookieText) {
    const err = new Error('Cookie 模式必须填写 Cookie');
    err.status = 400;
    throw err;
  }
  if (loginType === 'account' && (!account || !passwordText)) {
    const err = new Error('账号模式必须填写账号和密码');
    err.status = 400;
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO lanzou_accounts (title, provider, root_folder_id, login_type, account, password_text, cookie_text, remark, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      title,
      String(provider || 'ilanzou').trim() || 'ilanzou',
      Number(rootFolderId || 0),
      loginType,
      account || null,
      passwordText || null,
      cookieText || null,
      remark || null
    ]
  );

  return getLanzouAccount(result.insertId);
}

async function createSyncLog(accountId, status, message) {
  const [result] = await pool.query(
    'INSERT INTO sync_logs (account_id, status, message) VALUES (?, ?, ?)',
    [accountId, status, message || '']
  );
  return result.insertId;
}

async function updateSyncLog(logId, status, message) {
  await pool.query(
    'UPDATE sync_logs SET status = ?, message = ? WHERE id = ?',
    [status, message || '', logId]
  );
}

async function runPythonSync(account) {
  return new Promise((resolve, reject) => {
    const isIlanzou = account.provider === "ilanzou";
    const scriptFile = isIlanzou ? "ilanzou_sync_sdk.js" : "lanzou_sync.py";
    const scriptPath = path.join(__dirname, "..", "scripts", scriptFile);
    const command = isIlanzou ? "node" : "python3";

    const child = spawn(command, [scriptPath], {
      cwd: path.join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      stdout += buf.toString();
    });

    child.stderr.on("data", (buf) => {
      stderr += buf.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || stdout || `同步脚本退出码 ${code}`));
      }

      try {
        const cleanStdout = String(stdout || "").trim();
        const jsonText = cleanStdout.slice(cleanStdout.indexOf("{"));
        const result = JSON.parse(jsonText);

        if (!result.ok) {
          return reject(new Error(result.message || "蓝奏同步失败"));
        }

        resolve(result.files || []);
      } catch (err) {
        reject(new Error(`同步脚本返回内容无法解析: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify({
      provider: account.provider,
      rootFolderId: account.root_folder_id,
      loginType: account.login_type,
      account: account.account,
      password: account.password_text,
      cookie: account.cookie_text
    }));
    child.stdin.end();
  });
}

async function replaceResources(accountId, files) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM resources WHERE account_id = ?', [accountId]);

    if (files.length > 0) {
      const values = files.map((item) => [
        accountId,
        item.parent_folder_id || null,
        item.file_id || null,
        item.file_name || '',
        item.file_size || '',
        item.file_type || '',
        item.file_time || '',
        item.share_url || '',
        toSyncHash(item),
        0
      ]);
      await conn.query(
        `INSERT INTO resources
        (account_id, parent_folder_id, file_id, file_name, file_size, file_type, file_time, share_url, sync_hash, is_deleted)
        VALUES ?`,
        [values]
      );
    }

    await conn.query(
      'UPDATE lanzou_accounts SET last_sync_at = NOW(), last_check_at = NOW() WHERE id = ?',
      [accountId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function checkAccount(accountId) {
  const account = await getLanzouAccount(accountId);
  if (!account) {
    const err = new Error("蓝奏账号不存在");
    err.status = 404;
    throw err;
  }

  const logId = await createSyncLog(accountId, "running", "开始检测");
  try {
    const files = await runPythonSync(account);
    await pool.query("UPDATE lanzou_accounts SET last_check_at = NOW() WHERE id = ?", [accountId]);
    await updateSyncLog(logId, "success", `检测成功，共发现 ${files.length} 个文件`);
    return { total: files.length };
  } catch (err) {
    await pool.query("UPDATE lanzou_accounts SET last_check_at = NOW() WHERE id = ?", [accountId]);
    await updateSyncLog(logId, "failed", `检测失败：${err.message}`);
    throw err;
  }
}

async function syncAccount(accountId) {
  const account = await getLanzouAccount(accountId);
  if (!account) {
    const err = new Error('蓝奏账号不存在');
    err.status = 404;
    throw err;
  }

  const logId = await createSyncLog(accountId, 'running', '开始同步');
  try {
    const files = await runPythonSync(account);
    await replaceResources(accountId, files);
    await updateSyncLog(logId, 'success', `同步成功，共 ${files.length} 个文件`);
    return { total: files.length };
  } catch (err) {
    await updateSyncLog(logId, 'failed', err.message);
    throw err;
  }
}

async function listSyncLogs(limit = 50) {
  const [rows] = await pool.query(
    'SELECT * FROM sync_logs ORDER BY id DESC LIMIT ?',
    [Math.min(Number(limit) || 50, 200)]
  );
  return rows;
}

module.exports = {
  listLanzouAccounts,
  getLanzouAccount,
  saveLanzouAccount,
  checkAccount,
  syncAccount,
  listSyncLogs
};
