# MailAggregator Pro

多邮箱 IMAP 聚合 + 规则打标签 + Telegram 推送的小控制台。

---

## 技术栈（简要）

- **后端**：FastAPI、SQLAlchemy（异步）、SQLite
- **前端**：React、TypeScript、Vite
- **部署**：Docker + docker-compose（一容器同时跑前后端）

---

## Docker 部署（推荐）

1. **克隆代码并进入目录**

   ```bash
   git clone <你的仓库地址>
   cd mail-tool
   ```

2. **编辑 `docker-compose.yml`**

   主要修改 `environment` 段（其他保持默认即可）：

   - `ENCRYPTION_KEY`：使用项目自带脚本生成的密钥（或你自己生成），迁移时务必一起备份。
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD`：后台登录账号密码（请改成你自己的强密码）。
   - `JWT_SECRET`：JWT 签名密钥，改成随机长字符串。
   - `API_TOKEN`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`、`WEBHOOK_URL`：按需填写或留空。

3. **启动服务**

   ```bash
   # 第一次或更新镜像时
   docker compose up -d --build

   # 查看运行状态和日志
   docker compose ps
   docker compose logs -f app
   ```

   默认：

   - 访问地址：`http://服务器IP:8000`
   - 数据库存储：当前目录下 `data/mail_agg.db`

4. **日常运维**

   ```bash
   # 停止
   docker compose down

   # 更新代码 + 重新部署
   git pull
   docker compose up -d --build
   ```

   如需改端口，在 `docker-compose.yml` 的 `ports` 中把 `8000:8000` 改成例如 `8080:8000`。

---

## 项目结构（简要）

```text
mail-tool/
├── app/                 # Python 后端
│   ├── api/             # FastAPI 路由（账号、邮件、规则、设置、统计等）
│   ├── core/            # 配置、数据库、加密、认证
│   ├── models/          # SQLAlchemy 模型
│   ├── schemas/         # Pydantic 请求 / 响应
│   ├── services/        # 邮件拉取、规则引擎、Telegram、Webhook
│   └── worker/          # 后台轮询任务
├── frontend/            # 前端工程（React/Vite，构建后由后端静态托管）
├── main.py              # FastAPI 入口，挂载 API + 前端静态资源
├── requirements.txt     # 后端依赖
├── Dockerfile           # 多阶段构建镜像
├── docker-compose.yml   # 一键启动配置（推荐只改 environment）
├── .env.example         # 环境变量示例（实际生产用 docker-compose 环境变量）
└── README.md
```
