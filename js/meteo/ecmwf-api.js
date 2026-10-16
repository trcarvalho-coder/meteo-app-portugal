// ===== Adaptador ECMWF Open Data (AWS) no frontend =====
// Consome o backend local (backend/server.py) que processa GRIB2 do bucket
// s3://ecmwf-forecasts. O browser nunca descarrega ficheiros GRIB.

// URL do backend configurável: variável global window.ECMWF_BACKEND_URL
// (definida no index.html ou por script próprio) com fallback para loopback.
const BACKEND_URL = (typeof window !== 'undefined' && window.ECMWF_BACKEND_URL)
    || 'http://127.0.0.1:8787';

let cachedRun = null;
const fieldCache = new Map(); // key: variable-step -> { data, timestamp }
const FIELD_TTL = 3600000;

async function apiGet(path, signal) {
    const response = await fetch(`${BACKEND_URL}${path}`, { signal });
    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { msg = (await response.json()).error || msg; } catch (_) { /* mantém */ }
        throw new Error(msg);
    }
    return response.json();
}

async function getRun(forceRefresh = false) {
    if (!forceRefresh && cachedRun) return cachedRun;
    const data = await apiGet('/api/run');
    cachedRun = data.run;
    return cachedRun;
}

async function getSteps() {
    return apiGet('/api/steps');
}

async function getField(variable, step, { signal, forceRefresh = false } = {}) {
    const key = `${variable}-${step}`;
    const now = Date.now();
    const cached = fieldCache.get(key);
    if (!forceRefresh && cached && (now - cached.timestamp) < FIELD_TTL) {
        return cached.data;
    }
    const data = await apiGet(`/api/field?variable=${encodeURIComponent(variable)}&step=${step}`, signal);
    fieldCache.set(key, { data, timestamp: now });
    return data;
}

async function getPrecipIncrement(step, { signal } = {}) {
    return apiGet(`/api/precip-increment?step=${step}`, signal);
}

function clearCache() {
    fieldCache.clear();
    cachedRun = null;
}

export default {
    getRun,
    getSteps,
    getField,
    getPrecipIncrement,
    clearCache,
    BACKEND_URL
};
