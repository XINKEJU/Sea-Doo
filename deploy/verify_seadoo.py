import os
import paramiko

host = "170.168.89.127"
password = os.environ.get("SSHPASS")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, 22, username="root", password=password, timeout=12, look_for_keys=False, allow_agent=False)

def run(cmd):
    _, out, err = c.exec_command(cmd)
    o = out.read().decode()
    e = err.read().decode()
    print(">>> " + cmd)
    if o.strip():
        print(o.rstrip())
    if e.strip():
        print("[STDERR]", e.rstrip())

print("=== DNS 解析 ===")
run("getent hosts seadoo.aaastlydaaa.ru || echo 'NO DNS RECORD'")
print("=== 本地 vhost 测试 (Host header) ===")
run("curl -s -o /dev/null -w 'HTTP=%{http_code} time=%{time_total}s\\n' -H 'Host: seadoo.aaastlydaaa.ru' http://localhost/")
run("curl -s -H 'Host: seadoo.aaastlydaaa.ru' http://localhost/ | head -20")
print("=== 公网域名测试 ===")
run("curl -s -o /dev/null -m 10 -w 'HTTP=%{http_code}\\n' http://seadoo.aaastlydaaa.ru/ 2>&1 || echo 'PUBLIC CURL FAILED'")
run("curl -s -m 10 http://seadoo.aaastlydaaa.ru/ 2>&1 | head -8 || echo 'no body'")
print("=== 静态资源 ===")
run("curl -s -o /dev/null -w 'JS HTTP=%{http_code}\\n' -H 'Host: seadoo.aaastlydaaa.ru' http://localhost/assets/index-88bNvKlm.js")
print("=== 主站未受影响 ===")
run("curl -s -o /dev/null -w 'main HTTP=%{http_code}\\n' -H 'Host: aaatslydaaa.ru' http://localhost/")
c.close()
print("=== VERIFY DONE ===")
