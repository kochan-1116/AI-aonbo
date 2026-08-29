import test from "node:test";
import assert from "node:assert/strict";
import { driverForSimulation, driverFromGeolocation, GEOLOCATION_OPTIONS, headingFromMovement, locationSourceLabel } from "../src/location.js";

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

test("GPSが返す負の方位を0〜360度へ正規化する", () => {
  const driver = driverFromGeolocation({
    coords: { latitude: 35, longitude: 139, accuracy: 5, heading: -90, speed: 3 },
    timestamp: 123
  });
  assert.equal(driver.heading, 270);
});

test("連続するGPS座標から東向きと南向きの進行方向を計算する", () => {
  const base = { lat: 35, lng: 139, accuracy: 10, timestamp: 1_000 };
  const east = headingFromMovement(base, { ...base, lng: 139.0001, timestamp: 2_000 }, 0);
  const south = headingFromMovement(base, { ...base, lat: 34.9999, timestamp: 2_000 }, 0);
  assert.ok(east > 89 && east < 91);
  assert.ok(south > 179 && south < 181);
});

test("GPSの微小な位置ぶれでは進行方向を変更しない", () => {
  const previous = { lat: 35, lng: 139, accuracy: 10, timestamp: 1_000 };
  const jitter = { lat: 35.00001, lng: 139.00001, accuracy: 10, timestamp: 2_000 };
  assert.equal(headingFromMovement(previous, jitter, 225), 225);
});

test("古すぎるGPS更新や時刻が逆転した更新では進行方向を推測しない", () => {
  const previous = { lat: 35, lng: 139, accuracy: 5, timestamp: 10_000 };
  const moved = { lat: 35.001, lng: 139, accuracy: 5, timestamp: 50_001 };
  assert.equal(headingFromMovement(previous, moved, 45), 45);
  assert.equal(headingFromMovement(previous, { ...moved, timestamp: 9_000 }, 45), 45);
});

test("実証シナリオは実測GPSの位置を保ちつつ精度と時刻をテスト値へ置き換える", () => {
  const current = { lat: 35.7, lng: 139.7, accuracy: 113, heading: 90, timestamp: 1_000 };
  assert.deepEqual(driverForSimulation(current, 50_000), {
    lat: 35.7, lng: 139.7, accuracy: 12, heading: 90, timestamp: 50_000
  });
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
  assert.equal(locationSourceLabel({ mapProvider: "google", tracking: true, hasFix: true }), "Google Maps / GPS追従中");
  assert.equal(locationSourceLabel({ mapProvider: "openstreetmap", tracking: true }), "OpenStreetMap / GPS追従中");
});

test("GPS追従は高精度・短いキャッシュ・有限タイムアウトを使う", () => {
  assert.equal(GEOLOCATION_OPTIONS.enableHighAccuracy, true);
  assert.equal(GEOLOCATION_OPTIONS.maximumAge, 5_000);
  assert.equal(GEOLOCATION_OPTIONS.timeout, 15_000);
});
