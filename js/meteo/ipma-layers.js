// ===== Camadas IPMA no mapa (ArcGIS JS SDK) =====
// - Avisos: poligonos das areas oficiais (CAOP/DGT), cor por severidade maxima
//   no momento atual; pop-up com todos os avisos da area.
// - Estacoes: marcadores do catalogo publico IPMA com simbologia baseada
//   apenas nos dados disponiveis (temperatura/vento reais; sem icones de
//   estado do tempo inventados).

import IpmaApi from './ipma-api.js';

const LEVEL_COLORS = { 1: [255, 200, 0, 0.25], 2: [255, 140, 0, 0.30], 3: [220, 40, 40, 0.35] };
const LEVEL_OUTLINES = { 1: [255, 200, 0, 0.9], 2: [255, 140, 0, 0.95], 3: [220, 40, 40, 1.0] };
const LEVEL_NAMES = { 1: 'Amarelo', 2: 'Laranja', 3: 'Vermelho' };

let warningsLayer = null;
let stationsLayer = null;
let mapView = null;
let areasGeo = null;
let state = {
    warnings: [],
    stations: [],
    byStation: new Map(),
    stale: false
};

async function loadAreasGeometry() {
    if (areasGeo) return areasGeo;
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const res = await fetch(`${base}data/geo/areas-aviso.geojson`);
    if (!res.ok) throw new Error('areas-aviso.geojson indisponivel');
    areasGeo = await res.json();
    return areasGeo;
}

async function init(map, view) {
    mapView = view || null;
    if (!warningsLayer) {
        warningsLayer = new arcgis.GraphicsLayer({ title: 'Avisos IPMA', visible: true });
        stationsLayer = new arcgis.GraphicsLayer({ title: 'Estacoes IPMA', visible: true });
        map.add(warningsLayer);
        map.add(stationsLayer);
    }
    await refresh();
}

async function refresh(now = new Date()) {
    try {
        const [warningsResult, stationsResult, obsResult] = await Promise.all([
            IpmaApi.loadWarnings(),
            IpmaApi.loadStations(),
            IpmaApi.loadObservations()
        ]);
        state.warnings = warningsResult.warnings;
        state.stale = warningsResult.stale || obsResult.stale;
        state.stations = stationsResult.stations;
        state.byStation = obsResult.byStation;
        await renderWarnings(now);
        renderStations();
        return { stale: state.stale, count: state.warnings.filter(w => w.active).length };
    } catch (err) {
        console.error('[IPMA layers] falha ao atualizar:', err);
        return { error: err };
    }
}

async function renderWarnings(now = new Date()) {
    if (!warningsLayer) return;
    const geo = await loadAreasGeometry();
    warningsLayer.removeAll();

    const maxLevels = IpmaApi.maxLevelByArea(state.warnings, now);
    const byArea = new Map();
    for (const w of state.warnings) {
        if (!byArea.has(w.areaId)) byArea.set(w.areaId, []);
        byArea.get(w.areaId).push(w);
    }

    let unmatched = [];
    for (const feature of geo.features) {
        const areaId = feature.properties.idAreaAviso;
        const level = maxLevels.get(areaId);
        const rings = feature.geometry.type === 'Polygon'
            ? [feature.geometry.coordinates]
            : feature.geometry.coordinates;

        const graphic = new arcgis.Graphic({
            geometry: { type: 'polygon', rings, spatialReference: { wkid: 4326 } },
            symbol: {
                type: 'simple-fill',
                color: level ? LEVEL_COLORS[level] : [120, 140, 160, 0.06],
                outline: { color: level ? LEVEL_OUTLINES[level] : [120, 140, 160, 0.4], width: level ? 1.6 : 0.8 }
            },
            attributes: { areaId, areaName: feature.properties.nomeArea, level: level || 0 }
        });
        warningsLayer.add(graphic);
    }

    // areas de aviso sem correspondencia na geometria
    const geoIds = new Set(geo.features.map(f => f.properties.idAreaAviso));
    for (const w of state.warnings) {
        if (!geoIds.has(w.areaId)) unmatched.push(w.areaId);
    }
    if (unmatched.length) console.warn('[IPMA] areas sem geometria:', [...new Set(unmatched)]);
}

