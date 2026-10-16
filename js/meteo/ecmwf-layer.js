// ===== Publicação de camadas ECMWF no mapa (ArcGIS JS SDK) =====
// Cada célula da grelha nativa 0.25° é desenhada como um retângulo:
// não há interpolação para raster contínuo; a resolução nativa é visível.

import { legendStops } from './catalog.js';

let gridLayer = null;
let activeRenderer = null;

function ensureLayer(map) {
    if (!gridLayer) {
        gridLayer = new arcgis.GraphicsLayer({ title: 'ECMWF Open Data (AWS)' });
        map.add(gridLayer);
    }
    return gridLayer;
}

function colorForValue(scaleKey, value) {
    const stops = legendStops(scaleKey);
    if (!stops.length) return '#888888';
    let color = stops[0].color;
    for (const stop of stops) {
        if (value >= stop.value) color = stop.color;
    }
    return color;
}

/**
 * Desenha o campo no mapa. field = resposta normalizada do backend.
 * metadata: { displayName, unit, source, run, validTimeUtc, temporalType, scaleKey }
 */
function renderField(map, field, metadata) {
    const layer = ensureLayer(map);
    layer.removeAll();

    const { lats, lons, values } = field;
    const scaleKey = metadata.scaleKey;
    const opacity = metadata.opacity ?? 0.7;

    const symbols = {};
    for (const color of new Set(legendStops(scaleKey).map(s => s.color))) {
        symbols[color] = {
            type: 'simple-fill',
            color: hexToRgba(color, opacity),
            outline: { color: [255, 255, 255, 0.05], width: 0.3 }
        };
    }

    for (let i = 0; i < lats.length; i++) {
        for (let j = 0; j < lons.length; j++) {
            const value = values[i][j];
            if (value == null) continue; // indisponível não é desenhado, nunca zero
            const color = colorForValue(scaleKey, value);
            const graphic = new arcgis.Graphic({
                geometry: {
                    type: 'extent',
                    xmin: lons[j] - 0.125,
                    xmax: lons[j] + 0.125,
                    ymin: lats[i] - 0.125,
                    ymax: lats[i] + 0.125,
                    spatialReference: { wkid: 4326 }
                },
                symbol: symbols[color],
                attributes: { value, unit: metadata.unit, variable: metadata.displayName }
            });
            layer.add(graphic);
        }
    }

    activeRenderer = { field, metadata };
    return layer;
}

function clear() {
    if (gridLayer) gridLayer.removeAll();
    activeRenderer = null;
}

function setActiveOpacity(opacity) {
    if (!activeRenderer || !gridLayer) return;
    const { field, metadata } = activeRenderer;
    const map = gridLayer.get('map') ?? null;
    if (map) renderField(map, field, { ...metadata, opacity });
}

function getActive() {
    return activeRenderer;
}

function hexToRgba(hex, alpha) {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b, alpha];
}

export default { renderField, clear, setActiveOpacity, getActive };
