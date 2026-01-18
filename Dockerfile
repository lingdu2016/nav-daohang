FROM node:20-alpine3.20 AS frontend-builder
WORKDIR /app
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:20-alpine3.20 AS production
RUN apk add --no-cache sqlite ca-certificates
# 安装 Litestream
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz

WORKDIR /app
RUN mkdir -p uploads database web/dist
COPY package*.json ./
RUN npm install --production
COPY . .
COPY --from=frontend-builder /app/dist ./web/dist

# 这里的启动命令是关键
CMD ["sh", "-c", "litestream restore -if-replica-exists /app/database/nav.db && litestream replicate -exec 'npm start'"]
