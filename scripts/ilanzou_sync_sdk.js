#!/usr/bin/env node
const { LanZouYClient } = require("@netdrive-sdk/ilanzou");

function fileToDict(item, parentFolderId, shareUrl = "") {
  return {
    parent_folder_id: String(parentFolderId ?? 0),
    file_id: String(item.fileId || item.id || ""),
    file_name: String(item.fileName || item.name || ""),
    file_size: String(item.fileSize || item.size || ""),
    file_type: String(item.fileType || item.type || ""),
    file_time: String(item.updTime || item.addTime || item.updateTime || item.createTime || item.time || ""),
    share_url: String(shareUrl || "").trim()
  };
}

async function safeShareUrl(client, fileId) {
  try {
    const res = await client.shareUrl(String(fileId || ""));
    return String((res && res.shareUrl) || "").trim();
  } catch (_) {
    return "";
  }
}

async function readInput() {
  return await new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => buf += chunk);
    process.stdin.on("end", () => resolve(buf || "{}"));
    process.stdin.on("error", reject);
  });
}

function isFolderItem(item) {
  return Number(item?.fileType || item?.type || 0) === 2 && item?.folderId;
}

function isFileItem(item) {
  return Number(item?.fileType || item?.type || 0) === 1 && (item?.fileId || item?.id);
}

async function fetchAllInFolder(client, folderId) {
  const all = [];
  const limit = 100;
  let offset = 1;

  while (true) {
    const res = await client.getFileList({ folderId, limit, offset });

    if (!res || res.code !== 200) {
      throw new Error((res && (res.msg || res.message)) || ("ilanzou 列表获取失败，folderId=" + folderId));
    }

    const list = Array.isArray(res.list) ? res.list : [];
    all.push(...list);

    const total = Number(res.total || 0);
    if (list.length === 0) break;
    if (total > 0 && all.length >= total) break;

    offset += list.length;

    if (list.length < limit && total === 0) break;
  }

  return all;
}

async function walkFolder(client, folderId, files, visited, options = {}) {
  const key = String(folderId ?? 0);
  if (visited.has(key)) return;
  visited.add(key);

  const items = await fetchAllInFolder(client, Number(folderId || 0));

  for (const item of items) {
    if (isFolderItem(item)) {
      await walkFolder(client, Number(item.folderId), files, visited, options);
      continue;
    }

    if (isFileItem(item)) {
        const fileId = String(item.fileId || item.id || "");
        const shareUrl = options.includeShareUrls && fileId ? await safeShareUrl(client, fileId) : "";
        files.push(fileToDict(item, folderId, shareUrl));
      }
  }
}

async function main() {
  const input = JSON.parse(await readInput());
  const account = String(input.account || "").trim();
  const password = String(input.password || "");
  const rootFolderId = Number(input.rootFolderId || 0);
  const includeShareUrls = input.includeShareUrls === true;

  if (!account || !password) {
    throw new Error("ilanzou 账号或密码为空");
  }

  const client = new LanZouYClient({ username: account, password });
  client.config.apiUrl = "https://apis.ilanzou.com";
  client.client = client.client.extend({ prefixUrl: client.config.apiUrl });

  const loginRes = await client.login();
  if (!loginRes || loginRes.code !== 200) {
    throw new Error((loginRes && (loginRes.msg || loginRes.message)) || "ilanzou 登录失败");
  }

  const files = [];
  const visited = new Set();
  await walkFolder(client, rootFolderId, files, visited, { includeShareUrls });

  process.stdout.write(JSON.stringify({ ok: true, total: files.length, files }, null, 2));
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ ok: false, message: err && err.message ? err.message : String(err) }, null, 2));
  process.exit(1);
});
