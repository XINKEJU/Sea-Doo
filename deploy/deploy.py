#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sea-Doo 部署工具（单一脚本，替代旧的 deploy_seadoo.py / deploy_seadoo_api.py / verify_*.py）

用法（密码只从环境变量读取）:
  SSHPASS='<服务器密码>' python deploy/deploy.py front          # 上传前端 dist/
  SSHPASS='<服务器密码>' SEADOO_ADMIN_PASSWORD='<后台密码>' python deploy/deploy.py api
                                                               # 后端：server 上传 + compose 归一化 + 容器重建 + nginx conf
  SSHPASS='<服务器密码>' python deploy/deploy.py conf          # 仅应用 nginx seadoo.conf + reload
  SSHPASS='<服务器密码>' python deploy/deploy.py verify-https  # HTTPS 全链路验证
  SSHPASS='<服务器密码>' python deploy/deploy.py verify-site   # 站点 vhost/DNS 验证
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
def connect():
    password = os.environ.get("SSHPASS")
    assert password, "SSHPASS env var required"
    c = None
    for attempt in range(5):
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, 22, username="root", password=password, timeout=25, banner_timeout=40, look_for_keys=False, allow_agent=False)
            return c
        except Exception as e:
            print("connect attempt %d failed: %s" % (attempt + 1, type(e).__name__))
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
# nginx seadoo.conf（权威版本：HTTPS + gzip + upstream + CSP）
# ================================================================
SEADOO_CONF = """# ============================================
# seadoo.aaatslydaaa.ru - Sea-Doo 前端站点 + CMS API
# HTTPS（Let's Encrypt，cron 每日续期）；s-t 拼写 301 到规范域名
# ============================================

upstream seadoo_api {
    server seadoo-api:8080 max_fails=3 fail_timeout=30s;
}

# HTTP: s-t 错误拼写 -> 规范域名 HTTPS
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
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

    # 安全响应头（全站）
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'" always;

    # Sea-Doo CMS API 反向代理（^~ 防止被下方正则 location 覆盖）
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
        # API 响应禁止缓存
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

    # 后台上传的图片/视频（nginx 直接静态服务）
    location ^~ /uploads/ {
        alias /usr/share/nginx/seadoo-uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # React Router history 模式回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    access_log /var/log/nginx/seadoo-access.log main;
    error_log /var/log/nginx/seadoo-error.log warn;
}
"""


def apply_conf(c):
    sftp = c.open_sftp()
    with sftp.open(REMOTE + "/nginx/conf.d/seadoo.conf", "w") as f:
        f.write(SEADOO_CONF)
    sftp.close()
    print("written seadoo.conf")
    run(c, "docker exec aaatslydaaa-nginx nginx -t 2>&1 | tail -1")
    run(c, "docker exec aaatslydaaa-nginx nginx -s reload && echo RELOAD_OK")


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
    cmd = r'''
B=https://seadoo.aaatslydaaa.ru
for p in / /inventory/rxt-x-rs-300-2023 /admin /api/health /uploads/e40bf07571c426c3e2f297fc00cea830.mp4; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" $B$p
done
for p in / /admin /api/health; do
  curl -s -o /dev/null -w "http$p -> %{http_code} -> %{redirect_url}\n" http://seadoo.aaatslydaaa.ru$p
done
curl -s $B/ | grep -o '/assets/index-[^"]*\.js'
'''
    run(c, cmd, check=False)


def cmd_verify_site(c):
    cmd = r'''
echo '=== DNS ==='
for d in seadoo.aaatslydaaa.ru seadoo.aaastlydaaa.ru; do
  echo -n "$d -> "
  getent hosts $d || echo 'NO RECORD'
done
echo '=== vhost (Host header) ==='
for d in seadoo.aaatslydaaa.ru seadoo.aaastlydaaa.ru; do
  curl -s -o /dev/null -w "$d -> %{http_code}\n" -H "Host: $d" http://localhost/
done
echo '=== 主站 ==='
curl -s -o /dev/null -w 'main -> %{http_code}\n' -H 'Host: aaatslydaaa.ru' http://localhost/
'''
    run(c, cmd, check=False)


def main():
    parser = argparse.ArgumentParser(description="Sea-Doo 部署工具")
    parser.add_argument("cmd", choices=["front", "api", "conf", "verify-https", "verify-site"])
    args = parser.parse_args()

    c = connect()
    try:
        {"front": cmd_front, "api": cmd_api, "conf": cmd_conf,
         "verify-https": cmd_verify_https, "verify-site": cmd_verify_site}[args.cmd](c)
    finally:
        c.close()
    print("=== DONE ===")


if __name__ == "__main__":
    sys.exit(main())
