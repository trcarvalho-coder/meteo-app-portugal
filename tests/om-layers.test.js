// ===== Testes das camadas Open-Meteo (ECMWF 15 dias) =====
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OM_LAYERS, OM_LAYER_ORDER, OM_SCALES, legendStopsFor, scaleKeyForOm, OM_MAX_STEP } from '../js/meteo/om-catalog.js';
import { buildSteps } from '../js/meteo/om-timeline.js';
import { isoSegments, allIsobars, isobarLabels } from '../js/meteo/isobars.js';

describe('catalogo de camadas Open-Meteo', () => {
    it('tem as 8 camadas pedidas, incluindo isobaras por defeito', () => {
        expect(OM_LAYER_ORDER).toEqual([
            'isobars', 'wind', 'gust', 'precipitation', 'precipAccum',
            'lightning', 'tempMax', 'tempMin'
        ]);
        expect(OM_LAYERS.isobars.defaultOn).toBe(true);
        expect(OM_LAYERS.isobars.kind).toBe('isobars');
        expect(OM_LAYERS.isobars.unit).toBe('hPa');
    });

    it('vento e rajada em km/h; precipitacao em mm; descargas; temperaturas', () => {
        expect(OM_LAYERS.wind.unit).toBe('km/h');
        expect(OM_LAYERS.gust.unit).toBe('km/h');
        expect(OM_LAYERS.precipitation.unit).toBe('mm');
        expect(OM_LAYERS.precipAccum.unit).toBe('mm');
        expect(OM_LAYERS.lightning.unit).toMatch(/descargas/);
        expect(OM_LAYERS.tempMax.unit).toBe('°C');
        expect(OM_LAYERS.tempMin.unit).toBe('°C');
    });

    it('cada camada field tem escala com stops e unidade', () => {
        for (const key of OM_LAYER_ORDER) {
            const layer = OM_LAYERS[key];
            if (layer.kind === 'isobars') continue;
            expect(layer.scale.stops.length).toBeGreaterThan(2);
            expect(layer.scale.unit).toBeTruthy();
            expect(legendStopsFor(key)).toBe(layer.scale.stops);
        }
    });

    it('camadas por janela marcadas como accum (precipitacao, descargas, rajada)', () => {
        expect(OM_LAYERS.precipitation.accum).toBe(true);
        expect(OM_LAYERS.lightning.accum).toBe(true);
        expect(OM_LAYERS.gust.accum).toBe(true);
        expect(OM_LAYERS.wind.accum).toBeFalsy();
    });
});

describe('linha temporal de 15 dias (3 h ate 72 h, 6 h apos)', () => {
    it('buildSteps: 25 passos de 3 h ate 72 h + 48 passos de 6 h ate 360 h = 73', () => {
        const steps = buildSteps();
        expect(steps.slice(0, 25)).toEqual(Array.from({ length: 25 }, (_, i) => i * 3));
        expect(steps[24]).toBe(72);
        expect(steps[25]).toBe(78);
        expect(steps[steps.length - 1]).toBe(360);
        expect(steps.length).toBe(73);
        expect(OM_MAX_STEP).toBe(360);
    });

    it('apos 72 h todos os passos sao multiplos de 6 e > 72', () => {
        const steps = buildSteps();
        const after = steps.slice(25);
        expect(after.every(s => s % 6 === 0 && s > 72)).toBe(true);
        expect(after).not.toContain(75);
        expect(after).not.toContain(360 + 6);
    });
});

describe('isobaras (marching squares)', () => {
    // campo 3x3 com pressao a subir para leste: 1000, 1004, 1008 / ...
    const lats = [40.0, 40.5, 41.0];
    const lons = [-10.0, -9.5, -9.0];
    const values = [
        [1000, 1004, 1008],
        [1000, 1004, 1008],
        [1000, 1004, 1008]
    ];

    it('isolina de 1004 cruza cada linha horizontal', () => {
        const segs = isoSegments(lats, lons, values, 1004);
        expect(segs.length).toBeGreaterThan(0);
        for (const seg of segs) {
            expect(seg).toHaveLength(2);
            for (const [x, y] of seg) {
                expect(Number.isFinite(x)).toBe(true);
                expect(Number.isFinite(y)).toBe(true);
            }
        }
    });

    it('allIsobars gera varios niveis com intervalo de 4 hPa', () => {
        const lines = allIsobars({ lats, lons, values }, 4);
        const levels = lines.map(l => l.level);
        expect(levels).toContain(1004);
        expect(levels).toContain(1008);
        expect(levels.every(l => l % 4 === 0)).toBe(true);
    });

    it('isobarLabels devolve um rotulo por nivel com coordenadas validas', () => {
        const labels = isobarLabels({ lats, lons, values }, 4);
        expect(labels.length).toBeGreaterThan(0);
        for (const lbl of labels) {
            expect(lbl.level % 4).toBe(0);
            expect(lbl.lon).toBeGreaterThanOrEqual(-10);
            expect(lbl.lon).toBeLessThanOrEqual(-9);
            expect(lbl.lat).toBeGreaterThanOrEqual(40);
            expect(lbl.lat).toBeLessThanOrEqual(41);
        }
    });

    it('campo com nulos nao gera segmentos nos cantos nulos', () => {
        const v = [
            [1000, null, 1008],
            [1000, 1004, 1008],
            [1000, 1004, 1008]
        ];
        const segs = isoSegments(lats, lons, v, 1004);
        expect(segs.length).toBeGreaterThan(0);
        expect(segs.length).toBeLessThan(isoSegments(lats, lons, values, 1004).length + 1);
    });
});

