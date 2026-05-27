/* ─── MAPIN Explore Page ─── */

const $ = (id) => document.getElementById(id);

let allCampuses = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function filteredCampuses() {
  const query = $("exploreSearch").value.trim().toLowerCase();
  if (!query) return allCampuses;
  return allCampuses.filter((campus) => {
    const text = [campus.name, campus.city].join(" ").toLowerCase();
    return text.includes(query);
  });
}

function renderCampuses() {
  const campuses = filteredCampuses();
  $("resultsInfo").textContent = `${campuses.length} public campus${campuses.length !== 1 ? "es" : ""} available`;
  
  if (campuses.length === 0) {
    $("campusGrid").innerHTML = "";
    $("emptyState").style.display = "block";
    return;
  }

  $("emptyState").style.display = "none";
  $("campusGrid").innerHTML = campuses.map((campus) => `
    <a class="campus-card" href="/m/${escapeHtml(campus.id)}">
      <div class="campus-card-header">
        <div>
          <h3>${escapeHtml(campus.name)}</h3>
          <p class="campus-city">${escapeHtml(campus.city || "Campus")}</p>
        </div>
        <span class="campus-arrow">→</span>
      </div>
      <div class="campus-stats">
        <span class="stat-chip">📍 ${campus.pinCount} locations</span>
        <span class="stat-chip">🌐 Public</span>
      </div>
    </a>
  `).join("");
}

async function init() {
  try {
    const response = await fetch("/api/institutions/public");
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || "Failed to load campuses.");
    allCampuses = data;
  } catch (err) {
    console.error("Failed to load campuses:", err);
    allCampuses = [];
  }

  renderCampuses();

  $("exploreSearch").addEventListener("input", renderCampuses);
}

init();
