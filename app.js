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
const resetFilterButton = document.getElementById("reset-filter");
const zoomAllButton = document.getElementById("zoom-all");
const downloadGeoJsonButton = document.getElementById("download-geojson");
const downloadShapefileButton = document.getElementById("download-shapefile");

let allData = null;
let layer = null;
let allBounds = null;
let visibleData = null;

function formatArea(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "N/A";
  }

  return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })} km²`;
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

  const count = data.features.length;
  visibleCountEl.textContent = count.toLocaleString();

  const bounds = layer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.04));
  }
}

function applyFilter() {
  if (!allData) {
    return;
  }

  const selectedStartDate = startDateFilterEl.value;
  const selectedEndDate = endDateFilterEl.value;

  if (!selectedStartDate && !selectedEndDate) {
    renderGeoJson(allData);
    statusEl.textContent = "Showing all features.";
    return;
  }

  const filtered = {
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

  renderGeoJson(filtered);
  if (selectedStartDate && selectedEndDate) {
    statusEl.textContent = `Showing features from ${selectedStartDate} to ${selectedEndDate}.`;
  } else if (selectedStartDate) {
    statusEl.textContent = `Showing features on or after ${selectedStartDate}.`;
  } else {
    statusEl.textContent = `Showing features on or before ${selectedEndDate}.`;
  }
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
  downloadBlob("groundsource_tanzania_filtered.geojson", blob);
}

function downloadShapefile() {
  if (!visibleData || !visibleData.features.length || !window.shpwrite) {
    return;
  }

  window.shpwrite.download(visibleData, {
    folder: "groundsource_tanzania_filtered",
    file: "groundsource_tanzania_filtered"
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

    renderGeoJson(allData);
    statusEl.textContent = "Dataset loaded.";
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Could not load dataset: ${error.message}`;
  }
}

startDateFilterEl.addEventListener("change", applyFilter);
endDateFilterEl.addEventListener("change", applyFilter);

resetFilterButton.addEventListener("click", () => {
  startDateFilterEl.value = "";
  endDateFilterEl.value = "";
  applyFilter();
});

zoomAllButton.addEventListener("click", () => {
  if (allBounds?.isValid()) {
    map.fitBounds(allBounds.pad(0.04));
  }
});

downloadGeoJsonButton.addEventListener("click", downloadGeoJson);
downloadShapefileButton.addEventListener("click", downloadShapefile);

loadData();
