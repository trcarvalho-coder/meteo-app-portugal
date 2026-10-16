// ===== Testes: escala de vento, camada ECMWF e índice estático =====
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VARIABLE_CATALOG, SCALES, legendStops } from '../js/meteo/catalog.js';

// scaleKeyFor extraído de ecmwf-panel.js (mesma lógica: catálogo → chave SCALES)
function scaleKeyFor(variable) {
    const meta = VARIABLE_CATALOG[variable];
    if (!meta || !meta.scale) return null;
    for (const [key, value] of Object.entries(SCALES)) {
        if (value === meta.scale) return key;
    }
    return null;
}

describe('escala por variável (vento a negro)', () => {
    it('para cada variável do catálogo, scaleKeyFor devolve chave existente em SCALES', () => {
        for (const key of Object.keys(VARIABLE_CATALOG)) {
            const scaleKey = scaleKeyFor(key);
            expect(scaleKey, `variável ${key}`).not.toBeNull();
            expect(SCALES[scaleKey]).toBeDefined();
        }
    });

    it('windSpeed usa a escala "wind" (não "windSpeed", que não existe)', () => {
        expect(scaleKeyFor('windSpeed')).toBe('wind');
        expect(SCALES.windSpeed).toBeUndefined();
    });

    it('colorForValue("wind", 35) devolve #ff922b', async () => {
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;
        expect(EcmwfLayer.colorForValue('wind', 35)).toBe('#ff922b');
    });

    it('valores abaixo do primeiro stop usam o primeiro stop; null não é desenhado', async () => {
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;
        expect(EcmwfLayer.colorForValue('wind', -5)).toBe('#d0f4de');
        expect(EcmwfLayer.colorForValue('temperature', -50)).toBe('#4c6ef5');
    });

    it('classBreaks gera símbolos definidos (nenhum undefined)', async () => {
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;
        for (const key of ['temperature', 'wind', 'precipitation']) {
            const breaks = EcmwfLayer.classBreaks(key);
            expect(breaks.length).toBe(legendStops(key).length);
            for (const b of breaks) {
                expect(b.symbol).toBeDefined();
                expect(b.symbol.color).toBeDefined();
            }
        }
    });

    it('escala inexistente lança erro explícito (não desenha a negro)', async () => {
        const EcmwfLayer = (await import('../js/meteo/ecmwf-layer.js')).default;
        expect(() => EcmwfLayer.colorForValue('windSpeed', 10)).toThrow();
        expect(() => EcmwfLayer.classBreaks('windSpeed')).toThrow(/Escala desconhecida/);
    });

    it('escala de vento em km/h com intervalos coerentes com Portugal, sem "furacão"', () => {
        const values = SCALES.wind.stops.map(s => s.value);
        expect(values).toEqual([0, 10, 20, 30, 45, 60, 80]);
        expect(SCALES.wind.unit).toBe('km/h');
        const labels = legendStops('wind').map(s => JSON.stringify(s));
        expect(labels.some(l => /furac/i.test(l))).toBe(false);
    });
});

describe('ecmwf-api: índice estático como fonte de verdade', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('não pede passos ausentes do índice (availableSteps)', async () => {
        vi.stubGlobal('window', { location: { hostname: 'example.github.io', origin: 'https://x', pathname: '/' } });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ run: '20261016/00z', availableSteps: [0, 3, 6], maxStep: 6 })
        });
        vi.stubGlobal('fetch', fetchMock);
        const api = (await import('../js/meteo/ecmwf-api.js')).default;
        api.clearCache();
        await expect(api.getField('temperature', 33)).rejects.toThrow(/Passo ainda não publicado/);
        await expect(api.getField('temperature', 33)).rejects.toMatchObject({ code: 'unavailable' });
        // 33h não consta do índice: nenhum pedido ao ficheiro do passo
        const calls = fetchMock.mock.calls.map(c => String(c[0]));
        expect(calls.some(u => u.includes('temperature-33h.json'))).toBe(false);
    });

    it('passo listado no índice é obtido do estático', async () => {
        vi.stubGlobal('window', { location: { hostname: 'example.github.io', origin: 'https://x', pathname: '/' } });
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (String(url).includes('latest.json')) {
                return { ok: true, json: async () => ({ run: '20261016/00z', availableSteps: [0, 3, 6], maxStep: 6 }) };
            }
            return { ok: true, json: async () => ({ variable: 'temperature', step: 3, values: [[1]] }) };
        });
        vi.stubGlobal('fetch', fetchMock);
        const api = (await import('../js/meteo/ecmwf-api.js')).default;
        api.clearCache();
        const field = await api.getField('temperature', 3);
        expect(field.step).toBe(3);
        expect(fetchMock.mock.calls.some(c => String(c[0]).includes('temperature-3h.json'))).toBe(true);
    });

    it('404 é tratado como passo indisponível e não vai para cache', async () => {
        vi.stubGlobal('window', { location: { hostname: 'example.github.io', origin: 'https://x', pathname: '/' } });
        let calls = 0;
        const fetchMock = vi.fn().mockImplementation((url) => {
            calls++;
            if (String(url).includes('latest.json')) {
                return { ok: true, json: async () => ({ run: '20261016/00z', availableSteps: [0, 3], maxStep: 3 }) };
            }
            return { ok: false, status: 404 };
        });
        vi.stubGlobal('fetch', fetchMock);
        const api = (await import('../js/meteo/ecmwf-api.js')).default;
        api.clearCache();
        await expect(api.getField('temperature', 3)).rejects.toMatchObject({ code: 'unavailable' });
        expect(api.isCached('temperature-3')).toBe(false);
    });

    it('em produção (hostname não local) BACKEND_URL é null', async () => {
        vi.stubGlobal('window', { location: { hostname: 'trcarvalho-coder.github.io', origin: 'https://x', pathname: '/' } });
        vi.resetModules();
        const api = (await import('../js/meteo/ecmwf-api.js')).default;
        expect(api.BACKEND_URL).toBeNull();
    });

    it('em localhost, o backend local é permitido', async () => {
        vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'https://x', pathname: '/' } });
        vi.resetModules();
        const api = (await import('../js/meteo/ecmwf-api.js')).default;
        expect(api.BACKEND_URL).toBe('http://127.0.0.1:8787');
    });
});
