# ---- 阶段一：构建前端 ----
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ---- 阶段二：Python 运行时 ----
FROM python:3.12-slim AS runtime
WORKDIR /app

# 安装 Python 依赖（单独 COPY requirements 以利用层缓存）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端源码
COPY app/ ./app/
COPY main.py ./

# 复制前端构建产物
COPY --from=frontend /build/dist ./static

# 创建数据目录，并以非 root 用户运行
RUN mkdir -p /app/data \
    && useradd -r -s /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
