// ===== Testes: fetch com retry (429/5xx) e cache Open-Meteo =====
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithRetry, cacheKeyOf, MAX_RETRIES } from '../js/http.js';

describe('fetchWithRetry', () => {
    beforeEach(() => { vi.unstubAllGlobals(); });

    it('429 é repetido até ter sucesso (1 pedido único ao endpoint)', async () => {
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
            calls++;
            if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } };
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }));
        const data = await fetchWithRetry('https://api/x');
        expect(data).toEqual({ ok: true });
        expect(calls).toBe(2);
    });

    it('máximo de 3 retries para 503; depois lança com status', async () => {
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
            calls++;
            return { ok: false, status: 503, headers: { get: () => '0' } };
        }));
        await expect(fetchWithRetry('https://api/x')).rejects.toMatchObject({ status: 503 });
        expect(calls).toBe(MAX_RETRIES + 1);
    });

    it('erro 4xx não retryable (400) falha de imediato', async () => {
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
            calls++;
            return { ok: false, status: 400, headers: { get: () => null } };
        }));
        await expect(fetchWithRetry('https://api/x')).rejects.toMatchObject({ status: 400 });
        expect(calls).toBe(1);
    });

    it('respeita Retry-After em segundos', async () => {
        const delays = [];
        vi.stubGlobal('setTimeout', (fn, ms) => { delays.push(ms); fn(); });
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
            calls++;
            if (calls <= 2) return { ok: false, status: 429, headers: { get: () => '2' } };
            return { ok: true, status: 200, json: async () => ({}) };
        }));
        await fetchWithRetry('https://api/x');
        expect(delays.length).toBe(2);
        expect(delays.every(d => d >= 1500 && d <= 3000)).toBe(true); // 2s * jitter [0.75, 1.25]
    });
});

describe('cacheKeyOf', () => {
    it('chave arredondada a 2 decimais (pontos próximos partilham cache)', () => {
        expect(cacheKeyOf('combined', 38.7223, -9.1393))
            .toBe(cacheKeyOf('combined', 38.7229, -9.1391));
        expect(cacheKeyOf('combined', 38.7223, -9.1393)).toBe('combined-38.72--9.14');
    });
});
