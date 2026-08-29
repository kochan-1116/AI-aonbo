export const MAX_ALERT_DISTANCE_M = 500;
export const CRITICAL_DISTANCE_M = 200;
export const MAX_DATA_AGE_MS = 8_000;
export const MAX_ACCEPTABLE_ACCURACY_M = 100;

const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;

export function distanceMeters(a, b) {
  const earthRadiusM = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function angularDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function directionLabel(driverHeading, targetBearing) {
  const relative = ((targetBearing - driverHeading + 360) % 360);
  if (relative < 45 || relative >= 315) return "前方";
  if (relative < 135) return "右方向";
  if (relative < 225) return "後方";
  return "左方向";
}

export function evaluateEmergencyApproach({ driver, emergency, now = Date.now() }) {
  if (!driver || !emergency) {
    return { level: "unavailable", reason: "位置情報を取得できません" };
  }
  const validCoordinate = (point) => Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90
    && point.lng >= -180 && point.lng <= 180;
  if (!validCoordinate(driver) || !validCoordinate(emergency)
    || !Number.isFinite(emergency.heading)) {
    return { level: "unavailable", reason: "位置情報の形式が正しくありません" };
  }
  if (!Number.isFinite(emergency.timestamp) || now - emergency.timestamp > MAX_DATA_AGE_MS) {
    return { level: "unavailable", reason: "緊急車両の情報が更新されていません" };
  }
  if (now < emergency.timestamp - 1_000) {
    return { level: "unavailable", reason: "位置情報の時刻が正しくありません" };
  }
  if ((driver.accuracy ?? 0) > MAX_ACCEPTABLE_ACCURACY_M
    || (emergency.accuracy ?? 0) > MAX_ACCEPTABLE_ACCURACY_M) {
    return { level: "unavailable", reason: "位置情報の精度が不足しています" };
  }

  const distance = distanceMeters(driver, emergency);
  const fromEmergencyToDriver = bearingDegrees(emergency, driver);
  const approaching = angularDifference(emergency.heading, fromEmergencyToDriver) <= 75;
  const driverHeading = Number.isFinite(driver.heading) ? driver.heading : 0;
  const direction = directionLabel(driverHeading, bearingDegrees(driver, emergency));

  if (distance > MAX_ALERT_DISTANCE_M || !approaching) {
    return { level: "safe", distance, direction, approaching, reason: "接近する緊急車両はありません" };
  }
  return {
    level: distance <= CRITICAL_DISTANCE_M ? "critical" : "warning",
    distance,
    direction,
    approaching,
    reason: `${direction}から緊急車両が接近しています`
  };
}
