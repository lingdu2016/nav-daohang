# ─── Stage 1: 构建前端 ────────────────────────────────────────────────────────
FROM node:20-alpine3.20 AS frontend-builder
WORKDIR /app
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ─── Stage 2: 生产镜像 ────────────────────────────────────────────────────────
FROM node:20-alpine3.20 AS production

# 仅安装 ca-certificates（Neon 需要 TLS），不再需要 sqlite
RUN apk add --no-cache ca-certificates

WORKDIR /app

# 创建必要目录
RUN mkdir -p uploads web/dist scripts

# 安装后端依赖
COPY package*.json ./
RUN npm install --production

# 拷贝源码
COPY . .
COPY --from=frontend-builder /app/dist ./web/dist

# ─── 启动命令 ─────────────────────────────────────────────────────────────────
# init-db.js 必须在 app.js 之前执行：
#   - 验证 Neon 连接（失败则 exit 1，阻止服务启动）
#   - 建表 + 条件种子写入
#   - 成功后启动 Express 应用
CMD ["sh", "-c", "node scripts/init-db.js && node app.js"]
