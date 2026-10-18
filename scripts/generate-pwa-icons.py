"""Génère les déclinaisons du logo officiel Nethor.

Source vectorielle : assets/icon.svg — même pictogramme que le .ico fourni
(les légères différences d'anticrénelage sont inhérentes au format).
Conserve le dessin, ses couleurs, son orientation et sa transparence.

Usage : python3 scripts/generate-pwa-icons.py [dossier-assets]
Nécessite CairoSVG et Pillow uniquement pour le build.
"""
from io import BytesIO
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon.svg"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "assets")
OUT.mkdir(parents=True, exist_ok=True)
SVG = SOURCE.read_bytes()
root = ET.fromstring(SVG)
if not root.tag.endswith("svg") or "viewBox" not in root.attrib:
    raise SystemExit("Le logo source doit être un SVG valide avec viewBox.")

for size in (16, 32, 48, 180, 192, 256, 512):
    png = cairosvg.svg2png(bytestring=SVG, output_width=size, output_height=size)
    if png[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", png[16:24]) != (size, size):
        raise SystemExit(f"Image invalide {size}x{size}")
    filename = OUT / f"nethor-logo-{size}-v8.png"
    filename.write_bytes(png)
    print(f"Logo officiel Nethor {size}x{size} : {filename}")

# Favicon ICO multirésolution pour navigateurs, Windows et raccourcis.
source_ico = Image.open(BytesIO(cairosvg.svg2png(
    bytestring=SVG, output_width=256, output_height=256
))).convert("RGBA")
favicon = OUT.parent / "favicon.ico"
source_ico.save(favicon, format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(f"Favicon multirésolution : {favicon}")
