const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const datasets = [
  {
    id: 'kyoto',
    label: '京都市営バス',
    generatedFrom: 'Kyoto_City_Bus_GTFS-20260525.zip',
    zipPath: path.join(root, 'gtfs', 'Kyoto_City_Bus_GTFS-20260525.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'kyoto'),
    fallbackGtfsDir: path.join(root, '.gtfs_work'),
    mapCenter: [35.0116, 135.7681],
    zoom: 12,
    routePrefix: /^市バス/,
    color: '#0068b7',
  },
  {
    id: 'toei',
    label: '都営バス',
    generatedFrom: 'ToeiBus-GTFS.zip',
    zipPath: path.join(root, 'gtfs', 'ToeiBus-GTFS.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'toei'),
    mapCenter: [35.6895, 139.6917],
    zoom: 11,
    routePrefix: /^都営バス\s*/,
    color: '#208a3f',
  },
  {
    id: 'sendai',
    label: '仙台市営バス',
    generatedFrom: 'Sendai_city_bus_realtime_information-20260601.zip',
    zipPath: path.join(root, 'gtfs', 'Sendai_city_bus_realtime_information-20260601.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'sendai'),
    mapCenter: [38.2682, 140.8694],
    zoom: 12,
    routePrefix: /^仙台市営バス\s*/,
    color: '#6aa84f',
  },
  {
    id: 'keio',
    label: '京王バス',
    generatedFrom: 'Keio_AllLines-20260404.zip',
    zipPath: path.join(root, 'gtfs', 'Keio_AllLines-20260404.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'keio'),
    mapCenter: [35.6637, 139.4329],
    zoom: 11,
    routePrefix: /^京王バス\s*/,
    color: '#dd1f26',
    useRouteSortKey: true,
  },
  {
    id: 'yokohama',
    label: '横浜市営バス',
    generatedFrom: 'Yokohama_City_Bus-20260601.zip',
    zipPath: path.join(root, 'gtfs', 'Yokohama_City_Bus-20260601.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'yokohama'),
    mapCenter: [35.4437, 139.6380],
    zoom: 12,
    routePrefix: /系統$/,
    color: '#005bac',
  },
  {
    id: 'kawasaki',
    label: '川崎市営バス',
    generatedFrom: 'Kawasaki_City_AllLines-20260528.zip',
    zipPath: path.join(root, 'gtfs', 'Kawasaki_City_AllLines-20260528.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'kawasaki'),
    mapCenter: [35.5308, 139.7036],
    zoom: 12,
    routePrefix: /\s*$/,
    color: '#007a3d',
    forceColor: true,
    useRouteSortKey: true,
  },
  {
    id: 'odakyu',
    label: '小田急バス',
    generatedFrom: 'Odakyu_AIILines-20260601.zip',
    zipPath: path.join(root, 'gtfs', 'Odakyu_AIILines-20260601.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'odakyu'),
    mapCenter: [35.6600, 139.5550],
    zoom: 11,
    routePrefix: /\s*$/,
    color: '#0068b7',
    fallbackLongNameForEmptyShort: true,
    useRouteSortKey: true,
    combineDuplicateShortNames: true,
  },
  {
    id: 'aomori',
    label: '青森市営バス',
    generatedFrom: 'Aomori_City_AllLines-20260401.zip',
    zipPath: path.join(root, 'gtfs', 'Aomori_City_AllLines-20260401.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'aomori'),
    mapCenter: [40.8221, 140.7474],
    zoom: 12,
    routePrefix: /\s*$/,
    color: '#2f9e44',
    useRouteSortKey: true,
    combineDuplicateShortNames: true,
  },
  {
    id: 'kanto',
    label: '関東バス',
    generatedFrom: 'Kanto_AllLines-20260507.zip',
    zipPath: path.join(root, 'gtfs', 'Kanto_AllLines-20260507.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'kanto'),
    mapCenter: [35.7060, 139.6220],
    zoom: 12,
    routePrefix: /\s*$/,
    color: '#0052b5',
    useRouteSortKey: true,
  },
  {
    id: 'seibu',
    label: '西武バス',
    generatedFrom: 'SeibuBus-GTFS.zip',
    zipPath: path.join(root, 'gtfs', 'SeibuBus-GTFS.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'seibu'),
    mapCenter: [35.7800, 139.4700],
    zoom: 11,
    routePrefix: /\s*$/,
    color: '#ea5504',
    useRouteSortKey: true,
  },
  {
    id: 'iyotetsu',
    label: '伊予鉄バス',
    generatedFrom: 'Iyotetsu_AllLines-20260519.zip',
    zipPath: path.join(root, 'gtfs', 'Iyotetsu_AllLines-20260519.zip'),
    gtfsDir: path.join(root, '.gtfs_work', 'iyotetsu'),
    mapCenter: [33.8392, 132.7657],
    zoom: 12,
    routePrefix: /\s*$/,
    color: '#f9c74b',
    useRouteSortKey: true,
  },
];

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }

  fields.push(field);
  return fields;
}

function resolveGtfsDir(config) {
  if (fs.existsSync(path.join(config.gtfsDir, 'routes.txt'))) return config.gtfsDir;
  if (config.zipPath && fs.existsSync(config.zipPath)) {
    fs.mkdirSync(config.gtfsDir, { recursive: true });
    execFileSync('tar', ['-xf', config.zipPath, '-C', config.gtfsDir], { stdio: 'inherit' });
    if (fs.existsSync(path.join(config.gtfsDir, 'routes.txt'))) return config.gtfsDir;
  }
  if (config.fallbackGtfsDir && fs.existsSync(path.join(config.fallbackGtfsDir, 'routes.txt'))) {
    return config.fallbackGtfsDir;
  }
  throw new Error(`${config.label}: GTFS files were not found in ${config.gtfsDir}`);
}

function readCsv(gtfsDir, name) {
  return parseCsv(fs.readFileSync(path.join(gtfsDir, name), 'utf8'));
}

function readOptionalCsv(gtfsDir, name) {
  const filePath = path.join(gtfsDir, name);
  return fs.existsSync(filePath) ? parseCsv(fs.readFileSync(filePath, 'utf8')) : [];
}

function withHash(color, fallback) {
  const value = (color || '').trim();
  return value ? `#${value}` : fallback;
}

function routeDisplayName(routeShortName, config, routeLongName = '') {
  return (
    (routeShortName || '').replace(config.routePrefix, '').trim() ||
    routeShortName ||
    (config.fallbackLongNameForEmptyShort ? routeLongName : '') ||
    ''
  );
}

function routeSortKey(routeName, routeId) {
  const name = String(routeName || routeId || '').trim();
  const kanji = name.match(/[一-龯々〆ヵヶ]/)?.[0];
  if (kanji) return `0\u001f${kanji}\u001f${name}`;

  const kana = name.match(/[ぁ-んァ-ン]/)?.[0];
  if (kana) return `1\u001f${kana}\u001f${name}`;

  const latin = name.match(/[A-Za-z]/)?.[0]?.toUpperCase();
  if (latin) return `2\u001f${latin}\u001f${name}`;

  return `3\u001f${name}`;
}

function keyForTrip(trip, stopIds) {
  return [
    trip.route_id,
    trip.direction_id || '',
    trip.trip_headsign || '',
    trip.shape_id || '',
    stopIds.join('\u001e'),
  ].join('\u001f');
}

function timeLabel(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  return `${h}:${m}`;
}

function serviceTypeMap(calendar, calendarDates = []) {
  const types = new Map();
  for (const service of calendar) {
    types.set(service.service_id, {
      weekday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some((day) => service[day] === '1'),
      saturday: service.saturday === '1',
      holiday: service.sunday === '1',
    });
  }
  if (calendar.length > 0) return types;
  for (const service of calendarDates) {
    if (service.exception_type && service.exception_type !== '1') continue;
    if (!/^\d{8}$/.test(service.date || '')) continue;
    let type = types.get(service.service_id);
    if (!type) {
      type = { weekday: false, saturday: false, holiday: false };
      types.set(service.service_id, type);
    }
    const year = Number(service.date.slice(0, 4));
    const month = Number(service.date.slice(4, 6)) - 1;
    const day = Number(service.date.slice(6, 8));
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (weekday === 0) type.holiday = true;
    else if (weekday === 6) type.saturday = true;
    else type.weekday = true;
  }
  return types;
}

async function readTripStops(gtfsDir) {
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
  const rl = readline.createInterface({
    input: fs.createReadStream(stopTimesPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let header;
  const index = {};
  const tripStops = new Map();

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      if (header[0]) header[0] = header[0].replace(/^\uFEFF/, '');
      for (const name of ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']) {
        index[name] = header.indexOf(name);
      }
      continue;
    }

    const row = parseCsvLine(line);
    const tripId = row[index.trip_id];
    if (!tripId) continue;
    let stops = tripStops.get(tripId);
    if (!stops) {
      stops = [];
      tripStops.set(tripId, stops);
    }
    stops.push({
      stop_id: row[index.stop_id],
      sort: Number(row[index.stop_sequence]),
      time: timeLabel(row[index.departure_time] || row[index.arrival_time]),
    });
  }

  for (const stops of tripStops.values()) {
    stops.sort((a, b) => a.sort - b.sort);
    stops.forEach((stop, index) => {
      stop.seq = index + 1;
      delete stop.sort;
    });
  }

  return tripStops;
}

async function buildDataset(config) {
  const gtfsDir = resolveGtfsDir(config);
  const routesCsv = readCsv(gtfsDir, 'routes.txt');
  const stopsCsv = readCsv(gtfsDir, 'stops.txt');
  const tripsCsv = readCsv(gtfsDir, 'trips.txt');
  const shapesCsv = readOptionalCsv(gtfsDir, 'shapes.txt');
  const calendarCsv = readOptionalCsv(gtfsDir, 'calendar.txt');
  const calendarDatesCsv = readOptionalCsv(gtfsDir, 'calendar_dates.txt');

  const stops = new Map(stopsCsv.map((stop) => [
    stop.stop_id,
    {
      stop_id: stop.stop_id,
      name: stop.stop_name,
      lat: Number(stop.stop_lat),
      lon: Number(stop.stop_lon),
    },
  ]));

  const shapes = new Map();
  for (const point of shapesCsv) {
    let shape = shapes.get(point.shape_id);
    if (!shape) {
      shape = [];
      shapes.set(point.shape_id, shape);
    }
    shape.push({
      seq: Number(point.shape_pt_sequence),
      lat: Number(point.shape_pt_lat),
      lon: Number(point.shape_pt_lon),
    });
  }
  for (const [shapeId, points] of shapes) {
    shapes.set(
      shapeId,
      points
        .sort((a, b) => a.seq - b.seq)
        .map((point) => [Number(point.lat.toFixed(6)), Number(point.lon.toFixed(6))]),
    );
  }

  const routes = new Map();
  const routeGroups = new Map();
  routesCsv.forEach((route, routeIndex) => {
    const shortName = routeDisplayName(route.route_short_name, config, route.route_long_name);
    const shouldCombine = config.combineDuplicateShortNames && shortName;
    const groupKey = shouldCombine ? `name:${shortName}` : `id:${route.route_id}`;
    let routeData = routeGroups.get(groupKey);

    if (routeData) {
      routeData.source_route_ids.push(route.route_id);
      if (route.route_long_name && !routeData.long_names.includes(route.route_long_name)) {
        routeData.long_names.push(route.route_long_name);
        routeData.long_name = routeData.long_names.join(' / ');
      }
      routes.set(route.route_id, routeData);
      return;
    }

    routeData = {
      route_id: shouldCombine ? groupKey : route.route_id,
      short_name: shortName,
      full_short_name: route.route_short_name,
      long_name: route.route_long_name,
      color: withHash(config.forceColor ? '' : route.route_color, config.color),
      text_color: withHash(config.forceColor ? '' : route.route_text_color, '#ffffff'),
      patterns: [],
      pattern_count: 0,
    };
    if (shouldCombine) {
      routeData.source_route_ids = [route.route_id];
      routeData.long_names = route.route_long_name ? [route.route_long_name] : [];
    }
    if (config.useRouteSortKey) {
      routeData.route_sort_key = routeSortKey(routeData.short_name || routeData.long_name, routeData.route_id);
    }
    routeGroups.set(groupKey, routeData);
    routes.set(route.route_id, routeData);
  });

  const services = serviceTypeMap(calendarCsv, calendarDatesCsv);
  const tripStops = await readTripStops(gtfsDir);
  const patternMap = new Map();

  for (const trip of tripsCsv) {
    const route = routes.get(trip.route_id);
    const stopRows = tripStops.get(trip.trip_id);
    if (!route || !stopRows || stopRows.length === 0) continue;

    const stopIds = stopRows.map((stop) => stop.stop_id);
    const patternKey = keyForTrip(trip, stopIds);
    let pattern = patternMap.get(patternKey);
    const type = services.get(trip.service_id);

    if (!pattern) {
      const enrichedStops = stopRows.map((row) => {
        const stop = stops.get(row.stop_id) || {};
        return {
          seq: row.seq,
          stop_id: row.stop_id,
          name: stop.name || row.stop_id,
          lat: stop.lat,
          lon: stop.lon,
          time: row.time,
        };
      });
      const shape = shapes.get(trip.shape_id) || enrichedStops
        .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
        .map((stop) => [Number(stop.lat.toFixed(6)), Number(stop.lon.toFixed(6))]);

      pattern = {
        pattern_id: `${trip.route_id}-${route.patterns.length + 1}`,
        direction_id: trip.direction_id || '',
        headsign: trip.trip_headsign || '',
        shape_id: trip.shape_id || '',
        trip_count: 0,
        sample_trip_id: trip.trip_id,
        stop_count: enrichedStops.length,
        shape_point_count: shape.length,
        shape,
        stops: enrichedStops,
        trip_counts: { weekday: 0, saturday: 0, holiday: 0 },
      };
      route.patterns.push(pattern);
      patternMap.set(patternKey, pattern);
    }

    pattern.trip_count++;
    if (type?.weekday) pattern.trip_counts.weekday++;
    if (type?.saturday) pattern.trip_counts.saturday++;
    if (type?.holiday) pattern.trip_counts.holiday++;
  }

  const routeList = [...routeGroups.values()]
    .filter((route) => route.patterns.length > 0)
    .map((route) => {
      const maxTripCount = Math.max(...route.patterns.map((pattern) => pattern.trip_count));
      route.patterns.sort((a, b) => {
        const aFirst = a.stops[0]?.name || '';
        const bFirst = b.stops[0]?.name || '';
        const aLast = a.stops[a.stops.length - 1]?.name || '';
        const bLast = b.stops[b.stops.length - 1]?.name || '';
        const aFrequent = a.trip_count >= maxTripCount * 0.7;
        const bFrequent = b.trip_count >= maxTripCount * 0.7;
        const preferredOrder = (
          Number(bFrequent) - Number(aFrequent) ||
          (aFrequent && bFrequent ? b.stop_count - a.stop_count : b.trip_count - a.trip_count) ||
          (aFrequent && bFrequent ? b.trip_count - a.trip_count : b.stop_count - a.stop_count)
        );
        return (
          preferredOrder ||
          String(a.direction_id).localeCompare(String(b.direction_id), 'ja', { numeric: true }) ||
          aFirst.localeCompare(bFirst, 'ja', { numeric: true }) ||
          aLast.localeCompare(bLast, 'ja', { numeric: true }) ||
          a.shape_id.localeCompare(b.shape_id, 'ja', { numeric: true })
        );
      });
      route.pattern_count = route.patterns.length;
      return route;
    });

  return {
    id: config.id,
    label: config.label,
    generated_from: config.generatedFrom,
    map_center: config.mapCenter,
    map_zoom: config.zoom,
    route_count: routeList.length,
    pattern_count: routeList.reduce((sum, route) => sum + route.patterns.length, 0),
    routes: routeList,
  };
}

async function main() {
  const builtDatasets = Object.fromEntries(
    await Promise.all(datasets.map(async (config) => [config.id, await buildDataset(config)])),
  );

  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  for (const dataset of Object.values(builtDatasets)) {
    fs.writeFileSync(
      path.join(dataDir, `${dataset.id}.json`),
      `${JSON.stringify(dataset)}\n`,
      'utf8',
    );
  }

  const manifest = {
    default_dataset: 'kyoto',
    datasets: Object.fromEntries(Object.values(builtDatasets).map((dataset) => [
      dataset.id,
      {
        id: dataset.id,
        label: dataset.label,
        generated_from: dataset.generated_from,
        map_center: dataset.map_center,
        map_zoom: dataset.map_zoom,
        route_count: dataset.route_count,
        pattern_count: dataset.pattern_count,
        data_url: `data/${dataset.id}.json`,
      },
    ])),
  };

  fs.writeFileSync(
    path.join(root, 'data.js'),
    `window.BUS_ROUTE_MANIFEST = ${JSON.stringify(manifest)};\n`,
    'utf8',
  );

  for (const dataset of Object.values(builtDatasets)) {
    console.log(`${dataset.label}: generated ${dataset.route_count} routes and ${dataset.pattern_count} patterns`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
