import os
import posixpath
import paramiko

host = "170.168.89.127"
password = os.environ.get("SSHPASS")
REMOTE = "/opt/aaatslydaaa"
BASE = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIST = os.path.join(BASE, "..", "dist")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, 22, username="root", password=password, timeout=12, look_for_keys=False, allow_agent=False)

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

# ---------- 1. 上传 dist 到 /opt/aaatslydaaa/seadoo/dist ----------
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
        lp = os.path.join(local, item)
        rp = posixpath.join(remote, item)
        if os.path.isdir(lp):
            upload_dir(lp, rp)
        else:
            sftp.put(lp, rp)
            print("uploaded ->", rp)

print("=== 上传 dist ===")
upload_dir(LOCAL_DIST, REMOTE + "/seadoo/dist")
sftp.close()

# ---------- 2. 写入 seadoo.conf ----------
SEADOO_CONF = """# ============================================
# seadoo.aaatslydaaa.ru - Sea-Doo 前端站点 (HTTP)
# 独立静态站点，与主站 aaatslydaaa.ru 互不影响
# 注意：两个域名拼写都要配（aaatslydaaa=t-s 正确，aaastlydaaa=s-t 用户习惯拼写）
# ============================================
server {
    listen 80;
    server_name seadoo.aaatslydaaa.ru seadoo.aaastlydaaa.ru;

    root /usr/share/nginx/seadoo;
    index index.html;

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

    # 安全 Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    access_log /var/log/nginx/seadoo-access.log main;
    error_log /var/log/nginx/seadoo-error.log warn;
}
"""
print("=== 写入 seadoo.conf ===")
sftp = c.open_sftp()
with sftp.open(REMOTE + "/nginx/conf.d/seadoo.conf", "w") as f:
    f.write(SEADOO_CONF)
print("written seadoo.conf")
sftp.close()

# ---------- 3. docker-compose.yml 加挂载（先备份） ----------
print("=== 修改 docker-compose.yml ===")
run("cp %s/docker-compose.yml %s/docker-compose.yml.bak-$(date +%%Y%%m%%d%%H%%M%%S) && ls -la %s/docker-compose.yml* | tail -3" % (REMOTE, REMOTE, REMOTE))
sftp = c.open_sftp()
compose_path = REMOTE + "/docker-compose.yml"
with sftp.open(compose_path, "r") as f:
    data = f.read().decode()
anchor = "      - ./aaatslydaaa-frontend/dist:/usr/share/nginx/html:ro"
add_line = "      # Sea-Doo 子域名静态文件\n      - /opt/aaatslydaaa/seadoo/dist:/usr/share/nginx/seadoo:ro"
if "seadoo/dist:/usr/share/nginx/seadoo" in data:
    print("volume already present, skip")
else:
    assert anchor in data, "anchor not found in docker-compose.yml!"
    data = data.replace(anchor, anchor + "\n" + add_line, 1)
    with sftp.open(compose_path, "w") as f:
        f.write(data)
    print("docker-compose.yml updated")
sftp.close()

# ---------- 4. 校验并重载 nginx ----------
print("=== 校验 compose ===")
run("cd %s && docker compose config -q && echo COMPOSE_OK" % REMOTE)
print("=== 重建/重载 nginx 容器 ===")
run("cd %s && docker compose up -d nginx 2>&1 | tail -5" % REMOTE)
print("=== nginx -t ===")
run("docker exec aaatslydaaa-nginx nginx -t 2>&1 | tail -3")
print("=== 容器状态 ===")
run("docker ps --filter name=aaatslydaaa-nginx --format '{{.Names}} {{.Status}} {{.Ports}}'")
c.close()
print("=== DONE ===")
