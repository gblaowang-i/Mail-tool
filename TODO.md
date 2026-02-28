## MailAggregator Pro TODO

以下功能已实现（可作验收参考）：

- **Telegram 推送规则（tg-rules）** ✅
- **邮件搜索与过滤（email-search-filter）** ✅
- **每账号轮询间隔（per-account-poll-interval）** ✅
- **规则与标签系统（rules-and-labels-ui）** ✅
- **Webhook 与 API Token（webhook-and-api-token）** ✅
- **系统设置与敏感信息管理（settings-and-secrets-ui）** ✅
- **统计与清理（stats-and-cleanup）** ✅

---

### 原需求详情（供参考）

- **Telegram 推送规则（tg-rules）**
  - 按账号开关 Telegram 推送
  - 支持按发件人 / 域名 / 主题 / 正文关键字过滤
  - 不同账号或规则使用不同推送模板（长摘要 / 短摘要 / 仅标题）
  - 支持按时间窗口批量汇总推送（如每 10 分钟一条汇总）

- **邮件搜索与过滤（email-search-filter）**
  - 在邮件列表中按账号、发件人、主题、摘要关键字搜索
  - 支持按时间范围筛选（最近 24 小时 / 自定义起止时间）
  - 支持按未读 / 已读状态筛选（需要本地未读标记）

- **每账号轮询间隔（per-account-poll-interval）**
  - 在账号配置中增加轮询间隔字段，默认继承全局 `POLL_INTERVAL_SECONDS`
  - 后端轮询逻辑按账号自定义间隔调度
  - 前端账号列表展示每个账号的轮询频率

- **规则与标签系统（rules-and-labels-ui）**
  - 新增「规则管理」页面
  - 规则条件：账号 / 发件人 / 收件人 / 主题 / 正文关键字 / 是否有附件 / 邮件大小等
  - 规则动作：打标签、控制是否推送 Telegram、标记为重要 / 已读等
  - 邮件列表支持按标签过滤和展示

- **Webhook 与 API Token（webhook-and-api-token）**
  - 支持为新邮件触发自定义 Webhook（POST JSON 到指定 URL）
  - 简单的 API Token 鉴权机制，保护后端 API 和 Webhook 配置

- **系统设置与敏感信息管理（settings-and-secrets-ui）**
  - 新增系统设置页，统一管理：
    - Telegram Bot Token / Chat ID
    - 全局轮询间隔默认值
    - Webhook URL / API Token 等
  - 前端对敏感信息只显示脱敏版本，支持一键复制但不明文展示

- **统计与清理（stats-and-cleanup）**
  - 基础统计面板：
    - 每日 / 每周收件量趋势
    - 各邮箱账号的邮件占比
  - 邮件存储策略：
    - 仅保留最近 N 天或 N 条记录
    - 提供手动清理 / 历史归档入口

