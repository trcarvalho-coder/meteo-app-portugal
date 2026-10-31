// ===== Isolinhas de pressao (isobaras) por marching squares =====
// Dado um campo regular { lats, lons, values } (pressao em hPa), gera os
// segmentos de cada isolinha (intervalo de 4 hPa, p.ex. 988, 992, ... 1040)
// como pares de pontos [ [lon, lat], [lon, lat] ] em WGS84.

function lerp(a, b, va, vb, level) {
    const t = (level - va) / (vb - va);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/**
 * Extrai segmentos de uma isolinha num campo regular.
 * @returns {Array<Array<[number, number]>>} lista de segmentos [[lon,lat],[lon,lat]]
 */
export function isoSegments(lats, lons, values, level) {
    const segments = [];
    const nlat = lats.length;
    const nlon = lons.length;
    if (nlat < 2 || nlon < 2) return segments;

    for (let i = 0; i < nlat - 1; i++) {
        for (let j = 0; j < nlon - 1; j++) {
            const v00 = values[i][j];
            const v10 = values[i][j + 1];
            const v11 = values[i + 1][j + 1];
            const v01 = values[i + 1][j];
            if (v00 == null || v10 == null || v11 == null || v01 == null) continue;

            const x0 = lons[j], x1 = lons[j + 1];
            const y0 = lats[i], y1 = lats[i + 1];
            // cantos: 0=(x0,y0) 1=(x1,y0) 2=(x1,y1) 3=(x0,y1)
            const corners = [
                { x: x0, y: y0, v: v00 },
                { x: x1, y: y0, v: v10 },
                { x: x1, y: y1, v: v11 },
                { x: x0, y: y1, v: v01 }
            ];
            let caseIndex = 0;
            for (let c = 0; c < 4; c++) {
                if (corners[c].v >= level) caseIndex |= (1 << c);
            }
            if (caseIndex === 0 || caseIndex === 15) continue;

            // arestas: 0: canto0->1 (y0), 1: canto1->2 (x1), 2: canto2->3 (y1), 3: canto3->0 (x0)
            const edges = [
                () => lerp([corners[0].x, corners[0].y], [corners[1].x, corners[1].y], corners[0].v, corners[1].v, level),
                () => lerp([corners[1].x, corners[1].y], [corners[2].x, corners[2].y], corners[1].v, corners[2].v, level),
                () => lerp([corners[2].x, corners[2].y], [corners[3].x, corners[3].y], corners[2].v, corners[3].v, level),
                () => lerp([corners[3].x, corners[3].y], [corners[0].x, corners[0].y], corners[3].v, corners[0].v, level)
            ];
            const edgeHit = (e) => ((caseIndex >> e) & 1) !== ((caseIndex >> ((e + 1) % 4)) & 1);

            const pts = [];
            for (let e = 0; e < 4; e++) {
                if (edgeHit(e)) pts.push(edges[e]());
            }
            if (pts.length === 2) {
                segments.push([pts[0], pts[1]]);
            } else if (pts.length === 4) {
                // caso selado (5 ou 10): unir por 0-1 e 2-3 (convencao simples)
                segments.push([pts[0], pts[1]]);
                segments.push([pts[2], pts[3]]);
            }
        }
    }
    return segments;
}

/**
 * Gera todas as isolinhas de um campo de pressao.
 * @param {number} intervalHpa intervalo entre isobaras (ex.: 4)
 * @param {number} minHpa primeira isobara
 * @param {number} maxHpa ultima isobara
 * @returns {Array<{level: number, segments: Array}>}
 */
export function allIsobars(field, intervalHpa = 4, minHpa = 960, maxHpa = 1044) {
    const { lats, lons, values } = field;
    const lines = [];
    for (let level = Math.ceil(minHpa / intervalHpa) * intervalHpa; level <= maxHpa; level += intervalHpa) {
        const segments = isoSegments(lats, lons, values, level);
        if (segments.length) lines.push({ level, segments });
    }
    return lines;
}

/**
 * Rótulos de isóbaras (para o mapa): um ponto por isolinha (ponto médio do
 * segmento mais longo), com o valor em hPa.
 */
export function isobarLabels(field, intervalHpa = 4) {
    return allIsobars(field, intervalHpa).map(line => {
        let best = null;
        let bestLen = -1;
        for (const seg of line.segments) {
            const len = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
            if (len > bestLen) { bestLen = len; best = seg; }
        }
        if (!best) return null;
        const mid = [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2];
        return { level: line.level, lon: mid[0], lat: mid[1] };
    }).filter(Boolean);
}

export default { isoSegments, allIsobars, isobarLabels };
