#!/usr/bin/env python3
from pathlib import Path
import ast
import re
import sys

site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
sw_path = Path(sys.argv[2] if len(sys.argv) > 2 else "sw.js")
text = sw_path.read_text(encoding="utf-8")
match = re.search(r"const\s+SHELL\s*=\s*(\[[\s\S]*?\]);", text)
if not match:
    raise SystemExit("SHELL introuvable dans sw.js")
try:
    shell = ast.literal_eval(match.group(1))
except Exception as exc:
    raise SystemExit(f"SHELL illisible: {exc}")
missing = []
for item in shell:
    if not isinstance(item, str) or not item.startswith("./"):
        raise SystemExit(f"Entrée SHELL invalide: {item!r}")
    rel = item[2:]
    target = site / ("index.html" if rel == "" else rel)
    if not target.is_file():
        missing.append(str(target))
if missing:
    raise SystemExit("Ressources PWA absentes du déploiement:\n- " + "\n- ".join(missing))
print(f"PWA shell vérifié: {len(shell)} ressources présentes.")
