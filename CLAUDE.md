# Worsley

Ad-free compass and pocket sextant. Static PWA: plain HTML/CSS/ES modules, no build step, no dependencies.

## Target devices

- **Primary: Google Pixel 8 Pro, Android, Chrome.** Design, test and debug for this first.
  Heading comes from the `deviceorientationabsolute` event (see `js/orient.js`).
- Secondary: iPhone / Safari (the owner's daughters use iPhones). Keep it working, but only
  prioritise it when the owner says a task is for iPhone. Heading there comes from
  `webkitCompassHeading`, and motion access needs `DeviceOrientationEvent.requestPermission()`.

## Working rules

- Run `node --test` before handing over any change; it must pass.
- For UI changes, drive the app in a phone-sized browser with simulated sensors and look at the result.
  Use a Pixel 8 Pro sized viewport (412 x 915 CSS px) first.
- Say plainly what could not be verified (real sensors, camera and offline install cannot be tested off-device).
- No network calls, analytics, ads or third-party scripts. Everything is computed on the device.
- When adding a file the app loads, add it to the `ASSETS` list in `sw.js`.
- `js/wmm-data.js` holds the WMM2025 magnetic model, valid to the end of 2029.
- The owner publishes with GitHub Desktop and does not run build tools. Write the commit message from the actual diff.
