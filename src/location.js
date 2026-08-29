import { bearingDegrees, distanceMeters } from "./safety.js";

export const GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000
});

export function driverFromGeolocation(position, fallbackHeading = 0) {
  const { coords, timestamp } = position ?? {};
  if (!coords
    || !Number.isFinite(coords.latitude) || coords.latitude < -90 || coords.latitude > 90
    || !Number.isFinite(coords.longitude) || coords.longitude < -180 || coords.longitude > 180
    || !Number.isFinite(coords.accuracy) || coords.accuracy < 0
    || !Number.isFinite(timestamp)) return null;

  return {
    lat: coords.latitude,
    lng: coords.longitude,
    heading: Number.isFinite(coords.heading) ? ((coords.heading % 360) + 360) % 360 : fallbackHeading,
    speedMps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : 0,
    accuracy: coords.accuracy,
    timestamp
  };
}

export function headingFromMovement(previous, current, fallbackHeading = 0) {
  if (!previous || !current
    || !Number.isFinite(previous.lat) || !Number.isFinite(previous.lng)
    || !Number.isFinite(current.lat) || !Number.isFinite(current.lng)
    || !Number.isFinite(previous.timestamp) || !Number.isFinite(current.timestamp)
    || current.timestamp <= previous.timestamp
    || current.timestamp - previous.timestamp > 30_000) return fallbackHeading;

  const accuracyThreshold = Math.max(
    3,
    Math.min(15, Math.max(previous.accuracy ?? 0, current.accuracy ?? 0) * 0.5)
  );
  if (distanceMeters(previous, current) < accuracyThreshold) return fallbackHeading;
  return bearingDegrees(previous, current);
}

export function driverForSimulation(driver, timestamp, maxAccuracy = 12) {
  return {
    ...driver,
    accuracy: Math.min(driver.accuracy, maxAccuracy),
    timestamp
  };
}

export function locationSourceLabel({ mapProvider = "fallback", tracking = false, hasFix = false } = {}) {
  const mapSource = {
    google: "Google Maps",
    openstreetmap: "OpenStreetMap",
    fallback: "簡易地図"
  }[mapProvider] ?? "簡易地図";
  const locationSource = tracking ? "GPS追従中" : hasFix ? "GPS最終位置" : "模擬データ";
  return `${mapSource} / ${locationSource}`;
}
