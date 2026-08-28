import os
import paramiko
import time

host = "170.168.89.127"
password = os.environ["SSHPASS"]

c = None
for attempt in range(5):
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(host, 22, username="root", password=password, timeout=25, banner_timeout=40, look_for_keys=False, allow_agent=False)
        break
    except Exception as e:
        print("conn attempt %d: %s" % (attempt + 1, type(e).__name__))
        time.sleep(3)
if not c:
    raise SystemExit("connect failed")

cmd = r'''
B=https://seadoo.aaatslydaaa.ru
echo '=== HTTPS 全链路 ==='
for p in / /inventory/rxt-x-rs-300-2023 /admin /api/health /uploads/e40bf07571c426c3e2f297fc00cea830.mp4; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" $B$p
done
echo '=== 首页引用 JS ==='
curl -s $B/ | grep -o '/assets/index-[^"]*\.js'
echo '=== 详情页 title（slug 路由正常）==='
curl -s $B/inventory/gtx-limited-300-2022 | grep -o '<title>[^<]*</title>'
echo '=== HTTP 全部 301 ==='
for p in / /admin /api/health; do
  curl -s -o /dev/null -w "$p -> %{http_code} -> %{redirect_url}\n" http://seadoo.aaatslydaaa.ru$p
done
echo '=== 商品 API 数量 ==='
curl -s $B/api/products | grep -o '"slug"' | wc -l
echo '=== 主站 ==='
curl -s -o /dev/null -w 'main http: %{http_code}\n' -H 'Host: aaatslydaaa.ru' http://localhost/
'''

_, out, err = c.exec_command(cmd, timeout=90)
print(out.read().decode(errors="replace"))
e = err.read().decode(errors="replace")
if e.strip():
    print("[STDERR]", e)
c.close()
print("=== DONE ===")
