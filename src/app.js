import { evaluateEmergencyApproach } from "./safety.js";

const TOKYO_STATION = { lat: 35.681236, lng: 139.767125, heading: 0, speedMps: 12, accuracy: 12 };
const scenarios = {
  approach: { lat: 35.6840, lng: 139.767125, heading: 180, speedMps: 15, accuracy: 10 },
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
  drivingMode: document.querySelector("#drivingMode"),
  controls: document.querySelector(".controls"),
  badge: document.querySelector("#connectionBadge")
};

let lastAnnouncement = "";
let map;
let driverMarker;
let emergencyMarker;

function announceOnce(message, key) {
  if (!elements.drivingMode.checked || key === lastAnnouncement || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
  lastAnnouncement = key;
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
  const emergency = {
    ...scenario,
    timestamp: Date.now() - (scenario.stale ? 20_000 : 0)
  };
  renderResult(evaluateEmergencyApproach({ driver: TOKYO_STATION, emergency }));
  const positions = {
    approach: [63, 31], critical: [57, 42], away: [69, 38],
    outside: [78, 18], inaccurate: [70, 34], stale: [72, 35]
  };
  const [left, top] = positions[name];
  elements.emergency.style.left = `${left}%`;
  elements.emergency.style.top = `${top}%`;
  if (emergencyMarker) emergencyMarker.position = { lat: emergency.lat, lng: emergency.lng };
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => runScenario(button.dataset.scenario));
});
elements.drivingMode.addEventListener("change", () => {
  elements.controls.classList.toggle("driving", elements.drivingMode.checked);
  if (!elements.drivingMode.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

async function loadGoogleMap() {
  const key = window.APP_CONFIG?.googleMapsApiKey;
  if (!key || key.includes("YOUR_")) return;
  try {
    const { Loader } = await import("https://unpkg.com/@googlemaps/js-api-loader@1.16.8/dist/index.esm.js");
    const loader = new Loader({ apiKey: key, version: "weekly" });
    await loader.load();
    document.querySelector("#map").innerHTML = "";
    map = new google.maps.Map(document.querySelector("#map"), { center: TOKYO_STATION, zoom: 16, disableDefaultUI: true });
    driverMarker = new google.maps.Marker({ map, position: TOKYO_STATION, title: "現在地" });
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
