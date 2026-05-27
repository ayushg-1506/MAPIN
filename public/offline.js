const state = {
  institutions: [],
  current: null,
  selectedPin: null,
  map: null,
  markerLayer: null,
  routeLayer: null,
  imageOverlay: null,
  liveMarker: null,
  liveWatchId: null,
  liveLatLng: null
};

const $ = (id) => document.getElementById(id);
const toast = $("toast");

/* Decorative fallback tiles shown beneath the campus image overlay */
const tileImages = [
  "/offline-tiles/campus/tile-a.svg",
  "/offline-tiles/campus/tile-b.svg",
  "/offline-tiles/campus/tile-c.svg",
  "/offline-tiles/campus/tile-d.svg"
];

function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

async function api(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pinSearchText(pin) {
  return [
    pin.locationName,
    pin.category,
    pin.buildingName,
    pin.floorNumber,
    pin.roomNumber,
    pin.description,
    pin.nearbyLandmark
  ].join(" ").toLowerCase();
}

function filteredPins() {
  const query = $("offlineSearch").value.trim().toLowerCase();
  const pins = state.current?.pins || [];
  if (!query) return pins;
  return pins.filter((pin) => pinSearchText(pin).includes(query));
}

function institutionBounds(institution) {
  const b = institution?.bounds;
  if (!b) return null;
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

function pinToLatLng(pin) {
  const bounds = state.current?.bounds;
  if (!bounds) return null;
  const lat = bounds.north - (pin.yPct / 100) * (bounds.north - bounds.south);
  const lng = bounds.west + (pin.xPct / 100) * (bounds.east - bounds.west);
  return L.latLng(lat, lng);
}

function createOfflineTileLayer() {
  return L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement("img");
      const index = Math.abs(coords.x * 5 + coords.y * 3 + coords.z) % tileImages.length;
      tile.src = tileImages[index];
      tile.alt = "";
      tile.width = 256;
      tile.height = 256;
      return tile;
    }
  });
}

