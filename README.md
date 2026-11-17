# Worsley

Ad-free compass and pocket sextant for your phone. Named for Frank Worsley, who navigated the
*James Caird* 800 nautical miles to South Georgia on four sun sights.

It is a static web app (PWA): no build step, no dependencies, no accounts, no network calls.
Once installed it works offline.

## What it does

**Compass**
- Full-screen rotating compass card, large numeric heading, 16-point cardinal
- True or magnetic north. Variation comes from the World Magnetic Model 2025, computed on the device from your GPS fix
- Bearing lock with turn-left / turn-right steering and a buzz when you're on it
- Sun marker on the dial showing where the Sun should bear (a check on the compass itself)
- Bubble level, position (tap to copy), elevation, speed in knots
- Red night mode, screen stays awake

**Sextant**
- Measures altitude above the horizon using the phone's gravity sensor as an artificial horizon
- Camera mode (crosshair) or Edge mode (sight along the phone's long edge, for stars)
- Zero button = index correction; refraction applied automatically
- Sight log; the highest sight of a series is reduced as a noon sight: latitude from altitude, longitude from time
- Polaris latitude
- "Check against GPS" tells you how many miles out you were

**Learn** — what a sextant is, how a sight becomes a position, and what Worsley was up against.

## Put it on your phone

1. Publish this folder to GitHub (GitHub Desktop → Add local repository → Publish).
2. On github.com: repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. After a minute, open `https://<your-username>.github.io/worsley/` on the phone.
4. Android (Chrome): menu → *Add to Home screen* / *Install app*.
   iPhone (Safari): Share → *Add to Home Screen*.

The sensors only work over HTTPS, which GitHub Pages provides. Opening `index.html` straight
from disk will show the interface but no heading.

## Tests

```bash
node --test
```

Checks magnetic variation against NOAA's 100 official WMM2025 test values, the Sun ephemeris
against almanac values, noon-sight round trips, and the orientation maths. Needs Node 20+, nothing else.

## Limits worth knowing

- Phone magnetometers are easily disturbed by metal and magnets. Calibrate with a figure-eight.
- The phone sextant is good to roughly half a degree to a degree, i.e. tens of miles. A real sextant is about 100x better.
- The magnetic model expires at the end of 2029; `js/wmm-data.js` will need the WMM2030 coefficients then.
- On iPhone the heading comes from Safari's own compass value; on Android it is computed from the absolute orientation sensor.
