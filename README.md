# Pip Patrol

A cute, touch-friendly Space Invaders-style shooter that installs on your phone as a progressive web app (PWA) and plays offline.

Boop the blobs, dodge the star-drops, grab power-ups and take down a boss every third wave.

## Features

- Portrait and landscape layouts, with on-screen thumb pads (slide across the arrows to steer, hold the star to fire)
- Keyboard controls on desktop: arrow keys or A / D, Space to fire, P to pause, M to mute
- Crumbling shields, a mystery UFO, five power-ups (triple shot, rapid fire, bubble shield, slow-mo, and a rare Super shield with 3x the size and 3x the duration of the bubble) and boss waves
- Easy, Normal and Hard modes, with a saved best score for each
- Synthesized sound and music (no audio files), plus vibration on supported phones
- Installable, with an app icon, and fully playable offline

## Run it locally

It is a static site with no build step. Serve the folder over `localhost` (service workers need `https` or `localhost`):

```sh
python3 -m http.server 8000
# or: npx serve .
```

Then open <http://localhost:8000>.

## Deploy to Vercel

No build step or framework setup is needed.

1. Push this repo to GitHub (done if you are reading this there).
2. In Vercel, choose **Add New... > Project**, import the repo, and keep the defaults. Set **Framework Preset** to **Other** and leave the build command and output directory empty.
3. Deploy. Every push to `main` redeploys.

Or from the command line: `npx vercel --prod`.

`vercel.json` sets the headers that matter for a PWA: `sw.js` and the manifest are never cached stale, and the manifest is served as `application/manifest+json`.

## Install on your phone

- **Android (Chrome):** open the deployed URL and tap **Install app** on the start screen, or use the browser menu > **Install app**.
- **iPhone / iPad (Safari):** tap **Share > Add to Home Screen**.

## Project layout

```
index.html               page markup and PWA meta tags
css/style.css            styles
js/game.js               the game (canvas, audio, input)
js/pwa.js                service worker registration and install button
sw.js                    service worker (offline cache)
manifest.webmanifest     app name, colors, icons
vercel.json              Vercel headers and clean URLs
icons/                   app icons (SVG sources and PNG sizes)
scripts/generate_icons.py   regenerates every icon from one SVG template
```

## Updating

The service worker serves cached files first and refreshes them in the background, so players get new versions on their next launch. If you add or rename files, add them to `ASSETS` in `sw.js` and bump `VERSION`.

To change the icon, edit the art in `scripts/generate_icons.py` and run it (it needs Python with Playwright and Chromium for the PNG sizes; `--svg-only` writes just the SVGs).

## Notes

- The cartoon fonts (Bagel Fat One and Nunito) load from Google Fonts on the first online visit and are cached for offline use. Without them the game falls back to rounded system fonts.
- Vibration is not supported on iPhones.
