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

function routeDisplayName(routeShortName, config) {
  return (routeShortName || '').replace(config.routePrefix, '').trim() || routeShortName || '';
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

function serviceTypeMap(calendar) {
  const types = new Map();
  for (const service of calendar) {
    types.set(service.service_id, {
      weekday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some((day) => service[day] === '1'),
      saturday: service.saturday === '1',
      holiday: service.sunday === '1',
    });
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
  const calendarCsv = readCsv(gtfsDir, 'calendar.txt');

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
  for (const route of routesCsv) {
    routes.set(route.route_id, {
      route_id: route.route_id,
      short_name: routeDisplayName(route.route_short_name, config),
      full_short_name: route.route_short_name,
      long_name: route.route_long_name,
      color: withHash(route.route_color, config.color),
      text_color: withHash(route.route_text_color, '#ffffff'),
      patterns: [],
      pattern_count: 0,
    });
  }

  const services = serviceTypeMap(calendarCsv);
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

  const routeList = [...routes.values()]
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
