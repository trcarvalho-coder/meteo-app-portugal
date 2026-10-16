// ===== Testes da camada central de unidades =====
import { describe, it, expect } from 'vitest';
import {
    msToKmh, kelvinToCelsius, metersToMm,
    windSpeedKmhFromComponents, normalizeWindSpeed,
    normalizeTemperature, normalizePrecipitation,
    windDirectionFromComponents, precipitationIncrement
} from '../js/meteo/units.js';

describe('conversões de unidades', () => {
    it('10 m/s = 36 km/h', () => {
        expect(msToKmh(10)).toBe(36);
    });

    it('10u = 3 m/s e 10v = 4 m/s → 18 km/h', () => {
        expect(windSpeedKmhFromComponents(3, 4)).toBeCloseTo(18, 10);
    });

    it('273.15 K = 0 °C', () => {
        expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 10);
    });

    it('0.001 m de precipitação = 1 mm', () => {
        expect(metersToMm(0.001)).toBeCloseTo(1, 10);
    });

    it('valor já em km/h não sofre nova conversão', () => {
        expect(normalizeWindSpeed(50, 'kmh')).toBe(50);
        // 50 km/h * 3.6 seria 180 — o bug original
        expect(normalizeWindSpeed(50, 'kmh')).not.toBe(180);
    });

    it('m/s e nós convertem corretamente para km/h', () => {
        expect(normalizeWindSpeed(10, 'ms')).toBeCloseTo(36, 10);
        expect(normalizeWindSpeed(10, 'kn')).toBeCloseTo(18.52, 2);
    });
});

describe('vento vs rajada', () => {
    it('velocidade do vento e rajada não são trocadas pelo normalizador', () => {
        const wind = normalizeWindSpeed(10, 'kmh');
        const gust = normalizeWindSpeed(25, 'kmh');
        expect(wind).toBe(10);
        expect(gust).toBe(25);
        expect(wind).not.toBe(gust);
    });

    it('rajadas não são calculadas a partir da velocidade média', () => {
        // rajada só pode vir do campo wind_gusts_10m; nunca de wind_speed_10m
        const windSpeed = normalizeWindSpeed(10, 'kmh');
        expect(windSpeed).toBe(10);
    });

    it('direção a partir de u/v: vento de norte → 0°', () => {
        // v negativo = vento do norte
        expect(windDirectionFromComponents(0, -1)).toBeCloseTo(180, 6);
        expect(windDirectionFromComponents(1, 0)).toBeCloseTo(90, 6);
    });
});

describe('valores nulos', () => {
    it('valores nulos não são apresentados como zero', () => {
        expect(msToKmh(null)).toBeNull();
        expect(kelvinToCelsius(null)).toBeNull();
        expect(metersToMm(null)).toBeNull();
        expect(windSpeedKmhFromComponents(null, 5)).toBeNull();
        expect(normalizeWindSpeed(null, 'kmh')).toBeNull();
        expect(normalizeWindSpeed(undefined, 'kmh')).toBeNull();
    });

    it('zero real é distinto de null', () => {
        expect(msToKmh(0)).toBe(0);
        expect(normalizeWindSpeed(0, 'kmh')).toBe(0);
        expect(msToKmh(null)).not.toBe(0);
    });
});

describe('acumulados e incrementos de precipitação', () => {
    it('acumulados de 1 mm e 4 mm originam incremento de 3 mm', () => {
        expect(precipitationIncrement(1, 4)).toBeCloseTo(3, 10);
    });

    it('não soma acumulados sucessivos como incrementos', () => {
        // acumulados tp(0h)=0, tp(3h)=2, tp(6h)=5
        // incrementos: 2 e 3; soma de acumulados seria 7 (errado)
        const inc1 = precipitationIncrement(0, 2);
        const inc2 = precipitationIncrement(2, 5);
        expect(inc1).toBe(2);
        expect(inc2).toBe(3);
        expect(inc1 + inc2).toBe(5); // = acumulado final, não 7
    });

    it('diferença ligeiramente negativa dentro da tolerância é 0, não null', () => {
        const prev = 0.1 + 0.2; // 0.30000000000000004
        const cur = 0.3;
        expect(precipitationIncrement(prev, cur, 1e-9)).toBe(0);
    });

    it('diferença claramente negativa devolve null (não corrige às cegas)', () => {
        expect(precipitationIncrement(5, 1)).toBeNull();
    });
});

describe('associação de timestamps e coordenadas', () => {
    it('conversão de unidade não altera a associação índice/valor', () => {
        const speeds = [10, 20, 30]; // km/h da API
        const normalized = speeds.map(s => normalizeWindSpeed(s, 'kmh'));
        expect(normalized).toEqual([10, 20, 30]);
    });

    it('u/v das mesmas componentes produzem magnitude coerente', () => {
        const u = [3, 0, 6];
        const v = [4, 0, 8];
        const speeds = u.map((x, i) => windSpeedKmhFromComponents(x, v[i]));
        expect(speeds[0]).toBeCloseTo(speeds[2] / 2, 6);
    });
});

describe('temperatura e precipitação normalizadas', () => {
    it('temperatura em °C não é reconvertida', () => {
        expect(normalizeTemperature(15, 'c')).toBe(15);
    });

    it('precipitação em mm não é reconvertida', () => {
        expect(normalizePrecipitation(2.5, 'mm')).toBe(2.5);
    });
});
