// ===== Testes do adaptador ERA5 (Open-Meteo Historical API) =====
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Era5Api from '../js/meteo/era5-api.js';

describe('adaptador ERA5 (Open-Meteo Historical)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        Era5Api.clearCache();
    });

    it('pede unidades explicitas (kmh/celsius/mm) e datas de inicio/fim', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                latitude: 38.7, longitude: -9.1, elevation: 10,
                daily: {
                    time: ['2025-01-01', '2025-01-02'],
                    temperature_2m_max: [12.9, 15.0],
                    temperature_2m_min: [6.0, 7.5],
                    temperature_2m_mean: [9.4, 11.2],
                    precipitation_sum: [0.0, 0.0],
                    wind_speed_10m_max: [15.4, 10.0]
                }
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        const data = await Era5Api.loadDailyHistory(38.7223, -9.1393, '2025-01-01', '2025-01-02');

        const url = fetchMock.mock.calls[0][0];
        expect(url).toContain('wind_speed_unit=kmh');
        expect(url).toContain('temperature_unit=celsius');
        expect(url).toContain('precipitation_unit=mm');
        expect(url).toContain('start_date=2025-01-01');
        expect(url).toContain('end_date=2025-01-02');
        expect(url).toContain('daily=');
        expect(url).toContain('temperature_2m_mean');

        expect(data.source).toMatch(/ERA5/);
        expect(data.daily).toHaveLength(2);
        // valores ja em km/h / Celsius: sem nova conversao
        expect(data.daily[0].maxTemp).toBe(12.9);
        expect(data.daily[0].maxWind).toBe(15.4);
        // nulos preservados como null, nunca zero
        expect(data.daily[0].meanTemp).toBe(9.4);
    });

    it('valores nulos da API ficam null (indisponivel != zero)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                latitude: 38.7, longitude: -9.1, elevation: 10,
                daily: {
                    time: ['2025-01-01'],
                    temperature_2m_max: [null],
                    temperature_2m_min: [null],
                    temperature_2m_mean: [null],
                    precipitation_sum: [null],
                    wind_speed_10m_max: [null]
                }
            })
        });
        vi.stubGlobal('fetch', fetchMock);
        const data = await Era5Api.loadDailyHistory(38.7, -9.1, '2025-01-01', '2025-01-01');
        expect(data.daily[0].maxTemp).toBeNull();
        expect(data.daily[0].precipitation).toBeNull();
        expect(data.daily[0].maxWind).toBeNull();
    });

    it('erro da API e propagado com mensagem', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ reason: 'Data out of range' })
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            Era5Api.loadDailyHistory(38.7, -9.1, '1800-01-01', '1800-01-02')
        ).rejects.toThrow('Data out of range');
    });

    it('respostas em cache nao geram novos pedidos', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                latitude: 38.7, longitude: -9.1, elevation: 10,
                daily: { time: ['2025-01-01'], temperature_2m_max: [10], temperature_2m_min: [5], temperature_2m_mean: [7], precipitation_sum: [0], wind_speed_10m_max: [10] }
            })
        });
        vi.stubGlobal('fetch', fetchMock);
        await Era5Api.loadDailyHistory(38.7, -9.1, '2025-01-01', '2025-01-01');
        await Era5Api.loadDailyHistory(38.7, -9.1, '2025-01-01', '2025-01-01');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
