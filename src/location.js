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
    heading: Number.isFinite(coords.heading) ? coords.heading : fallbackHeading,
    speedMps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : 0,
    accuracy: coords.accuracy,
    timestamp
  };
}

export function locationSourceLabel({ hasMap = false, tracking = false, hasFix = false } = {}) {
  const mapSource = hasMap ? "Google Maps" : "簡易地図";
  const locationSource = tracking ? "GPS追従中" : hasFix ? "GPS最終位置" : "模擬データ";
  return `${mapSource} / ${locationSource}`;
}
