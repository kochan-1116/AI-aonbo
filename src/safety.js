export const MAX_ALERT_DISTANCE_M = 500;
export const CRITICAL_DISTANCE_M = 200;
export const MAX_DATA_AGE_MS = 8_000;
export const MAX_ACCEPTABLE_ACCURACY_M = 100;
export const COLLISION_HORIZON_S = 30;
export const COLLISION_CLEARANCE_M = 60;
export const IMMEDIATE_PROXIMITY_M = 50;

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

function projectedCollision(driver, emergency) {
  if (!Number.isFinite(driver.speedMps) || !Number.isFinite(emergency.speedMps)) return false;
  if (!Number.isFinite(driver.heading)) return false;
  if (driver.speedMps < 0 || emergency.speedMps < 0) return false;

  const meanLatitude = toRadians((driver.lat + emergency.lat) / 2);
  const earthRadiusM = 6_371_000;
  const longitudeDelta = ((emergency.lng - driver.lng + 540) % 360) - 180;
  const relativePosition = {
    x: toRadians(longitudeDelta) * earthRadiusM * Math.cos(meanLatitude),
    y: toRadians(emergency.lat - driver.lat) * earthRadiusM
  };
  const velocity = (heading, speed) => ({
    x: Math.sin(toRadians(heading)) * speed,
    y: Math.cos(toRadians(heading)) * speed
  });
  const driverVelocity = velocity(Number.isFinite(driver.heading) ? driver.heading : 0, driver.speedMps);
  const emergencyVelocity = velocity(emergency.heading, emergency.speedMps);
  const relativeVelocity = {
    x: emergencyVelocity.x - driverVelocity.x,
    y: emergencyVelocity.y - driverVelocity.y
  };
  const speedSquared = relativeVelocity.x ** 2 + relativeVelocity.y ** 2;
  if (speedSquared < 0.01) return false;

  const secondsToClosest = -(
    relativePosition.x * relativeVelocity.x + relativePosition.y * relativeVelocity.y
  ) / speedSquared;
  if (secondsToClosest < 0 || secondsToClosest > COLLISION_HORIZON_S) return false;
  const closestDistance = Math.hypot(
    relativePosition.x + relativeVelocity.x * secondsToClosest,
    relativePosition.y + relativeVelocity.y * secondsToClosest
  );
  return closestDistance <= COLLISION_CLEARANCE_M;
}

export function evaluateEmergencyApproach({ driver, emergency, now = Date.now() } = {}) {
  if (!driver || !emergency) {
    return { level: "unavailable", reason: "位置情報を取得できません" };
  }
  const validCoordinate = (point) => Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90
    && point.lng >= -180 && point.lng <= 180;
  const validAccuracy = (value) => Number.isFinite(value)
    && value >= 0 && value <= MAX_ACCEPTABLE_ACCURACY_M;
  const validSpeed = (value) => value === undefined || (Number.isFinite(value) && value >= 0);
  if (!Number.isFinite(now) || !validCoordinate(driver) || !validCoordinate(emergency)
    || !Number.isFinite(emergency.heading)) {
    return { level: "unavailable", reason: "位置情報の形式が正しくありません" };
  }
  if (!Number.isFinite(emergency.timestamp) || now - emergency.timestamp > MAX_DATA_AGE_MS) {
    return { level: "unavailable", reason: "緊急車両の情報が更新されていません" };
  }
  if (now < emergency.timestamp - 1_000) {
    return { level: "unavailable", reason: "位置情報の時刻が正しくありません" };
  }
  if (
    !Number.isFinite(driver.timestamp)
    || now - driver.timestamp > MAX_DATA_AGE_MS
    || now < driver.timestamp - 1_000
  ) {
    return { level: "unavailable", reason: "現在地の情報が更新されていません" };
  }
  if (!validAccuracy(driver.accuracy) || !validAccuracy(emergency.accuracy)) {
    return { level: "unavailable", reason: "位置情報の精度が不足しています" };
  }
  if (!validSpeed(driver.speedMps) || !validSpeed(emergency.speedMps)) {
    return { level: "unavailable", reason: "速度情報の形式が正しくありません" };
  }

  const distance = distanceMeters(driver, emergency);
  const fromEmergencyToDriver = bearingDegrees(emergency, driver);
  const directApproach = angularDifference(emergency.heading, fromEmergencyToDriver) <= 75;
  const collisionCourse = projectedCollision(driver, emergency);
  const immediateProximity = distance <= IMMEDIATE_PROXIMITY_M;
  const approaching = immediateProximity || directApproach || collisionCourse;
  const driverHeading = Number.isFinite(driver.heading) ? driver.heading : 0;
  const direction = directionLabel(driverHeading, bearingDegrees(driver, emergency));

  if (distance > MAX_ALERT_DISTANCE_M || !approaching) {
    return { level: "safe", distance, direction, approaching, collisionCourse, immediateProximity, reason: "接近する緊急車両はありません" };
  }
  return {
    level: distance <= CRITICAL_DISTANCE_M ? "critical" : "warning",
    distance,
    direction,
    approaching,
    collisionCourse,
    immediateProximity,
    reason: `${direction}から緊急車両が接近しています`
  };
}
