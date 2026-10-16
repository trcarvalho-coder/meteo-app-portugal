// ===== Adaptador ECMWF Open Data (AWS) no frontend =====
// Duas fontes de dados, por ordem de preferencia:
// 1. JSON estatico pre-computado (GitHub Actions) servido pelo site
//    (data/forecast/<run>/<variable>-<step>h.json) - usado no site publicado.
// 2. Backend local (backend/server.py) que processa GRIB2 - usado em
//    desenvolvimento ou quando o estatico nao esta disponivel.

const LOCALHOST = 'http' + '://127.0.0.1:8787';

const BACKEND_URL = (typeof window !== 'undefined' && window.ECMWF_BACKEND_URL)
    || LOCALHOST;

// base do site (funciona no Pages e em dev via servidor estatico)
const STATIC_BASE = (typeof window !== 'undefined' && window.ECMWF_STATIC_BASE)
    || (typeof window !== 'undefined' && window.location
        && window.location.origin + window.location.pathname.replace(/[^/]*$/, ''))
    || '';

let cachedRun = null;
let staticIndex = null; // { run, nativeSteps }
const fieldCache = new Map(); // key: variable-step -> { data, timestamp }
const FIELD_TTL = 3600000;

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { msg = (await response.json()).error || msg; } catch (_) { /* mantem */ }
        throw new Error(msg);
    }
    return response.json();
}

async function getStaticIndex(signal) {
    if (staticIndex) return staticIndex;
    try {
        staticIndex = await fetchJson(`${STATIC_BASE}data/forecast/latest.json`, signal);
        return staticIndex;
    } catch (_) {
        return null;
    }
}

async function apiGet(path, signal) {
    return fetchJson(`${BACKEND_URL}${path}`, signal);
}

async function getRun(forceRefresh = false, { signal } = {}) {
    if (!forceRefresh && cachedRun) return cachedRun;
    // prioridade: estatico; fallback: backend
    const idx = await getStaticIndex(signal);
    if (idx && idx.run) {
        cachedRun = idx.run;
        return cachedRun;
    }
    const data = await apiGet('/api/run', signal);
    cachedRun = data.run;
    return cachedRun;
}

async function getSteps({ signal } = {}) {
    const idx = await getStaticIndex(signal);
    if (idx && idx.nativeSteps) return { nativeSteps: idx.nativeSteps };
    return apiGet('/api/steps', signal);
}

async function getField(variable, step, { signal, forceRefresh = false } = {}) {
    const key = `${variable}-${step}`;
    const now = Date.now();
    const cached = fieldCache.get(key);
    if (!forceRefresh && cached && (now - cached.timestamp) < FIELD_TTL) {
        return cached.data;
    }
    // 1) JSON estatico pre-computado
    try {
        const idx = await getStaticIndex(signal);
        if (idx && idx.run) {
            const runId = idx.run.replace('/', '');
            const data = await fetchJson(
                `${STATIC_BASE}data/forecast/${runId}/${variable}-${step}h.json`, signal);
            fieldCache.set(key, { data, timestamp: now });
            return data;
        }
    } catch (_) {
        // estatico indisponivel: continua para o backend
    }
    // 2) backend local
    const data = await apiGet(`/api/field?variable=${encodeURIComponent(variable)}&step=${step}`, signal);
    fieldCache.set(key, { data, timestamp: now });
    return data;
}

async function getPrecipIncrement(step, { signal } = {}) {
    // o estatico ja vem incrementado do pre-compute; mesmo caminho do campo
    return getField('precipitation', step, { signal });
}

function clearCache() {
    fieldCache.clear();
    cachedRun = null;
    staticIndex = null;
}

export default {
    getRun,
    getSteps,
    getField,
    getPrecipIncrement,
    clearCache,
    BACKEND_URL,
    STATIC_BASE
};
