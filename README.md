# Groundsource Floods Tanzania

This repository contains a static Leaflet web map built from the Groundsource Tanzania GeoJSON dataset and designed to be hosted on GitHub Pages.

## Files

- `index.html` - main page
- `styles.css` - layout and visual styling
- `app.js` - map logic and filtering
- `data/Groundsource_Tanzania.geojson` - dataset used by the map

## Run locally

Because the map loads GeoJSON with `fetch`, serve it through a local web server instead of opening the HTML file directly.

If you have Python:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In GitHub, open `Settings` -> `Pages`.
3. Under `Build and deployment`, choose `Deploy from a branch`.
4. Select the `main` branch and the `/ (root)` folder.
5. Save. GitHub will publish the site at your Pages URL.

## Notes

- The dataset is about 6.7 MB, so the first load may take a moment.
- The map includes a date filter based on the `start_date` property.
