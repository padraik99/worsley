// Run with:  node --test
// tests/fixtures.json holds the official WMM2025 test values published by NOAA NCEI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { declination } from '../js/wmm.js';
import * as A from '../js/astro.js';
import * as O from '../js/orient.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);

test('magnetic declination matches the official WMM2025 test values', () => {
  assert.ok(fx.decl.length >= 50);
  for (const p of fx.decl) {
    const y = Math.floor(p.year);
    const d = new Date(Date.UTC(y) + (p.year - y) * 365 * 864e5);
    near(declination(p.lat, p.lon, p.altKm, d), p.decl, 0.01, `decl ${p.year} @${p.lat},${p.lon}`);
  }
});

test('sunrise/sunset agree with published almanac times (New York, 17 Nov 2026)', () => {
  const t = A.sunTimes(new Date('2026-11-17T15:00:00Z'), 40.7128, -74.006);
  near(t.rise.valueOf(), Date.parse('2026-11-17T11:45:00Z'), 3 * 6e4, 'sunrise ~06:45 EST');
  near(t.set.valueOf(), Date.parse('2026-11-17T21:36:00Z'), 3 * 6e4, 'sunset ~16:36 EST');
});

test('declination of the sun at solstice and equinox', () => {
  near(A.sunEphem(new Date('2026-06-21T08:00:00Z')).dec, 23.44, 0.02, 'june solstice');
  near(A.sunEphem(new Date('2026-12-21T20:00:00Z')).dec, -23.44, 0.02, 'december solstice');
  near(A.sunEphem(new Date('2026-03-20T14:46:00Z')).dec, 0, 0.02, 'march equinox');
});

test('equation of time extremes', () => {
  near(A.sunEphem(new Date('2026-11-03T12:00:00Z')).eot, 16.45, 0.15, 'early november');
  near(A.sunEphem(new Date('2026-02-11T12:00:00Z')).eot, -14.2, 0.15, 'mid february');
});

test('noon sight round-trips to the true position', () => {
  const cases = [[40.7, -74], [-54.28, -36.5], [-61.1, -55.1], [10, 100], [51.5, 179.5]];
  for (const [lat, lon] of cases) {
    for (const day of ['2026-11-17T12:00:00Z', '2026-05-10T12:00:00Z']) {
      const noon = A.sunTimes(new Date(day), lat, lon).noon;
      const p = A.sunPosition(noon, lat, lon);
      near(Math.abs(A.norm180(p.az - (p.az > 90 && p.az < 270 ? 180 : 0))), 0, 0.5, 'sun on meridian at noon');
      const south = Math.cos(p.az * Math.PI / 180) < 0;
      near(A.latitudeFromNoon(p.alt, p.dec, south), lat, 0.01, `lat ${lat},${lon} ${day}`);
      near(Math.abs(A.norm180(A.longitudeFromNoon(noon) - lon)), 0, 0.01, `lon ${lat},${lon} ${day}`);
    }
  }
});

test('sunrise and sunset straddle noon; sun is on the horizon', () => {
  const t = A.sunTimes(new Date('2026-11-17T15:00:00Z'), 40.7, -74);
  assert.ok(t.rise < t.noon && t.noon < t.set);
  near(A.sunPosition(t.rise, 40.7, -74).alt, -0.833, 0.1, 'alt at sunrise');
  near(A.sunPosition(t.set, 40.7, -74).alt, -0.833, 0.1, 'alt at sunset');
  assert.equal(A.sunTimes(new Date('2026-12-21T12:00:00Z'), 78, 15).polar, 'night');
  assert.equal(A.sunTimes(new Date('2026-06-21T12:00:00Z'), 78, 15).polar, 'day');
});

test('refraction', () => {
  near(A.refraction(0), 34.5, 1, 'horizon');
  near(A.refraction(45), 1.0, 0.05, '45 deg');
  near(A.refraction(90), 0, 0.01, 'zenith');
});

test('distance in nautical miles', () => {
  near(A.distanceNm(0, 0, 1, 0), 60, 0.01, '1 deg of latitude');
  near(A.distanceNm(60, 0, 60, 1), 30, 0.05, '1 deg of longitude at 60N');
});

test('heading from device orientation', () => {
  near(O.headingFromEuler(0, 0, 0), 0, 1e-9, 'flat, top north');
  near(O.headingFromEuler(90, 0, 0), 270, 1e-9, 'flat, rotated 90 ccw = west');
  near(O.headingFromEuler(270, 20, -10), 90, 1e-9, 'flattish, east');
  near(O.headingFromEuler(0, 90, 0), 0, 1e-9, 'upright, camera north');
  near(O.headingFromEuler(180, 80, 0), 180, 1e-9, 'nearly upright, south');
  near(O.cameraAzimuth(90, 120, 0), 270, 1e-9, 'tilted back past vertical, west');
  // continuity across the flat/upright switch when not rolled
  near(O.headingFromEuler(47, 64, 0), O.headingFromEuler(47, 66, 0), 1e-9, 'no jump at switch');
});

test('sextant elevation', () => {
  near(O.cameraElevation(90, 0), 0, 1e-9, 'upright = horizon');
  near(O.cameraElevation(120, 0), 30, 1e-9, 'tilted back 30');
  near(O.cameraElevation(60, 0), -30, 1e-9, 'tilted forward 30');
  near(O.cameraElevation(0, 0), -90, 1e-9, 'flat = camera straight down');
  near(O.cameraElevation(135, 10), 44.1, 0.1, 'roll barely matters');
  near(O.edgeElevation(35), 35, 1e-9, 'edge sight');
  near(O.angleDiff(350, 10), -20, 1e-9, 'angle diff wraps');
});
