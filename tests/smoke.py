#!/usr/bin/env python3
"""Smoke test for Orange Invader. Run it before every push:

    python3 tests/smoke.py            # about 2 minutes
    python3 tests/smoke.py --quick    # about 40 seconds

What it does: copies the site to a temp folder, patches the copy so every kill drops a power-up
(cycling through all of them), lives are unlimited and the UFO shows up quickly, then plays the
game with the keyboard on a desktop-sized and a phone-sized window.

It fails if:
  - any page error or console error happens (this includes the "Draw error in ..." messages from
    the per-sprite guard in draw(), which is what would have caught the missing drawUfo)
  - any power-up type was never collected
  - the UFO never appeared (so the UFO drawing path went untested)
  - the ship lost a life while invisible

Needs Python with Playwright and a Chromium or Chrome (set CHROME=/path/to/chrome if needed).
"""
import asyncio, os, random, shutil, subprocess, sys, tempfile, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUICK = '--quick' in sys.argv
TYPES = ['triple', 'rapid', 'bubble', 'slow', 'super', 'ghost']


def patch(path, pairs):
    s = open(path).read()
    for a, b in pairs:
        if a not in s:
            sys.exit(f'FAIL: test patch anchor not found (the code changed, update tests/smoke.py): {a[:70]!r}')
        s = s.replace(a, b, 1)
    open(path, 'w').write(s)


def build_test_copy():
    tmp = tempfile.mkdtemp(prefix='oi-smoke-')
    for f in ['index.html', 'manifest.webmanifest', 'sw.js']:
        shutil.copy(os.path.join(ROOT, f), tmp)
    for d in ['css', 'js', 'icons']:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(tmp, d))
    patch(os.path.join(tmp, 'js', 'game.js'), [
        ("S.score = 0; S.lives = D.lives;", "S.score = 0; S.lives = 99;"),
        ("normal: { lives: 3, spd: 1,   fire: 1,   drop: .14,", "normal: { lives: 3, spd: 1,   fire: 1,   drop: .6,"),
        ("p.y += 70 * dt; p.t += dt * 4;", "p.y += 70 * dt; p.t += dt * 4; p.x += (P.x - p.x) * Math.min(1, dt * 3);"),   # pickups home in so every type is collected
        ("S.ufoT = rand(10, 16);", "S.ufoT = rand(2, 3);"),
        ("S.ufoT = rand(16, 26);", "S.ufoT = rand(4, 6);"),
        ("function collect(p) {", "function collect(p) { (window.__got = window.__got || {})[p.type] = 1;"),
        ("function ufoLogic(dt) {", "function ufoLogic(dt) { window.__ufoFrames = (window.__ufoFrames || 0) + (ufo ? 1 : 0);"),
        ("function spawnPow(x, y) { pows.push({ x, y, type: POW_TYPES[Math.floor(Math.random() * POW_TYPES.length)],",
         "function spawnPow(x, y) { pows.push({ x, y, type: %r[(window.__n = (window.__n || 0) + 1) %% %d]," % (TYPES, len(TYPES))),
        ("  last = performance.now(); requestAnimationFrame(frame);",
         "  last = performance.now(); requestAnimationFrame(frame);\n"
         "  { let l = S.lives; setInterval(() => { if (S.fx.ghost > 0 && S.lives < l) (window.__viol = window.__viol || []).push(S.clock.toFixed(1)); l = S.lives; }, 40); }"),
    ])
    return tmp


async def play(browser, url, size, seconds, label, problems):
    ctx = await browser.new_context(viewport=size)
    page = await ctx.new_page()
    page.on('pageerror', lambda e: problems.append(f'[{label}] page error: {e}\n{getattr(e, "stack", "")}'))
    page.on('console', lambda m: problems.append(f'[{label}] console error: {m.text}')
            if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await page.goto(url)
    await page.wait_for_timeout(1500)
    await page.click('#btnPlay')
    await page.keyboard.down('Space')
    end = time.time() + seconds
    while time.time() < end:
        k = random.choice(['ArrowLeft', 'ArrowRight'])
        await page.keyboard.down(k)
        await page.wait_for_timeout(random.randint(150, 600))
        await page.keyboard.up(k)
    got = await page.evaluate('Object.keys(window.__got || {})')
    ufo = await page.evaluate('window.__ufoFrames || 0')
    viol = await page.evaluate('window.__viol || []')
    await ctx.close()
    return set(got), ufo, viol


async def main():
    tmp = build_test_copy()
    port = 8000 + random.randint(100, 900)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)], cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    problems, got_all, ufo_all, viol_all = [], set(), 0, []
    try:
        async with async_playwright() as p:
            exe = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
            browser = await p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
            url = f'http://localhost:{port}/'
            for label, size, secs in [('desktop', {'width': 1366, 'height': 768}, 25 if QUICK else 70),
                                      ('phone', {'width': 390, 'height': 780}, 15 if QUICK else 40)]:
                got, ufo, viol = await play(browser, url, size, secs, label, problems)
                print(f'{label}: collected {sorted(got)}, UFO frames {ufo}')
                got_all |= got; ufo_all += ufo; viol_all += viol
            await browser.close()
    finally:
        srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
    missing = [t for t in TYPES if t not in got_all]
    if missing: problems.append(f'power-ups never collected: {missing}')
    if ufo_all == 0: problems.append('the UFO never appeared')
    if viol_all: problems.append(f'lost a life while invisible at t={viol_all}')
    if problems:
        print('\nFAILED:'); [print(' -', x) for x in sorted(set(problems))[:20]]; sys.exit(1)
    print('\nPASSED: no errors, every power-up collected, UFO drawn, invisibility protects the ship')

asyncio.run(main())
