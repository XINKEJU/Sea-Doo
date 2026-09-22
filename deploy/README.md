# Sea-Doo 部署工具

服务器：`170.168.89.127`（root），站点：`https://seatoys.aaatslydaaa.ru`
（旧域名 `https://seadoo.aaatslydaaa.ru` **同样直接服务**，两个域名共用一张双域名证书与一份站点配置）

统一入口 `deploy.py`（paramiko），密码只从环境变量读取（**严禁硬编码/提交明文**）。

## 用法（Windows Git Bash）

```bash
# 前端：构建后上传 dist/
SSHPASS='<服务器密码>' python deploy/deploy.py front

# 后端：server 上传 + compose 归一化（version 移除/healthcheck/挂载）+ chown + 容器重建 + nginx conf
SSHPASS='<服务器密码>' SEADOO_ADMIN_PASSWORD='<后台密码>' python deploy/deploy.py api

# 仅应用 nginx seadoo.conf（HTTPS/gzip/CSP/upstream）并 reload；事务式，校验失败回滚
SSHPASS='<服务器密码>' python deploy/deploy.py conf

# 为规范域名签发 Let's Encrypt 证书（前置：DNS A 记录已指向 170.168.89.127）
SSHPASS='<服务器密码>' python deploy/deploy.py cert

# 验证
SSHPASS='<服务器密码>' python deploy/deploy.py verify-https   # HTTPS 全链路
SSHPASS='<服务器密码>' python deploy/deploy.py verify-site    # DNS/vhost/主站
```

## 子命令说明

| 子命令 | 用途 | 环境变量 |
|---|---|---|
| `front` | 清空远端 assets + 上传 `dist/` | `SSHPASS` |
| `api` | 上传 `server/`、注入 `.env`、compose 归一化（幂等：移除 `version`、补 seadoo-api/healthcheck/nginx uploads 挂载）、`chown 1000:1000`、重建容器、应用 nginx conf | `SSHPASS`、`SEADOO_ADMIN_PASSWORD` |
| `conf` | 仅写 `seadoo.conf` + `nginx -t` + reload（事务式，校验失败回滚） | `SSHPASS` |
| `cert` | 临时 acme vhost → `certbot certonly`（双域名 SAN）→ 清理 → 应用 `seadoo.conf` → 打印证书 SAN | `SSHPASS` |
| `verify-https` | 双域名 HTTPS 页面/API/301 巡检 + 证书 SAN | `SSHPASS` |
| `verify-site` | DNS/vhost/证书目录/主站巡检 | `SSHPASS` |

## 域名迁移（seadoo → seatoys）

规范域名已切换为 `seatoys.aaatslydaaa.ru`，**两个域名都直接可访问**（不做重定向）。
设计上只用**一张双 SAN 证书 + 一个 server 块**，站点配置不重复，避免双份维护走样。

执行顺序有严格要求：

1. **DNS**：在 nic.ru 添加 `seatoys` A 记录 → `170.168.89.127`（无此记录则第 2 步必然失败）
2. `cert`：临时 acme vhost → 签发 `seatoys.aaatslydaaa.ru` + `seadoo.aaatslydaaa.ru`
   双域名证书 → 清理临时文件 → 应用完整 `seadoo.conf`
3. `api`：后端 `ALLOWED_ORIGINS` 需包含新域名（同时保留旧域名，两种 Origin 都放行）

> nginx 在解析配置阶段就会校验 `ssl_certificate` 指向的文件，因此「引用新证书的 vhost」
> 必须先等证书存在。`cert` 已内置该引导顺序；直接跑 `conf` 会因证书缺失而回滚（不 reload，线上不受影响）。
>
> 旧的 `seadoo.aaatslydaaa.ru` 证书血统（`/etc/letsencrypt/live/seadoo.aaatslydaaa.ru/`）
> 迁移后不再被引用，仅作回滚兜底保留。确认无需回滚后可手工清理：
> `docker run --rm -v /opt/certbot/etc:/etc/letsencrypt certbot/certbot delete --cert-name seadoo.aaatslydaaa.ru`。
>
> 前端 `dist/` 无需重建：域名只出现在 nginx 与后端 Origin 白名单，前端运行时无硬编码域名。

## 内置配置（权威版本，全部在此脚本中）

- **nginx seadoo.conf**：单个 443 server 块同时声明两个 `server_name`，使用双 SAN 证书
  （`/etc/letsencrypt/live/seatoys.aaatslydaaa.ru/`）；HTTP 块对两个域名各自 301 到自身 HTTPS，
  并保留 acme 路径供双域名 HTTP-01 续期；含 `upstream seadoo_api`（max_fails 兜底）、gzip、
  CSP 等安全头、API no-store、`/uploads` 静态。
- **docker-compose 归一化**：幂等移除废弃 `version` 字段；seadoo-api 容器带 healthcheck（wget /api/health）；nginx 挂载 uploads。

## 注意

- 文件名 `seadoo.conf` 为历史遗留（内容已是 seatoys 规范域名）：改名需同时删除服务器旧文件，
  否则同一 `server_name` 会重复定义，故保持不变。
- 原配置里的 `seadoo.aaastlydaaa.ru` 已移除：权威 NS 实测该域名 NXDOMAIN（从未解析过），属死配置。
- `nginx -t` 必须直取退出码，不能走管道 —— `nginx -t | tail -1` 的退出码来自 `tail`，会掩盖失败。
- 本地路径已相对化（`deploy/` 向上取 `dist/`、`server/`），任意机器 clone 后可直接运行。
- SSH 偶发 banner 超时，脚本内置 5 次重试。
- 含明文测试密码的临时验证脚本保留在本地 `.workbuddy/`（gitignore），不提交。
