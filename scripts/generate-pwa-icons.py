"""Exporter les icônes PWA depuis le pictogramme bleu Planning de Nethor.

La source de vérité est assets/icon-planning-pwa.svg, identique à l’onglet Planning.
Les variantes PNG restent des rendus rasterisés de CE fichier ; aucun pictogramme
alternatif ou approximatif n'est dessiné par ce script.

Usage: python3 scripts/generate-pwa-icons.py [dossier-sortie]
Dépendance de génération uniquement: CairoSVG 2.8.2
"""
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET

try:
    import cairosvg
except ImportError as exc:
    raise SystemExit("CairoSVG manque : python3 -m pip install CairoSVG==2.8.2") from exc

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "assets" / "icon-planning-pwa.svg"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "assets")
OUT.mkdir(parents=True, exist_ok=True)

source = LOGO.read_bytes()
svg = ET.fromstring(source)
if not svg.tag.endswith("svg") or not svg.attrib.get("viewBox"):
    raise SystemExit("La source doit être le SVG officiel avec viewBox.")

for size in (180, 192, 512):
    png = cairosvg.svg2png(bytestring=source, output_width=size, output_height=size)
    if png[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", png[16:24]) != (size, size):
        raise SystemExit(f"Échec du rendu SVG vers PNG {size}px")
    dest = OUT / f"icon-{size}-planning-v4.png"
    dest.write_bytes(png)
    print(f"Icône Nethor Planning bleue : {dest.name} ({size}×{size})")
