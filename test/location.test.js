import test from "node:test";
import assert from "node:assert/strict";
import { driverFromGeolocation, GEOLOCATION_OPTIONS, locationSourceLabel } from "../src/location.js";

test("GPS位置を安全判定用の形式へ変換する", () => {
  const driver = driverFromGeolocation({
    coords: { latitude: 35.68, longitude: 139.76, accuracy: 8, heading: 90, speed: 12 },
    timestamp: 1_800_000_000_000
  });
  assert.deepEqual(driver, {
    lat: 35.68, lng: 139.76, accuracy: 8, heading: 90, speedMps: 12, timestamp: 1_800_000_000_000
  });
});

test("停止中など方位と速度が取れない場合は直前の方位と速度0を使う", () => {
  const driver = driverFromGeolocation({
    coords: { latitude: 35, longitude: 139, accuracy: 10, heading: null, speed: null },
    timestamp: 123
  }, 270);
  assert.equal(driver.heading, 270);
  assert.equal(driver.speedMps, 0);
});

test("不正なGPS座標・精度・時刻は採用しない", () => {
  assert.equal(driverFromGeolocation(null), null);
  assert.equal(driverFromGeolocation({ coords: { latitude: 91, longitude: 139, accuracy: 10 }, timestamp: 1 }), null);
  assert.equal(driverFromGeolocation({ coords: { latitude: 35, longitude: 181, accuracy: 10 }, timestamp: 1 }), null);
  assert.equal(driverFromGeolocation({ coords: { latitude: 35, longitude: 139, accuracy: -1 }, timestamp: 1 }), null);
  assert.equal(driverFromGeolocation({ coords: { latitude: 35, longitude: 139, accuracy: 10 }, timestamp: Number.NaN }), null);
});

test("GPS状態バッジは追従・停止・地図種別を正しく表示する", () => {
  assert.equal(locationSourceLabel(), "簡易地図 / 模擬データ");
  assert.equal(locationSourceLabel({ tracking: true }), "簡易地図 / GPS追従中");
  assert.equal(locationSourceLabel({ hasFix: true }), "簡易地図 / GPS最終位置");
  assert.equal(locationSourceLabel({ hasMap: true, tracking: true, hasFix: true }), "Google Maps / GPS追従中");
});

test("GPS追従は高精度・短いキャッシュ・有限タイムアウトを使う", () => {
  assert.equal(GEOLOCATION_OPTIONS.enableHighAccuracy, true);
  assert.equal(GEOLOCATION_OPTIONS.maximumAge, 5_000);
  assert.equal(GEOLOCATION_OPTIONS.timeout, 15_000);
});
