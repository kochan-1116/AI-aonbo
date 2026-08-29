import test from "node:test";
import assert from "node:assert/strict";
import {
  googleMapsUrl,
  googleMapsScriptUrl,
  loadGoogleMapsApi,
  updateMarkerPosition
} from "../src/map-adapter.js";

test("Google Mapsの現在地リンクは座標を公式URLへ安全に渡す", () => {
  const url = new URL(googleMapsUrl({ lat: 35.681236, lng: 139.767125 }));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "35.681236,139.767125");
  assert.equal(googleMapsUrl({ lat: Number.NaN, lng: 139 }), null);
});

test("Google Maps URLは公式ドメインを使いキーを安全にURLエンコードする", () => {
  const url = new URL(googleMapsScriptUrl("key+with/symbols", "ready"));
  assert.equal(url.origin, "https://maps.googleapis.com");
  assert.equal(url.searchParams.get("key"), "key+with/symbols");
  assert.equal(url.searchParams.get("callback"), "ready");
});

test("従来型Google MapsマーカーはsetPositionで更新する", () => {
  let received;
  const marker = { setPosition: (position) => { received = position; } };
  assert.equal(updateMarkerPosition(marker, { lat: 35, lng: 139 }), true);
  assert.deepEqual(received, { lat: 35, lng: 139 });
});

test("新型マーカーはpositionプロパティで更新する", () => {
  const marker = {};
  assert.equal(updateMarkerPosition(marker, { lat: 35, lng: 139 }), true);
  assert.deepEqual(marker.position, { lat: 35, lng: 139 });
  assert.equal(updateMarkerPosition(null, { lat: 0, lng: 0 }), false);
});

test("Google Mapsが読込済みならスクリプトを重複追加しない", async () => {
  let appended = false;
  const windowObject = { google: { maps: {} } };
  const documentObject = { head: { append: () => { appended = true; } } };
  await loadGoogleMapsApi("test-key", windowObject, documentObject);
  assert.equal(appended, false);
});

test("Google Mapsコールバックで読込完了し一時関数を削除する", async () => {
  const windowObject = {};
  let appendedScript;
  const documentObject = {
    createElement: () => ({}),
    head: { append: (script) => { appendedScript = script; } }
  };
  const loading = loadGoogleMapsApi("test-key", windowObject, documentObject);
  assert.equal(appendedScript.async, true);
  windowObject.__safetyNavGoogleMapsReady();
  await loading;
  assert.equal(windowObject.__safetyNavGoogleMapsReady, undefined);
});

test("Google Maps読込失敗時はエラーを返し一時関数を削除する", async () => {
  const windowObject = {};
  let appendedScript;
  const documentObject = {
    createElement: () => ({}),
    head: { append: (script) => { appendedScript = script; } }
  };
  const loading = loadGoogleMapsApi("test-key", windowObject, documentObject);
  appendedScript.onerror();
  await assert.rejects(loading, /読み込みに失敗/);
  assert.equal(windowObject.__safetyNavGoogleMapsReady, undefined);
});
