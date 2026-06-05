import re

f = "/etc/nginx/sites-enabled/omnivoice"
with open(f) as fh:
    c = fh.read()

if "Access-Control-Allow-Origin" in c:
    print("CORS ALREADY EXISTS")
    exit()

cors = """    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Generate-Token" always;
    if ($request_method = OPTIONS) {
        return 204;
    }
"""

p = r'(server_name api\.cvmnews\.com\.br;\s*\n\s*root[^\n]+\n\s*index[^\n]+\n\s*client_max_body_size 500M;)'
m = re.search(p, c)
if m:
    c = c[:m.end()] + '\n' + cors + c[m.end():]
    with open(f, "w") as fh:
        fh.write(c)
    print("CORS ADDED OK")
else:
    print("PATTERN NOT FOUND")
    idx = c.find("api.cvmnews.com.br")
    if idx >= 0:
        print("CONTEXT:", repr(c[idx:idx+300]))
