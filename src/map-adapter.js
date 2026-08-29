export function googleMapsScriptUrl(apiKey, callbackName) {
  const params = new URLSearchParams({ key: apiKey, v: "weekly", callback: callbackName });
  return `https://maps.googleapis.com/maps/api/js?${params}`;
}

export function googleMapsUrl(position) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  const params = new URLSearchParams({ api: "1", query: `${position.lat},${position.lng}` });
  return `https://www.google.com/maps/search/?${params}`;
}

export function updateMarkerPosition(marker, position) {
  if (!marker) return false;
  if (typeof marker.setPosition === "function") marker.setPosition(position);
  else if (typeof marker.setLatLng === "function") marker.setLatLng([position.lat, position.lng]);
  else marker.position = position;
  return true;
}

export function centerMap(map, position) {
  if (!map || !position) return false;
  if (typeof map.setCenter === "function") map.setCenter(position);
  else if (typeof map.panTo === "function") map.panTo([position.lat, position.lng]);
  else return false;
  return true;
}

export function loadGoogleMapsApi(apiKey, windowObject = window, documentObject = document) {
  if (windowObject.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const callbackName = "__safetyNavGoogleMapsReady";
    const script = documentObject.createElement("script");
    windowObject[callbackName] = () => {
      delete windowObject[callbackName];
      resolve();
    };
    script.src = googleMapsScriptUrl(apiKey, callbackName);
    script.async = true;
    script.onerror = () => {
      delete windowObject[callbackName];
      reject(new Error("Google Maps APIの読み込みに失敗しました"));
    };
    documentObject.head.append(script);
  });
}
