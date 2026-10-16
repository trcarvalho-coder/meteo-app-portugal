// ===== Adaptador IPMA (fonte central e unica de dados IPMA) =====
// Endpoints validados na documentacao oficial (https://api.ipma.pt/):
// - Avisos: /forecast/warnings/warnings_www.json (lista; horas UTC sem sufixo)
// - Observacoes: /observation/meteorology/stations/observations.json
//     (dict timestamp -> {idEstacao: {...}}; -99.0 = nodata; intensidadeVentoKM em km/h)
// - Estacoes: /observation/meteorology/stations/stations.json (GeoJSON)
// - Localidades: /distrits-islands.json (globalIdLocal, idAreaAviso)
// - Previsao diaria: /forecast/meteorology/cities/daily/{globalIdLocal}.json
//     ("Apenas estao disponiveis dados diarios.")
// - Tipos de tempo: /weather-type-classe.json
//
// Regras: -99.0 -> null (nodata); vento em km/h; timestamps da fonte em UTC
// sem sufixo; cache por recurso; falha preserva ultimo dado valido (stale).

const IPMA_BASE = 'https://api.ipma.pt/open-data';

const NODATA = -99.0;

// TTLs coerentes com a cadencia oficial de publicacao
const TTL = {
    warnings: 5 * 60 * 1000,
    observations: 10 * 60 * 1000,
    stations: 24 * 60 * 60 * 1000,
    locations: 24 * 60 * 60 * 1000,
    weatherTypes: 24 * 60 * 60 * 1000,
    forecast: 60 * 60 * 1000
};

const cache = new Map();
let inFlight = new Map();

async function fetchJson(path) {
    const response = await fetch(`${IPMA_BASE}${path}`);
    if (!response.ok) throw new Error(`IPMA HTTP ${response.status}: ${path}`);
    return response.json();
}

async function cached(key, path, ttl) {
    const entry = cache.get(key);
    const now = Date.now();
    if (entry && (now - entry.timestamp) < ttl) {
        return { data: entry.data, stale: false, fetchedAt: entry.timestamp };
    }
    if (!inFlight.has(key)) {
        inFlight.set(key, fetchJson(path).finally(() => inFlight.delete(key)));
    }
    try {
        const data = await inFlight.get(key);
        cache.set(key, { data, timestamp: now });
        return { data, stale: false, fetchedAt: now };
    } catch (err) {
        if (entry) {
            return { data: entry.data, stale: true, fetchedAt: entry.timestamp, error: err };
        }
        throw err;
    }
}

function nodataToNull(value) {
    return value == null ? null : (Number(value) === NODATA ? null : Number(value));
}

function parseIpmaDate(s) {
    if (!s) return null;
    return new Date(s.endsWith('Z') ? s : s + ':00Z');
}

// ===== Avisos =====

const LEVELS = { yellow: 1, orange: 2, red: 3 };

async function loadWarnings() {
    const { data, stale, fetchedAt } = await cached('warnings', '/forecast/warnings/warnings_www.json', TTL.warnings);
    const now = Date.now();
    const warnings = (Array.isArray(data) ? data : [])
        .filter(w => w.awarenessLevelID && w.awarenessLevelID !== 'green')
        .map(w => ({
            areaId: w.idAreaAviso,
            phenomenon: w.awarenessTypeName,
            level: LEVELS[w.awarenessLevelID] || 0,
            levelName: w.awarenessLevelID,
            text: w.text || null,
            start: parseIpmaDate(w.startTime),
            end: parseIpmaDate(w.endTime)
        }))
        .filter(w => w.start && w.end)
        .map(w => ({ ...w, active: w.start.getTime() <= now && now <= w.end.getTime() }));
    return { warnings, stale, fetchedAt };
}

function maxLevelByArea(warnings, now = new Date()) {
    const map = new Map();
    for (const w of warnings) {
        if (w.start <= now && now <= w.end) {
            const prev = map.get(w.areaId) || 0;
            if (w.level > prev) map.set(w.areaId, w.level);
        }
    }
    return map;
}

// ===== Estacoes e observacoes =====

async function loadStations() {
    const { data, stale } = await cached('stations', '/observation/meteorology/stations/stations.json', TTL.stations);
    const stations = (Array.isArray(data) ? data : []).map(f => ({
        id: String(f.properties.idEstacao),
        name: f.properties.localEstacao || String(f.properties.idEstacao),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0]
    }));
    return { stations, stale };
}

