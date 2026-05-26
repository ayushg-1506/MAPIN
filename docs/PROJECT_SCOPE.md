# MAPIN Website Expansion Scope

## Core Idea

MAPIN is a flexible campus navigation platform. Instead of supporting only one fixed institution map, it lets any institution upload its own campus key map, image map, or PDF map and turn it into an interactive visitor guide.

## Version 1 Goals

- Institution representatives can create a campus profile.
- Admins can upload a campus map image or PDF.
- Admins can manually place pins on blocks, departments, labs, offices, seminar halls, libraries, parking areas, canteens, and entry gates.
- Each pin can store:
  - Location name
  - Building or block name
  - Floor number
  - Room number
  - Short description
  - Nearby landmark
- Visitors can open a shareable MAPIN link, search for a location, and see the correct pin on the uploaded map.
- Visitors can allow browser geolocation to show their live latitude and longitude.
- If the campus GPS boundary is calibrated, MAPIN can project the visitor's live location onto the custom campus map.

## Current Implementation

This repository contains a working full-stack prototype:

- Node HTTP backend with no external dependencies.
- JSON database in `data/db.json`.
- Uploaded maps stored in `uploads/`.
- Admin editor at `/`.
- Visitor map at `/m/:institutionId`.
- Demo campus data with ready-made pins, including DSCE and MS Ramaiah sample institutions.
- Share link copying.
- Searchable pin list.
- Pin dragging and editing.
- GPS boundary calibration.
- Live location display using the browser Geolocation API.
- Supporting campus media such as 3D model photos and walkthrough videos.
- Offline map demo using local Leaflet assets and local tile images.

## Offline Map Direction

MAPIN avoids Google Maps for the offline-first project version. The project now includes a Leaflet-based offline page at `/offline.html`.

The offline map path is:

```text
Website -> Local Leaflet files -> Local tile images -> Marker and route display
```

This demonstrates the architecture needed for future downloaded OpenStreetMap tiles. The current local tile pack is a project demo tile set; later it can be replaced with real downloaded OSM tiles for a specific campus area.

## Future AI Expansion

The first version is intentionally not fully AI-based. It is a reliable map-pinning and location-management system.

Later MAPIN can add AI features such as:

- Detecting building labels from uploaded maps.
- Suggesting possible pin positions from map text.
- Auto-extracting floor, room, and department names from institution PDFs.
- Generating visitor-friendly directions from the user's live location to the selected pin.
- Recommending accessible routes and nearest landmarks.
- Turning natural-language queries into destination matches.

## Product Positioning

MAPIN should feel like a custom Google Maps layer for campuses, colleges, offices, event venues, and institutions whose internal navigation is not covered well by public maps.
