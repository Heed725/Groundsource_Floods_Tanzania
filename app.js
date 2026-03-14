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
const dateFilterEl = document.getElementById("date-filter");
const resetFilterButton = document.getElementById("reset-filter");
const zoomAllButton = document.getElementById("zoom-all");

let allData = null;
let layer = null;
let allBounds = null;

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

  const selectedDate = dateFilterEl.value;
  if (!selectedDate) {
    renderGeoJson(allData);
    statusEl.textContent = "Showing all features.";
    return;
  }

  const filtered = {
    ...allData,
    features: allData.features.filter((feature) => {
      const startDate = feature.properties?.start_date;
      return startDate && startDate >= selectedDate;
    })
  };

  renderGeoJson(filtered);
  statusEl.textContent = `Showing features with start date on or after ${selectedDate}.`;
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
      dateFilterEl.min = dates[0];
      dateFilterEl.max = dates[dates.length - 1];
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

dateFilterEl.addEventListener("change", applyFilter);

resetFilterButton.addEventListener("click", () => {
  dateFilterEl.value = "";
  applyFilter();
});

zoomAllButton.addEventListener("click", () => {
  if (allBounds?.isValid()) {
    map.fitBounds(allBounds.pad(0.04));
  }
});

loadData();
