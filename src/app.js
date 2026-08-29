import { evaluateEmergencyApproach } from "./safety.js";
import { googleMapsUrl, loadGoogleMapsApi, updateMarkerPosition } from "./map-adapter.js";

const TOKYO_STATION = { lat: 35.681236, lng: 139.767125, heading: 0, speedMps: 12, accuracy: 12 };
const scenarios = {
  approach: { lat: 35.6840, lng: 139.767125, heading: 180, speedMps: 15, accuracy: 10 },
  rear: { lat: 35.6785, lng: 139.767125, heading: 0, speedMps: 15, accuracy: 10 },
  critical: { lat: 35.6820, lng: 139.767125, heading: 180, speedMps: 12, accuracy: 10 },
  away: { lat: 35.6832, lng: 139.767125, heading: 0, speedMps: 15, accuracy: 10 },
  outside: { lat: 35.6870, lng: 139.767125, heading: 180, speedMps: 15, accuracy: 10 },
  inaccurate: { lat: 35.6830, lng: 139.767125, heading: 180, speedMps: 15, accuracy: 140 },
  stale: { lat: 35.6830, lng: 139.767125, heading: 180, speedMps: 15, accuracy: 10, stale: true }
};

const elements = {
  panel: document.querySelector("#alertPanel"),
  icon: document.querySelector("#directionIcon"),
  kicker: document.querySelector("#alertKicker"),
  title: document.querySelector("#alertTitle"),
  detail: document.querySelector("#alertDetail"),
  distance: document.querySelector("#distanceText"),
  freshness: document.querySelector("#freshnessText"),
  emergency: document.querySelector("#fallbackEmergency"),
  driver: document.querySelector("#fallbackDriver"),
  mapsLink: document.querySelector("#openGoogleMaps"),
  getLocation: document.querySelector("#getLocation"),
  locationStatus: document.querySelector("#locationStatus"),
  drivingMode: document.querySelector("#drivingMode"),
  controls: document.querySelector(".controls"),
  soundStatus: document.querySelector("#soundStatus"),
  badge: document.querySelector("#connectionBadge")
};

let lastAnnouncement = "";
let map;
let driverMarker;
let emergencyMarker;
let audioContext;
let currentDriver = { ...TOKYO_STATION };
let usingLiveLocation = false;

async function playAlertTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.23);
    return true;
  } catch (error) {
    console.warn("警告音を再生できませんでした。", error);
    return false;
  }
}

function announceOnce(message, key, { force = false } = {}) {
  if (!force && key === lastAnnouncement) return false;
  const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  elements.soundStatus.textContent = "警告音を再生しています…";
  playAlertTone().then((toneStarted) => {
    if (toneStarted && speechSupported) elements.soundStatus.textContent = "警告音と音声を再生しました";
    else if (toneStarted) elements.soundStatus.textContent = "警告音を再生しました";
    else if (speechSupported) elements.soundStatus.textContent = "音声を再生しました。端末の音量を確認してください";
    else elements.soundStatus.textContent = "このブラウザでは警告音を再生できません";
  });
  if (speechSupported) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "ja-JP";
    utterance.rate = 0.95;
    utterance.volume = 1;
    utterance.addEventListener("error", () => {
      elements.soundStatus.textContent = "音声を再生できませんでした。端末の音量を確認してください";
    });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  lastAnnouncement = key;
  return true;
}

function renderResult(result) {
  elements.panel.className = `alert-panel ${result.level}`;
  const view = {
    safe: ["✓", "周辺状況", "接近情報はありません", "サイレンと周囲の目視確認を常に優先してください"],
    warning: ["!", "注意", result.reason, "速度を落とし、交差点と周囲を確認してください"],
    critical: ["!", "緊急", result.reason, "急操作を避け、安全に進路を譲れる状況か確認してください"],
    unavailable: ["?", "情報不明", result.reason, "警告がなくても緊急車両がいないとは限りません"]
  }[result.level];
  [elements.icon.textContent, elements.kicker.textContent, elements.title.textContent, elements.detail.textContent] = view;
  elements.distance.textContent = Number.isFinite(result.distance) ? `約 ${Math.round(result.distance)} m` : "位置不明";
  elements.freshness.textContent = result.level === "unavailable" ? "通信または精度を確認" : "8秒以内の位置情報";
  if (result.level === "warning" || result.level === "critical") {
    announceOnce(`${result.reason}。周囲を確認してください。`, `${result.level}:${result.direction}`);
  }
  else lastAnnouncement = "";
}

