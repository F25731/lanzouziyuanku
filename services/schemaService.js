function getPersonalResourceSchemaRequirements() {
  return {
    columns: [
      {
        table: 'lanzou_accounts',
        name: 'provider',
        definition: "VARCHAR(20) NOT NULL DEFAULT 'ilanzou' AFTER `title`"
      },
      {
        table: 'lanzou_accounts',
        name: 'root_folder_id',
        definition: 'BIGINT NOT NULL DEFAULT 0 AFTER `provider`'
      },
      {
        table: 'resources',
        name: 'category',
        definition: "VARCHAR(100) NOT NULL DEFAULT '' AFTER `share_url`"
      },
      {
        table: 'resources',
        name: 'tags',
        definition: 'VARCHAR(500) DEFAULT NULL AFTER `category`'
      },
      {
        table: 'resources',
        name: 'note',
        definition: 'TEXT AFTER `tags`'
      },
      {
        table: 'resources',
        name: 'status',
        definition: "ENUM('visible','hidden','deleted') NOT NULL DEFAULT 'visible' AFTER `note`"
      }
    ],
    tables: [
      {
        name: 'download_logs',
        sql: `CREATE TABLE IF NOT EXISTS download_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  resource_id BIGINT UNSIGNED DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_download_logs_user_id (user_id),
  KEY idx_download_logs_resource_id (resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      },
      {
        name: 'api_tokens',
        sql: `CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT 'read',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME DEFAULT NULL,
  last_used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_api_tokens_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      }
    ]
  };
}

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensurePersonalResourceSchema() {
  const { pool } = require('../config/db');
  const requirements = getPersonalResourceSchemaRequirements();
  const conn = await pool.getConnection();
  const applied = [];

  try {
    for (const table of requirements.tables) {
      await conn.query(table.sql);
      applied.push(`table:${table.name}`);
    }

    for (const column of requirements.columns) {
      if (await columnExists(conn, column.table, column.name)) continue;
      await conn.query(`ALTER TABLE \`${column.table}\` ADD COLUMN \`${column.name}\` ${column.definition}`);
      applied.push(`column:${column.table}.${column.name}`);
    }

    return { applied };
  } finally {
    conn.release();
  }
}

module.exports = {
  ensurePersonalResourceSchema,
  getPersonalResourceSchemaRequirements
};
