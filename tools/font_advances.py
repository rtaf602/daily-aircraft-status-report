#!/usr/bin/env python3
"""Rebuild fonts/advances.json from the two TTF files (needs: pip install fonttools).

Only needed if the font files are ever replaced. The page uses these advance widths to place
centred and right-aligned text itself (Safari misplaces such Thai text when the canvas aligns it).
"""
import json, os
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fonts")

def adv(name):
    t = TTFont(os.path.join(ROOT, name)); cm = t.getBestCmap(); hm = t["hmtx"].metrics
    assert t["head"].unitsPerEm == 1000
    keep = lambda c: 0x20 <= c <= 0x7E or 0xA0 <= c <= 0xFF or 0x0E00 <= c <= 0x0E7F or 0x2000 <= c <= 0x22FF
    return {str(c): hm[g][0] for c, g in sorted(cm.items()) if keep(c)}

out = json.dumps({"r": adv("THSarabun.ttf"), "b": adv("THSarabun_Bold.ttf")}, separators=(",", ":"))
open(os.path.join(ROOT, "advances.json"), "w").write(out)
print("fonts/advances.json", len(out), "bytes")