function initMap() {
  const OfflineTiles = createOfflineTileLayer();
  state.map = L.map("offlineLeafletMap", {
    zoomControl: true,
    attributionControl: false,
    minZoom: 13,
    maxZoom: 19
  });
  new OfflineTiles({ tileSize: 256 }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
}

function renderInstitutionOptions() {
  $("offlineInstitutionSelect").innerHTML = state.institutions.map((institution) => `
    <option value="${escapeHtml(institution.id)}">${escapeHtml(institution.name)}</option>
  `).join("");
  $("offlineInstitutionSelect").value = state.current?.id || state.institutions[0]?.id || "";
}

async function selectInstitution(id) {
  state.current = await api(`/api/institutions/${id}`);
  state.selectedPin = state.current.pins[0] || null;
  renderInstitutionOptions();
  renderCurrent();
}

function renderCurrent() {
  if (!state.current) return;
  $("offlineTitle").textContent = state.current.name;
  $("offlineMeta").textContent = `${state.current.city || "Campus"} - ${state.current.pins.length} offline-ready pins`;
  $("offlinePinCount").textContent = `${state.current.pins.length} pins`;

  const bounds = institutionBounds(state.current);
  state.markerLayer.clearLayers();
  state.routeLayer.clearLayers();

  /* Remove old campus image overlay if any */
  if (state.imageOverlay) {
    state.map.removeLayer(state.imageOverlay);
    state.imageOverlay = null;
  }

  if (bounds) {
    state.map.fitBounds(bounds.pad(0.2));

    /* Overlay the actual campus map image on top of the tile layer */
    const mapUrl = state.current.map && state.current.map.url;
    const mapKind = state.current.map && state.current.map.kind;
    console.log("[MAPIN] Overlay check:", { mapUrl, mapKind, hasBounds: !!bounds });
    if (mapUrl && mapKind === "image") {
      try {
        console.log("[MAPIN] Creating image overlay:", mapUrl, bounds.toBBoxString());
        state.imageOverlay = L.imageOverlay(mapUrl, bounds, {
          opacity: 0.95,
          interactive: false
        }).addTo(state.map);
        console.log("[MAPIN] Image overlay added successfully");
        /* Boost overlay pane above tile pane */
        const overlayPane = state.map.getPane("overlayPane");
        if (overlayPane) {
          overlayPane.style.zIndex = "250";
          console.log("[MAPIN] Overlay pane z-index set to 250");
        }
      } catch (err) {
        console.error("[MAPIN] Image overlay failed:", err);
      }
    }

    /* Campus boundary rectangle */
    L.rectangle(bounds, {
      color: "#177e80",
      weight: 2,
      fill: false,
      dashArray: "6 6"
    }).addTo(state.routeLayer);
  } else {
    state.map.setView([12.9716, 77.5946], 13);
  }

  /* Custom marker icon for a nicer look */
  const pinIcon = L.divIcon({
    className: "offline-pin-icon",
    html: `<span style="
      display:block;width:18px;height:18px;
      background:#d86745;border:3px solid #fff;
      border-radius:50% 50% 50% 4px;transform:rotate(-45deg);
      box-shadow:0 4px 12px rgba(0,0,0,.3);">
    </span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18]
  });

  state.current.pins.forEach((pin) => {
    const latLng = pinToLatLng(pin);
    if (!latLng) return;
    L.marker(latLng, { icon: pinIcon })
      .addTo(state.markerLayer)
      .bindPopup(`<strong>${escapeHtml(pin.locationName)}</strong><br>${escapeHtml(pin.category || "")}`)
      .on("click", () => selectPin(pin.id));
  });

  renderResults();
  renderDetail();
  drawRoute();
}

function renderResults() {
  const pins = filteredPins();
  $("offlineResults").innerHTML = pins.map((pin) => `
    <button class="result-row ${state.selectedPin?.id === pin.id ? "active" : ""}" data-id="${pin.id}" type="button">
      <strong>${escapeHtml(pin.locationName)}</strong>
      <span>${escapeHtml(pin.category)} - ${escapeHtml(pin.buildingName || "Campus")} ${escapeHtml(pin.roomNumber || "")}</span>
    </button>
  `).join("") || `<p class="detail-empty">No offline locations found.</p>`;
}

function renderDetail() {
  const pin = state.selectedPin;
  if (!pin) {
    $("offlineDetail").innerHTML = `<p class="detail-empty">Select a location.</p>`;
    return;
  }
  $("offlineDetail").innerHTML = `
    <h2 class="detail-title">${escapeHtml(pin.locationName)}</h2>
    <div class="detail-chip-row">
      <span class="detail-chip">${escapeHtml(pin.category || "Location")}</span>
      ${pin.buildingName ? `<span class="detail-chip">Building: ${escapeHtml(pin.buildingName)}</span>` : ""}
      ${pin.floorNumber ? `<span class="detail-chip">Floor: ${escapeHtml(pin.floorNumber)}</span>` : ""}
      ${pin.roomNumber ? `<span class="detail-chip">Room: ${escapeHtml(pin.roomNumber)}</span>` : ""}
    </div>
    <p class="muted">${escapeHtml(pin.description || "Offline campus location.")}</p>
  `;
}

function selectPin(id) {
  const pin = state.current.pins.find((item) => item.id === id);
  if (!pin) return;
  state.selectedPin = pin;
  const latLng = pinToLatLng(pin);
  if (latLng) state.map.setView(latLng, Math.max(state.map.getZoom(), 17));
  renderResults();
  renderDetail();
  drawRoute();
}

function drawRoute() {
  state.routeLayer.clearLayers();
  const bounds = institutionBounds(state.current);
  if (bounds) {
    L.rectangle(bounds, {
      color: "#177e80",
      weight: 2,
      fill: false,
      dashArray: "6 6"
    }).addTo(state.routeLayer);
  }

  const destination = state.selectedPin ? pinToLatLng(state.selectedPin) : null;
  if (!destination) {
    $("offlineMode").textContent = "Select a location";
    return;
  }

  /* Only draw route from live location — never from campus center */
  if (!state.liveLatLng) {
    $("offlineMode").textContent = "Enable GPS for route";
    return;
  }

  $("offlineMode").textContent = "Routing";
  L.polyline([state.liveLatLng, destination], {
    color: "#d86745",
    weight: 5,
    opacity: 0.9,
    dashArray: "10 6"
  }).addTo(state.routeLayer);

  /* Show distance */
  const dist = state.liveLatLng.distanceTo(destination);
  $("offlineDetail").insertAdjacentHTML("beforeend",
    `<p style="color:#0ea3be;font-weight:600;margin-top:8px;">📍 ~${Math.round(dist)} m away</p>`);
}

function startLiveLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.", "error");
    return;
  }
  if (state.liveWatchId !== null) navigator.geolocation.clearWatch(state.liveWatchId);
  state.liveWatchId = navigator.geolocation.watchPosition((position) => {
    state.liveLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
    if (!state.liveMarker) {
      state.liveMarker = L.circleMarker(state.liveLatLng, {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#177e80",
        fillOpacity: 1
      }).addTo(state.map);
    } else {
      state.liveMarker.setLatLng(state.liveLatLng);
    }
    $("offlineLiveMode").textContent = "Tracking";
    $("offlineLiveStatus").textContent = `${state.liveLatLng.lat.toFixed(6)}, ${state.liveLatLng.lng.toFixed(6)} - ${Math.round(position.coords.accuracy)} m accuracy`;
    drawRoute();
  }, (error) => {
    showToast(error.message, "error");
  }, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
  });
  showToast("Live location started.");
}

function bindEvents() {
  $("offlineInstitutionSelect").addEventListener("change", (event) => {
    selectInstitution(event.target.value).catch((error) => showToast(error.message, "error"));
  });
  $("offlineResults").addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) selectPin(row.dataset.id);
  });
  $("offlineSearch").addEventListener("input", renderResults);
  $("offlineRouteButton").addEventListener("click", drawRoute);
  $("offlineLocateButton").addEventListener("click", startLiveLocation);
}

async function init() {
  initMap();
  bindEvents();
  state.institutions = await api("/api/institutions");
  const initialId = new URLSearchParams(window.location.search).get("id") || "dsce-campus";
  await selectInstitution(initialId);
}

init().catch((error) => showToast(error.message, "error"));
