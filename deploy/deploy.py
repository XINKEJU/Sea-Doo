#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sea-Doo 部署工具（单一脚本，替代旧的 deploy_seadoo.py / deploy_seadoo_api.py / verify_*.py）

用法（密码只从环境变量读取）:
  SSHPASS='<服务器密码>' python deploy/deploy.py front          # 上传前端 dist/
  SSHPASS='<服务器密码>' SEADOO_ADMIN_PASSWORD='<后台密码>' python deploy/deploy.py api
                                                               # 后端：server 上传 + compose 归一化 + 容器重建 + nginx conf
  SSHPASS='<服务器密码>' python deploy/deploy.py conf          # 仅应用 nginx seadoo.conf + reload
  SSHPASS='<服务器密码>' python deploy/deploy.py cert          # seatoys 证书签发（acme 引导 + 应用配置）
  SSHPASS='<服务器密码>' python deploy/deploy.py verify-https  # HTTPS 全链路验证
  SSHPASS='<服务器密码>' python deploy/deploy.py verify-site   # 站点 vhost/DNS 验证

认证：优先使用 SSHPASS 密码登录；若未提供或密码被拒，自动回退到 SSH 密钥
（默认 ~/.ssh/id_ed25519，可用 SSH_KEY 指定）。密钥对请用 `ssh root@170.168.89.127` 验证。

