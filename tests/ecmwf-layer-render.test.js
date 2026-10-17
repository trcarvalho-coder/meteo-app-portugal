// ===== Testes de regressão: renderField com FeatureLayer cliente =====
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ecmwf-layer renderField (geometria válida p/ FeatureLayer)', () => {
    beforeEach(() => { vi.unstubAllGlobals(); });

    it('células são polygons (não extent) e geometryType é polygon', async () => {
        const created = [];
        class FakeFeatureLayer {
            constructor(opts) { created.push(opts); }
        }
        const added = [];
        vi.stubGlobal('arcgis', { FeatureLayer: FakeFeatureLayer });
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;

        const field = {
            lats: [40.0, 39.75],
            lons: [-9.0, -8.75],
            values: [[12.5, null], [7.2, 21.1]],
            unit: '°C'
        };
        const map = { add: (l) => added.push(l) };
        EcmwfLayer.renderField(map, field, {
            displayName: 'Temperatura a 2 m', unit: '°C', source: 'ECMWF',
            run: '20261016/00z', validTimeUtc: '2026-10-16T00:00:00Z',
            temporalType: 'instantâneo', scaleKey: 'temperature', opacity: 0.7
        });

        expect(created).toHaveLength(1);
        const opts = created[0];
        // FeatureLayer cliente só aceita point/polygon/polyline/multipoint/...
        expect(opts.geometryType).toBe('polygon');
        // null não é desenhado: 3 features para 4 células
        expect(opts.source).toHaveLength(3);
        for (const f of opts.source) {
            expect(f.geometry.type).toBe('polygon');
            expect(f.geometry.rings).toHaveLength(1);
            const ring = f.geometry.rings[0];
            expect(ring.length).toBe(5); // 4 vértices + fecho
            expect(ring[0]).toEqual(ring[4]);
            for (const [x, y] of ring) {
                expect(Number.isFinite(x)).toBe(true);
                expect(Number.isFinite(y)).toBe(true);
            }
        }
        expect(added).toHaveLength(1);
    });

    it('escala desconhecida lança antes de criar a layer (nada desenhado)', async () => {
        class FakeFeatureLayer { constructor() { throw new Error('não deve chegar aqui'); } }
        vi.stubGlobal('arcgis', { FeatureLayer: FakeFeatureLayer });
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;
        expect(() => EcmwfLayer.renderField({ add: () => {}, remove: () => {} }, {
            lats: [40], lons: [-9], values: [[1]]
        }, { scaleKey: 'windSpeed' })).toThrow(/Escala desconhecida/);
    });
});
