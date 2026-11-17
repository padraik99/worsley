// Sun ephemeris and sight-reduction maths.
// Solar position follows the NOAA Solar Calculator (Meeus, "Astronomical Algorithms").
// Good to roughly 1 arcminute for current dates - far better than a phone can measure.

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD), tan = (d) => Math.tan(d * RAD);
export const norm360 = (d) => ((d % 360) + 360) % 360;
export const norm180 = (d) => norm360(d + 180) - 180;

/** Sun declination (deg) and equation of time (minutes) at a UTC instant. */
export function sunEphem(date) {
  const jd = date.valueOf() / 864e5 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * cos(omega);
  const dec = Math.asin(sin(eps) * sin(lambda)) / RAD;
  const y = tan(eps / 2) ** 2;
  const eot = 4 * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0)
    - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)) / RAD;
  return { dec, eot };
}

const utcMinutes = (date) => (date.valueOf() % 864e5) / 6e4;

/** Geometric (no refraction) altitude and true azimuth of the Sun, degrees. lon east-positive. */
export function sunPosition(date, lat, lon) {
  const { dec, eot } = sunEphem(date);
  const tst = (((utcMinutes(date) + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)) / RAD;
  const az = norm360(Math.atan2(sin(ha), cos(ha) * sin(lat) - tan(dec) * cos(lat)) / RAD + 180);
  return { alt, az, dec, eot };
}

/** UTC instants of sunrise, local apparent noon and sunset for the UTC-day nearest `date`. */
export function sunTimes(date, lat, lon) {
  // centre on the local solar day containing `date`
  const localDay = Math.floor((date.valueOf() + lon * 24e4) / 864e5) * 864e5;
  let noon = localDay + 432e5 - lon * 24e4;
  for (let i = 0; i < 2; i++) {
    noon = localDay + (720 - 4 * lon - sunEphem(new Date(noon)).eot) * 6e4;
  }
  const { dec } = sunEphem(new Date(noon));
  const c = cos(90.833) / (cos(lat) * cos(dec)) - tan(lat) * tan(dec);
  const out = { noon: new Date(noon), rise: null, set: null, polar: null };
  if (c > 1) out.polar = 'night';
  else if (c < -1) out.polar = 'day';
  else {
    const h = Math.acos(c) / RAD * 4 * 6e4;
    out.rise = new Date(noon - h);
    out.set = new Date(noon + h);
  }
  return out;
}

/** Atmospheric refraction in arcminutes for an apparent altitude in degrees (Bennett 1982). */
export function refraction(apparentAlt) {
  if (apparentAlt < -1) return 0;
  return 1 / tan(apparentAlt + 7.31 / (apparentAlt + 4.4));
}

/**
 * Noon sight: latitude from the Sun's peak altitude.
 * ho = observed (corrected) altitude; sunBearsSouth = you faced south to see it.
 */
export function latitudeFromNoon(ho, dec, sunBearsSouth) {
  const zenithDist = 90 - ho;
  return sunBearsSouth ? dec + zenithDist : dec - zenithDist;
}

/** Longitude (east-positive) from the UTC instant the Sun crossed your meridian. */
export function longitudeFromNoon(date) {
  const { eot } = sunEphem(date);
  return norm180((720 - eot - utcMinutes(date)) / 4);
}

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / RAD * 60;
}
