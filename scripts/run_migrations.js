require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../config/db");

function sha1(text) {
  return crypto.createHash("sha1").update(String(text || "")).digest("hex");
}

function normalizeSql(sqlText) {
  return String(sqlText || "")
    .split(/\r?\n/)
    .filter((line) => {
      const s = String(line || "").trim().toUpperCase();
      if (!s) return true;
      if (s.startsWith("CREATE DATABASE ")) return false;
      if (s.startsWith("USE ")) return false;
      return true;
    })
    .join("\n");
}

function splitStatements(sqlText) {
  return String(sqlText || "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, checksum VARCHAR(40) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uk_schema_migrations_name (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
  );
}

async function runMigrations() {
  const dir = path.join(__dirname, "..", "database", "migrations");
  if (!fs.existsSync(dir)) {
    return { applied: [], skipped: [], totalFiles: 0 };
  }

  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const conn = await pool.getConnection();
  const applied = [];
  const skipped = [];

  try {
    await ensureMigrationsTable(conn);
    const [rows] = await conn.query("SELECT name, checksum FROM schema_migrations ORDER BY id ASC");
    const done = new Map(rows.map((row) => [String(row.name), String(row.checksum || "")]));

    for (const name of files) {
      const fullPath = path.join(dir, name);
      const raw = fs.readFileSync(fullPath, "utf8");
      const checksum = sha1(raw);

      if (done.has(name)) {
        skipped.push(name);
        continue;
      }

      const sql = normalizeSql(raw);
      const statements = splitStatements(sql);
      await conn.beginTransaction();
      try {
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.query("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)", [name, checksum]);
        await conn.commit();
        applied.push(name);
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    return { applied, skipped, totalFiles: files.length };
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then((result) => {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  runMigrations
};
