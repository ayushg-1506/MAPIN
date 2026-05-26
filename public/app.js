const state = {
  institutions: [],
  current: null,
  selectedPin: null,
  draftPin: null,
  addMode: false,
  drag: null,
  liveWatchId: null,
  livePosition: null
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

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
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

function shareUrl(id = state.current?.id) {
  return id ? `${window.location.origin}/m/${id}` : window.location.origin;
}

function categoryColor(pin) {
  return categoryColors[pin.category] || "#d86745";
}

function eventToPercent(event) {
  const rect = $("panzoomElement") ? $("panzoomElement").getBoundingClientRect() : $("mapStage").getBoundingClientRect();
  const xPct = ((event.clientX - rect.left) / rect.width) * 100;
  const yPct = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    xPct: Math.min(100, Math.max(0, xPct)),
    yPct: Math.min(100, Math.max(0, yPct))
  };
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

function matchingPins() {
  const query = $("pinSearch").value.trim().toLowerCase();
  const pins = state.current?.pins || [];
  if (!query) return pins;
  return pins.filter((pin) => pinSearchText(pin).includes(query));
}

function pinPayloadFromForm() {
  return {
    locationName: $("locationName").value,
    category: $("category").value,
    buildingName: $("buildingName").value,
    floorNumber: $("floorNumber").value,
    roomNumber: $("roomNumber").value,
    description: $("description").value,
    nearbyLandmark: $("nearbyLandmark").value,
    xPct: state.selectedPin?.xPct ?? state.draftPin?.xPct ?? 50,
    yPct: state.selectedPin?.yPct ?? state.draftPin?.yPct ?? 50
  };
}

async function loadInstitutions(selectId = null) {
  state.institutions = await api("/api/institutions");
  renderInstitutionList();
  const id = selectId || state.current?.id || state.institutions[0]?.id;
  if (id) await selectInstitution(id);
}

async function selectInstitution(id) {
  state.current = await api(`/api/institutions/${id}`);
  state.selectedPin = null;
  state.draftPin = null;
  state.addMode = false;
  renderCurrent();
}

function renderInstitutionList() {
  $("institutionCount").textContent = `${state.institutions.length} maps`;
  $("institutionList").innerHTML = state.institutions.map((institution) => `
    <button class="institution-card ${state.current?.id === institution.id ? "active" : ""}" data-id="${institution.id}" type="button">
      <strong>${escapeHtml(institution.name)}</strong>
      <span>${escapeHtml(institution.city || "Campus")} - ${institution.pinCount} pins</span>
    </button>
  `).join("");
}

function renderCurrent() {
  if (!state.current) return;
  $("currentName").textContent = state.current.name;
  $("currentMeta").textContent = `${state.current.city || "Campus"} - ${state.current.pins.length} saved pins`;
  $("visitorLink").href = shareUrl();
  $("offlineLink").href = `/offline.html?id=${encodeURIComponent(state.current.id)}`;
  $("addPinButton").classList.toggle("primary", state.addMode);
  $("addPinButton").textContent = state.addMode ? "Placing Pin" : "Add Pin";

  $("mapImage").style.display = state.current.map.kind === "image" ? "block" : "none";
  $("mapPdf").style.display = state.current.map.kind === "pdf" ? "block" : "none";
  if (state.current.map.kind === "image") $("mapImage").src = state.current.map.url;
  if (state.current.map.kind === "pdf") $("mapPdf").src = state.current.map.url;

  fillBoundsForm();
  renderInstitutionList();
  renderPins();
  renderPinResults();
  renderCampusMedia();
  renderLiveLocation();
  clearPinForm();
}

function renderPins() {
  const pins = state.current?.pins || [];
  const savedPins = pins.map((pin) => pinMarker(pin)).join("");
  const draft = state.draftPin ? pinMarker(state.draftPin, true) : "";
  $("pinLayer").innerHTML = savedPins + draft;
  bindPinMarkers();
  $("pinCount").textContent = `${pins.length} pins`;
}

function pinMarker(pin, isDraft = false) {
  const active = state.selectedPin?.id === pin.id || (isDraft && state.draftPin);
  return `
    <button class="pin-marker ${active ? "active" : ""} ${isDraft ? "draft" : ""}"
      type="button"
      data-pin-id="${escapeHtml(pin.id)}"
      data-draft="${isDraft ? "true" : "false"}"
      style="left:${pin.xPct}%;top:${pin.yPct}%;--pin-color:${categoryColor(pin)}">
      <span class="pin-dot"></span>
      <span class="pin-label">${escapeHtml(pin.locationName || "New pin")}</span>
    </button>
  `;
}

function bindPinMarkers() {
  document.querySelectorAll(".pin-marker").forEach((marker) => {
    marker.addEventListener("pointerdown", (event) => startDrag(event, marker));
    marker.addEventListener("click", (event) => event.stopPropagation());
  });
}

function renderPinResults() {
  const pins = matchingPins();
  $("pinResults").innerHTML = pins.map((pin) => `
    <button class="result-row ${state.selectedPin?.id === pin.id ? "active" : ""}" data-id="${pin.id}" type="button">
      <strong>${escapeHtml(pin.locationName)}</strong>
      <span>${escapeHtml(pin.category)} - ${escapeHtml(pin.buildingName || "Campus")} ${escapeHtml(pin.roomNumber || "")}</span>
    </button>
  `).join("") || `<p class="detail-empty">No locations found.</p>`;
}

function renderCampusMedia() {
  const media = state.current?.media || [];
  $("campusMediaCount").textContent = `${media.length} items`;
  $("campusMediaPanel").style.display = media.length ? "block" : "none";
  $("campusMediaGallery").innerHTML = media.map((item) => mediaCard(item)).join("");
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

function fillBoundsForm() {
  const bounds = state.current?.bounds || {};
  $("northBound").value = bounds.north ?? "";
  $("southBound").value = bounds.south ?? "";
  $("westBound").value = bounds.west ?? "";
  $("eastBound").value = bounds.east ?? "";
}

function clearPinForm() {
  state.selectedPin = null;
  $("pinId").value = "";
  $("pinModeLabel").textContent = state.draftPin ? "Draft" : "New";
  $("locationName").value = state.draftPin?.locationName || "";
  $("category").value = state.draftPin?.category || "Block";
  $("buildingName").value = "";
  $("floorNumber").value = "";
  $("roomNumber").value = "";
  $("description").value = "";
  $("nearbyLandmark").value = "";
  $("deletePinButton").disabled = true;
  renderPins();
  renderPinResults();
}

function populatePinForm(pin, shouldRender = true) {
  state.selectedPin = pin;
  state.draftPin = null;
  $("pinId").value = pin.id;
  $("pinModeLabel").textContent = "Saved";
  $("locationName").value = pin.locationName || "";
  $("category").value = pin.category || "Block";
  $("buildingName").value = pin.buildingName || "";
  $("floorNumber").value = pin.floorNumber || "";
  $("roomNumber").value = pin.roomNumber || "";
  $("description").value = pin.description || "";
  $("nearbyLandmark").value = pin.nearbyLandmark || "";
  $("deletePinButton").disabled = false;
  if (shouldRender) {
    renderPins();
    renderPinResults();
  }
}

function createDraftPin(event) {
  const point = eventToPercent(event);
  state.addMode = false;
  state.selectedPin = null;
  state.draftPin = {
    id: "draft-pin",
    locationName: "",
    category: "Block",
    xPct: point.xPct,
    yPct: point.yPct
  };
  renderCurrent();
  $("locationName").focus();
  showToast("Pin placed. Add the location details.");
}

function startDrag(event, marker) {
  event.preventDefault();
  event.stopPropagation();
  const isDraft = marker.dataset.draft === "true";
  const pin = isDraft ? state.draftPin : state.current.pins.find((item) => item.id === marker.dataset.pinId);
  if (!pin) return;
  if (!isDraft) populatePinForm(pin, false);

  state.drag = {
    pin,
    marker,
    isDraft,
    moved: false,
    startX: event.clientX,
    startY: event.clientY
  };

  marker.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function onDrag(event) {
  if (!state.drag) return;
  const dx = Math.abs(event.clientX - state.drag.startX);
  const dy = Math.abs(event.clientY - state.drag.startY);
  if (dx + dy > 3) state.drag.moved = true;
  const point = eventToPercent(event);
  state.drag.pin.xPct = point.xPct;
  state.drag.pin.yPct = point.yPct;
  state.drag.marker.style.left = `${point.xPct}%`;
  state.drag.marker.style.top = `${point.yPct}%`;
}

async function endDrag() {
  window.removeEventListener("pointermove", onDrag);
  const drag = state.drag;
  state.drag = null;
  if (!drag) return;

  if (drag.isDraft) {
    renderPins();
    return;
  }

  if (drag.moved) {
    try {
      await api(`/api/institutions/${state.current.id}/pins/${drag.pin.id}`, {
        method: "PUT",
        body: JSON.stringify(drag.pin)
      });
      await selectInstitution(state.current.id);
      const updated = state.current.pins.find((pin) => pin.id === drag.pin.id);
      if (updated) populatePinForm(updated);
      showToast("Pin position saved.");
    } catch (error) {
      showToast(error.message, "error");
    }
  } else {
    renderPins();
    renderPinResults();
  }
}

function projectLocation(position) {
  const bounds = state.current?.bounds;
  if (!bounds) return null;
  const xPct = ((position.lng - bounds.west) / (bounds.east - bounds.west)) * 100;
  const yPct = ((bounds.north - position.lat) / (bounds.north - bounds.south)) * 100;
  return { xPct, yPct, inside: xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100 };
}

function renderLiveLocation() {
  const layer = $("liveLayer");
  layer.innerHTML = "";
  if (!state.livePosition) {
    $("liveStatus").textContent = "Live location idle";
    return;
  }

  const { lat, lng, accuracy } = state.livePosition;
  const projected = projectLocation(state.livePosition);
  $("liveStatus").textContent = projected
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
  if (state.liveWatchId !== null) navigator.geolocation.clearWatch(state.liveWatchId);
  state.liveWatchId = navigator.geolocation.watchPosition((position) => {
    state.livePosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    renderLiveLocation();
  }, (error) => {
    showToast(error.message, "error");
  }, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
  });
  showToast("Live location started.");
}

async function copyCurrentShareLink() {
  await navigator.clipboard.writeText(shareUrl());
  showToast("Share link copied.");
}

function bindEvents() {
  $("createInstitutionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const created = await api("/api/institutions", {
        method: "POST",
        body: new FormData(form)
      });
      form.reset();
      await loadInstitutions(created.id);
      showToast("Campus created.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  $("institutionList").addEventListener("click", async (event) => {
    const card = event.target.closest("[data-id]");
    if (card) await selectInstitution(card.dataset.id);
  });

  $("mapStage").addEventListener("click", (event) => {
    if (state.addMode) createDraftPin(event);
  });

  $("addPinButton").addEventListener("click", () => {
    state.addMode = !state.addMode;
    state.draftPin = null;
    renderCurrent();
    showToast(state.addMode ? "Click the map to place a pin." : "Pin placement cancelled.");
  });

  $("pinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.current) return;
    const payload = pinPayloadFromForm();
    try {
      if ($("pinId").value) {
        await api(`/api/institutions/${state.current.id}/pins/${$("pinId").value}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showToast("Pin updated.");
      } else {
        await api(`/api/institutions/${state.current.id}/pins`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showToast("Pin saved.");
      }
      await selectInstitution(state.current.id);
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("deletePinButton").addEventListener("click", async () => {
    const pinId = $("pinId").value;
    if (!pinId || !state.current) return;
    try {
      await api(`/api/institutions/${state.current.id}/pins/${pinId}`, { method: "DELETE" });
      await selectInstitution(state.current.id);
      showToast("Pin deleted.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("clearPinButton").addEventListener("click", () => {
    state.draftPin = null;
    clearPinForm();
  });

  $("pinSearch").addEventListener("input", renderPinResults);

  $("pinResults").addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (!row) return;
    const pin = state.current.pins.find((item) => item.id === row.dataset.id);
    if (pin) populatePinForm(pin);
  });

  $("copyShareButton").addEventListener("click", copyCurrentShareLink);
  $("locateButton").addEventListener("click", startLiveLocation);

  $("boundsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.current) return;
    const bounds = {
      north: Number($("northBound").value),
      south: Number($("southBound").value),
      west: Number($("westBound").value),
      east: Number($("eastBound").value)
    };
    if (!(bounds.north > bounds.south && bounds.east > bounds.west)) {
      showToast("Boundary values are invalid.", "error");
      return;
    }
    try {
      await api(`/api/institutions/${state.current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ bounds })
      });
      await selectInstitution(state.current.id);
      showToast("GPS boundary saved.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

let panzoomInstance = null;
function initMapZoom() {
  const elem = $("panzoomElement");
  if (!elem || typeof Panzoom === "undefined") return;
  panzoomInstance = Panzoom(elem, {
    maxScale: 5,
    minScale: 0.5,
    step: 0.1,
    excludeClass: "pin-marker"
  });
  elem.parentElement.addEventListener("wheel", panzoomInstance.zoomWithWheel);
}

bindEvents();
initMapZoom();
loadInstitutions().catch((error) => showToast(error.message, "error"));
