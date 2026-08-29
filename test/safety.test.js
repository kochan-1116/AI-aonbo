import test from "node:test";
import assert from "node:assert/strict";
import {
  angularDifference,
  bearingDegrees,
  directionLabel,
  distanceMeters,
  evaluateEmergencyApproach
} from "../src/safety.js";

const now = 1_800_000_000_000;
const driver = { lat: 35.681236, lng: 139.767125, heading: 0, accuracy: 10, timestamp: now };
const emergency = (overrides = {}) => ({
  lat: 35.6840,
  lng: 139.767125,
  heading: 180,
  accuracy: 10,
  timestamp: now,
  ...overrides
});

test("距離計算は東京駅付近の約307mを返す", () => {
  assert.ok(Math.abs(distanceMeters(driver, emergency()) - 307) < 3);
});

test("方位と角度差を0〜360度の境界でも正しく扱う", () => {
  assert.ok(bearingDegrees(driver, emergency()) < 1 || bearingDegrees(driver, emergency()) > 359);
  assert.equal(angularDifference(350, 10), 20);
  assert.equal(directionLabel(0, 90), "右方向");
});

test("500m以内でこちらへ向かう車両を警告する", () => {
  const result = evaluateEmergencyApproach({ driver, emergency: emergency(), now });
  assert.equal(result.level, "warning");
  assert.equal(result.approaching, true);
});

test("200m以内は緊急警告にする", () => {
  const result = evaluateEmergencyApproach({ driver, emergency: emergency({ lat: 35.6820 }), now });
  assert.equal(result.level, "critical");
});

test("500m以内でも遠ざかる車両には警告しない", () => {
  const result = evaluateEmergencyApproach({ driver, emergency: emergency({ heading: 0 }), now });
  assert.equal(result.level, "safe");
  assert.equal(result.approaching, false);
});

test("500mより遠い車両には警告しない", () => {
  const result = evaluateEmergencyApproach({ driver, emergency: emergency({ lat: 35.687 }), now });
  assert.equal(result.level, "safe");
});

test("8秒を超えたデータは不明扱いにする", () => {
  const result = evaluateEmergencyApproach({ driver, emergency: emergency({ timestamp: now - 8_001 }), now });
  assert.equal(result.level, "unavailable");
});

test("未来時刻と精度不足を不明扱いにする", () => {
  assert.equal(evaluateEmergencyApproach({ driver, emergency: emergency({ timestamp: now + 2_000 }), now }).level, "unavailable");
  assert.equal(evaluateEmergencyApproach({ driver, emergency: emergency({ accuracy: 101 }), now }).level, "unavailable");
});

test("位置が欠けている場合は例外を出さず不明扱いにする", () => {
  assert.equal(evaluateEmergencyApproach({ driver: null, emergency: emergency(), now }).level, "unavailable");
  assert.equal(evaluateEmergencyApproach({ driver, emergency: emergency({ lat: undefined }), now }).level, "unavailable");
  assert.equal(evaluateEmergencyApproach({ driver, emergency: emergency({ heading: undefined }), now }).level, "unavailable");
  assert.equal(evaluateEmergencyApproach({ driver, emergency: emergency({ lat: 91 }), now }).level, "unavailable");
});
