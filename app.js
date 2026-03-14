const map = L.map("map", {
  zoomControl: true
}).setView([-6.2, 35.1], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const statusEl = document.getElementById("status");
const visibleCountEl = document.getElementById("visible-count");
const totalCountEl = document.getElementById("total-count");
const dateRangeEl = document.getElementById("date-range");
const startDateFilterEl = document.getElementById("start-date-filter");
const endDateFilterEl = document.getElementById("end-date-filter");
const clipFileEl = document.getElementById("clip-file");
const applyClipButton = document.getElementById("apply-clip");
const clearClipButton = document.getElementById("clear-clip");
const resetFilterButton = document.getElementById("reset-filter");
const zoomAllButton = document.getElementById("zoom-all");
const downloadGeoJsonButton = document.getElementById("download-geojson");
const downloadShapefileButton = document.getElementById("download-shapefile");

let allData = null;
let layer = null;
let clipLayer = null;
let allBounds = null;
let visibleData = null;
let clipGeometry = null;

function formatArea(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "N/A";
  }

  return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })} km2`;
}

function styleFeature(feature) {
  const area = Number(feature?.properties?.area_km2 ?? 0);
  return {
    color: "#0f4d3a",
    weight: 1.1,
    fillColor: area > 100 ? "#17624f" : area > 10 ? "#2e8b72" : "#8cc9b1",
    fillOpacity: 0.56
  };
}

function popupContent(feature) {
  const props = feature.properties || {};
  return `
    <strong>${props.uuid || "Feature"}</strong><br>
    <strong>Area:</strong> ${formatArea(props.area_km2)}<br>
    <strong>Start date:</strong> ${props.start_date || "N/A"}<br>
    <strong>End date:</strong> ${props.end_date || "N/A"}
  `;
}

function sortDateStrings(values) {
  return values
    .filter(Boolean)
    .slice()
    .sort((a, b) => new Date(a) - new Date(b));
}

function renderGeoJson(data) {
  if (layer) {
    map.removeLayer(layer);
  }

  visibleData = data;
  layer = L.geoJSON(data, {
    style: styleFeature,
    onEachFeature(feature, featureLayer) {
      featureLayer.bindPopup(popupContent(feature));
    }
  }).addTo(map);

  visibleCountEl.textContent = data.features.length.toLocaleString();

  const bounds = layer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.04));
  }
}

function getBaseFilteredData() {
  const selectedStartDate = startDateFilterEl.value;
  const selectedEndDate = endDateFilterEl.value;

  if (!selectedStartDate && !selectedEndDate) {
    return allData;
  }

  return {
    ...allData,
    features: allData.features.filter((feature) => {
      const startDate = feature.properties?.start_date;
      const endDate = feature.properties?.end_date || startDate;
      if (!startDate || !endDate) {
        return false;
      }

      if (selectedStartDate && endDate < selectedStartDate) {
        return false;
      }

      if (selectedEndDate && startDate > selectedEndDate) {
        return false;
      }

      return true;
    })
  };
}

function makeStatusMessage(featureCount) {
  const selectedStartDate = startDateFilterEl.value;
  const selectedEndDate = endDateFilterEl.value;
  const clipSuffix = clipGeometry ? " within the uploaded clip boundary." : ".";

  if (!selectedStartDate && !selectedEndDate) {
    if (featureCount === allData.features.length && !clipGeometry) {
      return "Showing all features.";
    }

    return `Showing ${featureCount.toLocaleString()} features${clipSuffix}`;
  }

  if (selectedStartDate && selectedEndDate) {
    return `Showing features from ${selectedStartDate} to ${selectedEndDate}${clipSuffix}`;
  }

  if (selectedStartDate) {
    return `Showing features on or after ${selectedStartDate}${clipSuffix}`;
  }

  return `Showing features on or before ${selectedEndDate}${clipSuffix}`;
}

function normalizeClipGeometry(input) {
  const features = input?.type === "FeatureCollection"
    ? input.features
    : input?.type === "Feature"
      ? [input]
      : input?.type
        ? [{ type: "Feature", properties: {}, geometry: input }]
        : [];

  const polygonCoords = features.flatMap((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) {
      return [];
    }

    if (geometry.type === "Polygon") {
      return [geometry.coordinates];
    }

    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }

    return [];
  });

  if (!polygonCoords.length) {
    throw new Error("Uploaded GeoJSON must contain at least one Polygon or MultiPolygon.");
  }

  return turf.multiPolygon(polygonCoords);
}

function updateClipLayer() {
  if (clipLayer) {
    map.removeLayer(clipLayer);
    clipLayer = null;
  }

  if (!clipGeometry) {
    return;
  }

  clipLayer = L.geoJSON(clipGeometry, {
    style: {
      color: "#8a5a10",
      weight: 2,
      fillColor: "#d8b26e",
      fillOpacity: 0.12
    }
  }).addTo(map);
}

function getClippedData(data) {
  if (!clipGeometry) {
    return data;
  }

  const clippedFeatures = data.features.flatMap((feature) => {
    try {
      if (!turf.booleanIntersects(feature, clipGeometry)) {
        return [];
      }

      const clipped = turf.intersect(feature, clipGeometry);
      if (!clipped?.geometry) {
        return [];
      }

      return [{
        type: "Feature",
        properties: { ...(feature.properties || {}) },
        geometry: clipped.geometry
      }];
    } catch (error) {
      console.warn("Skipping feature during clipping", error);
      return [];
    }
  });

  return {
    ...data,
    features: clippedFeatures
  };
}

function refreshMap() {
  if (!allData) {
    return;
  }

  const filteredData = getBaseFilteredData();
  const displayData = getClippedData(filteredData);
  renderGeoJson(displayData);
  updateClipLayer();
  statusEl.textContent = makeStatusMessage(displayData.features.length);
}

async function handleClipUpload() {
  const [file] = clipFileEl.files || [];
  if (!file) {
    statusEl.textContent = "Choose a GeoJSON file first.";
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    clipGeometry = normalizeClipGeometry(parsed);
    refreshMap();

    if (clipLayer) {
      const bounds = clipLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.08));
      }
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Could not apply clip boundary: ${error.message}`;
  }
}

