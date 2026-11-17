// Device-orientation maths. Angles follow the W3C DeviceOrientation spec:
// rotation R = Rz(alpha) * Rx(beta) * Ry(gamma); world frame is x=east, y=north, z=up.

const RAD = Math.PI / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;

function parts(alpha, beta, gamma) {
  const a = alpha * RAD, b = beta * RAD, g = gamma * RAD;
  return {
    sA: Math.sin(a), cA: Math.cos(a), sB: Math.sin(b), cB: Math.cos(b),
    sG: Math.sin(g), cG: Math.cos(g),
  };
}

/** Compass bearing of the direction the rear camera looks (device -z axis). */
export function cameraAzimuth(alpha, beta, gamma) {
  const { sA, cA, sB, cB, sG, cG } = parts(alpha, beta, gamma);
  const e = -cA * sG - sA * sB * cG, n = -sA * sG + cA * sB * cG;
  if (Math.hypot(e, n) < 0.05) return norm360(Math.atan2(-sA * cB, cA * cB) / RAD); // camera aimed straight up/down
  return norm360(Math.atan2(e, n) / RAD);
}

/**
 * Compass heading for a hand-held phone. Lying flattish, it is where the top edge points;
 * held upright (like taking a photo), it is where the rear camera looks.
 */
export function headingFromEuler(alpha, beta, gamma) {
  const { sA, cA, cB } = parts(alpha, beta, gamma);
  if (cB > 0.42) return norm360(Math.atan2(-sA * cB, cA * cB) / RAD);
  return cameraAzimuth(alpha, beta, gamma);
}

/** Elevation above the horizontal of the rear camera's line of sight, degrees. */
export function cameraElevation(beta, gamma) {
  return Math.asin(Math.max(-1, Math.min(1, -Math.cos(beta * RAD) * Math.cos(gamma * RAD)))) / RAD;
}

/** Elevation of the phone's long edge (sighting from the bottom edge towards the top), degrees. */
export function edgeElevation(beta) {
  return Math.asin(Math.sin(beta * RAD)) / RAD;
}

/** Shortest signed difference a-b in degrees, in (-180, 180]. */
export function angleDiff(a, b) {
  return norm360(a - b + 180) - 180;
}
