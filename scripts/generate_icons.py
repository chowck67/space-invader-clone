#!/usr/bin/env python3
"""Generate the Pip Patrol app icons.

Writes icons/icon.svg and icons/icon-maskable.svg, then renders the PNG sizes
with headless Chromium via Playwright (optional: pass --svg-only to skip PNGs).

    python3 scripts/generate_icons.py
"""
import asyncio, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

ART = """
  <g id="sparkles" fill="#fff6fd">
    <path d="M84 92l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#ffd96b"/>
    <path d="M436 132l4 11 11 4-11 4-4 11-4-11-11-4 11-4z"/>
    <path d="M66 292l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/>
    <path d="M452 318l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#7cc4ff"/>
    <circle cx="140" cy="40" r="4"/><circle cx="392" cy="52" r="5" fill="#ffd96b"/><circle cx="470" cy="226" r="4"/><circle cx="40" cy="190" r="4" fill="#ffd96b"/>
  </g>
  <g id="critter">
    <g transform="rotate(-14 205 135)"><ellipse cx="205" cy="105" rx="27" ry="68" fill="#e0559a"/><ellipse cx="205" cy="108" rx="14" ry="48" fill="#ffc7df"/></g>
    <g transform="rotate(14 307 135)"><ellipse cx="307" cy="105" rx="27" ry="68" fill="#e0559a"/><ellipse cx="307" cy="108" rx="14" ry="48" fill="#ffc7df"/></g>
    <ellipse cx="210" cy="330" rx="30" ry="15" fill="#e0559a"/><ellipse cx="302" cy="330" rx="30" ry="15" fill="#e0559a"/>
    <ellipse cx="256" cy="225" rx="122" ry="104" fill="#ff7eb6"/>
    <ellipse cx="256" cy="278" rx="86" ry="46" fill="#fff" opacity=".25"/>
    <circle cx="208" cy="212" r="31" fill="#fff"/><circle cx="304" cy="212" r="31" fill="#fff"/>
    <circle cx="215" cy="217" r="17" fill="#2b1f5e"/><circle cx="311" cy="217" r="17" fill="#2b1f5e"/>
    <circle cx="209" cy="209" r="6" fill="#fff"/><circle cx="305" cy="209" r="6" fill="#fff"/>
    <ellipse cx="166" cy="262" rx="18" ry="11" fill="#ff4682" opacity=".45"/><ellipse cx="346" cy="262" rx="18" ry="11" fill="#ff4682" opacity=".45"/>
    <path d="M234 262q22 26 44 0" fill="none" stroke="#2b1f5e" stroke-width="8" stroke-linecap="round"/>
  </g>
  <g id="bullet"><ellipse cx="256" cy="361" rx="7" ry="14" fill="#ffd96b"/><ellipse cx="256" cy="361" rx="3" ry="9" fill="#fff"/></g>
  <g id="pip" transform="translate(256 440) scale(1.9)">
    <ellipse cx="0" cy="23" rx="5" ry="9" fill="#ff7eb6"/><ellipse cx="0" cy="21" rx="2.6" ry="5.4" fill="#ffd96b"/>
    <path d="M-8 2Q-20 8-19 18L-8 13zM8 2Q20 8 19 18L8 13z" fill="#4aa3e8"/>
    <ellipse cx="0" cy="0" rx="11" ry="17" fill="#fff3fb"/><ellipse cx="0" cy="9" rx="10" ry="5" fill="#ffd0e6"/>
    <path d="M-9.500 -9Q0 -32 9.500 -9Q0 -13 -9.500 -9z" fill="#ff7eb6"/>
    <circle cx="0" cy="-1" r="6.400" fill="#4aa3e8"/><circle cx="0" cy="-1" r="5" fill="#7cc4ff"/>
    <circle cx="-1.900" cy="-1.800" r=".9" fill="#2b1f5e"/><circle cx="1.900" cy="-1.800" r=".9" fill="#2b1f5e"/>
  </g>
"""

def svg(maskable: bool) -> str:
    # Maskable: full-bleed square, art kept inside the central safe zone.
    # Regular: rounded square so the icon looks right where no mask is applied.
    s = 0.8 if maskable else 0.92
    t = 256 * (1 - s)
    bg = ('<rect width="512" height="512" fill="url(#sky)"/>' if maskable
          else '<rect width="512" height="512" rx="112" fill="url(#sky)"/>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3a9c"/><stop offset="1" stop-color="#1b1446"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#ff7eb6" stop-opacity=".4"/><stop offset="1" stop-color="#ff7eb6" stop-opacity="0"/></radialGradient>
  </defs>
  {bg}
  <circle cx="256" cy="220" r="210" fill="url(#glow)"/>
  <g transform="translate({t:.1f} {t:.1f}) scale({s})">{ART}</g>
</svg>
"""

def write_svgs():
    os.makedirs(OUT, exist_ok=True)
    for name, m in (("icon.svg", False), ("icon-maskable.svg", True)):
        with open(os.path.join(OUT, name), "w") as f:
            f.write(svg(m))

async def render():
    from playwright.async_api import async_playwright
    jobs = [  # (svg, output, size, transparent corners)
        ("icon.svg", "icon-192.png", 192), ("icon.svg", "icon-512.png", 512), ("icon.svg", "favicon-32.png", 32),
        ("icon-maskable.svg", "icon-maskable-192.png", 192), ("icon-maskable.svg", "icon-maskable-512.png", 512),
        ("icon-maskable.svg", "apple-touch-icon.png", 180),
    ]
    exe = os.environ.get("CHROME", "/usr/bin/google-chrome")
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe if os.path.exists(exe) else None, args=["--no-sandbox"])
        for src, out, size in jobs:
            pg = await b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            data = open(os.path.join(OUT, src)).read()
            await pg.set_content(f'<body style="margin:0;background:transparent">{data.replace("width=\"512\" height=\"512\"", f"width=\"{size}\" height=\"{size}\"", 1)}</body>')
            await pg.screenshot(path=os.path.join(OUT, out), omit_background=True)
            await pg.close()
        await b.close()

if __name__ == "__main__":
    write_svgs()
    if "--svg-only" not in sys.argv:
        asyncio.run(render())
    print("icons written to", OUT)
