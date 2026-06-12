import os

arquivo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "omnivoice_api.py")

with open(arquivo, "r", encoding="utf-8") as f:
    c = f.read()

# Fix 1: adicionar urllib.request no import do topo (se ainda nao tiver)
if "urllib.request" not in c.split("import numpy")[0]:
    c = c.replace(
        "import numpy as np\n",
        "import numpy as np\nimport urllib.request\n"
    )

# Fix 2: remover import urllib.request dentro da funcao (se ainda tiver)
c = c.replace(
    "    import urllib.request\n    with urllib.request.urlopen(req, timeout=30) as resp:",
    "    with urllib.request.urlopen(req, timeout=30) as resp:"
)

with open(arquivo, "w", encoding="utf-8") as f:
    f.write(c)

print("FIX APLICADO! Reinicie o omnivoice_api.py")