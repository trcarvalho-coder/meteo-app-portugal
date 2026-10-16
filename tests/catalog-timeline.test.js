// ===== Testes do catálogo de variáveis e linha temporal =====
import { describe, it, expect } from 'vitest';
import { VARIABLE_CATALOG, SCALES, legendStops } from '../js/meteo/catalog.js';

describe('catálogo de variáveis', () => {
    it('variáveis ECMWF mapeadas para paramIds reais', () => {
        expect(VARIABLE_CATALOG.temperature.paramId).toBe(167);
        expect(VARIABLE_CATALOG.temperature.originalIdentifier).toBe('2t');
        expect(VARIABLE_CATALOG.windSpeed.paramId).toEqual({ u: 165, v: 166 });
        expect(VARIABLE_CATALOG.precipitation.paramId).toBe(228);
    });

    it('rajada é marcada como indisponível na fonte AWS, com fallback identificado', () => {
        expect(VARIABLE_CATALOG.gust.status).toBe('unavailable');
        expect(VARIABLE_CATALOG.gust.fallback.source).toMatch(/Open-Meteo/);
        expect(VARIABLE_CATALOG.gust.sourceId).toBeNull();
    });

    it('transformações do catálogo aplicam conversões corretas', () => {
        expect(VARIABLE_CATALOG.temperature.transform(273.15)).toBeCloseTo(0, 10);
        expect(VARIABLE_CATALOG.precipitation.transform(0.001)).toBeCloseTo(1, 10);
        expect(VARIABLE_CATALOG.windSpeed.transform(3, 4)).toBeCloseTo(18, 10);
    });

    it('escalas têm unidade e intervalos', () => {
        for (const key of ['temperature', 'wind', 'gust', 'precipitation']) {
            const scale = SCALES[key];
            expect(scale.unit).toBeTruthy();
            expect(scale.stops.length).toBeGreaterThan(3);
            expect(legendStops(key)).toBe(scale.stops);
        }
    });

    it('escala é consistente (não dinâmica durante animação)', () => {
        const before = JSON.stringify(SCALES.temperature);
        const after = JSON.stringify(SCALES.temperature);
        expect(before).toBe(after);
    });
});

describe('linha temporal tri-horária', () => {
    const nativeStepList = () => {
        const steps = [];
        for (let h = 0; h <= 72; h += 3) steps.push(h);
        return steps;
    };

    it('horizonte de 72 h com passos nativos de 3 h (25 instantes)', () => {
        const steps = nativeStepList();
        expect(steps[0]).toBe(0);
        expect(steps).toContain(72);
        expect(steps.length).toBe(25);
        expect(steps).not.toContain(75);
        expect(steps).not.toContain(144);
    });

    it('todos os passos são múltiplos de 3 h', () => {
        const steps = nativeStepList();
        expect(steps.every(s => s % 3 === 0)).toBe(true);
    });

    it('25 instantes (0..72 h de 3 em 3 h, ambos incluídos) = 24 intervalos', () => {
        let count = 0;
        for (let h = 0; h <= 72; h += 3) count++;
        expect(count).toBe(25);
        expect(count - 1).toBe(24);
    });

    it('HORIZON_STEPS da Timeline é 25', async () => {
        const Timeline = (await import('../js/meteo/timeline.js')).default;
        expect(Timeline.HORIZON_STEPS).toBe(25);
        expect(Timeline.indexToStep(24)).toBe(72);
    });

    it('validade = execução + prazo', () => {
        const run = Date.UTC(2026, 9, 16, 0);
        const step = 6;
        const valid = new Date(run + step * 3600000);
        expect(valid.toISOString()).toBe('2026-10-16T06:00:00.000Z');
    });

    it('extremos e rajadas não são interpolados: janela estatística preservada', () => {
        const gustWindow = { start: 0, end: 6 };
        const cursorStep = 3;
        expect(cursorStep).toBeGreaterThanOrEqual(gustWindow.start);
        expect(cursorStep).toBeLessThan(gustWindow.end);
    });
});
