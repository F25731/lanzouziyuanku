蓝奏云资源站源码包部署说明（V1.0.1）

一、当前版本
1. 当前正式交付版本：1.0.1
2. 当前版本特性：
- 基础商业交付版
- 支持 install / update / backup / rollback / healthcheck
- 支持数据库迁移机制
- 支持同步时自动写入 share_url
- 小说搜索结果去重
- 同名小说按优先级展示主结果
- 前台显示去重前结果数量
- 支持定时自动备份
- 支持定时自动健康检查
- 支持自动清理 14 天前旧备份与旧安装包

二、项目简介
本项目为 Node.js + Express + MySQL + Redis + PM2 的资源站源码。

1. 前台功能
- 用户注册 / 登录
- 新用户赠送 1 天会员
- 资源搜索
- 小说搜索结果去重
- 会员卡兑换
- 会员资源查看下载

2. 后台功能
- 站点配置
- 天卡 / 周卡 / 月卡制卡
- 用户管理
- 蓝奏账号管理
- 手动检测 / 手动同步
- 同步日志查看
- 版本信息查看
- 检查更新入口

三、蓝奏同步说明
1. 普通蓝奏同步脚本：scripts/lanzou_sync.py
2. ilanzou 同步脚本：scripts/ilanzou_sync_sdk.js
3. 当前系统已支持同步时自动写入 share_url
4. 下载接口保留兜底补链逻辑
5. 蓝奏相关接口属于非官方方式接入，若上游规则变化，同步能力可能需要调整

四、运行环境要求
建议环境如下：
- Linux 服务器
- Node.js 18 及以上
- MySQL 5.7 / 8.0
- Redis 6 及以上
- PM2
- npm

如需使用 Python 同步脚本，还需要：
- Python 3
- pip3 install lanzou-api

五、环境变量配置
首次部署前，请先检查 .env 文件。
如果项目根目录不存在 .env，可先复制：
cp .env.example .env

重点配置项：
- PORT
- DB_HOST
- DB_PORT
- DB_NAME
- DB_USER
- DB_PASSWORD
- REDIS_HOST
- REDIS_PORT
- REDIS_PASSWORD
- SESSION_SECRET
- ADMIN_INIT_USERNAME
- ADMIN_INIT_PASSWORD
- UPDATE_MANIFEST_URL

六、首次安装
在项目根目录执行：
bash scripts/install.sh

该脚本会自动完成：
- 检查并使用 .env
- 安装 npm 依赖
- 执行数据库迁移
- 启动或重启 PM2 进程
- 保存 PM2 启动配置

七、数据库迁移
本项目已内置数据库迁移机制。
迁移目录：
database/migrations/

手动执行迁移命令：
npm run migrate

当前已执行迁移会记录到：
schema_migrations 表

八、日常运维命令
1. 语法与关键脚本检查
npm run check

2. 健康检查
bash scripts/healthcheck.sh

3. 手动备份
bash scripts/backup.sh

4. 一键更新
bash scripts/update.sh

5. 手动回滚
bash scripts/rollback.sh 备份目录绝对路径

6. 清理旧备份与旧安装包
bash scripts/prune_old_releases.sh

7. 打包交付版
bash scripts/release.sh

九、备份与回滚说明
1. 备份脚本
bash scripts/backup.sh

执行后会在以下目录生成备份：
releases/backups/时间戳/

默认包含：
- code.tar.gz 代码备份
- db.sql 数据库备份
- meta.json 备份信息

2. 回滚脚本
bash scripts/rollback.sh 备份目录绝对路径

回滚会执行：
- 恢复代码
- 恢复数据库
- 重启 PM2 进程

十、自动运维任务
当前已配置 cron 自动任务：
- 每天 03:30 自动备份
- 每 10 分钟自动健康检查
- 每天 03:50 自动清理 14 天前旧备份和旧安装包

日志目录：
logs/cron/

日志文件：
- logs/cron/backup.log
- logs/cron/healthcheck.log
- logs/cron/prune.log

十一、搜索去重说明
1. 小说搜索会优先对同名资源进行去重展示
2. 去重逻辑主要基于：
- 归一化书名
- 作者信息
- 常见标签清洗
3. 主结果优先展示更优版本，例如：
- 精校版
- 校对版
- 全本
- 全集
- 完结
4. 前台会显示：
- 当前展示结果数量
- 去重前命中数量

十二、PM2 进程说明
默认进程名：
lanzou-site

常用命令：
pm2 status
pm2 logs lanzou-site
pm2 restart lanzou-site
pm2 save

十三、访问地址
前台正式页面：
/front-v2

后台登录页：
/admin/login

后台主页面：
/admin/dashboard
或
/admin/dashboard-v2

十四、上线建议
1. 首次上线后先执行：
bash scripts/healthcheck.sh

2. 更新前建议先手动执行一次：
bash scripts/backup.sh

3. 如需正式商用，建议补充：
- Nginx 反向代理
- HTTPS 证书
- 日志轮转
- 数据库异地备份
- 敏感信息加密存储
- 用户协议与隐私政策

十五、故障排查建议
1. 搜索异常先检查：
- 是否完成资源同步
- 后台蓝奏账号状态是否正常
- sync_logs 是否有报错
- healthcheck 是否通过

2. 下载异常先检查：
- 当前用户是否登录
- 是否达到普通用户下载次数上限
- share_url 是否存在
- 蓝奏源资源是否失效

3. 同步异常先检查：
- 蓝奏账号状态
- Cookie 是否失效
- 网络连通性
- 同步日志
- healthcheck 结果

十六、交付建议
对外售卖源码时，建议至少交付以下内容：
- 完整源码
- .env.example
- version.json
- README-部署说明.txt
- scripts/install.sh
- scripts/update.sh
- scripts/backup.sh
- scripts/rollback.sh
- scripts/healthcheck.sh
- scripts/prune_old_releases.sh
- scripts/release.sh
- database/migrations/

至此，V1.0.1 已具备基础商业交付能力，并具备基础自动运维能力。
