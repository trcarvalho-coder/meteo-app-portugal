// ===== Publicação de camadas ECMWF no mapa (ArcGIS JS SDK) =====
// A grelha nativa 0.25° é publicada como FeatureLayer cliente com
// ClassBreaksRenderer (uma classe por stop da escala) em vez de ~6000
// Graphics individuais por passo. A opacidade muda via layer.opacity,
// sem re-render.

import { legendStops } from './catalog.js';

let gridLayer = null;
let activeRenderer = null;

class UnknownScaleError extends Error {
    constructor(scaleKey) {
        super(`Escala desconhecida: '${scaleKey}' não existe no catálogo; nada desenhado.`);
        this.name = 'UnknownScaleError';
    }
}

function classBreaks(scaleKey) {
    const stops = legendStops(scaleKey);
    if (!stops.length) throw new UnknownScaleError(scaleKey);
    return stops.map((stop, i) => {
        const next = stops[i + 1];
        return {
            minValue: stop.value,
            maxValue: next ? next.value - 1e-9 : Number.MAX_SAFE_INTEGER,
            symbol: {
                type: 'simple-fill',
                color: hexToRgba(stop.color, 1),
                outline: { color: [255, 255, 255, 0.05], width: 0.3 }
            },
            label: `${stop.value}`
        };
    });
}

function colorForValue(scaleKey, value) {
    const stops = legendStops(scaleKey);
    if (!stops.length) throw new UnknownScaleError(scaleKey);
    // valores abaixo do primeiro stop usam o primeiro stop; null nunca é desenhado
    let color = stops[0].color;
    for (const stop of stops) {
        if (value >= stop.value) color = stop.color;
    }
    return color;
}

/**
 * Desenha o campo no mapa. field = resposta normalizada.
 * metadata: { displayName, unit, source, run, validTimeUtc, temporalType, scaleKey, opacity }
 */
function renderField(map, field, metadata) {
    clearLayer(map);

    const scaleKey = metadata.scaleKey;
    const stops = legendStops(scaleKey);
    if (!stops.length) {
        // nunca desenhar com símbolo indefinido (era a causa da camada a negro)
        throw new UnknownScaleError(scaleKey);
    }

    const { lats, lons, values } = field;
    const features = [];
    for (let i = 0; i < lats.length; i++) {
        for (let j = 0; j < lons.length; j++) {
            const value = values[i][j];
            if (value == null) continue; // indisponível não é desenhado, nunca zero
            // FeatureLayer cliente não suporta geometryType 'extent'
            // (esriGeometryEnvelope); cada célula é um retângulo de 4 vértices
            const w = 0.125;
            const x = lons[j];
            const y = lats[i];
            features.push({
                geometry: {
                    type: 'polygon',
                    rings: [[
                        [x - w, y - w],
                        [x + w, y - w],
                        [x + w, y + w],
                        [x - w, y + w],
                        [x - w, y - w]
                    ]],
                    spatialReference: { wkid: 4326 }
                },
                attributes: { value, unit: metadata.unit, variable: metadata.displayName }
            });
        }
    }

    gridLayer = new arcgis.FeatureLayer({
        title: 'ECMWF Open Data (AWS)',
        source: features,
        fields: [
            { name: 'value', type: 'double' },
            { name: 'unit', type: 'string' },
            { name: 'variable', type: 'string' }
        ],
        objectIdField: 'objectId',
        outFields: ['value', 'unit', 'variable'],
        geometryType: 'polygon',
        spatialReference: { wkid: 4326 },
        renderer: {
            type: 'class-breaks',
            field: 'value',
            classBreakInfos: classBreaks(scaleKey)
        },
        opacity: metadata.opacity ?? 0.7,
        popupEnabled: false
    });
    map.add(gridLayer);

    activeRenderer = { field, metadata, map };
    return gridLayer;
}

function clearLayer(map) {
    if (gridLayer && map) {
        map.remove(gridLayer);
    } else if (gridLayer && gridLayer.destroy) {
        gridLayer.destroy();
    }
    gridLayer = null;
    activeRenderer = null;
}

function clear() {
    if (activeRenderer && activeRenderer.map) {
        clearLayer(activeRenderer.map);
    }
}

function setActiveOpacity(opacity) {
    // opacidade via layer.opacity: sem re-render de features
    if (gridLayer) gridLayer.opacity = opacity;
    if (activeRenderer) {
        activeRenderer = { ...activeRenderer, metadata: { ...activeRenderer.metadata, opacity } };
    }
}

function getActive() {
    return activeRenderer;
}

function getLayer() {
    return gridLayer;
}

function hexToRgba(hex, alpha) {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b, alpha];
}

export default {
    renderField, clear, setActiveOpacity, getActive, getLayer,
    colorForValue, classBreaks, UnknownScaleError
};
