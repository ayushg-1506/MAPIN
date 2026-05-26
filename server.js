import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY_SIZE = 35 * 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

const allowedUploadTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);

async function ensureStorage() {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDb({ institutions: [] });
  }
}

async function readDb() {
  await ensureStorage();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw || "{\"institutions\":[]}");
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DB_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2));
  await fs.rename(tmpFile, DB_FILE);
}

function now() {
  return new Date().toISOString();
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message, details = undefined) {
  sendJson(res, status, { error: message, details });
}

function normalizeNumber(value, fallback = null) {
  if (value === "" || value === undefined || value === null) return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clampPercent(value) {
  const next = normalizeNumber(value, 0);
  return Math.min(100, Math.max(0, next));
}

function summarizeInstitution(institution) {
  return {
    id: institution.id,
    name: institution.name,
    city: institution.city,
    map: institution.map,
    bounds: institution.bounds,
    pinCount: institution.pins.length,
    updatedAt: institution.updatedAt,
    shareUrl: `/m/${institution.id}`
  };
}

function sanitizeText(value, limit = 220) {
  return String(value ?? "").trim().slice(0, limit);
}

function sanitizeFilename(name) {
  return path.basename(String(name || "map")).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function extensionForUpload(file) {
  const byType = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  return byType[file.type] || ".bin";
}

function mapKind(mimeType) {
  return mimeType === "application/pdf" ? "pdf" : "image";
}

async function collectBody(req, limit = MAX_BODY_SIZE) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      const err = new Error("Request body is too large.");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await collectBody(req, 2 * 1024 * 1024);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function parseMultipart(req, body) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    const err = new Error("Missing multipart boundary.");
    err.status = 400;
    throw err;
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const raw = body.toString("latin1");
  const chunks = raw.split(`--${boundary}`).slice(1, -1);
  const fields = {};
  const files = {};

  for (const chunk of chunks) {
    const trimmed = chunk.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = trimmed.indexOf("\r\n\r\n");
    if (separatorIndex === -1) continue;

    const headerText = trimmed.slice(0, separatorIndex);
    let content = trimmed.slice(separatorIndex + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);

    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    if (!disposition) continue;

    const nameMatch = disposition[1].match(/name="([^"]+)"/i);
    if (!nameMatch) continue;

    const filenameMatch = disposition[1].match(/filename="([^"]*)"/i);
    const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    const name = nameMatch[1];
    const bytes = Buffer.from(content, "latin1");

    if (filenameMatch && filenameMatch[1]) {
      files[name] = {
        filename: sanitizeFilename(filenameMatch[1]),
        type: (typeMatch?.[1] || "application/octet-stream").trim().toLowerCase(),
        bytes
      };
    } else {
      fields[name] = bytes.toString("utf8").trim();
    }
  }

  return { fields, files };
}

function findInstitution(db, id) {
  return db.institutions.find((institution) => institution.id === id);
}

function cleanBounds(input) {
  if (!input) return null;
  const north = normalizeNumber(input.north);
  const south = normalizeNumber(input.south);
  const east = normalizeNumber(input.east);
  const west = normalizeNumber(input.west);
  if ([north, south, east, west].some((item) => item === null)) return null;
  if (north <= south || east <= west) return null;
  return { north, south, east, west };
}

function cleanPin(input, existing = {}) {
  const xPct = clampPercent(input.xPct ?? existing.xPct);
  const yPct = clampPercent(input.yPct ?? existing.yPct);
  return {
    ...existing,
    locationName: sanitizeText(input.locationName ?? existing.locationName, 120),
    category: sanitizeText(input.category ?? existing.category ?? "Block", 60),
    buildingName: sanitizeText(input.buildingName ?? existing.buildingName, 120),
    floorNumber: sanitizeText(input.floorNumber ?? existing.floorNumber, 40),
    roomNumber: sanitizeText(input.roomNumber ?? existing.roomNumber, 40),
    description: sanitizeText(input.description ?? existing.description, 420),
    nearbyLandmark: sanitizeText(input.nearbyLandmark ?? existing.nearbyLandmark, 160),
    xPct,
    yPct
  };
}

