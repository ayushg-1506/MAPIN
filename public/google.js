const visitorState = {
  institution: null,
  selectedPin: null,
  livePosition: null,
  liveWatchId: null,
  category: "",
  googleMap: null,
  markers: [],
  userMarker: null,
  infoWindow: null
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
  const pathMatch = window.location.pathname.match(/^\/google(?:\.html)?\/([^/]+)/);
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

function filteredPins() {
  const query = $("visitorSearch").value.trim().toLowerCase();
  const category = visitorState.category;
  return (visitorState.institution?.pins || []).filter((pin) => {
    const categoryMatch = !category || pin.category === category;
    const queryMatch = !query || pinSearchText(pin).includes(query);
    return categoryMatch && queryMatch;
  });
}

function shareUrl() {
  return `${window.location.origin}/google.html?id=${visitorState.institution?.id || getInstitutionId()}`;
}

// Convert local map coordinates (percentage) to GPS coordinates using affine transform or bounds
function pinToGps(pin) {
  const t = visitorState.institution?.gpsTransform;
  if (t) {
    const lat = t.a1 * pin.xPct + t.b1 * pin.yPct + t.c1;
    const lng = t.a2 * pin.xPct + t.b2 * pin.yPct + t.c2;
    return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
  }
  const bounds = visitorState.institution?.bounds;
  if (!bounds) return null;
  const lat = bounds.north - (pin.yPct / 100) * (bounds.north - bounds.south);
  const lng = bounds.west + (pin.xPct / 100) * (bounds.east - bounds.west);
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Google Maps Logic ───

async function loadGoogleMapsScript() {
  try {
    const { googleMapsApiKey } = await api("/api/secrets/google-maps-key");
    if (!googleMapsApiKey) {
      $("googleMap").innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:24px; color:#ad3c37; text-align:center; gap:8px;">
          <span style="font-size:32px;">🔑</span>
          <strong style="font-size:18px;">Google Maps API Key Missing</strong>
          <p style="max-width:380px; margin:0; font-size:14px; color:#65726d;">Please add your key to <code>data/secrets.local.json</code> and restart the server to enable this view.</p>
        </div>
      `;
      return false;
    }

    return new Promise((resolve, reject) => {
      window.initMapCallback = () => resolve(true);
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMapCallback`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("Failed to load Google Maps SDK."));
      document.head.appendChild(script);
    });
  } catch (error) {
    showToast(error.message, "error");
    return false;
  }
}

function initGoogleMap() {
  const bounds = visitorState.institution.bounds;
  let center = { lat: 12.9716, lng: 77.5946 }; // Default center (Bengaluru)

  if (bounds) {
    center = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2
    };
  }

  visitorState.googleMap = new google.maps.Map($("googleMap"), {
    center: center,
    zoom: 17,
    mapTypeId: "roadmap",
    tilt: 45,
    styles: [
      { featureType: "poi.school", elementType: "labels", stylers: [{ visibility: "on" }] }
    ]
  });

  visitorState.infoWindow = new google.maps.InfoWindow();
  renderMarkers();
}

function renderMarkers() {
  if (!visitorState.googleMap) return;

  // Clear existing markers
  visitorState.markers.forEach(m => m.setMap(null));
  visitorState.markers = [];

  const visiblePins = filteredPins();

  visitorState.institution.pins.forEach((pin) => {
    const gps = pinToGps(pin);
    if (!gps) return;

    const isVisible = visiblePins.some(p => p.id === pin.id);
    const active = visitorState.selectedPin?.id === pin.id;
    const pinColor = categoryColors[pin.category] || "#d86745";

    const marker = new google.maps.Marker({
      position: gps,
      map: isVisible ? visitorState.googleMap : null,
      title: pin.locationName,
      // Premium SVG Marker styling
      icon: {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        fillColor: pinColor,
        fillOpacity: active ? 1.0 : 0.82,
        strokeColor: "#ffffff",
        strokeWeight: active ? 2.5 : 1.5,
        scale: active ? 1.5 : 1.2,
        anchor: new google.maps.Point(12, 22)
      }
    });

    marker.addListener("click", () => {
      selectPin(pin.id);
      showMarkerPopup(pin, marker);
    });

    visitorState.markers.push(marker);

    if (active && isVisible) {
      showMarkerPopup(pin, marker);
    }
  });
}

function showMarkerPopup(pin, marker) {
  const contentString = `
    <div style="padding: 4px; max-width: 200px; color: #1f2f2b;">
      <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700;">${escapeHtml(pin.locationName)}</h3>
      <span style="font-size: 11px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: ${categoryColors[pin.category] || "#444"};">${escapeHtml(pin.category)}</span>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #4a5568; line-height: 1.3;">${escapeHtml(pin.buildingName || "Main Building")} ${pin.floorNumber ? `- Floor ${pin.floorNumber}` : ""}</p>
    </div>
  `;
  visitorState.infoWindow.setContent(contentString);
  visitorState.infoWindow.open({
    anchor: marker,
    map: visitorState.googleMap,
    shouldFocus: false
  });
}