async function loadObservations() {
    const { data, stale, fetchedAt } = await cached('observations', '/observation/meteorology/stations/observations.json', TTL.observations);
    const byStation = new Map();
    const times = Object.keys(data || {}).sort();
    for (const t of times.reverse()) {
        const stamp = parseIpmaDate(t);
        const stationsAt = data[t] || {};
        for (const [id, obs] of Object.entries(stationsAt)) {
            if (byStation.has(id) || !obs) continue; // estacao sem dados neste instante
            byStation.set(id, {
                time: stamp,
                temperature: nodataToNull(obs.temperatura),
                humidity: nodataToNull(obs.humidade),
                windSpeedKmh: nodataToNull(obs.intensidadeVentoKM),
                windDirectionCode: obs.idDireccVento != null && Number(obs.idDireccVento) !== NODATA ? Number(obs.idDireccVento) : null,
                pressure: nodataToNull(obs.pressao),
                precipitation: nodataToNull(obs.precAcumulada),
                radiation: nodataToNull(obs.radiacao)
            });
        }
    }
    return { byStation, stale, fetchedAt };
}

// ===== Localidades e previsao =====

async function loadLocations() {
    const { data, stale } = await cached('locations', '/distrits-islands.json', TTL.locations);
    const locations = (data.data || []).map(l => ({
        globalIdLocal: l.globalIdLocal,
        name: l.local,
        areaId: l.idAreaAviso,
        region: l.idRegiao,
        lat: Number(l.latitude),
        lng: Number(l.longitude)
    }));
    return { locations, stale };
}

async function loadWeatherTypes() {
    const { data } = await cached('weatherTypes', '/weather-type-classe.json', TTL.weatherTypes);
    const types = new Map();
    for (const t of data.data || []) types.set(t.idWeatherType, t.descWeatherTypePT);
    return types;
}

async function loadDailyForecast(globalIdLocal) {
    const key = 'forecast-' + globalIdLocal;
    const { data, stale, fetchedAt } = await cached(key, '/forecast/meteorology/cities/daily/' + globalIdLocal + '.json', TTL.forecast);
    const days = (data.data || []).map(d => ({
        date: d.forecastDate,
        tMin: d.tMin != null ? Number(d.tMin) : null,
        tMax: d.tMax != null ? Number(d.tMax) : null,
        precipProb: d.precipitaProb != null ? Number(d.precipitaProb) : null,
        windDirection: d.predWindDir || null,
        windClass: d.classWindSpeed != null ? Number(d.classWindSpeed) : null,
        weatherType: d.idWeatherType,
        lat: Number(d.latitude),
        lng: Number(d.longitude)
    }));
    return { days, stale, fetchedAt, dataUpdate: parseIpmaDate(data.dataUpdate) };
}

// ===== Associacao espacial =====

function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OBS_MAX_DISTANCE_KM = 40;
const OBS_MAX_AGE_HOURS = 3;
const FC_MAX_DISTANCE_KM = 60;

function findStation(point, stations, byStation, now = new Date()) {
    let best = null;
    for (const s of stations) {
        const d = distanceKm(point.lat, point.lng, s.lat, s.lng);
        if (d > OBS_MAX_DISTANCE_KM) continue;
        const obs = byStation.get(s.id);
        if (!obs) {
            if (!best || d < best.distance) best = { station: s, distance: d, obs: null };
            continue;
        }
        const ageHours = (now - obs.time) / 3600000;
        if (ageHours > OBS_MAX_AGE_HOURS) {
            if (!best || d < best.distance) best = { station: s, distance: d, obs: { staleObs: true, ...obs } };
            continue;
        }
        if (!best || d < best.distance) best = { station: s, distance: d, obs };
    }
    return best;
}

function findForecastLocation(point, locations) {
    let best = null;
    for (const l of locations) {
        const d = distanceKm(point.lat, point.lng, l.lat, l.lng);
        if (d > FC_MAX_DISTANCE_KM) continue;
        if (!best || d < best.distance) best = { location: l, distance: d };
    }
    return best;
}

function forecastDaysWithin(days, now, hours = 36) {
    const end = new Date(now.getTime() + hours * 3600000);
    const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return days.filter(d => {
        const parts = d.date.split('-').map(Number);
        const dayStart = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        const dayEnd = new Date(dayStart.getTime() + 24 * 3600000 - 1);
        return dayEnd >= startDay && dayStart <= end;
    });
}

function clearCache() {
    cache.clear();
}

export default {
    loadWarnings, maxLevelByArea,
    loadStations, loadObservations,
    loadLocations, loadWeatherTypes, loadDailyForecast,
    findStation, findForecastLocation, forecastDaysWithin, distanceKm,
    clearCache,
    OBS_MAX_DISTANCE_KM, OBS_MAX_AGE_HOURS, FC_MAX_DISTANCE_KM,
    IPMA_BASE
};
