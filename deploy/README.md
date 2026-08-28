# Sea-Doo 部署脚本

服务器：`170.168.89.127`（root），站点：`https://seadoo.aaatslydaaa.ru`

所有脚本通过 **paramiko** 连接，密码从环境变量读取（**严禁硬编码/提交明文**）：

| 脚本 | 用途 | 必需环境变量 |
|---|---|---|
| `deploy_seadoo.py` | 构建后上传前端 `dist/` + 写 nginx conf + 重载 | `SSHPASS` |
| `deploy_seadoo_api.py` | 上传后端 `server/`、注入 `.env` 密码、改 compose、chown data/uploads、重建 seadoo-api 容器、应用 nginx conf（HTTPS+CSP） | `SSHPASS`、`SEADOO_ADMIN_PASSWORD` |
| `verify_https.py` | HTTPS 全链路验证（页面/API/301） | `SSHPASS` |
| `verify_seadoo.py` | 站点 vhost/DNS/静态资源验证 | `SSHPASS` |

## 用法（Windows Git Bash）

```bash
# 静态站点部署
SSHPASS='<服务器密码>' python deploy/deploy_seadoo.py

# 后端部署（后台密码需与服务器 .env 中 SEADOO_ADMIN_PASSWORD 一致）
SSHPASS='<服务器密码>' SEADOO_ADMIN_PASSWORD='<后台密码>' python deploy/deploy_seadoo_api.py

# 验证
SSHPASS='<服务器密码>' python deploy/verify_https.py
```

## 注意

- 本地路径已相对化（基于脚本所在 `deploy/` 目录向上取 `dist/`、`server/`），任意机器 clone 后可直接运行。
- 含明文测试密码的临时验证脚本保留在本地 `.workbuddy/`（已 gitignore），不提交。
- nginx HTTPS 配置（Let's Encrypt 证书 + 443 + HTTP 301 + CSP + API no-store）内置在 `deploy_seadoo_api.py` 的 `SEADOO_CONF` 中，重新部署会自动应用。
- 密码只从环境变量读取：`SSHPASS`（服务器 root）、`SEADOO_ADMIN_PASSWORD`（后台管理，注入服务器 .env）。
