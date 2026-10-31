// ===== Adaptador das camadas Open-Meteo pre-computadas (JSON estatico) =====
// Fonte de verdade: data/om/latest.json + data/om/<run>/<layer>-<step>h.json,
// gerados 2x/dia pela GitHub Action precompute-om (modelo ECMWF ecmwf_ifs025,
// 15 dias, passos 3 h ate 72 h e 6 h apos 72 h).
// Nao ha pedidos em runtime a api.open-meteo.com: o site publicado e estatico.

const STATIC_BASE = (typeof window !== 'undefined' && window.OM_STATIC_BASE)
    || (typeof window !== 'undefined' && window.location
        && window.location.origin + window.location.pathname.replace(/[^/]*$/, ''))
    || '';

let indexCache = null;
const fieldCache = new Map(); // key: layer-step -> { data, timestamp }
const FIELD_TTL = 3600000;

class StepUnavailableError extends Error {
    constructor(step, layer) {
        super(`Passo ${step} h ainda não publicado para a camada ${layer}.`);
        this.name = 'StepUnavailableError';
        this.code = 'unavailable';
    }
}

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        if (response.status === 404) throw new StepUnavailableError(null, null);
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function getIndex({ signal } = {}) {
    if (indexCache) return indexCache;
    try {
        indexCache = await fetchJson(`${STATIC_BASE}data/om/latest.json`, signal);
    } catch (_) {
        return null;
    }
    return indexCache;
}

async function getSteps({ signal } = {}) {
    const idx = await getIndex({ signal });
    return idx ? (idx.steps || []) : [];
}

async function getLayers({ signal } = {}) {
    const idx = await getIndex({ signal });
    return idx ? (idx.layers || []) : [];
}

async function getRun({ signal } = {}) {
    const idx = await getIndex({ signal });
    return idx && idx.run ? idx.run : null;
}

async function getField(layer, step, { signal, forceRefresh = false } = {}) {
    const key = `${layer}-${step}`;
    const now = Date.now();
    const cached = fieldCache.get(key);
    if (!forceRefresh && cached && (now - cached.timestamp) < FIELD_TTL) {
        return cached.data;
    }
    const idx = await getIndex({ signal });
    if (!idx || !idx.run) throw new StepUnavailableError(step, layer);
    const steps = idx.steps || [];
    if (!steps.includes(step)) {
        throw new StepUnavailableError(step, layer);
    }
    const runId = idx.run.replace('/', '');
    const data = await fetchJson(
        `${STATIC_BASE}data/om/${runId}/${layer}-${step}h.json`, signal);
    fieldCache.set(key, { data, timestamp: Date.now() });
    return data;
}

function isCached(layer, step) {
    const cached = fieldCache.get(`${layer}-${step}`);
    return Boolean(cached && (Date.now() - cached.timestamp) < FIELD_TTL);
}

function clearCache() {
    fieldCache.clear();
    indexCache = null;
}

export default {
    getIndex, getSteps, getLayers, getRun, getField,
    isCached, clearCache, StepUnavailableError, STATIC_BASE
};