function clearClip() {
  clipGeometry = null;
  clipFileEl.value = "";
  refreshMap();
}

function applyFilter() {
  refreshMap();
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadGeoJson() {
  if (!visibleData) {
    return;
  }

  const blob = new Blob([JSON.stringify(visibleData, null, 2)], {
    type: "application/geo+json"
  });
  downloadBlob("groundsource_tanzania_clipped.geojson", blob);
}

function downloadShapefile() {
  if (!visibleData || !visibleData.features.length || !window.shpwrite) {
    return;
  }

  window.shpwrite.download(visibleData, {
    folder: "groundsource_tanzania_clipped",
    file: "groundsource_tanzania_clipped"
  });
}

async function loadData() {
  try {
    const response = await fetch("./data/Groundsource_Tanzania.geojson");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    allData = await response.json();
    totalCountEl.textContent = allData.features.length.toLocaleString();

    const dates = sortDateStrings(allData.features.map((feature) => feature.properties?.start_date));
    if (dates.length > 0) {
      startDateFilterEl.min = dates[0];
      startDateFilterEl.max = dates[dates.length - 1];
      endDateFilterEl.min = dates[0];
      endDateFilterEl.max = dates[dates.length - 1];
      dateRangeEl.textContent = `${dates[0]} to ${dates[dates.length - 1]}`;
    } else {
      dateRangeEl.textContent = "No dates found";
    }

    layer = L.geoJSON(allData);
    allBounds = layer.getBounds();
    map.removeLayer(layer);
    layer = null;

    refreshMap();
    statusEl.textContent = "Dataset loaded.";
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Could not load dataset: ${error.message}`;
  }
}

startDateFilterEl.addEventListener("change", applyFilter);
endDateFilterEl.addEventListener("change", applyFilter);
applyClipButton.addEventListener("click", handleClipUpload);
clearClipButton.addEventListener("click", clearClip);

resetFilterButton.addEventListener("click", () => {
  startDateFilterEl.value = "";
  endDateFilterEl.value = "";
  refreshMap();
});

zoomAllButton.addEventListener("click", () => {
  if (clipLayer?.getBounds().isValid()) {
    map.fitBounds(clipLayer.getBounds().pad(0.08));
    return;
  }

  if (allBounds?.isValid()) {
    map.fitBounds(allBounds.pad(0.04));
  }
});

downloadGeoJsonButton.addEventListener("click", downloadGeoJson);
downloadShapefileButton.addEventListener("click", downloadShapefile);

loadData();
