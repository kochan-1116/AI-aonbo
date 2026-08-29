import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEmergencyApproach } from "../src/safety.js";

const now = 1_800_000_000_000;
const metersPerLatitudeDegree = 111_195;
const baseDriver = { lat: 35, lng: 139, heading: 0, speedMps: 12, accuracy: 10, timestamp: now };
const northAt = (meters, overrides = {}) => ({
  lat: baseDriver.lat + meters / metersPerLatitudeDegree,
  lng: baseDriver.lng,
  heading: 180,
  speedMps: 15,
  accuracy: 10,
  timestamp: now,
  ...overrides
});
const evaluate = (emergency, driver = baseDriver, time = now) =>
  evaluateEmergencyApproach({ driver, emergency, now: time });

test("距離の境界: 199mは緊急、201mは注意、499mは注意、501mは安全", () => {
  assert.equal(evaluate(northAt(199)).level, "critical");
  assert.equal(evaluate(northAt(201)).level, "warning");
  assert.equal(evaluate(northAt(499)).level, "warning");
  assert.equal(evaluate(northAt(501)).level, "safe");
});

test("データ鮮度の境界: 8秒は有効、8秒を1ms超えると不明", () => {
  assert.equal(evaluate(northAt(300, { timestamp: now - 8_000 })).level, "warning");
  assert.equal(evaluate(northAt(300, { timestamp: now - 8_001 })).level, "unavailable");
});

test("GPS精度の境界: 100mは有効、超過・負数・NaNは不明", () => {
  assert.equal(evaluate(northAt(300, { accuracy: 100 })).level, "warning");
  assert.equal(evaluate(northAt(300, { accuracy: 100.1 })).level, "unavailable");
  assert.equal(evaluate(northAt(300, { accuracy: -1 })).level, "unavailable");
  assert.equal(evaluate(northAt(300), { ...baseDriver, accuracy: Number.NaN }).level, "unavailable");
});

test("異常な時刻・速度・座標は安全と誤表示せず不明にする", () => {
  assert.equal(evaluate(northAt(300), baseDriver, Number.NaN).level, "unavailable");
  assert.equal(evaluate(northAt(300, { speedMps: -1 })).level, "unavailable");
  assert.equal(evaluate(northAt(300, { lng: 181 })).level, "unavailable");
  assert.equal(evaluate(northAt(300), { ...baseDriver, timestamp: now - 8_001 }).level, "unavailable");
  assert.equal(evaluate(northAt(300), { ...baseDriver, timestamp: Number.NaN }).level, "unavailable");
});

test("接近角度の境界を処理する", () => {
  assert.equal(evaluate(northAt(300, { heading: 105 })).level, "warning");
  assert.equal(evaluate(northAt(300, { heading: 104.8 })).level, "safe");
});

test("速度情報がない旧端末でも直接接近を判定できる", () => {
  const driver = { ...baseDriver, speedMps: undefined };
  const emergency = northAt(300, { speedMps: undefined });
  assert.equal(evaluate(emergency, driver).level, "warning");
});

test("交差点へ異なる方向から進入する衝突コースを検知する", () => {
  const driver = { lat: 35, lng: 139, heading: 0, speedMps: 25, accuracy: 10, timestamp: now };
  const emergency = {
    lat: 35 + 250 / metersPerLatitudeDegree,
    lng: 139 - 50 / (metersPerLatitudeDegree * Math.cos(35 * Math.PI / 180)),
    heading: 90,
    speedMps: 5,
    accuracy: 10,
    timestamp: now
  };
  const result = evaluate(emergency, driver);
  assert.equal(result.collisionCourse, true);
  assert.equal(result.level, "warning");
});

test("交差して見えても到達時間が異なる場合は衝突コースとしない", () => {
  const driver = { lat: 35, lng: 139, heading: 0, speedMps: 5, accuracy: 10, timestamp: now };
  const emergency = {
    lat: 35 + 250 / metersPerLatitudeDegree,
    lng: 139 - 50 / (metersPerLatitudeDegree * Math.cos(35 * Math.PI / 180)),
    heading: 90,
    speedMps: 5,
    accuracy: 10,
    timestamp: now
  };
  const result = evaluate(emergency, driver);
  assert.equal(result.collisionCourse, false);
  assert.equal(result.level, "safe");
});

test("一般車の進行方向が不明なら推測で交差衝突と判定しない", () => {
  const driver = { lat: 35, lng: 139, speedMps: 25, accuracy: 10, timestamp: now };
  const emergency = {
    lat: 35 + 250 / metersPerLatitudeDegree,
    lng: 139 - 50 / (metersPerLatitudeDegree * Math.cos(35 * Math.PI / 180)),
    heading: 90,
    speedMps: 5,
    accuracy: 10,
    timestamp: now
  };
  const result = evaluate(emergency, driver);
  assert.equal(result.collisionCourse, false);
  assert.equal(result.level, "safe");
});

test("2,000通りの位置・速度・方位で例外や不正な判定値を出さない", () => {
  let seed = 20260829;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const levels = new Set(["safe", "warning", "critical", "unavailable"]);
  for (let index = 0; index < 2_000; index += 1) {
    const driver = {
      lat: -80 + random() * 160,
      lng: -170 + random() * 340,
      heading: random() * 360,
      speedMps: random() * 45,
      accuracy: random() * 100,
      timestamp: now - random() * 8_000
    };
    const emergency = {
      lat: Math.max(-90, Math.min(90, driver.lat + (random() - 0.5) * 0.02)),
      lng: Math.max(-180, Math.min(180, driver.lng + (random() - 0.5) * 0.02)),
      heading: random() * 360,
      speedMps: random() * 45,
      accuracy: random() * 100,
      timestamp: now - random() * 8_000
    };
    const result = evaluate(emergency, driver);
    assert.ok(levels.has(result.level));
    if (result.level !== "unavailable") assert.ok(Number.isFinite(result.distance));
  }
});

test("方位表示を前後左右すべて返せる", async () => {
  const { directionLabel } = await import("../src/safety.js");
  assert.equal(directionLabel(0, 0), "前方");
  assert.equal(directionLabel(0, 90), "右方向");
  assert.equal(directionLabel(0, 180), "後方");
  assert.equal(directionLabel(0, 270), "左方向");
});
