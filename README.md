# MailAggregator Pro

邮件聚合控制台：多邮箱 IMAP 拉取、规则处理、Telegram 推送、Webhook、统计与系统设置。

## 技术栈

- **后端**: FastAPI + SQLAlchemy (async) + SQLite
- **前端**: React + TypeScript + Vite
- **认证**: JWT 登录、修改密码、忘记密码（重置令牌）

## 快速开始

### 1. 环境配置

```bash
# 复制示例配置并编辑
cp .env.example .env
# 至少填写 ENCRYPTION_KEY、ADMIN_USERNAME、ADMIN_PASSWORD（若使用登录）
```

`.env` 中常用项说明见 [.env.example](.env.example)。

### 2. 后端

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
uvicorn main:app --reload
```

默认 http://127.0.0.1:8000

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

默认 http://127.0.0.1:5173，需通过 Vite 代理或同域访问后端 API。

### 4. Docker 部署（推荐用于 Linux 服务器）

推荐做法：**只改 `docker-compose.yml` 中的 `environment` 段即可完成配置**，其中：

- `ENCRYPTION_KEY`：Fernet 加密密钥，必须是强随机值，迁移时一并备份。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：控制台登录账号密码，公网环境务必使用强密码。
- `JWT_SECRET`：JWT 签发密钥，必须是强随机值。
- 其余如 `API_TOKEN`、`TELEGRAM_BOT_TOKEN`、`WEBHOOK_URL` 可按需填写或留空。

也可以在本地使用 `.env`（参见 `.env.example`），但生产环境直接改 `docker-compose.yml` 即可。

```bash
# 构建并启动（数据库会持久化到 ./data）
docker compose up -d --build

# 查看日志
docker compose logs -f app
```

- 服务地址：`http://服务器IP:8000`（前端与 API 同端口，无需单独起前端）
- 数据库文件：`./data/mail_agg.db`（首次运行会自动创建 `data` 目录）
- 停止：`docker compose down`

如需修改端口，在 `docker-compose.yml` 中调整 `ports`，例如 `"8080:8000"`。

### 5. 非 Docker 生产部署

- 后端：使用 `uvicorn main:app --host 0.0.0.0` 或挂到 Nginx 等反向代理
- 前端：`npm run build` 后将 `frontend/dist` 静态资源交给同一域名或 Nginx 托管

### 6. 公网部署安全清单（Checklist）

- **配置密钥**
  - 在 `.env` 中设置强随机的 `ENCRYPTION_KEY`（切勿留空或使用默认），迁移时一起备份。
  - 设置管理员账号：`ADMIN_USERNAME`、`ADMIN_PASSWORD`，密码建议 ≥ 12 位随机字符串。
  - 设置 `JWT_SECRET` 为强随机字符串，避免回退到默认值。
  - 若不需要脚本访问接口，`API_TOKEN` 留空即可。

- **网络与反向代理**
  - 使用 Nginx/Caddy 等反向代理统一提供 `https://` 访问。
  - 对外只暴露反向代理端口（80/443），`8000` 仅监听在本机或内网。
  - 如仅自用，可在防火墙或代理上按 IP 做访问控制（白名单）。

- **登录与暴力破解**
  - 在反向代理上给 `/api/auth/login` 配置限速（如每 IP 每分钟 5 次）。
  - 管理员账号仅自用，不在公开页面展示注册入口。

- **健康检查与调试**
  - `/api/health` 仅返回轮询时间与错误信息，不包含敏感数据；如需更严格，可限制为仅内网探活使用。
  - 线上环境不要开启 `uvicorn --reload`、调试日志等开发选项。

- **导出/导入与备份**
  - `设置导出` 得到的 JSON 含有加密后的邮箱密码和 Token，只在安全环境下保存和传输。
  - 定期备份 `./data/mail_agg.db` 与 `.env`（至少包含 `ENCRYPTION_KEY` 和登录配置）。
  - 从其他环境迁移时，务必保持 `ENCRYPTION_KEY` 一致，否则无法解密原有账号密码。

- **前端安全**
  - 不在代码中添加 `dangerouslySetInnerHTML` 等直接渲染外部 HTML 的用法。
  - 保持前后端同源部署（本项目 Docker 镜像已经是同源方案），避免多余的跨域暴露。

## 项目结构

```
mail-tool/
├── app/
│   ├── api/          # 路由：账号、邮件、规则、设置、统计、健康、认证
│   ├── core/         # 配置、数据库、加密、鉴权
│   ├── models/       # SQLAlchemy 模型
│   ├── schemas/      # 请求/响应结构
│   ├── services/     # 拉取、规则引擎、Telegram、Webhook
│   └── worker/       # 轮询任务
├── frontend/src/
│   ├── api/          # 请求封装与类型
│   ├── features/     # 账号、邮件、规则、设置、统计、登录
│   └── styles.css
├── main.py           # FastAPI 入口
├── requirements.txt
├── Dockerfile        # 多阶段构建：前端 + 后端
├── docker-compose.yml
├── .env.example      # 配置模板（勿提交 .env）
└── README.md
```

## 安全说明

- 不要将 `.env` 提交到版本库；使用 `.env.example` 作为模板。
- 控制台登录：配置 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 后可在系统设置中修改密码（存 bcrypt 于 DB）。
- 忘记密码：在 `.env` 中设置 `ADMIN_RESET_TOKEN` 后，可在登录页通过重置令牌设置新密码。

## 许可证

按项目原有约定使用。
