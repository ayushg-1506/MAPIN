# MAPIN Campus Platform

MAPIN is a full-stack campus navigation prototype. Institutions can upload a campus map image or PDF, place searchable pins for important locations, calibrate a GPS boundary, and share a visitor link.

## Run

```powershell
node server.js
```

Open:

```text
http://localhost:3000
```

Sample visitor links:

```text
http://localhost:3000/m/dsce-campus
http://localhost:3000/m/ramaiah-campus
```

Offline Leaflet map:

```text
http://localhost:3000/offline.html?id=dsce-campus
http://localhost:3000/offline.html?id=ramaiah-campus
```

## What is included

- Admin dashboard for institution map uploads.
- Support for PDF, PNG, JPG, WEBP, GIF, and SVG campus maps.
- Manual pin placement with name, block, floor, room, description, and nearby landmark.
- Searchable visitor map with shareable URL: `/m/:institutionId`.
- Browser live location using the Geolocation API.
- Optional GPS boundary calibration to project live location onto the uploaded map.
- Campus media gallery for supporting images and videos such as 3D model views.
- Offline Leaflet map page using local Leaflet files and local demo tiles.
- JSON persistence in `data/db.json`.
- Uploaded maps stored in `uploads/`.
- Project expansion notes in `docs/PROJECT_SCOPE.md`.

## Sample Campuses

- `dsce-campus`: DSCE key map photo with 8 sample pins and 3D model image/video references.
- `ramaiah-campus`: MS Ramaiah dummy key map with 5 sample pins.
- `demo-campus`: Original generated MAPIN demo campus.

## Architecture

```text
server.js          Node HTTP server and JSON API
public/           Frontend files
public/vendor/    Local frontend libraries such as Leaflet
public/offline-tiles/
                  Local tile images for the offline map demo
data/db.json      Institution and pin database
uploads/          Uploaded map files
```

The project intentionally uses no npm packages, so it runs on the local Node runtime already available on this machine.
