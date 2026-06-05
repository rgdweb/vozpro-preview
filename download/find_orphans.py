import re
with open('/home/ubuntu/omnivoice/src/app/page.tsx') as f:
    content = f.read()

# Find all setter names used in JSX
setters = set(re.findall(r'set([A-Z][a-zA-Z]*)', content))

orphans = []
for s in sorted(setters):
    # Check if there's a matching useState: const [varName, setVarName] = useState(...)
    useState_pattern = r'\[\s*' + re.escape(s) + r'\s*,\s*set' + re.escape(s) + r'\]'
    # More flexible: look for useState that has the setter
    has_state = bool(re.search(r'const\s*\[\s*\w+\s*,\s*set' + re.escape(s) + r'\s*\]\s*=\s*useState', content))
    
    if not has_state:
        count = len(re.findall(r'set' + re.escape(s), content))
        if count > 0:
            orphans.append(f'set{s} ({count} refs)')

if orphans:
    print('ORPHAN VARIABLES:')
    for o in orphans:
        print(f'  {o}')
else:
    print('NO ORPHANS FOUND')
