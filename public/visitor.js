const visitorState = {
  institution: null,
  selectedPin: null,
  liveWatchId: null,
  livePosition: null,
  category: ""
};

const $ = (id) => document.getElementById(id);
const toast = $("toast");
const categoryColors = {
  "Block": "#d86745",
  "Department": "#177e80",
  "Lab": "#6b6aa8",
  "Office": "#5e8f63",
  "Seminar Hall": "#c4952f",
  "Library": "#8a5a44",
  "Parking": "#436b8f",
  "Canteen": "#c56b2d",
  "Entry Gate": "#2f6d4e"
};

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

function getInstitutionId() {
  const pathMatch = window.location.pathname.match(/^\/m\/([^/]+)/);
  return pathMatch?.[1] || new URLSearchParams(window.location.search).get("id") || "demo-campus";
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

function selectedCategory() {
  return visitorState.category;
}

function filteredPins() {
  const query = $("visitorSearch").value.trim().toLowerCase();
  const category = selectedCategory();
  return (visitorState.institution?.pins || []).filter((pin) => {
    const categoryMatch = !category || pin.category === category;
    const queryMatch = !query || pinSearchText(pin).includes(query);
    return categoryMatch && queryMatch;
  });
}

function categoryColor(pin) {
  return categoryColors[pin.category] || "#d86745";
}

function shareUrl() {
  return `${window.location.origin}/m/${visitorState.institution?.id || getInstitutionId()}`;
}

function renderMap() {
  const institution = visitorState.institution;
  if (!institution) return;
  $("visitorCampusName").textContent = institution.name;
  $("visitorSubtitle").textContent = institution.city || "Visitor navigation";
  $("visitorCampusMeta").textContent = `${institution.city || "Campus"} - ${institution.pins.length} mapped locations`;
  $("visitorPinCount").textContent = `${institution.pins.length} pins`;
  $("offlineVisitorLink").href = `/offline.html?id=${encodeURIComponent(institution.id)}`;

  $("visitorMapImage").style.display = institution.map.kind === "image" ? "block" : "none";
  $("visitorMapPdf").style.display = institution.map.kind === "pdf" ? "block" : "none";
  if (institution.map.kind === "image") $("visitorMapImage").src = institution.map.url;
  if (institution.map.kind === "pdf") $("visitorMapPdf").src = institution.map.url;

  renderCategoryOptions();
  renderPins();
  renderResults();
  renderDestination();
  renderCampusMedia();
  renderLiveLocation();
}

function renderCategoryOptions() {
  const categories = [...new Set(visitorState.institution.pins.map((pin) => pin.category).filter(Boolean))].sort();
  const chips = $("visitorCategoryChips");
  if (!chips) return;
  
  const allChip = `<button type="button" class="category-chip ${visitorState.category === "" ? "active" : ""}" data-category="">All</button>`;
  const catChips = categories.map((category) => `
    <button type="button" class="category-chip ${visitorState.category === category ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join("");
  
  chips.innerHTML = allChip + catChips;
}

function renderPins() {
  const visible = new Set(filteredPins().map((pin) => pin.id));
  $("visitorPinLayer").innerHTML = visitorState.institution.pins.map((pin) => {
    const active = visitorState.selectedPin?.id === pin.id;
    const dimmed = visible.has(pin.id) ? "" : "opacity:.32";
    return `
      <button class="pin-marker ${active ? "active" : ""}" type="button" data-id="${pin.id}"
        style="left:${pin.xPct}%;top:${pin.yPct}%;--pin-color:${categoryColor(pin)};${dimmed}">
        <span class="pin-dot"></span>
        <span class="pin-label">${escapeHtml(pin.locationName)}</span>
      </button>
    `;
  }).join("");
}

function renderResults() {
  const pins = filteredPins();
  $("visitorResultCount").textContent = `${pins.length} found`;
  $("visitorResults").innerHTML = pins.map((pin) => `
    <button class="result-row ${visitorState.selectedPin?.id === pin.id ? "active" : ""}" data-id="${pin.id}" type="button">
      <strong>${escapeHtml(pin.locationName)}</strong>
      <span>${escapeHtml(pin.category)} - ${escapeHtml(pin.buildingName || "Campus")} ${escapeHtml(pin.roomNumber || "")}</span>
    </button>
  `).join("") || `<p class="detail-empty">No locations found.</p>`;
}

function renderDestination() {
  const pin = visitorState.selectedPin;
  if (!pin) {
    $("destinationDetail").innerHTML = `<p class="detail-empty">Select a location from the map or results.</p>`;
    $("googleMapsLink").classList.add("disabled-link");
    $("googleMapsLink").href = "#";
    return;
  }

  const chips = [
    pin.category,
    pin.buildingName && `Building: ${pin.buildingName}`,
    pin.floorNumber && `Floor: ${pin.floorNumber}`,
    pin.roomNumber && `Room: ${pin.roomNumber}`,
    pin.nearbyLandmark && `Near: ${pin.nearbyLandmark}`
  ].filter(Boolean);

  const gps = pinToGps(pin);
  let distanceHtml = "";
  if (gps && visitorState.livePosition) {
    const dist = calculateDistance(visitorState.livePosition.lat, visitorState.livePosition.lng, gps.lat, gps.lng);
    distanceHtml = `<p class="distance-info" style="color: #0ea3be; font-weight: 500; margin-bottom: 8px;">📍 ${Math.round(dist)} meters away</p>`;
  }

  $("destinationDetail").innerHTML = `
    <h2 class="detail-title">${escapeHtml(pin.locationName)}</h2>
    ${distanceHtml}
    <div class="detail-chip-row">
      ${chips.map((chip) => `<span class="detail-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
    <p class="muted">${escapeHtml(pin.description || "Mapped campus location.")}</p>
  `;

  if (gps) {
    $("googleMapsLink").classList.remove("disabled-link");
    $("googleMapsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${gps.lat},${gps.lng}`;
  } else {
    $("googleMapsLink").classList.add("disabled-link");
    $("googleMapsLink").href = "#";
  }
}

function renderCampusMedia() {
  const media = visitorState.institution?.media || [];
  $("visitorMediaCount").textContent = `${media.length} items`;
  $("visitorMediaPanel").style.display = media.length ? "block" : "none";
  $("visitorMediaGallery").innerHTML = media.map((item) => mediaCard(item)).join("");
}

function mediaCard(item) {
  const title = escapeHtml(item.title || "Campus view");
  const caption = escapeHtml(item.caption || item.kind || "");
  const url = escapeHtml(item.url);
  if (item.kind === "video") {
    return `
      <article class="media-card">
        <video src="${url}" controls preload="metadata"></video>
        <div class="media-caption"><strong>${title}</strong><span>${caption}</span></div>
      </article>
    `;
  }
  return `
    <article class="media-card">
      <a href="${url}" target="_blank" rel="noreferrer">
        <img src="${url}" alt="${title}">
        <div class="media-caption"><strong>${title}</strong><span>${caption}</span></div>
      </a>
    </article>
  `;
}

function selectPin(pinId) {
  const pin = visitorState.institution.pins.find((item) => item.id === pinId);
  if (!pin) return;
  visitorState.selectedPin = pin;
  renderPins();
  renderResults();
  renderDestination();

  const stage = $("visitorMapStage");
  if (stage) {
    stage.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function projectLocation(position) {
  const bounds = visitorState.institution?.bounds;
  if (!bounds) return null;
  const xPct = ((position.lng - bounds.west) / (bounds.east - bounds.west)) * 100;
  const yPct = ((bounds.north - position.lat) / (bounds.north - bounds.south)) * 100;
  return { xPct, yPct, inside: xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100 };
}

function pinToGps(pin) {
  const bounds = visitorState.institution?.bounds;
  if (!bounds) return null;
  const lat = bounds.north - (pin.yPct / 100) * (bounds.north - bounds.south);
  const lng = bounds.west + (pin.xPct / 100) * (bounds.east - bounds.west);
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function renderLiveLocation() {
  const layer = $("visitorLiveLayer");
  layer.innerHTML = "";
  if (!visitorState.livePosition) {
    $("visitorLiveStatus").textContent = "Live location idle";
    $("visitorLiveMode").textContent = "Idle";
    return;
  }

  const { lat, lng, accuracy } = visitorState.livePosition;
  const projected = projectLocation(visitorState.livePosition);
  $("visitorLiveMode").textContent = projected?.inside ? "On map" : "GPS";
  $("visitorLiveStatus").textContent = projected
    ? `${lat.toFixed(6)}, ${lng.toFixed(6)} - ${Math.round(accuracy)} m accuracy${projected.inside ? "" : " - outside boundary"}`
    : `${lat.toFixed(6)}, ${lng.toFixed(6)} - ${Math.round(accuracy)} m accuracy`;

  if (projected?.inside) {
    layer.innerHTML = `<span class="live-dot" style="left:${projected.xPct}%;top:${projected.yPct}%"></span>`;
  }
}

function startLiveLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.", "error");
    return;
  }
  if (visitorState.liveWatchId !== null) navigator.geolocation.clearWatch(visitorState.liveWatchId);
  visitorState.liveWatchId = navigator.geolocation.watchPosition((position) => {
    visitorState.livePosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    renderLiveLocation();
    renderDestination();
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
  $("visitorPinLayer").addEventListener("click", (event) => {
    const marker = event.target.closest("[data-id]");
    if (marker) selectPin(marker.dataset.id);
  });

  $("visitorResults").addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) selectPin(row.dataset.id);
  });

  $("visitorSearch").addEventListener("input", () => {
    renderPins();
    renderResults();
  });

  const chipsContainer = $("visitorCategoryChips");
  if (chipsContainer) {
    chipsContainer.addEventListener("click", (event) => {
      const chip = event.target.closest(".category-chip");
      if (!chip) return;
      visitorState.category = chip.dataset.category || "";
      renderCategoryOptions();
      renderPins();
      renderResults();
    });
  }

  $("visitorLocateButton").addEventListener("click", startLiveLocation);

  $("visitorCopyButton").addEventListener("click", async () => {
    await navigator.clipboard.writeText(shareUrl());
    showToast("Share link copied.");
  });
}

function generateQRCode() {
  const container = $("qrcodeContainer");
  if (!container || typeof QRCode === "undefined") return;
  container.innerHTML = "";
  new QRCode(container, {
    text: shareUrl(),
    width: 140,
    height: 140,
    colorDark: "#1f2f2b",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.L
  });
}

async function init() {
  bindEvents();
  visitorState.institution = await api(`/api/institutions/${getInstitutionId()}`);
  visitorState.selectedPin = visitorState.institution.pins[0] || null;
  renderMap();
  generateQRCode();
  initMapZoom();
}

function initMapZoom() {
  const elem = $("panzoomElement");
  if (!elem || typeof Panzoom === "undefined") return;
  const panzoom = Panzoom(elem, {
    maxScale: 5,
    minScale: 0.5,
    step: 0.1
  });
  elem.parentElement.addEventListener("wheel", panzoom.zoomWithWheel);
}

init().catch((error) => {
  $("visitorCampusName").textContent = "Map not found";
  $("visitorCampusMeta").textContent = error.message;
  showToast(error.message, "error");
});
