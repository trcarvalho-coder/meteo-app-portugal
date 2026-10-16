// ===== Testes do helper de formatação partilhado =====
import { describe, it, expect } from 'vitest';
import { formatNumber, formatProbability, isValidNumber, UNAVAILABLE } from '../js/format.js';

describe('formatNumber', () => {
    it('"100.0" (string) → "100.0 %"', () => {
        expect(formatProbability('100.0')).toBe('100.0 %');
    });

    it('null → "Indisponível" (nunca 0)', () => {
        expect(formatProbability(null)).toBe(UNAVAILABLE);
        expect(formatNumber(null, 1, 'mm')).toBe(UNAVAILABLE);
    });

    it('"-99.0" (sentinela) → "Indisponível"', () => {
        expect(formatProbability('-99.0')).toBe(UNAVAILABLE);
        expect(formatNumber(-99, 1, '°C')).toBe(UNAVAILABLE);
    });

    it('undefined/NaN → "Indisponível"', () => {
        expect(formatProbability(undefined)).toBe(UNAVAILABLE);
        expect(formatProbability('abc')).toBe(UNAVAILABLE);
        expect(formatNumber(NaN, 1, 'km/h')).toBe(UNAVAILABLE);
    });

    it('número válido com unidade', () => {
        expect(formatNumber(3.14, 1, 'mm')).toBe('3.1 mm');
        expect(formatNumber(12.34567, 2, 'km/h')).toBe('12.35 km/h');
    });

    it('zero real é distinto de null', () => {
        expect(formatNumber(0, 1, 'mm')).toBe('0.0 mm');
        expect(isValidNumber(0)).toBe(true);
        expect(isValidNumber(null)).toBe(false);
    });
});
