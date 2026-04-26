# 蓝奏个人资源库

这是一个个人资源库服务：服务器负责蓝奏云优享版资源同步、索引、搜索和开放 API，本地单文件 HTML 负责管理。

## 本地管理台

打开 `resource-library-admin.html`，填写：

- 服务器地址：例如 `http://127.0.0.1:3000`
- 后台口令：`.env` 里的 `ADMIN_API_TOKEN`

管理台支持蓝奏来源、同步、资源分类/标签/备注、隐藏/删除资源、同步日志和 API Token。

## 本地运行

复制配置文件：

```bash
cp .env.example .env
```

安装依赖并启动：

```bash
npm install
npm start
```

测试和语法检查：

```bash
npm test
npm run check
```

## Docker Compose

服务器部署时复制 `.env.example` 为 `.env`，修改数据库密码、`SESSION_SECRET` 和 `ADMIN_API_TOKEN`，然后运行：

```bash
docker compose up -d --build
```

默认会启动：

- Node.js 应用：`3000`
- MySQL 8
- Redis 7

## 重要环境变量

```env
PORT=3000
DB_HOST=mysql
DB_PORT=3306
DB_NAME=qyshuku
DB_USER=qyshuku
DB_PASSWORD=change_this_db_password
REDIS_HOST=redis
REDIS_PORT=6379
SESSION_SECRET=change_this_session_secret
ADMIN_API_TOKEN=change_this_local_admin_token
```

## 主要接口

- `GET /api/search?q=关键词`：公开搜索
- `GET /api/download/:id`：获取资源链接
- `GET /api/local-admin/ping`：本地后台连通性检测
- `GET /api/local-admin/resources`：资源管理
- `POST /api/local-admin/sources/:id/sync`：同步蓝奏来源

`/api/local-admin/*` 需要请求头：

```text
X-Admin-Token: ADMIN_API_TOKEN
```
