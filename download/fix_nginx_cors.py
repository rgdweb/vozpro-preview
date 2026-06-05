import re

with open("/etc/nginx/sites-enabled/omnivoice.conf") as f:
    content = f.read()

if "Access-Control-Allow-Origin" in content:
    print("CORS ALREADY EXISTS")
else:
    cors_block = """    # CORS for voice generation
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Generate-Token" always;
    if ($request_method = OPTIONS) {
        return 204;
    }
"""
    # Insert after client_max_body_size in the api.cvmnews.com.br block
    # Find the pattern: server_name api.cvmnews.com.br; ... client_max_body_size 500M;
    pattern = r"(server_name api\.cvmnews\.com\.br;\s*\n\s*root[^\n]+\n\s*index[^\n]+\n\s*client_max_body_size 500M;)"
    
    match = re.search(pattern, content)
    if match:
        pos = match.end()
        content = content[:pos] + "\n" + cors_block + content[pos:]
        with open("/etc/nginx/sites-enabled/omnivoice.conf", "w") as f:
            f.write(content)
        print("CORS ADDED OK")
    else:
        print("PATTERN NOT FOUND")
        # Debug: show the api.cvmnews section
        idx = content.find("api.cvmnews.com.br")
        if idx >= 0:
            print("CONTEXT:", content[idx:idx+300])
