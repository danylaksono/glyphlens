const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const centerState = {
  location: [-0.1276, 51.5072],
  radiusMeters: 800,
  searchRadius: 1600,
  features: [],
  located: false,
  lastFetchCenter: null,
  pendingFetchTimer: null,
};

const categoryConfig = {
  health: { label: 'Health', color: '#22c55e', tags: new Set(['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist', 'ambulance_station', 'nursing_home', 'health_centre']) },
  education: { label: 'Education', color: '#38bdf8', tags: new Set(['school', 'kindergarten', 'university', 'college', 'library', 'adult_education']) },
  marketplace: { label: 'Markets', color: '#f59e0b', tags: new Set(['marketplace', 'supermarket', 'convenience', 'bakery', 'butcher', 'mall', 'kiosk', 'retail']) },
  workplace: { label: 'Work', color: '#a855f7', tags: new Set(['office', 'industrial', 'factory', 'research_institute', 'business']) },
};

const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const radiusInput = document.getElementById('radiusInput');
const radiusLabel = document.getElementById('radiusLabel');
const totalCount = document.getElementById('totalCount');
const countHealth = document.getElementById('countHealth');
const countEducation = document.getElementById('countEducation');
const countMarketplace = document.getElementById('countMarketplace');
const countWorkplace = document.getElementById('countWorkplace');
const svgOverlay = d3.select('#chart-overlay');

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  center: centerState.location,
  zoom: 15,
  minZoom: 11,
  maxZoom: 18,
  pitchWithRotate: false,
  dragRotate: false,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

map.on('load', async () => {
  addSources();
  await locateAndRefresh();
});

map.on('move', () => {
  syncCenterVisuals();
  renderChartOverlay();
});

map.on('zoom', () => {
  syncCenterVisuals();
  renderChartOverlay();
});

map.on('moveend', () => scheduleRefreshFromCenter());
map.on('zoomend', () => scheduleRefreshFromCenter());

window.addEventListener('resize', () => {
  syncCenterVisuals();
  renderChartOverlay();
});

radiusInput.addEventListener('input', ({ target }) => {
  centerState.radiusMeters = Number(target.value);
  radiusLabel.textContent = centerState.radiusMeters;
  drawRadiusCircle(getMapCenter());
  refreshCounts();
  renderChartOverlay();
});

radiusInput.addEventListener('change', async () => {
  centerState.searchRadius = Math.max(centerState.radiusMeters * 2, 1200);
  await refreshAmenities(getMapCenter());
});

function setStatus(text, variant = 'info') {
  statusText.textContent = text;
  const variants = {
    info: 'bg-sky-500/12 text-sky-200',
    success: 'bg-emerald-500/12 text-emerald-200',
    warning: 'bg-amber-500/12 text-amber-200',
    error: 'bg-rose-500/12 text-rose-200',
  };
  statusBadge.className = `status-chip ${variants[variant] || variants.info}`;
  statusBadge.textContent = variant === 'success' ? 'Ready' : variant === 'warning' ? 'Fallback' : variant === 'error' ? 'Error' : 'Loading';
}

function haversineDistance([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toGeoJSONCircle(center, radiusMeters, vertices = 64) {
  const [lon, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const coords = [];

  for (let i = 0; i <= vertices; i += 1) {
    const angle = (i / vertices) * 2 * Math.PI;
    const dx = Math.cos(angle) * radiusMeters;
    const dy = Math.sin(angle) * radiusMeters;
    const pointLat = lat + dy / 110574;
    const pointLon = lon + dx / (111320 * Math.cos(latRad));
    coords.push([pointLon, pointLat]);
  }

  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }],
  };
}

function addSources() {
  map.addSource('amenities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'amenity-points',
    type: 'circle',
    source: 'amenities',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 10],
      'circle-color': ['match', ['get', 'category'], 'health', categoryConfig.health.color, 'education', categoryConfig.education.color, 'marketplace', categoryConfig.marketplace.color, 'workplace', categoryConfig.workplace.color, '#94a3b8'],
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    },
  });

  map.addSource('radius-circle', { type: 'geojson', data: toGeoJSONCircle(getMapCenter(), centerState.radiusMeters) });
  map.addLayer({
    id: 'radius-fill',
    type: 'fill',
    source: 'radius-circle',
    paint: {
      'fill-color': categoryConfig.education.color,
      'fill-opacity': 0.08,
    },
  });
  map.addLayer({
    id: 'radius-ring',
    type: 'line',
    source: 'radius-circle',
    paint: {
      'line-color': categoryConfig.education.color,
      'line-width': 2,
      'line-opacity': 0.9,
    },
  });

  map.addSource('user-point', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: getMapCenter() } }],
    },
  });
  map.addLayer({
    id: 'user-point',
    type: 'circle',
    source: 'user-point',
    paint: {
      'circle-radius': 10,
      'circle-color': '#ffffff',
      'circle-stroke-color': categoryConfig.education.color,
      'circle-stroke-width': 3,
    },
  });
}

