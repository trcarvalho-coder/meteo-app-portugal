// ===== Adaptador ECMWF Open Data (AWS) no frontend =====
// Fontes de dados, por ordem de preferencia:
// 1. JSON estatico pre-computado (GitHub Actions) servido pelo site
//    (data/forecast/<run>/<variable>-<step>h.json) - usado no site publicado.
// 2. Backend local (backend/server.py) que processa GRIB2 - usado APENAS em
//    desenvolvimento: exige window.ECMWF_BACKEND_URL explicita OU hostname
//    localhost/127.0.0.1. No site publicado nunca há pedidos a 127.0.0.1.

const LOCALHOST = 'http' + '://127.0.0.1:8787';

function isLocalDevHost() {
    if (typeof window === 'undefined' || !window.location) return false;
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

const BACKEND_URL = (typeof window !== 'undefined'
    && ((window.ECMWF_BACKEND_URL) || (isLocalDevHost() ? LOCALHOST : null))) || null;

// base do site (funciona no Pages e em dev via servidor estatico)
const STATIC_BASE = (typeof window !== 'undefined' && window.ECMWF_STATIC_BASE)
    || (typeof window !== 'undefined' && window.location
        && window.location.origin + window.location.pathname.replace(/[^/]*$/, ''))
    || '';

let cachedRun = null;
let staticIndex = null; // { run, nativeSteps, availableSteps, maxStep }
const fieldCache = new Map(); // key: variable-step -> { data, timestamp }
const FIELD_TTL = 3600000;

class StepUnavailableError extends Error {
    constructor(step, variable) {
        super(`Passo ainda não publicado para esta execução (${variable} ${step}h)`);
        this.name = 'StepUnavailableError';
        this.code = 'unavailable';
    }
}

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        if (response.status === 404) {
            // 404 = passo indisponível, não erro genérico; nunca vai a cache
            throw new StepUnavailableError(null, null);
        }
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
    // prioridade: estatico; fallback: backend (apenas dev)
    const idx = await getStaticIndex(signal);
    if (idx && idx.run) {
        cachedRun = idx.run;
        return cachedRun;
    }
    if (!BACKEND_URL) {
        throw new Error('Dados ECMWF ainda não publicados para este site.');
    }
    const data = await apiGet('/api/run', signal);
    cachedRun = data.run;
    return cachedRun;
}

async function getSteps({ signal } = {}) {
    const idx = await getStaticIndex(signal);
    if (idx) {
        // fonte de verdade: passos efetivamente escritos para todas as variáveis
        const steps = idx.availableSteps || idx.nativeSteps;
        return { nativeSteps: steps || [] };
    }
    if (!BACKEND_URL) return { nativeSteps: [] };
    return apiGet('/api/steps', signal);
}

async function getAvailableSteps({ signal } = {}) {
    const { nativeSteps } = await getSteps({ signal });
    return nativeSteps;
}

async function getField(variable, step, { signal, forceRefresh = false } = {}) {
    const key = `${variable}-${step}`;
    const now = Date.now();
    const cached = fieldCache.get(key);
    if (!forceRefresh && cached && (now - cached.timestamp) < FIELD_TTL) {
        return cached.data;
    }
    // 1) JSON estatico pre-computado: apenas passos listados no indice
    const idx = await getStaticIndex(signal);
    if (idx && idx.run) {
        const steps = idx.availableSteps || idx.nativeSteps || [];
        if (!steps.includes(step)) {
            // não pedir passos que não constam do índice
            throw new StepUnavailableError(step, variable);
        }
        const runId = idx.run.replace('/', '');
        try {
            const data = await fetchJson(
                `${STATIC_BASE}data/forecast/${runId}/${variable}-${step}h.json`, signal);
            fieldCache.set(key, { data, timestamp: Date.now() });
            return data;
        } catch (err) {
            if (err instanceof StepUnavailableError || !BACKEND_URL) throw err;
            // estatico falhou de outra forma: continua para o backend local (dev)
        }
    }
    // 2) backend local (apenas dev: window.ECMWF_BACKEND_URL ou localhost)
    if (!BACKEND_URL) {
        throw new StepUnavailableError(step, variable);
    }
    const data = await apiGet(`/api/field?variable=${encodeURIComponent(variable)}&step=${step}`, signal);
    fieldCache.set(key, { data, timestamp: Date.now() });
    return data;
}

async function getPrecipIncrement(step, { signal } = {}) {
    // o estatico ja vem incrementado do pre-compute; mesmo caminho do campo
    return getField('precipitation', step, { signal });
}

function isCached(key) {
    const cached = fieldCache.get(key);
    return Boolean(cached && (Date.now() - cached.timestamp) < FIELD_TTL);
}

function clearCache() {
    fieldCache.clear();
    cachedRun = null;
    staticIndex = null;
}

export default {
    getRun,
    getSteps,
    getAvailableSteps,
    getField,
    getPrecipIncrement,
    clearCache,
    isCached,
    StepUnavailableError,
    BACKEND_URL,
    STATIC_BASE
};
