import test from "node:test";
import assert from "node:assert/strict";
import {
  bearingDegrees,
  directionLabel,
  distanceMeters,
  evaluateEmergencyApproach
} from "../src/safety.js";

const now = 1_800_000_000_000;
const earthRadiusM = 6_371_000;
const baseDriver = {
  lat: 0,
  lng: 0,
  heading: 0,
  speedMps: 10,
  accuracy: 5,
  timestamp: now
};

function pointAt(distanceM, bearing = 0) {
  const angularDistance = distanceM / earthRadiusM;
  const bearingRad = bearing * Math.PI / 180;
  const lat1 = baseDriver.lat * Math.PI / 180;
  const lng1 = baseDriver.lng * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

function emergencyAt(distanceM, overrides = {}) {
  return {
    ...pointAt(distanceM),
    heading: 180,
    speedMps: 15,
    accuracy: 5,
    timestamp: now,
    ...overrides
  };
}

const evaluate = (emergency, driver = baseDriver, time = now) =>
  evaluateEmergencyApproach({ driver, emergency, now: time });

test("引数全体が欠けても例外ではなく情報不明を返す", () => {
  assert.equal(evaluateEmergencyApproach().level, "unavailable");
});

test("緊急車両がnullなら情報不明を返す", () => {
  assert.equal(evaluate(null).level, "unavailable");
});

test("一般車の取得時刻が欠けていれば情報不明を返す", () => {
  const { timestamp, ...driverWithoutTime } = baseDriver;
  assert.equal(evaluate(emergencyAt(300), driverWithoutTime).level, "unavailable");
});

test("緊急車両の取得時刻が欠けていれば情報不明を返す", () => {
  assert.equal(evaluate(emergencyAt(300, { timestamp: undefined })).level, "unavailable");
});

test("一般車のGPS精度が欠けていれば情報不明を返す", () => {
  assert.equal(evaluate(emergencyAt(300), { ...baseDriver, accuracy: undefined }).level, "unavailable");
});

test("緊急車両のGPS精度が欠けていれば情報不明を返す", () => {
  assert.equal(evaluate(emergencyAt(300, { accuracy: undefined })).level, "unavailable");
});

test("一般車位置がちょうど8秒前なら有効", () => {
  assert.equal(evaluate(emergencyAt(300), { ...baseDriver, timestamp: now - 8_000 }).level, "warning");
});

test("一般車位置が1秒だけ未来でも時計誤差として許容", () => {
  assert.equal(evaluate(emergencyAt(300), { ...baseDriver, timestamp: now + 1_000 }).level, "warning");
});

test("一般車位置が1秒を超えて未来なら情報不明", () => {
  assert.equal(evaluate(emergencyAt(300), { ...baseDriver, timestamp: now + 1_001 }).level, "unavailable");
});

test("緊急車両位置が1秒だけ未来でも時計誤差として許容", () => {
  assert.equal(evaluate(emergencyAt(300, { timestamp: now + 1_000 })).level, "warning");
});

test("緊急車両位置が1秒を超えて未来なら情報不明", () => {
  assert.equal(evaluate(emergencyAt(300, { timestamp: now + 1_001 })).level, "unavailable");
});

test("GPS精度0mは有効値として扱う", () => {
  assert.equal(evaluate(emergencyAt(300, { accuracy: 0 }), { ...baseDriver, accuracy: 0 }).level, "warning");
});

test("無限大のGPS精度を情報不明として扱う", () => {
  assert.equal(evaluate(emergencyAt(300, { accuracy: Infinity })).level, "unavailable");
});

test("無限大の速度を情報不明として扱う", () => {
  assert.equal(evaluate(emergencyAt(300, { speedMps: Infinity })).level, "unavailable");
});

test("速度がない旧端末でも直接接近は検出する", () => {
  assert.equal(evaluate(emergencyAt(300, { speedMps: undefined }), { ...baseDriver, speedMps: undefined }).level, "warning");
});

test("同一地点なら進行方向にかかわらず緊急警告", () => {
  const result = evaluate(emergencyAt(0, { heading: 90 }));
  assert.equal(result.level, "critical");
  assert.equal(result.immediateProximity, true);
});

test("49m以内なら遠ざかる車両も至近警告", () => {
  assert.equal(evaluate(emergencyAt(49, { heading: 0 })).level, "critical");
});

test("51mで遠ざかる車両は警告しない", () => {
  assert.equal(evaluate(emergencyAt(51, { heading: 0 })).level, "safe");
});

test("360度を超える方位でも周期的に正しく判定", () => {
  assert.equal(evaluate(emergencyAt(300, { heading: 540 })).level, "warning");
});

test("負の方位でも周期的に正しく判定", () => {
  assert.equal(evaluate(emergencyAt(300, { heading: -180 })).level, "warning");
});

test("日付変更線をまたぐ近距離を地球一周と誤認しない", () => {
  const west = { lat: 0, lng: 179.9999 };
  const east = { lat: 0, lng: -179.9999 };
  assert.ok(distanceMeters(west, east) < 30);
  assert.ok(bearingDegrees(west, east) > 80 && bearingDegrees(west, east) < 100);
});

test("方位ラベルの境界45・135・225・315度を一貫して分類", () => {
  assert.equal(directionLabel(0, 45), "右方向");
  assert.equal(directionLabel(0, 135), "後方");
  assert.equal(directionLabel(0, 225), "左方向");
  assert.equal(directionLabel(0, 315), "前方");
});