代理：当本机到服务器的路由被阻断（22/443 均超时）时，设置 SSH_PROXY 指向本机
HTTP 代理（如 SSH_PROXY=http://127.0.0.1:7897），脚本会以 CONNECT 隧道直连服务器 IP。
"""
import argparse
import os
import posixpath
import re
import sys
import time

import paramiko

HOST = "170.168.89.127"
REMOTE = "/opt/aaatslydaaa"
BASE = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIST = os.path.join(BASE, "..", "dist")
LOCAL_SERVER = os.path.join(BASE, "..", "server")
EXCLUDE = {"node_modules", "data", "uploads", ".dockerignore"}


# ================================================================
# SSH 连接（带重试，服务器偶发 banner 超时）
# ================================================================
def _load_key(path):
    """按密钥类型选择 paramiko 解析器（ed25519 / rsa / ecdsa）。"""
    import paramiko as pm
    for loader in (pm.Ed25519Key, pm.RSAKey, pm.ECDSAKey):
        try:
            return loader.from_private_key_file(path)
        except Exception:
            continue
    return None


def _proxy_sock(host, port, proxy_url, timeout=25):
    """经 HTTP 代理建立到 host:port 的 CONNECT 隧道，返回已连通的 socket。

    使用场景：某些网络到服务器的路由被阻断（本机 TCP 22/443 全超时），
    但本机代理节点可达服务器。设置 SSH_PROXY 即可全程走隧道。

    注意两点：
    1) CONNECT 一律使用 IP，不传域名 —— 代理侧 DNS 可能返回 fake-ip，
       而该 fake 地址并不对应真实服务器，会直接连不上。
    2) 响应头逐字节读取，避免多读到紧随其后的 SSH banner（paramiko 会等待它而挂死）。
    """
    from urllib.parse import urlsplit
    import socket

    u = urlsplit(proxy_url if "://" in proxy_url else "http://" + proxy_url)
    s = socket.create_connection((u.hostname, u.port or 8080), timeout=timeout)
    s.settimeout(timeout)
    s.sendall(("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n\r\n"
               % (host, port, host, port)).encode())

    buf = b""
    while not buf.endswith(b"\r\n\r\n") and len(buf) < 8192:
        ch = s.recv(1)
        if not ch:
            break
        buf += ch
    if b" 200 " not in buf.split(b"\r\n", 1)[0]:
        s.close()
        raise OSError("proxy CONNECT rejected: %s"
                      % buf.split(b"\r\n", 1)[0].decode("latin-1", "replace"))
    return s


def connect():
    # 认证顺序：SSHPASS 密码 -> SSH 密钥（默认 ~/.ssh/id_ed25519，可用 SSH_KEY 覆盖）
    password = os.environ.get("SSHPASS")
    key_path = os.environ.get("SSH_KEY") or os.path.expanduser("~/.ssh/id_ed25519")
    pkey = _load_key(key_path) if os.path.exists(key_path) else None
    proxy = os.environ.get("SSH_PROXY")
    assert password or pkey, "SSHPASS env var or a usable SSH key is required"

    for attempt in range(5):
        try:
            sock = _proxy_sock(HOST, 22, proxy) if proxy else None
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            # 没有 SSHPASS 时直接走密钥，否则 paramiko 会因无可用认证方式抛 SSHException
            # 注意：不要传 look_for_keys=False / allow_agent=False —— paramiko 5.x 下
            # 这两个参数同时为 False 会导致 pkey 认证被服务端拒绝（AuthenticationException）。
            if password:
                try:
                    c.connect(HOST, 22, username="root", password=password,
                              timeout=25, banner_timeout=40, sock=sock)
                    return c
                except Exception as e:
                    if not pkey:
                        raise
                    print("password auth failed (%s), falling back to SSH key: %s"
                          % (type(e).__name__, key_path))
                    if proxy:
                        sock = _proxy_sock(HOST, 22, proxy)
            c.connect(HOST, 22, username="root", pkey=pkey, timeout=25,
                      banner_timeout=40, sock=sock)
            return c
        except Exception as e:
            print("connect attempt %d failed: %s" % (attempt + 1, type(e).__name__))
            try:
                c.close()
            except Exception:
                pass
            time.sleep(3)
    raise SystemExit("SSH connect failed")


def run(c, cmd, check=True, timeout=120):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode(errors="replace")
    e = err.read().decode(errors="replace")
    code = out.channel.recv_exit_status()
    print(">>> " + cmd)
    if o.strip():
        print(o.rstrip())
    if e.strip():
        print("[STDERR]", e.rstrip())
    if check and code != 0:
        raise SystemExit("FAILED (%s): %s" % (code, cmd))
    return code


def sftp_upload_dir(c, local, remote):
    sftp = c.open_sftp()

    def mkdirs(d):
        cur = ""
        for p in d.split("/"):
            if not p:
                continue
            cur += "/" + p
            try:
                sftp.stat(cur)
            except IOError:
                sftp.mkdir(cur)

    def up(local_dir, remote_dir):
        mkdirs(remote_dir)
        for item in sorted(os.listdir(local_dir)):
            # 顶层与嵌套的 node_modules/data/uploads 一律不上传（体积大且属运行期数据）
            if item in EXCLUDE:
                print("skipped ->", posixpath.join(remote_dir, item))
                continue
            lp = os.path.join(local_dir, item)
            rp = posixpath.join(remote_dir, item)
            if os.path.isdir(lp):
                up(lp, rp)
            else:
                sftp.put(lp, rp)
                print("uploaded ->", rp)

    up(local, remote)
    sftp.close()


# ================================================================
# nginx seadoo.conf（权威版本：HTTPS + gzip + upstream + 安全头 + 缓存策略）
#
# 【务必遵守】此常量必须与服务器上的实际内容保持一致。
# 2026-09-23 发现二者已经分叉：本地常量还是「双域名 seatoys+seadoo + 双 SAN 证书」的
# 旧方案，服务器上则是「单域名 seadoo + 错误拼写 aaast- 301」。此时执行 `deploy.py conf`
# 会因 seatoys 证书文件不存在导致 nginx -t 失败并回滚 —— 表现为「命令成功但配置没变」。
# 修改顺序：先改这里，再 `deploy.py conf`；不要直接改服务器上的文件。
#
# 文件名为历史遗留（早期叫 seadoo），改名会与服务器旧文件并存，故保留。
# ================================================================

# ---- 安全响应头（单一来源，防止多处漏改）----
# nginx 的 add_header **不与上层合并**：当前层只要出现一条 add_header，
# 上层（server 级）的所有 add_header 都会被丢弃。因此凡是自带 add_header 的
# location，都必须把这些头再声明一遍（见下方 @@SEC8@@ 占位）。
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self'; "
    "img-src 'self' data: https:; "
    "media-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'self'; "
    "form-action 'self'"
)

_SECURITY_HEADERS = (
    'X-Frame-Options "SAMEORIGIN"',
    'X-Content-Type-Options "nosniff"',
    'X-XSS-Protection "1; mode=block"',
    'Referrer-Policy "strict-origin-when-cross-origin"',
    'Permissions-Policy "camera=(), microphone=(), geolocation=()"',
    'Content-Security-Policy "' + _CSP + '"',
)


def _security_headers(indent):
    pad = " " * indent
    return "\n".join(pad + "add_header " + h + " always;" for h in _SECURITY_HEADERS)


SEADOO_CONF = """# ============================================
# seadoo.aaatslydaaa.ru — DY_RIDE 前端站点 + CMS API
# HTTPS（Let's Encrypt，cron 每日续期）；错误拼写 aaast- 301 到规范域名
# ============================================

