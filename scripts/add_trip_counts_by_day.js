const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
global.window = {};
require(path.join(root, 'data.js'));

const data = window.TOEI_BUS_DATA;

function parseCsv(text) {
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
      continue;
    }
    if (c === '"') {
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

function keyFor(routeId, directionId, headsign, shapeId) {
  return [routeId, directionId || '', headsign || '', shapeId || ''].join('\u001f');
}

function patternKey(routeId, pattern) {
  return [
    keyFor(routeId, pattern.direction_id, pattern.headsign, pattern.shape_id),
    pattern.stops.map((s) => s.stop_id).join('\u001e'),
  ].join('\u001d');
}

function tripKey(trip, stopIds) {
  return [
    keyFor(trip.route_id, trip.direction_id, trip.trip_headsign, trip.shape_id),
    stopIds.join('\u001e'),
  ].join('\u001d');
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

async function readTripStopIds() {
  const stopTimesPath = path.join(root, '.gtfs_work', 'stop_times.txt');
  const rl = readline.createInterface({
    input: fs.createReadStream(stopTimesPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header;
  const tripIndex = { trip_id: -1, stop_id: -1 };
  const tripStops = new Map();
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      tripIndex.trip_id = header.indexOf('trip_id');
      tripIndex.stop_id = header.indexOf('stop_id');
      continue;
    }
    const row = parseCsvLine(line);
    const tripId = row[tripIndex.trip_id];
    if (!tripId) continue;
    let stops = tripStops.get(tripId);
    if (!stops) {
      stops = [];
      tripStops.set(tripId, stops);
    }
    stops.push(row[tripIndex.stop_id]);
  }
  return tripStops;
}

async function main() {
const calendar = parseCsv(fs.readFileSync(path.join(root, '.gtfs_work', 'calendar.txt'), 'utf8'));
const serviceTypes = new Map();
for (const service of calendar) {
  serviceTypes.set(service.service_id, {
    weekday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some((day) => service[day] === '1'),
    saturday: service.saturday === '1',
    holiday: service.sunday === '1',
  });
}

const counts = new Map();
const trips = parseCsv(fs.readFileSync(path.join(root, '.gtfs_work', 'trips.txt'), 'utf8'));
const tripStops = await readTripStopIds();
for (const trip of trips) {
  const types = serviceTypes.get(trip.service_id);
  const stopIds = tripStops.get(trip.trip_id);
  if (!stopIds) continue;
  const key = tripKey(trip, stopIds);
  const count = counts.get(key) || { weekday: 0, saturday: 0, holiday: 0, total: 0 };
  if (types?.weekday) count.weekday++;
  if (types?.saturday) count.saturday++;
  if (types?.holiday) count.holiday++;
  count.total++;
  counts.set(key, count);
}

let matched = 0;
let mismatched = 0;
const mismatches = [];
for (const route of data.routes) {
  for (const pattern of route.patterns) {
    const count = counts.get(patternKey(route.route_id, pattern)) || {
      weekday: 0,
      saturday: 0,
      holiday: 0,
      total: pattern.trip_count,
    };
    pattern.trip_counts = {
      weekday: count.weekday,
      saturday: count.saturday,
      holiday: count.holiday,
    };
    if (count.total === pattern.trip_count) matched++;
    else {
      mismatched++;
      mismatches.push(`${route.short_name} ${pattern.pattern_id}: data=${pattern.trip_count}, trips=${count.total}`);
    }
  }
}

fs.writeFileSync(
  path.join(root, 'data.js'),
  `window.TOEI_BUS_DATA = ${JSON.stringify(data)};\n`,
  'utf8',
);

console.log(`updated ${matched + mismatched} patterns; matched totals: ${matched}; mismatched totals: ${mismatched}`);
if (mismatches.length) console.log(mismatches.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