async function locateAndRefresh() {
  if (!navigator.geolocation) {
    setStatus('Geolocation unavailable. Using fallback location.', 'warning');
    await setFallback();
    return;
  }

  setStatus('Requesting location…');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      centerState.location = [position.coords.longitude, position.coords.latitude];
      centerState.located = true;
      centerState.searchRadius = Math.max(centerState.radiusMeters * 2, 1200);
      map.jumpTo({ center: centerState.location, zoom: 15 });
      await refreshAmenities(getMapCenter());
      setStatus('Showing nearby amenities', 'success');
    },
    async () => {
      setStatus('Location denied. Using fallback location.', 'warning');
      await setFallback();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

async function setFallback() {
  centerState.location = [-0.1276, 51.5072];
  centerState.located = false;
  centerState.searchRadius = Math.max(centerState.radiusMeters * 2, 1200);
  map.jumpTo({ center: centerState.location, zoom: 13 });
  await refreshAmenities(getMapCenter());
}

async function refreshAmenities(center = getMapCenter()) {
  try {
    setStatus('Loading nearby amenities…', 'info');
    const features = await fetchAmenities(center, centerState.searchRadius);
    centerState.features = features;
    centerState.lastFetchCenter = center;
    updateMapData(features);
    refreshCounts();
    renderChartOverlay();
    setStatus('Updated amenity overview', 'success');
  } catch (error) {
    console.error(error);
    setStatus(`Amenity load failed: ${error.message}`, 'error');
    statusText.textContent = 'Overpass API failed. Try again or refresh the page.';
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeout = 22000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAmenities([lon, lat], radius) {
  const amenityExpr = [
    'hospital',
    'clinic',
    'pharmacy',
    'doctors',
    'dentist',
    'ambulance_station',
    'nursing_home',
    'school',
    'kindergarten',
    'university',
    'college',
    'library',
    'marketplace',
  ].join('|');

  const shopExpr = [
    'supermarket',
    'convenience',
    'bakery',
    'butcher',
    'mall',
    'kiosk',
  ].join('|');

  const query = `
[out:json][timeout:25];
(
  node["amenity"~"${amenityExpr}"](around:${radius},${lat},${lon});
  way["amenity"~"${amenityExpr}"](around:${radius},${lat},${lon});
  relation["amenity"~"${amenityExpr}"](around:${radius},${lat},${lon});
  node["shop"~"${shopExpr}"](around:${radius},${lat},${lon});
  way["shop"~"${shopExpr}"](around:${radius},${lat},${lon});
  relation["shop"~"${shopExpr}"](around:${radius},${lat},${lon});
  node["office"](around:${radius},${lat},${lon});
  way["office"](around:${radius},${lat},${lon});
  relation["office"](around:${radius},${lat},${lon});
  node["industrial"](around:${radius},${lat},${lon});
  way["industrial"](around:${radius},${lat},${lon});
  relation["industrial"](around:${radius},${lat},${lon});
);
out center qt;
`;

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }, 24000);

      if (!response.ok) {
        lastError = new Error(`${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      return data.elements
        .map((element) => {
          const lonLat = element.type === 'node' ? [element.lon, element.lat] : element.center ? [element.center.lon, element.center.lat] : null;
          if (!lonLat) return null;
          const category = categorizeAmenity(element.tags || {});
          if (!category) return null;
          return {
            id: `${element.type}-${element.id}`,
            name: (element.tags && (element.tags.name || element.tags.official_name)) || categoryConfig[category].label,
            category,
            tags: element.tags || {},
            coordinates: lonLat,
            distance: haversineDistance([lon, lat], lonLat),
          };
        })
        .filter(Boolean);
    } catch (error) {
      lastError = error;
      await sleep(800);
    }
  }

  throw new Error(lastError?.message || 'Overpass API fetch failed');
}

function categorizeAmenity(tags) {
  if (!tags) return null;
  const amenity = (tags.amenity || '').toLowerCase();
  const shop = (tags.shop || '').toLowerCase();
  const office = tags.office ? 'office' : null;
  const industrial = tags.industrial ? 'industrial' : null;

  if (categoryConfig.health.tags.has(amenity)) return 'health';
  if (categoryConfig.education.tags.has(amenity)) return 'education';
  if (categoryConfig.marketplace.tags.has(amenity) || categoryConfig.marketplace.tags.has(shop)) return 'marketplace';
  if (office || industrial) return 'workplace';
  return null;
}

function updateMapData(features) {
  const geojson = {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: feature.coordinates },
      properties: { category: feature.category, name: feature.name, distance: feature.distance },
    })),
  };

  map.getSource('amenities').setData(geojson);
  syncCenterVisuals();
}

function drawRadiusCircle(center = getMapCenter()) {
  if (!map.isStyleLoaded()) return;
  const circleGeoJSON = toGeoJSONCircle(center, centerState.radiusMeters);
  map.getSource('radius-circle').setData(circleGeoJSON);
}

function refreshCounts() {
  const center = getMapCenter();
  const counts = { health: 0, education: 0, marketplace: 0, workplace: 0 };
  centerState.features.forEach((feature) => {
    const distance = haversineDistance(center, feature.coordinates);
    if (distance <= centerState.radiusMeters) {
      counts[feature.category] += 1;
    }
  });
  countHealth.textContent = counts.health;
  countEducation.textContent = counts.education;
  countMarketplace.textContent = counts.marketplace;
  countWorkplace.textContent = counts.workplace;
  totalCount.textContent = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return counts;
}

function renderChartOverlay() {
  const counts = refreshCounts();
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const frame = document.getElementById('chart-overlay');
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  svgOverlay.attr('width', width).attr('height', height);
  svgOverlay.selectAll('*').remove();

  if (!total) {
    svgOverlay.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2 + 122)
      .attr('fill', '#cbd5e1')
      .attr('font-size', 14)
      .attr('text-anchor', 'middle')
      .text('Slide the radius or move the map to refresh amenities.');
    return;
  }

  const centerPixel = { x: width / 2, y: height / 2 };
  const chartRadius = Math.min(90, Math.max(72, Math.min(width, height) * 0.12));
  const innerRadius = chartRadius * 0.38;
  const outerMaxRadius = chartRadius * 0.9;
  const values = Object.entries(counts).map(([key, value]) => ({ key, value, color: categoryConfig[key].color }));
  const maxValue = Math.max(1, ...values.map((d) => d.value));
  const scale = d3.scaleLinear().domain([0, maxValue]).range([innerRadius + 10, outerMaxRadius]);
  const angleStep = (Math.PI * 2) / values.length;

  const chartGroup = svgOverlay.append('g').attr('transform', `translate(${centerPixel.x}, ${centerPixel.y})`);
  chartGroup.append('circle')
    .attr('r', outerMaxRadius + 4)
    .attr('fill', 'none')
    .attr('stroke', '#7dd3fc')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.85)
    .attr('stroke-dasharray', '6 5');
  chartGroup.append('circle').attr('r', innerRadius - 2).attr('fill', 'rgba(15,23,42,0.85)');

  values.forEach((item, index) => {
    const startAngle = index * angleStep - Math.PI / 2;
    const endAngle = startAngle + angleStep * 0.94;
    const band = d3.arc().innerRadius(innerRadius).outerRadius(scale(item.value)).startAngle(startAngle).endAngle(endAngle);
    chartGroup.append('path').attr('d', band()).attr('fill', item.color).attr('opacity', 0.92);
    const labelAngle = startAngle + (endAngle - startAngle) / 2;
    const labelRadius = scale(item.value) + 18;
    chartGroup.append('text')
      .attr('x', Math.cos(labelAngle) * labelRadius)
      .attr('y', Math.sin(labelAngle) * labelRadius)
      .attr('fill', '#e2e8f0')
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .text(item.value);
  });

  chartGroup.append('text')
    .attr('y', 6)
    .attr('fill', '#f8fafc')
    .attr('font-size', 18)
    .attr('font-weight', 700)
    .attr('text-anchor', 'middle')
    .text(total);

  chartGroup.append('text')
    .attr('y', 28)
    .attr('fill', '#94a3b8')
    .attr('font-size', 11)
    .attr('text-anchor', 'middle')
    .text('within radius');
}

function getMapCenter() {
  const center = map.getCenter();
  return [center.lng, center.lat];
}

function syncCenterVisuals() {
  if (!map.isStyleLoaded()) return;
  if (!map.getSource('user-point') || !map.getSource('radius-circle')) return;
  const center = getMapCenter();
  map.getSource('user-point').setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: center } }],
  });
  drawRadiusCircle(center);
}

function scheduleRefreshFromCenter() {
  if (centerState.pendingFetchTimer) {
    clearTimeout(centerState.pendingFetchTimer);
  }

  centerState.pendingFetchTimer = setTimeout(async () => {
    const center = getMapCenter();
    const movedDistance = centerState.lastFetchCenter
      ? haversineDistance(centerState.lastFetchCenter, center)
      : Number.POSITIVE_INFINITY;

    if (movedDistance > centerState.searchRadius * 0.35) {
      centerState.searchRadius = Math.max(centerState.radiusMeters * 2, 1200);
      await refreshAmenities(center);
    }
  }, 220);
}
