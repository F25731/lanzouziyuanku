蓝奏云资源站常见问题排查（V1.0.1）

一、网站能打开，但搜索不到内容
请依次检查：
1. 后台是否已添加蓝奏账号
2. 是否已经执行过手动同步
3. 后台同步日志是否有报错
4. resources 表里是否已有数据
5. bash scripts/healthcheck.sh 是否通过

二、搜索结果数量太少或和预期不一致
说明：
1. 小说搜索已启用去重展示
2. 前台会显示“去重前 X 条”
3. 当前展示的是去重后的主结果
4. 主结果会优先展示精校版、校对版、全本、全集、完结等更优版本

三、普通用户点查看下载失败
请依次检查：
1. 用户是否已登录
2. 是否达到普通用户每日查看次数上限
3. 资源 share_url 是否存在
4. 蓝奏源链接是否失效

四、会员用户仍然看不到下载链接
请依次检查：
1. 该账号会员是否仍在有效期内
2. membership_expire_at 是否正确
3. 重新登录后再试
4. bash scripts/healthcheck.sh 是否通过

五、蓝奏账号同步失败
请依次检查：
1. 蓝奏账号或 Cookie 是否失效
2. 网络是否能正常访问蓝奏相关页面
3. scripts/ilanzou_sync_sdk.js 是否可正常执行
4. 后台同步日志里的报错内容

六、更新后页面异常
请按以下顺序处理：
1. 先执行 npm run check
2. 再执行 bash scripts/healthcheck.sh
3. 如仍异常，执行 bash scripts/rollback.sh 备份目录绝对路径

七、备份相关问题
说明：
1. 手动备份命令：bash scripts/backup.sh
2. 自动备份时间：每天 03:30
3. 备份目录：releases/backups/
4. 默认保留最近 14 天备份

八、日志查看位置
1. PM2 日志：pm2 logs lanzou-site
2. 自动备份日志：logs/cron/backup.log
3. 健康检查日志：logs/cron/healthcheck.log
4. 清理日志：logs/cron/prune.log

九、交付后的建议操作
1. 修改默认管理员账号密码
2. 检查 .env 配置是否完整
3. 首次上线先手动执行一次备份
4. 首次上线先手动执行一次健康检查

十、紧急回滚步骤
1. 找到最近一次可用备份目录
2. 执行：bash scripts/rollback.sh 备份目录绝对路径
3. 回滚后再执行：bash scripts/healthcheck.sh
