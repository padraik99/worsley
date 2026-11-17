// Magnetic declination from the World Magnetic Model (spherical harmonics, degree 12).
// Compact port of the standard NOAA geomag algorithm; declination only.
import { WMM } from './wmm-data.js';

const RAD = Math.PI / 180;
const A = 6378.137, B = 6356.7523142, RE = 6371.2;
const EPSSQ = 1 - (B * B) / (A * A);

/** Degrees east of true north that a compass needle points. Positive = east. */
export function declination(latDeg, lonDeg, altKm = 0, date = new Date()) {
  const N = WMM.nMax;
  const y0 = date.getUTCFullYear();
  const dyear = y0 + (date.valueOf() - Date.UTC(y0)) / (365 * 864e5) - WMM.epoch;

  // geodetic -> geocentric spherical
  const sinLat = Math.sin(latDeg * RAD), cosLat = Math.cos(latDeg * RAD);
  const rc = A / Math.sqrt(1 - EPSSQ * sinLat * sinLat);
  const xp = (rc + altKm) * cosLat;
  const zp = (rc * (1 - EPSSQ) + altKm) * sinLat;
  const r = Math.hypot(xp, zp);
  const phig = Math.asin(zp / r);
  const x = Math.sin(phig), z = Math.sqrt((1 - x) * (1 + x));
  const cosPhi = Math.cos(phig);
  if (Math.abs(cosPhi) < 1e-8) return 0; // at the geographic poles declination is undefined

  // Schmidt semi-normalised associated Legendre functions and derivatives
  const P = [1], dP = [0], S = [1];
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      const i = n * (n + 1) / 2 + m;
      if (n === m) {
        const i1 = (n - 1) * n / 2 + m - 1;
        P[i] = z * P[i1];
        dP[i] = z * dP[i1] + x * P[i1];
      } else if (n === 1) {
        P[i] = x * P[0];
        dP[i] = x * dP[0] - z * P[0];
      } else {
        const i1 = (n - 2) * (n - 1) / 2 + m, i2 = (n - 1) * n / 2 + m;
        if (m > n - 2) {
          P[i] = x * P[i2];
          dP[i] = x * dP[i2] - z * P[i2];
        } else {
          const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
          P[i] = x * P[i2] - k * P[i1];
          dP[i] = x * dP[i2] - z * P[i2] - k * dP[i1];
        }
      }
    }
  }
  for (let n = 1; n <= N; n++) {
    const i0 = n * (n + 1) / 2;
    S[i0] = S[(n - 1) * n / 2] * (2 * n - 1) / n;
    for (let m = 1; m <= n; m++) {
      S[i0 + m] = S[i0 + m - 1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }

  const lam = lonDeg * RAD;
  let bx = 0, by = 0, bz = 0, rr = (RE / r) * (RE / r);
  for (let n = 1; n <= N; n++) {
    rr *= RE / r;
    for (let m = 0; m <= n; m++) {
      const i = n * (n + 1) / 2 + m;
      const g = WMM.g[i] + dyear * WMM.dg[i];
      const h = WMM.h[i] + dyear * WMM.dh[i];
      const cm = Math.cos(m * lam), sm = Math.sin(m * lam);
      const p = P[i] * S[i], dp = -dP[i] * S[i];
      bz -= rr * (g * cm + h * sm) * (n + 1) * p;
      by += rr * (g * sm - h * cm) * m * p;
      bx -= rr * (g * cm + h * sm) * dp;
    }
  }
  by /= cosPhi;

  // rotate from geocentric to geodetic frame
  const psi = phig - latDeg * RAD;
  const bxg = bx * Math.cos(psi) - bz * Math.sin(psi);
  return Math.atan2(by, bxg) / RAD;
}

export const WMM_VALID_UNTIL = WMM.validUntil;
