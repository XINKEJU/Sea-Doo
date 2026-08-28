FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# 安全加固：非 root 运行。
# data/uploads 目录挂载自宿主机，需在宿主机 chown 1000:1000（见 deploy_seadoo_api.py）
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
USER node

ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