upstream seadoo_api {
    server seadoo-api:8080 max_fails=3 fail_timeout=30s;
}

# HTTP: 错误拼写 aaast- -> 规范域名 HTTPS
server {
    listen 80;
    server_name seadoo.aaastlydaaa.ru;
    return 301 https://seadoo.aaatslydaaa.ru$request_uri;
}

# HTTP: 规范域名 -> HTTPS（保留 acme 验证路径）
server {
    listen 80;
    server_name seadoo.aaatslydaaa.ru;

    # Let's Encrypt HTTP-01 验证
    location ^~ /.well-known/acme-challenge/ {
        root /opt/certbot-webroot;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 主配置
server {
    listen 443 ssl;
    http2 on;
    server_name seadoo.aaatslydaaa.ru;

    ssl_certificate /etc/letsencrypt/live/seadoo.aaatslydaaa.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seadoo.aaatslydaaa.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SeadooSSL:10m;
    ssl_session_timeout 10m;

    root /usr/share/nginx/seadoo;
    index index.html;

    # gzip（JS/CSS/JSON/SVG；含代理的 API JSON）
    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml application/manifest+json;

    # 安全响应头（server 级基线）
@@SEC4@@

    # HTML 壳：必须每次回源校验。
    # 若允许浏览器缓存 HTML，部署后用户仍会拿到旧 HTML，而旧 HTML 引用的是
    # 已被清空的旧 hash 资源 —— 表现为整页白屏。expires -1 会发出
    # Cache-Control: no-cache（注意它不属 add_header，故仍可继承上面的安全头）。
    location = /index.html {
        expires -1;
    }

    # 公共接口（商品/设置）：允许携带 ETag 的条件请求返回 304，
    # 在高延迟链路下把重复传输从「数 KB」降到「几百字节」。
    # no-cache 语义为「可存储但每次必须回源校验」，不会读到脏数据。
    location ^~ /api/ {
        proxy_pass http://seadoo_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        client_max_body_size 25m;
        expires -1;
    }

    # 后台接口（含登录与询盘）：绝不落盘
    location ^~ /api/admin/ {
        proxy_pass http://seadoo_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        client_max_body_size 25m;
        add_header Cache-Control "no-store" always;
@@SEC8@@
    }

    # 后台上传的图片/视频（nginx 直接静态服务）
    # 此前同时写了 expires 与 add_header Cache-Control，会发出**两个** Cache-Control
    # 响应头（浏览器行为未定义）。这里统一为单条显式声明。
    location ^~ /uploads/ {
        alias /usr/share/nginx/seadoo-uploads/;
        add_header Cache-Control "public, max-age=2592000, immutable" always;
@@SEC8@@
        try_files $uri =404;
    }

    # React Router history 模式回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源（含自托管字体 woff2）：一年不可变缓存。
    # 文件名带内容 hash（字体为固定文件名，改动时需同步改 URL 或在部署时清理）。
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|avif|woff|woff2|ttf|eot)$ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
@@SEC8@@
        try_files $uri =404;
    }

    access_log /var/log/nginx/seadoo-access.log main;
    error_log /var/log/nginx/seadoo-error.log warn;
}
""".replace("@@SEC4@@", _security_headers(4)).replace("@@SEC8@@", _security_headers(8))


NGINX_CONF_PATH = "/nginx/conf.d/seadoo.conf"


def nginx_test(c):
    """执行 nginx -t，返回 (是否通过, 输出)。

    不经管道：`nginx -t | tail -1` 的退出码来自 tail，会掩盖真实失败，
    导致校验不通过仍继续 reload。此处用 exec_command 直接取真实退出码。
    """
    _, out, _ = c.exec_command("docker exec aaatslydaaa-nginx nginx -t 2>&1", timeout=120)
    text = out.read().decode(errors="replace")
    rc = out.channel.recv_exit_status()
    print(">>> nginx -t")
    print(text.rstrip() or "(no output)")
    return rc == 0, text


def apply_conf(c):
    """事务式应用 nginx conf：备份 → 写入 → nginx -t 校验 → 通过才 reload。

    该容器同时承载 aaatslydaaa.ru 主站，坏配置会让整个网关不可用，
    因此校验失败一律回滚到上一版并中止，绝不留半成品配置。
    """
    backup = NGINX_CONF_PATH + ".prev"
    run(c, "cp -a %s %s 2>/dev/null || true" % (REMOTE + NGINX_CONF_PATH, REMOTE + backup),
        check=False)
    sftp = c.open_sftp()
    with sftp.open(REMOTE + NGINX_CONF_PATH, "w") as f:
        f.write(SEADOO_CONF)
    sftp.close()
    print("written seadoo.conf")

    ok, _ = nginx_test(c)
    if not ok:
        run(c, "cp -a %s %s" % (REMOTE + backup, REMOTE + NGINX_CONF_PATH), check=False)
        raise SystemExit("FAILED: nginx -t 未通过，已回滚 seadoo.conf；未 reload，线上服务未受影响")
    run(c, "docker exec aaatslydaaa-nginx nginx -s reload && echo RELOAD_OK")


# ================================================================
# 证书引导：为规范域名签发 Let's Encrypt 证书
# ================================================================
# 引导顺序问题：nginx 在解析配置时就会校验 ssl_certificate 指向的文件，
# 因此「引用 seatoys 证书的 vhost」必须先等证书存在 —— 否则 nginx -t 失败、
# reload 不生效，而该容器同时承载 aaatslydaaa.ru 主站，风险面很大。
# 解决方式：先写入一个只含 acme 路径的临时 vhost（不引用证书，可安全 reload），
# 用它通过 HTTP-01 校验签发证书；签发成功→删除临时文件→应用完整配置。
ACME_BOOTSTRAP_PATH = "/nginx/conf.d/zz-acme-bootstrap.conf"
ACME_BOOTSTRAP_CONF = """# 临时文件：seatoys 证书 HTTP-01 引导，签发完成后由 deploy.py cert 自动删除
# 只声明 seatoys：seadoo 的 HTTP-01 已由现存的 seadoo.conf 提供；
# 此处若一并声明 seadoo 会触发 nginx "conflicting server name" 告警。
server {
    listen 80;
    server_name seatoys.aaatslydaaa.ru;

    location ^~ /.well-known/acme-challenge/ {
        root /opt/certbot-webroot;
        default_type text/plain;
    }

    location / {
        return 301 https://seadoo.aaatslydaaa.ru$request_uri;
    }
}
"""

# 一张证书覆盖两个域名（SAN）：双域名同为规范服务，共用一份站点配置
CERTBOT_CMD = (
    "docker run --rm "
    "-v /opt/certbot/etc:/etc/letsencrypt "
    "-v /opt/certbot/var:/var/lib/letsencrypt "
    "-v %s/certbot-webroot:/webroot "
    "certbot/certbot certonly --webroot -w /webroot "
    "--cert-name seatoys.aaatslydaaa.ru "
    "-d seatoys.aaatslydaaa.ru -d seadoo.aaatslydaaa.ru "
    "--key-type ecdsa --non-interactive --agree-tos --keep-until-expiring"
) % REMOTE


def cmd_cert(c):
    print("=== 引导 seatoys 双域名 Let's Encrypt 证书 ===")
    sftp = c.open_sftp()
    with sftp.open(REMOTE + ACME_BOOTSTRAP_PATH, "w") as f:
        f.write(ACME_BOOTSTRAP_CONF)
    sftp.close()
    print("written", ACME_BOOTSTRAP_PATH)
    ok, _ = nginx_test(c)
    if not ok:
        run(c, "rm -f %s%s" % (REMOTE, ACME_BOOTSTRAP_PATH), check=False)
        raise SystemExit("FAILED: acme 引导配置未通过 nginx -t，已清理临时文件")
    run(c, "docker exec aaatslydaaa-nginx nginx -s reload && echo RELOAD_OK")
    try:
        run(c, CERTBOT_CMD, timeout=300)
    finally:
        # 无论签发成功与否都清理临时 vhost，避免与 seadoo.conf 的 seatoys 块重复声明
        run(c, "rm -f %s%s && echo BOOTSTRAP_REMOVED" % (REMOTE, ACME_BOOTSTRAP_PATH),
            check=False)
    # 仅在签发成功后应用引用该证书的完整配置
    apply_conf(c)
    # 核对证书实际覆盖的域名（SAN），双域名共用此证书，务必确认两个都在
    run(c, "docker run --rm -v /opt/certbot/etc:/etc/letsencrypt:ro "
           "--entrypoint openssl certbot/certbot "
           "x509 -in /etc/letsencrypt/live/seatoys.aaatslydaaa.ru/fullchain.pem "
           "-noout -subject -dates -ext subjectAltName", check=False)


# ================================================================
# docker-compose 归一化（幂等）：移除 version、补 seadoo-api + healthcheck + nginx uploads 挂载
# ================================================================
SEADOO_SVC = """  # ========================================
  # Sea-Doo 目录 CMS API (Node.js + JSON)
  # ========================================
  seadoo-api:
    build: ./seadoo-api
    container_name: seadoo-api
    restart: unless-stopped
    environment:
      ADMIN_PASSWORD: ${SEADOO_ADMIN_PASSWORD:?SEADOO_ADMIN_PASSWORD is required}
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    volumes:
      - /opt/aaatslydaaa/seadoo-api/data:/app/data
      - /opt/aaatslydaaa/seadoo-api/uploads:/app/uploads
    networks:
      - aaatslydaaa-network

