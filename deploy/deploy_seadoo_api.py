import os
import posixpath
import paramiko

host = "170.168.89.127"
password = os.environ.get("SSHPASS")
admin_pw = os.environ.get("SEADOO_ADMIN_PASSWORD")
assert password and admin_pw, "SSHPASS and SEADOO_ADMIN_PASSWORD env vars required"
REMOTE = "/opt/aaatslydaaa"
BASE = os.path.dirname(os.path.abspath(__file__))
LOCAL_SERVER = os.path.join(BASE, "..", "server")
EXCLUDE = {"node_modules", "data", "uploads", ".dockerignore"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, 22, username="root", password=password, timeout=20, banner_timeout=30, look_for_keys=False, allow_agent=False)

def run(cmd, check=True):
    _, out, err = c.exec_command(cmd)
    o = out.read().decode()
    e = err.read().decode()
    code = out.channel.recv_exit_status()
    print(">>> " + cmd)
    if o.strip():
        print(o.rstrip())
    if e.strip():
        print("[STDERR]", e.rstrip())
    if check and code != 0:
        raise SystemExit("FAILED (%s): %s" % (code, cmd))
    return code

# ---------- 1. 上传 server/ ----------
sftp = c.open_sftp()
def mkdirs(remote_dir):
    parts = remote_dir.replace("\\", "/").split("/")
    cur = ""
    for p in parts:
        if not p:
            continue
        cur += "/" + p
        try:
            sftp.stat(cur)
        except IOError:
            sftp.mkdir(cur)

def upload_dir(local, remote):
    mkdirs(remote)
    for item in sorted(os.listdir(local)):
        if item in EXCLUDE:
            continue
        lp = os.path.join(local, item)
        rp = posixpath.join(remote, item)
        if os.path.isdir(lp):
            upload_dir(lp, rp)
        else:
            sftp.put(lp, rp)
            print("uploaded ->", rp)

print("=== 上传 server/ ===")
upload_dir(LOCAL_SERVER, REMOTE + "/seadoo-api")
sftp.close()

# ---------- 2. .env 注入 SEADOO_ADMIN_PASSWORD ----------
print("=== .env ===")
sftp = c.open_sftp()
env_path = REMOTE + "/.env"
try:
    with sftp.open(env_path, "r") as f:
        env = f.read().decode()
except IOError:
    env = ""
if "SEADOO_ADMIN_PASSWORD" in env:
    print("SEADOO_ADMIN_PASSWORD already present, skip")
else:
    env = env.rstrip("\n") + ("\n" if env.strip() else "") + "SEADOO_ADMIN_PASSWORD=" + admin_pw + "\n"
    with sftp.open(env_path, "w") as f:
        f.write(env)
    print(".env updated (SEADOO_ADMIN_PASSWORD set)")
sftp.close()

# ---------- 3. docker-compose.yml 加 seadoo-api ----------
print("=== docker-compose.yml ===")
run("cp %s/docker-compose.yml %s/docker-compose.yml.bak-$(date +%%Y%%m%%d%%H%%M%%S)" % (REMOTE, REMOTE))
sftp = c.open_sftp()
compose_path = REMOTE + "/docker-compose.yml"
with sftp.open(compose_path, "r") as f:
    data = f.read().decode()

SEADOO_SVC = """  # ========================================
  # Sea-Doo 目录 CMS API (Node.js + JSON)
  # ========================================
  seadoo-api:
    build: ./seadoo-api
    container_name: seadoo-api
    restart: unless-stopped
    environment:
      ADMIN_PASSWORD: ${SEADOO_ADMIN_PASSWORD:?SEADOO_ADMIN_PASSWORD is required}
    volumes:
      - /opt/aaatslydaaa/seadoo-api/data:/app/data
      - /opt/aaatslydaaa/seadoo-api/uploads:/app/uploads
    networks:
      - aaatslydaaa-network

"""
anchor = "  # ========================================\n  # Nginx 反向代理 + 前端静态服务"
if "seadoo-api" in data:
    print("seadoo-api service already present, skip")
else:
    assert anchor in data, "nginx anchor not found!"
    data = data.replace(anchor, SEADOO_SVC + anchor, 1)
    # nginx volumes 追加 uploads 映射
    nginx_vol_anchor = "      # Sea-Doo 子域名静态文件\n      - /opt/aaatslydaaa/seadoo/dist:/usr/share/nginx/seadoo:ro"
    nginx_vol_add = "\n      # Sea-Doo 上传图片（nginx 直接静态服务）\n      - /opt/aaatslydaaa/seadoo-api/uploads:/usr/share/nginx/seadoo-uploads:ro"
    assert nginx_vol_anchor in data, "nginx volume anchor not found!"
    data = data.replace(nginx_vol_anchor, nginx_vol_anchor + nginx_vol_add, 1)
    with sftp.open(compose_path, "w") as f:
        f.write(data)
    print("docker-compose.yml updated")
sftp.close()

# ---------- 4. seadoo.conf：HTTPS + /api 代理 + /uploads 静态 ----------
print("=== seadoo.conf ===")
SEADOO_CONF = """# ============================================
# seadoo.aaatslydaaa.ru - Sea-Doo 前端站点 + CMS API
# HTTPS（Let's Encrypt，cron 每日续期）；s-t 拼写 301 到规范域名
# ============================================

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

    # 安全响应头（全站）
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'" always;

    # Sea-Doo CMS API 反向代理（^~ 防止被下方正则 location 覆盖）
    location ^~ /api/ {
        proxy_pass http://seadoo-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
sftp = c.open_sftp()
with sftp.open(REMOTE + "/nginx/conf.d/seadoo.conf", "w") as f:
    f.write(SEADOO_CONF)
print("written seadoo.conf")
sftp.close()

# ---------- 5. 应用 ----------
print("=== 校验 compose ===")
run("cd %s && docker compose config -q && echo COMPOSE_OK" % REMOTE)
print("=== 宿主机 data/uploads 属主（非 root 容器写权限）===")
run("chown -R 1000:1000 %s/seadoo-api/data %s/seadoo-api/uploads && ls -ld %s/seadoo-api/data %s/seadoo-api/uploads" % (REMOTE, REMOTE, REMOTE, REMOTE))
print("=== 构建并启动 seadoo-api ===")
run("cd %s && docker compose up -d --build seadoo-api 2>&1 | tail -8" % REMOTE)
print("=== nginx -t + reload ===")
run("docker exec aaatslydaaa-nginx nginx -t 2>&1 | tail -2 && docker exec aaatslydaaa-nginx nginx -s reload && echo RELOAD_OK")
print("=== 容器状态 ===")
run("docker ps --filter name=seadoo-api --filter name=aaatslydaaa-nginx --format '{{.Names}} {{.Status}}'")
c.close()
print("=== DONE ===")