describe('om-api: JSON estatico como fonte de verdade', () => {
    beforeEach(() => { vi.unstubAllGlobals(); });

    it('nao pede passos fora do indice; lanca StepUnavailableError', async () => {
        vi.stubGlobal('window', { location: { hostname: 'example.github.io', origin: 'https://x', pathname: '/' } });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ run: '20261031/00z', steps: [0, 3, 6, 78, 360], layers: ['isobars'], model: 'ecmwf_ifs025' })
        });
        vi.stubGlobal('fetch', fetchMock);
        const api = (await import('../js/meteo/om-api.js')).default;
        api.clearCache();
        await expect(api.getField('wind', 75)).rejects.toMatchObject({ code: 'unavailable' });
        const calls = fetchMock.mock.calls.map(c => String(c[0]));
        expect(calls.some(u => u.includes('wind-75h.json'))).toBe(false);
    });

    it('passo do indice e obtido de data/om/<run>/<layer>-<step>h.json', async () => {
        vi.stubGlobal('window', { location: { hostname: 'example.github.io', origin: 'https://x', pathname: '/' } });
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (String(url).includes('latest.json')) {
                return { ok: true, json: async () => ({ run: '20261031/00z', steps: [0, 78, 360], layers: ['wind'], model: 'ecmwf_ifs025' }) };
            }
            return { ok: true, json: async () => ({ layer: 'wind', step: 78, values: [[1]], lats: [40], lons: [-9] }) };
        });
        vi.stubGlobal('fetch', fetchMock);
        const api = (await import('../js/meteo/om-api.js')).default;
        api.clearCache();
        const field = await api.getField('wind', 78);
        expect(field.step).toBe(78);
        expect(fetchMock.mock.calls.some(c => String(c[0]).includes('data/om/2026103100z/wind-78h.json'))).toBe(true);
    });
});

describe('om-field-layer: multiplas camadas simultaneas', () => {
    beforeEach(() => { vi.unstubAllGlobals(); });

    it('renderLayer cria uma layer por camada e mantem varias ativas', async () => {
        const added = [];
        const removed = [];
        const map = { add: (l) => added.push(l), remove: (l) => removed.push(l) };
        class FakeFeatureLayer { constructor(opts) { this.opts = opts; this.opacity = opts.opacity; this.visible = true; } }
        class FakeGraphicsLayer { constructor(opts) { this.opts = opts; this.opacity = opts.opacity; this.visible = true; this.graphics = []; } add(g) { this.graphics.push(g); } }
        class FakeGraphic { constructor(o) { Object.assign(this, o); } }
        vi.stubGlobal('arcgis', { FeatureLayer: FakeFeatureLayer, GraphicsLayer: FakeGraphicsLayer, Graphic: FakeGraphic });
        const mod = (await import('../js/meteo/om-field-layer.js')).default;
        mod.init(map);

        const windField = { lats: [40.0, 40.5], lons: [-9.0, -8.5], values: [[10, 20], [30, null]], unit: 'km/h', step: 0 };
        mod.renderLayer('wind', windField);
        expect(mod.isActive('wind')).toBe(true);
        expect(mod.activeKeys()).toContain('wind');

        const gustField = { lats: [40.0, 40.5], lons: [-9.0, -8.5], values: [[40, 50], [60, 70]], unit: 'km/h', step: 0 };
        mod.renderLayer('gust', gustField);
        expect(mod.activeKeys()).toEqual(expect.arrayContaining(['wind', 'gust']));
        expect(added.length).toBe(2); // duas camadas no mapa em simultaneo

        // isobaras usan GraphicsLayer com polylines
        const pressureField = {
            lats: [40.0, 40.5, 41.0], lons: [-10.0, -9.5, -9.0],
            values: [[1000, 1004, 1008], [1000, 1004, 1008], [1000, 1004, 1008]],
            unit: 'hPa', step: 0
        };
        mod.renderLayer('isobars', pressureField);
        expect(mod.activeKeys()).toContain('isobars');
        expect(added.length).toBe(3);

        // remover uma camada nao remove as outras
        mod.removeLayer('wind');
        expect(mod.activeKeys()).toEqual(expect.arrayContaining(['gust', 'isobars']));
        expect(mod.isActive('wind')).toBe(false);

        // sampleAtPoint devolve valores das camadas ativas
        const samples = mod.sampleAtPoint(40.1, -8.9);
        expect(samples.length).toBe(2);
        expect(samples.map(s => s.layer).sort()).toEqual(['gust', 'isobars']);
    });
});