// ─── Rendering UI ───

function renderMap() {
  const institution = visitorState.institution;
  if (!institution) return;

  $("visitorCampusName").textContent = institution.name;
  $("visitorCampusMeta").textContent = `${institution.city || "Campus"} - ${institution.pins.length} mapped GPS pins`;
  $("visitorPinCount").textContent = `${institution.pins.length} pins`;
  $("offlineVisitorLink").href = `/offline.html?id=${encodeURIComponent(institution.id)}`;

  renderCategoryOptions();
  renderResults();
  renderDestination();
  renderCampusMedia();
  renderLiveLocation();
  renderMarkers();
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
    distanceHtml = `<p class="distance-info" style="color: #0ea3be; font-weight: 600; margin-bottom: 8px;">🧭 ${Math.round(dist)} meters away</p>`;
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

  renderResults();
  renderDestination();
  
  // Highlighting active marker on map
  const pinIndex = visitorState.institution.pins.findIndex(p => p.id === pinId);
  const marker = visitorState.markers[pinIndex];
  if (marker && visitorState.googleMap) {
    visitorState.googleMap.panTo(marker.getPosition());
    showMarkerPopup(pin, marker);
  }

  const resultsArea = $("visitorResults");
  if (resultsArea) {
    const selectedBtn = resultsArea.querySelector(`[data-id="${pinId}"]`);
    if (selectedBtn) selectedBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ─── Real-Time Live Location Logic ───

function renderLiveLocation() {
  if (!visitorState.livePosition) {
    $("visitorLiveStatus").textContent = "Live location idle";
    $("visitorLiveMode").textContent = "Idle";
    if (visitorState.userMarker) {
      visitorState.userMarker.setMap(null);
      visitorState.userMarker = null;
    }
    return;
  }

  const { lat, lng, accuracy } = visitorState.livePosition;
  $("visitorLiveMode").textContent = "Active";
  $("visitorLiveStatus").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} - ${Math.round(accuracy)} m accuracy`;

  const latLng = new google.maps.LatLng(lat, lng);

  if (visitorState.googleMap) {
    if (!visitorState.userMarker) {
      // Blue dot live-location marker with pulsing effect styling
      visitorState.userMarker = new google.maps.Marker({
        position: latLng,
        map: visitorState.googleMap,
        title: "Your Location",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#177e80",
          fillOpacity: 1.0,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
          scale: 9.5
        }
      });
    } else {
      visitorState.userMarker.setPosition(latLng);
    }
  }
}

function startLiveLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.", "error");
    return;
  }

  if (visitorState.liveWatchId !== null) {
    navigator.geolocation.clearWatch(visitorState.liveWatchId);
  }

  visitorState.liveWatchId = navigator.geolocation.watchPosition((position) => {
    visitorState.livePosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    renderLiveLocation();
    renderDestination();

    // Auto-center on user position on first lock
    if (visitorState.googleMap && !startLiveLocation.hasCentered) {
      visitorState.googleMap.panTo(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
      startLiveLocation.hasCentered = true;
    }
  }, (error) => {
    showToast(error.message, "error");
  }, {
    enableHighAccuracy: true,
    maximumAge: 3000,
    timeout: 10000
  });

  showToast("Live location started.");
}

function bindEvents() {
  $("visitorResults").addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) selectPin(row.dataset.id);
  });

  $("visitorSearch").addEventListener("input", () => {
    renderResults();
    renderMarkers();
  });

  const chipsContainer = $("visitorCategoryChips");
  if (chipsContainer) {
    chipsContainer.addEventListener("click", (event) => {
      const chip = event.target.closest(".category-chip");
      if (!chip) return;
      visitorState.category = chip.dataset.category || "";
      renderCategoryOptions();
      renderResults();
      renderMarkers();
    });
  }

  $("visitorLocateButton").addEventListener("click", startLiveLocation);

  $("visitorCopyButton").addEventListener("click", async () => {
    await navigator.clipboard.writeText(shareUrl());
    showToast("Share link copied.");
  });
}

async function init() {
  bindEvents();
  try {
    visitorState.institution = await api(`/api/institutions/${getInstitutionId()}`);
  } catch (error) {
    $("visitorCampusName").textContent = "Map not found";
    $("visitorCampusMeta").textContent = error.message;
    showToast(error.message, "error");
    return;
  }

  const success = await loadGoogleMapsScript();
  if (success) {
    initGoogleMap();
    visitorState.selectedPin = visitorState.institution.pins[0] || null;
    renderMap();
  }
}

init().catch((error) => {
  showToast(error.message, "error");
});