async function createInstitution(req, res) {
  const body = await collectBody(req);
  const { fields, files } = parseMultipart(req, body);
  const mapFile = files.mapFile;

  if (!mapFile) return sendError(res, 400, "Upload a campus map file.");
  if (!allowedUploadTypes.has(mapFile.type)) {
    return sendError(res, 415, "Use a PDF, PNG, JPG, WEBP, GIF, or SVG map.");
  }

  const id = crypto.randomUUID();
  const ext = extensionForUpload(mapFile);
  const storedName = `${id}-${Date.now()}${ext}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);
  await fs.writeFile(storedPath, mapFile.bytes);

  const db = await readDb();
  const createdAt = now();
  const institution = {
    id,
    name: sanitizeText(fields.name, 120) || "Untitled Campus",
    city: sanitizeText(fields.city, 120),
    adminName: sanitizeText(fields.adminName, 120),
    createdAt,
    updatedAt: createdAt,
    map: {
      url: `/uploads/${storedName}`,
      originalName: mapFile.filename,
      type: mapFile.type,
      kind: mapKind(mapFile.type),
      size: mapFile.bytes.length
    },
    media: [],
    bounds: cleanBounds(fields),
    pins: []
  };

  db.institutions.unshift(institution);
  await writeDb(db);
  sendJson(res, 201, institution);
}

async function patchInstitution(req, res, id) {
  const patch = await readJson(req);
  const db = await readDb();
  const institution = findInstitution(db, id);
  if (!institution) return sendError(res, 404, "Institution not found.");

  if ("name" in patch) institution.name = sanitizeText(patch.name, 120) || institution.name;
  if ("city" in patch) institution.city = sanitizeText(patch.city, 120);
  if ("adminName" in patch) institution.adminName = sanitizeText(patch.adminName, 120);
  if ("bounds" in patch) institution.bounds = cleanBounds(patch.bounds);
  institution.updatedAt = now();

  await writeDb(db);
  sendJson(res, 200, institution);
}

async function createPin(req, res, id) {
  const input = await readJson(req);
  const db = await readDb();
  const institution = findInstitution(db, id);
  if (!institution) return sendError(res, 404, "Institution not found.");

  const pin = cleanPin(input, {
    id: crypto.randomUUID(),
    createdAt: now()
  });

  if (!pin.locationName) return sendError(res, 400, "Location name is required.");

  pin.updatedAt = now();
  institution.pins.push(pin);
  institution.updatedAt = now();

  await writeDb(db);
  sendJson(res, 201, pin);
}

async function updatePin(req, res, id, pinId) {
  const input = await readJson(req);
  const db = await readDb();
  const institution = findInstitution(db, id);
  if (!institution) return sendError(res, 404, "Institution not found.");

  const pinIndex = institution.pins.findIndex((pin) => pin.id === pinId);
  if (pinIndex === -1) return sendError(res, 404, "Pin not found.");

  const pin = cleanPin(input, institution.pins[pinIndex]);
  if (!pin.locationName) return sendError(res, 400, "Location name is required.");

  pin.updatedAt = now();
  institution.pins[pinIndex] = pin;
  institution.updatedAt = now();

  await writeDb(db);
  sendJson(res, 200, pin);
}

async function deletePin(res, id, pinId) {
  const db = await readDb();
  const institution = findInstitution(db, id);
  if (!institution) return sendError(res, 404, "Institution not found.");

  const before = institution.pins.length;
  institution.pins = institution.pins.filter((pin) => pin.id !== pinId);
  if (institution.pins.length === before) return sendError(res, 404, "Pin not found.");

  institution.updatedAt = now();
  await writeDb(db);
  sendJson(res, 200, { ok: true });
}

function safeFilePath(baseDir, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(baseDir, relative));
  if (!filePath.startsWith(baseDir)) return null;
  return filePath;
}

async function serveFile(res, baseDir, requestPath, fallbackFile = null) {
  const filePath = safeFilePath(baseDir, requestPath);
  if (!filePath) return sendError(res, 403, "Forbidden.");

  let target = filePath;
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = path.join(target, fallbackFile || "index.html");
  } catch {
    if (fallbackFile) target = path.join(baseDir, fallbackFile);
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    sendError(res, 404, "File not found.");
  }
}

async function routeApi(req, res, url) {
  const method = req.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, name: "MAPIN API" });
  }

  if (method === "GET" && url.pathname === "/api/institutions") {
    const db = await readDb();
    return sendJson(res, 200, db.institutions.map(summarizeInstitution));
  }

  if (method === "POST" && url.pathname === "/api/institutions") {
    return createInstitution(req, res);
  }

  if (parts[0] === "api" && parts[1] === "institutions" && parts[2]) {
    const institutionId = parts[2];

    if (method === "GET" && parts.length === 3) {
      const db = await readDb();
      const institution = findInstitution(db, institutionId);
      if (!institution) return sendError(res, 404, "Institution not found.");
      return sendJson(res, 200, institution);
    }

    if (method === "PATCH" && parts.length === 3) {
      return patchInstitution(req, res, institutionId);
    }

    if (method === "POST" && parts[3] === "pins" && parts.length === 4) {
      return createPin(req, res, institutionId);
    }

    if ((method === "PUT" || method === "PATCH") && parts[3] === "pins" && parts[4]) {
      return updatePin(req, res, institutionId, parts[4]);
    }

    if (method === "DELETE" && parts[3] === "pins" && parts[4]) {
      return deletePin(res, institutionId, parts[4]);
    }
  }

  sendError(res, 404, "API route not found.");
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      return routeApi(req, res, url);
    }

    if (url.pathname.startsWith("/uploads/")) {
      return serveFile(res, __dirname, url.pathname);
    }

    if (url.pathname === "/" || url.pathname === "/landing.html" || url.pathname === "/index.html") {
      return serveFile(res, PUBLIC_DIR, "/landing.html");
    }

    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      return serveFile(res, PUBLIC_DIR, "/admin.html");
    }

    if (url.pathname === "/map.html" || url.pathname.startsWith("/m/")) {
      return serveFile(res, PUBLIC_DIR, "/map.html");
    }

    return serveFile(res, PUBLIC_DIR, url.pathname);
  } catch (error) {
    const status = error.status || 500;
    sendError(res, status, error.message || "Something went wrong.");
  }
}

await ensureStorage();

const server = http.createServer(requestHandler);
server.listen(PORT, () => {
  console.log(`MAPIN running at http://localhost:${PORT}`);
});
