const DATASETS = window.BUS_ROUTE_MANIFEST || window.BUS_ROUTE_DATASETS || {
  default_dataset: 'kyoto',
  datasets: { kyoto: window.KYOTO_CITY_BUS_DATA },
};
const DATA_CACHE = new Map();
let DATA = null;
let map, shapeLayer, stopLayer;
const state = {
  datasetId: DATASETS.default_dataset || Object.keys(DATASETS.datasets || {})[0],
  routeId: null,
  patternIndex: 0,
  stopName: null,
  returnStopName: null,
  viewMode: 'route',
};
const $ = (id) => document.getElementById(id);
const SEARCH_EXAMPLES = {
  kyoto: '1、四条河原町',
  toei: '都01、新橋駅前',
  sendai: '10、仙台駅',
  keio: '西55、聖蹟桜ヶ丘駅',
  yokohama: '001、中山駅前',
};

function datasetEntries() {
  return Object.values(DATASETS.datasets || {}).filter(Boolean);
}

function datasetInfo(datasetId) {
  return (DATASETS.datasets || {})[datasetId] || datasetEntries()[0];
}

async function loadDataset(datasetId) {
  const info = datasetInfo(datasetId);
  if (!info) throw new Error('Dataset is not configured.');
  if (info.routes) return info;
  if (DATA_CACHE.has(datasetId)) return DATA_CACHE.get(datasetId);

  const response = await fetch(info.data_url || `data/${datasetId}.json`);
  if (!response.ok) throw new Error(`Failed to load ${info.label || datasetId}.`);
  const dataset = await response.json();
  DATA_CACHE.set(datasetId, dataset);
  return dataset;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function textColorFor(bg) {
  const h = (bg || '#0068b7').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#172033' : '#fff';
}

function findRoute(id) {
  return DATA.routes.find((r) => r.route_id === id);
}

function setDetailHeading(text) {
  const heading = document.querySelector('.panel-heading h2');
  if (heading) heading.textContent = text;
}

function normalizeRouteName(name) {
  return String(name ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/^市バス/, '')
    .replace(/^都営バス\s*/, '')
    .trim();
}

function routeNumber(route) {
  const match = normalizeRouteName(route.short_name).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function routePrefixRank(route) {
  const name = normalizeRouteName(route.short_name);
  if (/^\d/.test(name)) return 0;
  if (name.includes('特')) return 1;
  if (name.includes('快速')) return 2;
  if (name.includes('臨')) return 3;
  return 4;
}

function compareRoutes(a, b) {
  const an = routeNumber(a);
  const bn = routeNumber(b);
  if (an !== bn) return an - bn;
  const ar = routePrefixRank(a);
  const br = routePrefixRank(b);
  if (ar !== br) return ar - br;
  return normalizeRouteName(a.short_name).localeCompare(normalizeRouteName(b.short_name), 'ja', { numeric: true });
}

function compareRoutesBySortKey(a, b) {
  return (
    String(a.route_sort_key || a.short_name || a.long_name || a.route_id).localeCompare(
      String(b.route_sort_key || b.short_name || b.long_name || b.route_id),
      'ja',
    ) ||
    String(a.long_name || '').localeCompare(String(b.long_name || ''), 'ja') ||
    String(a.route_id || '').localeCompare(String(b.route_id || ''), 'ja', { numeric: true })
  );
}

function routeComparator(datasetId) {
  return ['keio', 'kawasaki', 'odakyu', 'aomori', 'kanto', 'seibu', 'iyotetsu'].includes(datasetId) ? compareRoutesBySortKey : compareRoutes;
}

function initMap() {
  const initialDataset = datasetInfo(state.datasetId);
  map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(initialDataset?.map_center || [35.0116, 135.7681], initialDataset?.map_zoom || 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  shapeLayer = L.layerGroup().addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 150);
  window.addEventListener('resize', () => setTimeout(() => map.invalidateSize(), 50));
}

function routeMatches(route, q) {
  if (!q) return true;
  const stopNames = route.patterns
    .flatMap((pattern) => pattern.stops.map((stop) => stop.name))
    .join(' ');
  const hay = [route.route_id, route.short_name, route.full_short_name, route.long_name, routeSummary(route), stopNames].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function collectStopOptions(q) {
  const query = q.trim().toLowerCase();
  if (!DATA || !query) return [];
  const stops = new Map();

  DATA.routes.forEach((route) => {
    route.patterns.forEach((pattern) => {
      pattern.stops.forEach((stop) => {
        const name = stop.name || '';
        if (!name.toLowerCase().includes(query)) return;
        const item = stops.get(name) || { name, routeIds: new Set(), patternIds: new Set() };
        item.routeIds.add(route.route_id);
        item.patternIds.add(pattern.pattern_id);
        stops.set(name, item);
      });
    });
  });

  return [...stops.values()]
    .map((stop) => ({
      name: stop.name,
      routeCount: stop.routeIds.size,
      patternCount: stop.patternIds.size,
    }))
    .sort((a, b) => (
      Number(a.name.toLowerCase() !== query) - Number(b.name.toLowerCase() !== query) ||
      a.name.length - b.name.length ||
      b.routeCount - a.routeCount ||
      a.name.localeCompare(b.name, 'ja', { numeric: true })
    ))
    .slice(0, 24);
}

function stopMarkerKey(stop) {
  if (stop.stop_id) return stop.stop_id;
  return `${stop.name}-${stop.lat}-${stop.lon}`;
}

function patternsForStop(stopName) {
  if (!DATA || !stopName) return [];
  const matches = [];
  DATA.routes.forEach((route) => {
    route.patterns.forEach((pattern, patternIndex) => {
      const stops = pattern.stops.filter((stop) => stop.name === stopName);
      if (stops.length > 0) matches.push({ route, pattern, patternIndex, stops });
    });
  });
  return matches.sort((a, b) => (
    routeComparator(DATA.id)(a.route, b.route) ||
    String(a.pattern.direction_id).localeCompare(String(b.pattern.direction_id), 'ja', { numeric: true }) ||
    String(a.pattern.pattern_id).localeCompare(String(b.pattern.pattern_id), 'ja', { numeric: true })
  ));
}

function allStops() {
  if (!DATA) return [];
  const stops = new Map();
  DATA.routes.forEach((route) => {
    route.patterns.forEach((pattern) => {
      pattern.stops.forEach((stop) => {
        if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return;
        const key = stopMarkerKey(stop);
        const item = stops.get(key) || {
          stop,
          routeIds: new Set(),
          patternIds: new Set(),
        };
        item.routeIds.add(route.route_id);
        item.patternIds.add(pattern.pattern_id);
        stops.set(key, item);
      });
    });
  });

  return [...stops.values()].map((item) => ({
    ...item.stop,
    routeCount: item.routeIds.size,
    patternCount: item.patternIds.size,
  }));
}

function representativePattern(route) {
  const maxTripCount = Math.max(...route.patterns.map((pattern) => pattern.trip_count));
  return [...route.patterns].sort((a, b) => (
    Number(b.trip_count >= maxTripCount * 0.7) - Number(a.trip_count >= maxTripCount * 0.7) ||
    (a.trip_count >= maxTripCount * 0.7 && b.trip_count >= maxTripCount * 0.7 ? b.stop_count - a.stop_count : b.trip_count - a.trip_count) ||
    (a.trip_count >= maxTripCount * 0.7 && b.trip_count >= maxTripCount * 0.7 ? b.trip_count - a.trip_count : b.stop_count - a.stop_count) ||
    String(a.direction_id).localeCompare(String(b.direction_id), 'ja', { numeric: true }) ||
    String(a.shape_id).localeCompare(String(b.shape_id), 'ja', { numeric: true })
  ))[0];
}

function cleanHeadsign(headsign) {
  return String(headsign || '').replace(/\s*行$/, '').trim();
}

function uniqueNames(names) {
  return [...new Set(names.filter(Boolean))];
}

function isCircularPattern(pattern) {
  const first = pattern.stops?.[0]?.name || '';
  const last = pattern.stops?.[pattern.stops.length - 1]?.name || '';
  return Boolean(first && last && first === last) || String(pattern.headsign || '').includes('循環');
}

function circularVia(pattern) {
  const first = pattern.stops?.[0]?.name || '';
  const headsignVia = cleanHeadsign(pattern.headsign).replace(/循環/g, '').trim();
  if (headsignVia && headsignVia !== first) return headsignVia;

  const middleStops = uniqueNames((pattern.stops || [])
    .slice(1, -1)
    .map((stop) => stop.name)
    .filter((name) => name !== first));
  if (middleStops.length === 0) return '';

  const picks = uniqueNames([
    middleStops[Math.floor(middleStops.length / 3)],
    middleStops[Math.floor((middleStops.length * 2) / 3)],
  ]);
  return picks.slice(0, 2).join('・');
}

function patternSummary(pattern, arrow = '⇔', datasetId = DATA.id) {
  const first = pattern.stops?.[0]?.name || '';
  const last = pattern.stops?.[pattern.stops.length - 1]?.name || '';
  const headsign = cleanHeadsign(pattern.headsign);
  if (datasetId === 'kyoto' && isCircularPattern(pattern) && headsign) return headsign;
  if (isCircularPattern(pattern)) {
    const via = circularVia(pattern);
    return `${first || headsign}発 循環${via ? `（${via}）` : ''}`;
  }
  if (first && last && first !== last) return `${first} ${arrow} ${last}`;
  if (first && headsign && first !== headsign) return `${first} → ${headsign}`;
  return headsign || first;
}

function routeSummary(route) {
  const pattern = representativePattern(route);
  if (!pattern) return route.long_name || route.full_short_name || route.short_name;
  return patternSummary(pattern, '⇔', DATA.id) || route.long_name || route.full_short_name || route.short_name;
}

function renderRouteList() {
  if (!DATA) {
    $('routeList').innerHTML = '<div class="empty">Loading route data...</div>';
    return;
  }
  const q = $('routeSearch').value.trim();
  const stopOptions = collectStopOptions(q);
  const list = DATA.routes.filter((r) => routeMatches(r, q)).sort(routeComparator(DATA.id));
  const stopHtml = stopOptions.length ? `
    <div class="list-section-title">停留所候補</div>
    ${stopOptions.map((stop) => `
      <button class="stop-card ${state.viewMode === 'stop' && stop.name === state.stopName ? 'active' : ''}" data-stop-name="${escapeHtml(stop.name)}">
        <span class="stop-dot" aria-hidden="true"></span>
        <span class="info"><span class="name">${escapeHtml(stop.name)}</span><span class="sub">${stop.routeCount}系統 / ${stop.patternCount}経路パターン</span></span>
      </button>`).join('')}` : '';
  const routeHtml = list.map((r) => `
    <button class="route-card ${r.route_id === state.routeId ? 'active' : ''}" data-route-id="${escapeHtml(r.route_id)}">
      <span class="badge" style="background:${r.color};color:${textColorFor(r.color)}">${escapeHtml(r.short_name)}</span>
      <span class="info"><span class="name">${escapeHtml(routeSummary(r))}</span><span class="sub">${r.pattern_count} 経路パターン</span></span>
    </button>`).join('');
  $('routeList').innerHTML = [
    stopHtml,
    stopHtml && routeHtml ? '<div class="list-section-title">系統候補</div>' : '',
    routeHtml || (stopHtml ? '' : '<div class="empty">該当する系統・停留所がありません。</div>'),
  ].join('');
  $('routeList').querySelectorAll('.stop-card').forEach((btn) => btn.addEventListener('click', () => selectStop(btn.dataset.stopName)));
  $('routeList').querySelectorAll('.route-card').forEach((btn) => btn.addEventListener('click', () => selectRoute(btn.dataset.routeId, 0, { returnStopName: null })));
}

function renderDatasetSelect() {
  const select = $('datasetSelect');
  if (!select) return;
  select.innerHTML = datasetEntries().map((dataset) => (
    `<option value="${escapeHtml(dataset.id)}">${escapeHtml(dataset.label)}</option>`
  )).join('');
  select.value = state.datasetId;
}

function renderCounts() {
  const source = DATA || datasetInfo(state.datasetId) || {};
  $('routeCount').textContent = `${source.route_count || 0}系統`;
  $('patternCount').textContent = `${source.pattern_count || 0}経路パターン`;
}

function updateSearchPlaceholder() {
  const example = SEARCH_EXAMPLES[state.datasetId] || '系統名、停留所名';
  $('routeSearch').placeholder = `例：${example}`;
}

function patternLabel(pattern, i, datasetId = DATA.id) {
  return `${i + 1}. ${patternSummary(pattern, '→', datasetId) || '経路未設定'}`;
}

function tripCountLabel(pattern) {
  const counts = pattern.trip_counts;
  if (!counts) return `本数 ${pattern.trip_count}本`;
  return `平日 ${counts.weekday}本 / 土曜 ${counts.saturday}本 / 休日 ${counts.holiday}本`;
}

function routePopupHtml(route, pattern) {
  const shapeNote = pattern.shape_id ? '' : '<br><span class="popup-note">推定経路</span>';
  return `<strong>${escapeHtml(route.short_name)}</strong><br>${escapeHtml(patternSummary(pattern, '→', DATA.id) || pattern.headsign || '経路未設定')}<br>${tripCountLabel(pattern)}${shapeNote}`;
}

function addRouteClickTarget(pattern, route, patternIndex, returnStopName = null) {
  return L.polyline(pattern.shape, {
    color: '#000',
    weight: 18,
    opacity: 0,
    interactive: true,
    lineCap: 'round',
    lineJoin: 'round',
  })
    .bindPopup(routePopupHtml(route, pattern))
    .on('click', () => selectRoute(route.route_id, patternIndex, { returnStopName }))
    .addTo(shapeLayer);
}

function routeReturnStopName(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'returnStopName')) return options.returnStopName;
  if (state.viewMode === 'stop') return state.stopName;
  return state.returnStopName;
}

function selectRoute(routeId, patternIndex, options = {}) {
  const route = findRoute(routeId);
  if (!route) return;
  const returnStopName = routeReturnStopName(options);
  state.viewMode = 'route';
  state.routeId = routeId;
  state.patternIndex = Math.max(0, Math.min(patternIndex, route.patterns.length - 1));
  state.stopName = null;
  state.returnStopName = returnStopName || null;
  setDetailHeading('経路一覧・停留所');
  renderRouteList();
  renderDetail();
  drawPattern();
}

function selectStop(stopName) {
  const matches = patternsForStop(stopName);
  if (matches.length === 0) return;
  state.viewMode = 'stop';
  state.routeId = null;
  state.patternIndex = 0;
  state.stopName = stopName;
  state.returnStopName = null;
  setDetailHeading('通過系統一覧');
  renderRouteList();
  renderStopDetail(matches);
  drawStopPatterns(matches);
}

function clearSelection() {
  state.viewMode = 'route';
  state.routeId = null;
  state.patternIndex = 0;
  state.stopName = null;
  state.returnStopName = null;
  setDetailHeading('経路一覧・停留所');
  $('detail').classList.remove('stop-mode');
  $('detail').innerHTML = '<div class="empty">系統または停留所を選択すると、詳細が表示されます。</div>';
  renderRouteList();
  drawAllStops();
}

function drawPattern() {
  const route = findRoute(state.routeId);
  if (!route) return;
  const pattern = route.patterns[state.patternIndex];
  if (!pattern) return;

  shapeLayer.clearLayers();
  stopLayer.clearLayers();
  const line = L.polyline(pattern.shape, {
    color: route.color,
    weight: 7,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  })
    .bindPopup(routePopupHtml(route, pattern))
    .addTo(shapeLayer);
  addRouteClickTarget(pattern, route, state.patternIndex, state.returnStopName);

  pattern.stops.forEach((stop) => {
    if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return;
    L.circleMarker([stop.lat, stop.lon], {
      radius: 6,
      color: route.color,
      weight: 2,
      fillColor: '#fff',
      fillOpacity: 1,
    })
      .bindPopup(`<strong>${escapeHtml(stop.seq)}. ${escapeHtml(stop.name)}</strong>`)
      .bindTooltip(`${stop.seq}. ${escapeHtml(stop.name)}`, {
        permanent: true,
        direction: 'top',
        offset: [0, -8],
        className: 'stop-label',
      })
      .on('click', () => selectStop(stop.name))
      .addTo(stopLayer);
  });

  const bounds = line.getBounds();
  setTimeout(() => {
    map.invalidateSize();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
  }, 50);
  $('mapStatus').textContent = `${route.short_name} ${pattern.headsign || '行先未設定'} 停留所${pattern.stop_count}件`;
}

function drawStopPatterns(matches = patternsForStop(state.stopName)) {
  shapeLayer.clearLayers();
  stopLayer.clearLayers();
  const bounds = L.latLngBounds();
  const stopMarkers = new Map();

  matches.forEach(({ route, pattern, patternIndex, stops }) => {
    if (Array.isArray(pattern.shape) && pattern.shape.length > 0) {
      const line = L.polyline(pattern.shape, {
        color: route.color,
        weight: 4,
        opacity: 0.56,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindPopup(routePopupHtml(route, pattern))
        .on('click', () => selectRoute(route.route_id, patternIndex, { returnStopName: state.stopName }))
        .addTo(shapeLayer);
      addRouteClickTarget(pattern, route, patternIndex, state.stopName);
      bounds.extend(line.getBounds());
    }

    stops.forEach((stop) => {
      if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return;
      if (!stopMarkers.has(stopMarkerKey(stop))) stopMarkers.set(stopMarkerKey(stop), stop);
      bounds.extend([stop.lat, stop.lon]);
    });
  });

  stopMarkers.forEach((stop) => {
    L.circleMarker([stop.lat, stop.lon], {
      radius: 8,
      color: '#162033',
      weight: 3,
      fillColor: '#fff',
      fillOpacity: 1,
    })
      .bindPopup(`<strong>${escapeHtml(stop.name)}</strong>`)
      .bindTooltip(escapeHtml(stop.name), {
        permanent: true,
        direction: 'top',
        offset: [0, -10],
        className: 'stop-label selected',
      })
      .on('click', () => selectStop(stop.name))
      .addTo(stopLayer);
  });

  setTimeout(() => {
    map.invalidateSize();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
  }, 50);
  const routeCount = new Set(matches.map(({ route }) => route.route_id)).size;
  $('mapStatus').textContent = `${state.stopName} ${routeCount}系統 / ${matches.length}経路パターン`;
}

function drawAllStops() {
  shapeLayer.clearLayers();
  stopLayer.clearLayers();
  const stops = allStops();

  stops.forEach((stop) => {
    L.circleMarker([stop.lat, stop.lon], {
      radius: 4,
      color: '#52657d',
      weight: 1,
      fillColor: '#fff',
      fillOpacity: 0.82,
      opacity: 0.82,
    })
      .bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${stop.routeCount}系統 / ${stop.patternCount}経路パターン`)
      .bindTooltip(escapeHtml(stop.name), {
        permanent: false,
        direction: 'top',
        offset: [0, -7],
        className: 'stop-label all-stop-label',
      })
      .on('click', () => selectStop(stop.name))
      .addTo(stopLayer);
  });

  $('mapStatus').textContent = `停留所または系統を選択してください（停留所 ${stops.length}件）`;
}

function renderDetail() {
  $('detail').classList.remove('stop-mode');
  const route = findRoute(state.routeId);
  if (!route) {
    $('detail').innerHTML = '<div class="empty">系統を選択してください。</div>';
    return;
  }
  const p = route.patterns[state.patternIndex];
  const returnControls = state.returnStopName ? `
    <div class="detail-actions">
      <button class="back-detail" type="button">戻る</button>
      <button class="close-detail" type="button" aria-label="閉じる">×</button>
    </div>` : '';
  const tabs = route.patterns.map((pt, i) => `
    <button class="pattern-tab ${i === state.patternIndex ? 'active' : ''}" data-index="${i}" style="${i === state.patternIndex ? `background:${route.color};color:${textColorFor(route.color)}` : ''}">
      <strong>${escapeHtml(patternLabel(pt, i))}</strong>
      <span>${tripCountLabel(pt)} / 停留所 ${pt.stop_count}</span>
    </button>`).join('');
  const stops = p.stops.map((s) => `<li data-stop-name="${escapeHtml(s.name)}" data-lat="${s.lat}" data-lon="${s.lon}"><span class="seq">${String(s.seq).padStart(2, '0')}</span><span class="stop-name">${escapeHtml(s.name)}</span></li>`).join('');
  $('detail').innerHTML = `
    <div class="detail-title"><span class="badge" style="background:${route.color};color:${textColorFor(route.color)}">${escapeHtml(route.short_name)}</span><h2>${escapeHtml(p.headsign || '行先未設定')}</h2>${returnControls}</div>
    <div class="pattern-scroll"><div class="pattern-tabs">${tabs}</div></div>
    <div class="stop-scroll"><ol class="stop-list">${stops}</ol></div>`;
  $('detail').querySelector('.back-detail')?.addEventListener('click', () => selectStop(state.returnStopName));
  $('detail').querySelector('.close-detail')?.addEventListener('click', clearSelection);
  $('detail').querySelectorAll('.pattern-tab').forEach((btn) => btn.addEventListener('click', () => selectRoute(route.route_id, Number(btn.dataset.index), { returnStopName: state.returnStopName })));
  $('detail').querySelectorAll('.stop-list li').forEach((li) => li.addEventListener('click', () => {
    const lat = Number(li.dataset.lat);
    const lon = Number(li.dataset.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], Math.max(map.getZoom(), 16));
    selectStop(li.dataset.stopName);
  }));
}

function renderStopDetail(matches = patternsForStop(state.stopName)) {
  $('detail').classList.add('stop-mode');
  const routeCount = new Set(matches.map(({ route }) => route.route_id)).size;
  const items = matches.map(({ route, pattern, patternIndex, stops }) => `
    <button class="passing-route-card" data-route-id="${escapeHtml(route.route_id)}" data-pattern-index="${patternIndex}">
      <span class="badge" style="background:${route.color};color:${textColorFor(route.color)}">${escapeHtml(route.short_name)}</span>
      <span class="info">
        <strong>${escapeHtml(patternSummary(pattern, '→', DATA.id) || pattern.headsign || '経路未設定')}</strong>
        <span>${tripCountLabel(pattern)} / 通過位置 ${stops.map((stop) => `${stop.seq}番`).join('、')}</span>
      </span>
    </button>`).join('');

  $('detail').innerHTML = `
    <div class="stop-detail-title">
      <span class="stop-dot large" aria-hidden="true"></span>
      <div><h2>${escapeHtml(state.stopName)}</h2><p>${routeCount}系統 / ${matches.length}経路パターン</p></div>
      <button class="close-detail" type="button" aria-label="停留所選択を閉じる">×</button>
    </div>
    <div class="passing-route-list">${items}</div>`;
  $('detail').querySelector('.close-detail')?.addEventListener('click', clearSelection);
  $('detail').querySelectorAll('.passing-route-card').forEach((btn) => {
    btn.addEventListener('click', () => selectRoute(btn.dataset.routeId, Number(btn.dataset.patternIndex), { returnStopName: state.stopName }));
  });
}

async function selectDataset(datasetId) {
  const info = datasetInfo(datasetId);
  if (!info) return;
  state.datasetId = datasetId;
  state.routeId = null;
  state.patternIndex = 0;
  state.stopName = null;
  state.returnStopName = null;
  state.viewMode = 'route';
  DATA = null;
  $('routeSearch').value = '';
  shapeLayer.clearLayers();
  stopLayer.clearLayers();
  map.setView(info.map_center || [35.0116, 135.7681], info.map_zoom || 12);
  $('mapStatus').textContent = 'データを読み込んでいます...';
  $('detail').classList.remove('stop-mode');
  $('detail').innerHTML = '<div class="empty">データを読み込んでいます...</div>';
  setDetailHeading('経路一覧・停留所');
  updateSearchPlaceholder();
  renderCounts();
  renderRouteList();
  $('datasetSelect').disabled = true;

  try {
    const dataset = await loadDataset(datasetId);
    if (state.datasetId !== datasetId) return;
    DATA = dataset;
    map.setView(DATA.map_center || [35.0116, 135.7681], DATA.map_zoom || 12);
    drawAllStops();
    $('detail').innerHTML = '<div class="empty">系統を選択すると、経路パターンと停留所が表示されます。</div>';
    renderCounts();
    renderRouteList();
  } catch (error) {
    if (state.datasetId !== datasetId) return;
    $('mapStatus').textContent = 'データの読み込みに失敗しました';
    $('routeList').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    $('detail').innerHTML = '<div class="empty">時間をおいて再度選択してください。</div>';
  } finally {
    if (state.datasetId === datasetId) $('datasetSelect').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderDatasetSelect();
  updateSearchPlaceholder();
  renderCounts();
  initMap();
  $('datasetSelect').addEventListener('change', (event) => selectDataset(event.target.value));
  $('routeSearch').addEventListener('input', renderRouteList);
  selectDataset(state.datasetId);
});