function runScenario(name) {
  const scenario = scenarios[name];
  const timestamp = Date.now();
  const driver = { ...currentDriver, timestamp };
  const latitudeOffset = scenario.lat - TOKYO_STATION.lat;
  const longitudeOffset = scenario.lng - TOKYO_STATION.lng;
  const emergency = {
    ...scenario,
    lat: driver.lat + latitudeOffset,
    lng: driver.lng + longitudeOffset,
    timestamp: timestamp - (scenario.stale ? 20_000 : 0)
  };
  renderResult(evaluateEmergencyApproach({ driver, emergency, now: timestamp }));
  const positions = {
    approach: [58, 31], rear: [58, 72], critical: [58, 42], away: [58, 38],
    outside: [58, 18], inaccurate: [58, 34], stale: [58, 35]
  };
  const [left, top] = positions[name];
  elements.emergency.style.left = `${left}%`;
  elements.emergency.style.top = `${top}%`;
  elements.driver.style.setProperty("--driver-heading", `${driver.heading}deg`);
  elements.emergency.style.setProperty("--emergency-heading", `${emergency.heading}deg`);
  elements.mapsLink.href = googleMapsUrl(driver);
  updateMarkerPosition(driverMarker, driver);
  if (map && usingLiveLocation) map.setCenter(driver);
  updateMarkerPosition(emergencyMarker, { lat: emergency.lat, lng: emergency.lng });
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => runScenario(button.dataset.scenario));
});
document.querySelector("#testSound").addEventListener("click", () => {
  announceOnce("警告音のテストです。緊急車両の接近時はこのようにお知らせします。", "manual-test", { force: true });
});
elements.getLocation.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    elements.locationStatus.textContent = "この端末ではGPSを利用できません";
    return;
  }
  elements.getLocation.disabled = true;
  elements.locationStatus.textContent = "現在地を取得しています…";
  navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
    currentDriver = {
      lat: coords.latitude,
      lng: coords.longitude,
      heading: Number.isFinite(coords.heading) ? coords.heading : 0,
      speedMps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : 0,
      accuracy: coords.accuracy,
      timestamp
    };
    usingLiveLocation = true;
    updateMarkerPosition(driverMarker, currentDriver);
    if (map) map.setCenter(currentDriver);
    elements.mapsLink.href = googleMapsUrl(currentDriver);
    elements.badge.textContent = map ? "Google Maps / GPS" : "簡易地図 / GPS";
    elements.locationStatus.textContent = `現在地を取得しました（精度 約${Math.round(currentDriver.accuracy)}m）`;
    elements.getLocation.disabled = false;
  }, (error) => {
    const reason = error.code === 1 ? "位置情報の利用が許可されていません" : "現在地を取得できませんでした";
    elements.locationStatus.textContent = `${reason}。端末の設定を確認してください`;
    elements.getLocation.disabled = false;
  }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 10_000 });
});
elements.drivingMode.addEventListener("change", () => {
  elements.controls.classList.toggle("driving", elements.drivingMode.checked);
});

async function loadGoogleMap() {
  const key = window.APP_CONFIG?.googleMapsApiKey;
  if (!key || key.includes("YOUR_")) return;
  try {
    await loadGoogleMapsApi(key);
    document.querySelector("#map").innerHTML = "";
    map = new google.maps.Map(document.querySelector("#map"), { center: currentDriver, zoom: 16, disableDefaultUI: true });
    driverMarker = new google.maps.Marker({ map, position: currentDriver, title: "現在地" });
    emergencyMarker = new google.maps.Marker({ map, position: scenarios.approach, title: "緊急車両（模擬）" });
    elements.badge.textContent = "Google Maps / 模擬データ";
  } catch (error) {
    console.warn("Google Mapsを読み込めないため、安全な簡易地図を使用します。", error);
    elements.badge.textContent = "簡易地図 / 模擬データ";
  }
}

runScenario("away");
loadGoogleMap();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js");
