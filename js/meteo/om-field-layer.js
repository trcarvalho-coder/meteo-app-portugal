// ===== Gestor das camadas Open-Meteo no mapa (ArcGIS JS SDK) =====
// Suporta VARIAS camadas visiveis em simultaneo (selecionadas pelos botoes
// do painel "Camadas"): cada camada tem o seu GraphicsLayer/FeatureLayer,
// e o time slider percorre todas as camadas selecionadas ao mesmo tempo.
// - camadas 'field': FeatureLayer cliente com ClassBreaksRenderer (celulas);
// - camada 'isobars': GraphicsLayer com polylines (marching squares) + rotulos.

import { OM_LAYERS, legendStopsFor } from './om-catalog.js';
import { allIsobars, isobarLabels } from './isobars.js';

const CELL_HALF = 0.25; // metade do passo da grelha (0.5) em graus

const state = {
    map: null,
    layers: new Map(),   // layerKey -> { layer, graphicsLayer|featureLayer, field }
    opacity: 0.7
};

function getArcgis() {
    return (typeof globalThis !== 'undefined' && globalThis.arcgis) ? globalThis.arcgis : null;
}

function hexToRgba(hex, alpha) {
    if (hex.startsWith('rgba')) {
        return hex;
    }
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b, alpha];
}

function classBreaks(scaleKey) {
    const stops = legendStopsFor(scaleKey);
    return stops.map((stop, i) => {
        const next = stops[i + 1];
        return {
            minValue: stop.value,
            maxValue: next ? next.value - 1e-9 : Number.MAX_SAFE_INTEGER,
            symbol: {
                type: 'simple-fill',
                color: hexToRgba(stop.color, 1),
                outline: { color: [255, 255, 255, 0.04], width: 0.3 }
            },
            label: `${stop.value}`
        };
    });
}

function init(map) {
    state.map = map;
}

function isActive(layerKey) {
    return state.layers.has(layerKey);
}

function activeKeys() {
    return [...state.layers.keys()];
}

function setOpacity(opacity) {
    state.opacity = opacity;
    for (const entry of state.layers.values()) {
        const l = entry.layerRef;
        if (l) l.opacity = opacity;
    }
}

// ===== camada de campo (grelha colorida) =====
function renderFieldLayer(layerKey, field) {
    const layer = OM_LAYERS[layerKey];
    removeLayer(layerKey);
    const arcgis = getArcgis();
    if (!state.map || !arcgis) return null;

    const { lats, lons, values } = field;
    const features = [];
    for (let i = 0; i < lats.length; i++) {
        for (let j = 0; j < lons.length; j++) {
            const value = values[i][j];
            if (value == null) continue;
            const x = lons[j];
            const y = lats[i];
            const w = CELL_HALF;
            features.push({
                geometry: {
                    type: 'polygon',
                    rings: [[
                        [x - w, y - w], [x + w, y - w], [x + w, y + w], [x - w, y + w], [x - w, y - w]
                    ]],
                    spatialReference: { wkid: 4326 }
                },
                attributes: { value, unit: field.unit, layer: layerKey }
            });
        }
    }

    const featureLayer = new arcgis.FeatureLayer({
        title: `Open-Meteo — ${layer.label}`,
        source: features,
        fields: [
            { name: 'value', type: 'double' },
            { name: 'unit', type: 'string' },
            { name: 'layer', type: 'string' }
        ],
        objectIdField: 'objectId',
        outFields: ['value', 'unit', 'layer'],
        geometryType: 'polygon',
        spatialReference: { wkid: 4326 },
        renderer: {
            type: 'class-breaks',
            field: 'value',
            classBreakInfos: classBreaks(layerKey)
        },
        opacity: state.opacity,
        popupEnabled: false
    });
    state.map.add(featureLayer);
    state.layers.set(layerKey, { def: layer, field, layerRef: featureLayer });
    return featureLayer;
}

// ===== camada de isobaras (polylines + rotulos) =====
function renderIsobarLayer(layerKey, field) {
    const layer = OM_LAYERS[layerKey];
    removeLayer(layerKey);
    const arcgis = getArcgis();
    if (!state.map || !arcgis) return null;

    const graphicsLayer = new arcgis.GraphicsLayer({
        title: `Open-Meteo — ${layer.label}`,
        opacity: state.opacity
    });
    const lines = allIsobars(field, layer.intervalHpa || 4);
    for (const line of lines) {
        for (const seg of line.segments) {
            graphicsLayer.add(new arcgis.Graphic({
                geometry: {
                    type: 'polyline',
                    paths: [[seg[0], seg[1]]],
                    spatialReference: { wkid: 4326 }
                },
                symbol: {
                    type: 'simple-line',
                    color: line.level < 1000 ? [80, 60, 200, 0.95] : [30, 60, 120, 0.95],
                    width: line.level % 20 === 0 ? 1.8 : 1.1
                },
                attributes: { kind: 'isobar', level: line.level }
            }));
        }
    }
    for (const lbl of isobarLabels(field, layer.intervalHpa || 4)) {
        graphicsLayer.add(new arcgis.Graphic({
            geometry: {
                type: 'point',
                longitude: lbl.lon,
                latitude: lbl.lat,
                spatialReference: { wkid: 4326 }
            },
            symbol: {
                type: 'text',
                text: String(lbl.level),
                color: [20, 40, 80, 1],
                font: { size: 10, weight: 'bold' },
                haloColor: [255, 255, 255, 0.85],
                haloSize: 1.5
            },
            attributes: { kind: 'isobar-label', level: lbl.level }
        }));
    }
    state.map.add(graphicsLayer);
    state.layers.set(layerKey, { def: layer, field, layerRef: graphicsLayer });
    return graphicsLayer;
}

function renderLayer(layerKey, field) {
    const layer = OM_LAYERS[layerKey];
    if (!layer) return null;
    if (layer.kind === 'isobars') {
        // isobaras derivam do campo de pressao
        return renderIsobarLayer(layerKey, field);
    }
    return renderFieldLayer(layerKey, field);
}

function removeLayer(layerKey) {
    const entry = state.layers.get(layerKey);
    if (entry) {
        if (state.map && entry.layerRef) state.map.remove(entry.layerRef);
        state.layers.delete(layerKey);
    }
}

function clearAll() {
    for (const key of [...state.layers.keys()]) removeLayer(key);
}

function setLayerVisible(layerKey, visible) {
    const entry = state.layers.get(layerKey);
    if (entry && entry.layerRef) entry.layerRef.visible = visible;
}

// Amostra de todas as camadas ativas num ponto (para o popup).
function sampleAtPoint(lat, lon) {
    const out = [];
    for (const [key, entry] of state.layers) {
        const field = entry.field;
        if (!field) continue;
        const { lats, lons, values } = field;
        let bi = 0, bj = 0, best = Infinity;
        for (let i = 0; i < lats.length; i++) {
            for (let j = 0; j < lons.length; j++) {
                const d = (lats[i] - lat) ** 2 + (lons[j] - lon) ** 2;
                if (d < best) { best = d; bi = i; bj = j; }
            }
        }
        const value = values[bi][bj];
        out.push({
            layer: key,
            label: entry.def.label,
            value,
            unit: field.unit,
            step: field.step,
            validTimeUtc: field.validTimeUtc,
            accumWindow: field.accumWindow || null
        });
    }
    return out;
}

export default {
    init, renderLayer, removeLayer, clearAll, setOpacity, setLayerVisible,
    isActive, activeKeys, sampleAtPoint,
    colorStops: legendStopsFor
};