function stationMarker(obs) {
    // simbologia apenas com dados reais; tres estados visiveis
    const hasRecent = obs && !obs.staleObs;
    if (hasRecent) {
        return {
            type: 'simple-marker', style: 'circle', size: 13,
            color: [23, 98, 127, 0.92],
            outline: { color: [255, 255, 255, 1], width: 1.3 }
        };
    }
    const outdated = obs && obs.staleObs;
    return {
        type: 'simple-marker', style: 'circle', size: outdated ? 8 : 10,
        color: outdated ? [200, 160, 60, 0.85] : [150, 165, 180, 0.6],
        outline: { color: [70, 90, 105, 0.9], width: 1 }
    };
}

function stationTextSymbol(obs) {
    if (!obs || obs.staleObs || obs.temperature == null) return null;
    return {
        type: 'text',
        text: String(Math.round(obs.temperature)),
        color: 'white',
        font: { size: 10, weight: 'bold' },
        yoffset: 0
    };
}

function renderStations() {
    if (!stationsLayer) return;
    stationsLayer.removeAll();
    for (const s of state.stations) {
        const obs = state.byStation.get(s.id) || null;
        const geometry = { type: 'point', longitude: s.lng, latitude: s.lat, spatialReference: { wkid: 4326 } };
        const marker = new arcgis.Graphic({
            geometry,
            symbol: stationMarker(obs),
            attributes: { stationId: s.id, stationName: s.name, kind: 'station' }
        });
        stationsLayer.add(marker);
        const textSym = stationTextSymbol(obs);
        if (textSym) {
            stationsLayer.add(new arcgis.Graphic({
                geometry,
                symbol: textSym,
                attributes: { stationId: s.id, kind: 'station-label' }
            }));
        }
    }
}

function setWarningsVisible(visible) {
    if (warningsLayer) warningsLayer.visible = visible;
}

function setStationsVisible(visible) {
    if (stationsLayer) stationsLayer.visible = visible;
}

function warningsForPoint(areaId) {
    return state.warnings.filter(w => w.areaId === areaId);
}

function getState() {
    return state;
}

export default {
    init, refresh,
    setWarningsVisible, setStationsVisible,
    warningsForPoint, getState,
    LEVEL_NAMES
};


// ===== Tooltip de hover nos avisos (area, fenomeno, nivel) =====
let hoverThrottle = 0;
export function attachWarningsHover(view) {
    mapView = view;
    view.on('pointer-move', async (event) => {
        const now = Date.now();
        if (now - hoverThrottle < 150) return; // throttle
        hoverThrottle = now;
        try {
            const hit = await view.hitTest(event);
            const g = hit.results.map(r => r.graphic).find(x => x && x.attributes && x.attributes.areaId);
            const tooltip = document.getElementById('ipma-hover-tooltip');
            if (!tooltip) return;
            if (g) {
                const areaId = g.attributes.areaId;
                const areaName = g.attributes.areaName;
                const active = state.warnings.filter(w => w.areaId === areaId && w.active);
                const future = state.warnings.filter(w => w.areaId === areaId && !w.active);
                let html = '<strong>' + areaName + ' (' + areaId + ')</strong>';
                if (active.length) {
                    html += active.map(w => '<div>&#9679; ' + w.phenomenon + ' — ' + LEVEL_NAMES[w.level] + '</div>').join('');
                } else {
                    html += '<div>Sem avisas em vigor</div>';
                }
                if (future.length) {
                    html += '<div style="opacity:.7">' + future.length + ' previsto(s)</div>';
                }
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                tooltip.style.left = (event.x + 14) + 'px';
                tooltip.style.top = (event.y + 14) + 'px';
            } else {
                tooltip.style.display = 'none';
            }
        } catch (_) { /* sem hit */ }
    });
}
