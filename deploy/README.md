# Sea-Doo 部署工具

服务器：`170.168.89.127`（root），站点：`https://seadoo.aaatslydaaa.ru`

统一入口 `deploy.py`（paramiko），密码只从环境变量读取（**严禁硬编码/提交明文**）。

## 用法（Windows Git Bash）

```bash
# 前端：构建后上传 dist/
SSHPASS='<服务器密码>' python deploy/deploy.py front

# 后端：server 上传 + compose 归一化（version 移除/healthcheck/挂载）+ chown + 容器重建 + nginx conf
SSHPASS='<服务器密码>' SEADOO_ADMIN_PASSWORD='<后台密码>' python deploy/deploy.py api

# 仅应用 nginx seadoo.conf（HTTPS/gzip/CSP/upstream）并 reload
SSHPASS='<服务器密码>' python deploy/deploy.py conf

# 验证
SSHPASS='<服务器密码>' python deploy/deploy.py verify-https   # HTTPS 全链路
SSHPASS='<服务器密码>' python deploy/deploy.py verify-site    # DNS/vhost/主站
```

## 子命令说明

| 子命令 | 用途 | 环境变量 |
|---|---|---|
| `front` | 清空远端 assets + 上传 `dist/` | `SSHPASS` |
| `api` | 上传 `server/`、注入 `.env`、compose 归一化（幂等：移除 `version`、补 seadoo-api/healthcheck/nginx uploads 挂载）、`chown 1000:1000`、重建容器、应用 nginx conf | `SSHPASS`、`SEADOO_ADMIN_PASSWORD` |
| `conf` | 仅写 `seadoo.conf` + `nginx -t` + reload | `SSHPASS` |
| `verify-https` | HTTPS 页面/API/301 巡检 | `SSHPASS` |
| `verify-site` | DNS/vhost/主站巡检 | `SSHPASS` |

## 内置配置（权威版本，全部在此脚本中）

- **nginx seadoo.conf**：Let's Encrypt 443 + HTTP 301 + acme 路径 + `upstream seadoo_api`（max_fails 兜底）+ gzip（js/css/json/svg + 代理响应）+ CSP 等安全头 + API no-store + `/uploads` 静态。
- **docker-compose 归一化**：幂等移除废弃 `version` 字段；seadoo-api 容器带 healthcheck（wget /api/health）；nginx 挂载 uploads。

## 注意

- 本地路径已相对化（`deploy/` 向上取 `dist/`、`server/`），任意机器 clone 后可直接运行。
- SSH 偶发 banner 超时，脚本内置 5 次重试。
- 含明文测试密码的临时验证脚本保留在本地 `.workbuddy/`（gitignore），不提交。