"""

NGINX_VOL_ANCHOR = "      # Sea-Doo 子域名静态文件\n      - /opt/aaatslydaaa/seadoo/dist:/usr/share/nginx/seadoo:ro"
NGINX_VOL_ADD = "\n      # Sea-Doo 上传图片（nginx 直接静态服务）\n      - /opt/aaatslydaaa/seadoo-api/uploads:/usr/share/nginx/seadoo-uploads:ro"


def normalize_compose(data):
    # 1) 移除废弃的 version 字段
    data = re.sub(r"(?m)^version:\s*['\"][^'\"]+['\"]\s*\n", "", data)
    # 2) seadoo-api service（缺则插入到 nginx 块之前）
    anchor = "  # ========================================\n  # Nginx 反向代理 + 前端静态服务"
    if "seadoo-api:" not in data:
        assert anchor in data, "nginx anchor not found!"
        data = data.replace(anchor, SEADOO_SVC + anchor, 1)
        print("compose: seadoo-api service added")
    else:
        # 3) healthcheck（缺则补到 service 块内 volumes 之前）
        m = re.search(r"(  seadoo-api:\n)(.*?)(?=\n  [a-z]|^networks:)", data, re.S)
        if m and "healthcheck" not in m.group(2):
            block = m.group(2)
            hc = (
                "    healthcheck:\n"
                "      test: [\"CMD\", \"wget\", \"-q\", \"-O\", \"/dev/null\", \"http://localhost:8080/api/health\"]\n"
                "      interval: 30s\n"
                "      timeout: 5s\n"
                "      retries: 3\n"
                "      start_period: 10s\n"
            )
            block = block.replace("    volumes:\n", hc + "    volumes:\n", 1)
            data = data[: m.start(2)] + block + data[m.end(2):]
            print("compose: healthcheck added")
    # 4) nginx uploads 挂载（缺则补）
    if "seadoo-api/uploads:/usr/share/nginx/seadoo-uploads" not in data:
        assert NGINX_VOL_ANCHOR in data, "nginx volume anchor not found!"
        data = data.replace(NGINX_VOL_ANCHOR, NGINX_VOL_ANCHOR + NGINX_VOL_ADD, 1)
        print("compose: nginx uploads volume added")
    return data


def apply_compose(c):
    run(c, "cp %s/docker-compose.yml %s/docker-compose.yml.bak-$(date +%%Y%%m%%d%%H%%M%%S)" % (REMOTE, REMOTE))
    sftp = c.open_sftp()
    with sftp.open(REMOTE + "/docker-compose.yml", "r") as f:
        data = f.read().decode()
    new_data = normalize_compose(data)
    if new_data != data:
        with sftp.open(REMOTE + "/docker-compose.yml", "w") as f:
            f.write(new_data)
        print("docker-compose.yml updated")
    else:
        print("docker-compose.yml unchanged")
    sftp.close()
    run(c, "cd %s && docker compose config -q && echo COMPOSE_OK" % REMOTE)


# ================================================================
# 子命令
# ================================================================
def cmd_front(c):
    print("=== 清空远端 assets 并上传前端 dist ===")
    run(c, "mkdir -p %s/seadoo/dist && rm -f %s/seadoo/dist/assets/*" % (REMOTE, REMOTE))
    sftp_upload_dir(c, LOCAL_DIST, REMOTE + "/seadoo/dist")


def cmd_api(c):
    admin_pw = os.environ.get("SEADOO_ADMIN_PASSWORD")
    assert admin_pw, "SEADOO_ADMIN_PASSWORD env var required"
    print("=== 上传 server/ ===")
    sftp_upload_dir(c, LOCAL_SERVER, REMOTE + "/seadoo-api")
    print("=== .env 注入 SEADOO_ADMIN_PASSWORD ===")
    sftp = c.open_sftp()
    try:
        with sftp.open(REMOTE + "/.env", "r") as f:
            env = f.read().decode()
    except IOError:
        env = ""
    if "SEADOO_ADMIN_PASSWORD" in env:
        print("SEADOO_ADMIN_PASSWORD already present, skip")
    else:
        env = env.rstrip("\n") + ("\n" if env.strip() else "") + "SEADOO_ADMIN_PASSWORD=" + admin_pw + "\n"
        with sftp.open(REMOTE + "/.env", "w") as f:
            f.write(env)
        print(".env updated")
    sftp.close()
    apply_compose(c)
    run(c, "chown -R 1000:1000 %s/seadoo-api/data %s/seadoo-api/uploads" % (REMOTE, REMOTE))
    print("=== 构建并启动 seadoo-api ===")
    run(c, "cd %s && docker compose up -d --build seadoo-api 2>&1 | tail -6" % REMOTE)
    apply_conf(c)
    run(c, "docker ps --filter name=seadoo-api --format '{{.Names}} {{.Status}}'")


def cmd_conf(c):
    apply_conf(c)


def cmd_verify_https(c):
    # 单域名直接服务；同时验证错误拼写域名 301、缓存策略、自托管字体与证书 SAN。
    # （旧版本检查的是已下线的 seatoys 域名与不存在的证书路径，恒为失败。）
    cmd = r'''
B=https://seadoo.aaatslydaaa.ru
SLUG=$(curl -s $B/api/products | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p' | head -1)
echo "=== $B（首个商品 slug: $SLUG）"
for p in / /inventory/$SLUG /admin /api/health /sitemap.xml /robots.txt /fonts/inter-v20-cyrillic.woff2; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" $B$p
done
echo '=== 关键响应头 ==='
curl -s -o /dev/null -D - $B/ | grep -iE '^(cache-control|content-security-policy)' | cut -c1-100
echo -n 'font  : '; curl -s -o /dev/null -D - $B/fonts/inter-v20-cyrillic.woff2 | grep -i '^cache-control'
echo -n 'api   : '; curl -s -o /dev/null -D - $B/api/settings | grep -iE '^(cache-control|etag)'
echo '=== 首屏是否仍依赖外部字体 CDN（应为 0；匹配的是服务端返回的 HTML，含注释）==='
curl -s $B/ | grep -c 'googleapis'
echo '=== 错误拼写域名 301（该域名在 nic.ru 无 DNS 记录，故用 Host 头直连 127.0.0.1 验证规则本身）==='
curl -s -o /dev/null -w "aaast(Host) -> %{http_code} -> %{redirect_url}\n" -H 'Host: seadoo.aaastlydaaa.ru' http://127.0.0.1/
echo '=== HTTP -> HTTPS 301 ==='
for p in / /admin /api/health; do
  curl -s -o /dev/null -w "$p -> %{http_code} -> %{redirect_url}\n" http://seadoo.aaatslydaaa.ru$p
done
echo '=== 证书 SAN ==='
docker run --rm -v /opt/certbot/etc:/etc/letsencrypt:ro --entrypoint openssl certbot/certbot x509 -in /etc/letsencrypt/live/seadoo.aaatslydaaa.ru/fullchain.pem -noout -dates -ext subjectAltName
'''
    run(c, cmd, check=False)


def cmd_verify_site(c):
    cmd = r'''
echo '=== DNS ==='
for d in seatoys.aaatslydaaa.ru seadoo.aaatslydaaa.ru; do
  echo -n "$d -> "
  getent hosts $d || echo 'NO RECORD'
done
echo '=== vhost (Host header) ==='
for d in seatoys.aaatslydaaa.ru seadoo.aaatslydaaa.ru; do
  curl -s -o /dev/null -w "$d -> %{http_code}\n" -H "Host: $d" http://localhost/
done
echo '=== 证书目录 ==='
docker exec aaatslydaaa-nginx ls /etc/letsencrypt/live/ 2>/dev/null
echo '=== 主站 ==='
curl -s -o /dev/null -w 'main -> %{http_code}\n' -H 'Host: aaatslydaaa.ru' http://localhost/
'''
    run(c, cmd, check=False)


def main():
    parser = argparse.ArgumentParser(description="Sea-Doo 部署工具")
    parser.add_argument("cmd", choices=["front", "api", "conf", "cert", "verify-https", "verify-site"])
    args = parser.parse_args()

    c = connect()
    try:
        {"front": cmd_front, "api": cmd_api, "conf": cmd_conf, "cert": cmd_cert,
         "verify-https": cmd_verify_https, "verify-site": cmd_verify_site}[args.cmd](c)
    finally:
        c.close()
    print("=== DONE ===")


if __name__ == "__main__":
    sys.exit(main())
