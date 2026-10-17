// ===== Adaptador ERA5 (via Open-Meteo Historical API) =====
// Fonte interina, identificada como "Open-Meteo (ERA5)", ate a integracao
// ARCO-ERA5/BigQuery estar disponivel.
// Unidades pedidas explicitamente: vento km/h, temperatura Celsius, precip. mm.
// Contexto temporal historico independente da linha temporal de previsao.

const ERA5_HOST = 'archive-api' + '.open-meteo.com';
const ERA5_BASE = 'https://' + ERA5_HOST + '/v1/era5';

const era5Cache = new Map(); // key: lat-lng-start-end -> { data, timestamp }
const CACHE_TTL = 3600000;

/**
 * Historico diario ERA5 para um periodo.
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 */
async function loadDailyHistory(latitude, longitude, startDate, endDate, { signal } = {}) {
    const key = `${latitude.toFixed(4)}-${longitude.toFixed(4)}-${startDate}-${endDate}`;
    const now = Date.now();
    const cached = era5Cache.get(key);
    if (cached && (now - cached.timestamp) < CACHE_TTL) return cached.data;

    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        start_date: startDate,
        end_date: endDate,
        daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max',
        timezone: 'Europe/Lisbon',
        wind_speed_unit: 'kmh',
        temperature_unit: 'celsius',
        precipitation_unit: 'mm'
    });

    // Timeout de 30 s: um pedido pendurado não deixa o widget eternamente
    // "a carregar" (o archive-api pode demorar; 30 s cobre os casos normais)
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), 30000);
    const requestSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
    let response;
    try {
        response = await fetch(`${ERA5_BASE}?${params}`, { signal: requestSignal });
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { msg = (await response.json()).reason || msg; } catch (_) { /* mantem */ }
        throw new Error(msg);
    }
    const raw = await response.json();

    const daily = [];
    for (let i = 0; i < raw.daily.time.length; i++) {
        daily.push({
            date: raw.daily.time[i],
            maxTemp: raw.daily.temperature_2m_max[i],
            minTemp: raw.daily.temperature_2m_min[i],
            meanTemp: raw.daily.temperature_2m_mean[i],
            precipitation: raw.daily.precipitation_sum[i],
            maxWind: raw.daily.wind_speed_10m_max[i]
        });
    }

    const data = {
        source: 'Open-Meteo Historical API - ERA5 (reanalise 0.25, desde 1940)',
        latitude: raw.latitude,
        longitude: raw.longitude,
        elevation: raw.elevation,
        daily
    };
    era5Cache.set(key, { data, timestamp: now });
    return data;
}

function clearCache() {
    era5Cache.clear();
}

export default { loadDailyHistory, clearCache, ERA5_BASE };
