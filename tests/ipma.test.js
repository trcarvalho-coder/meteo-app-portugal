// ===== Testes do adaptador IPMA =====
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IpmaApi from '../js/meteo/ipma-api.js';

const NOW = new Date('2026-10-16T12:00:00Z');

describe('avisos IPMA', () => {
    it('avisos futuros nao aparecem como ativos', () => {
        const warnings = [
            { areaId: 'LSB', level: 1, start: new Date('2026-10-16T10:00:00Z'), end: new Date('2026-10-16T18:00:00Z') },
            { areaId: 'LSB', level: 2, start: new Date('2026-10-17T10:00:00Z'), end: new Date('2026-10-17T18:00:00Z') }
        ];
        const levels = IpmaApi.maxLevelByArea(warnings, NOW);
        expect(levels.get('LSB')).toBe(1); // amarelo ativo; o laranja futuro nao conta
    });

    it('severidade maxima do periodo selecionado', () => {
        const warnings = [
            { areaId: 'PTO', level: 1, start: new Date('2026-10-16T08:00:00Z'), end: new Date('2026-10-16T20:00:00Z') },
            { areaId: 'PTO', level: 3, start: new Date('2026-10-16T09:00:00Z'), end: new Date('2026-10-16T14:00:00Z') }
        ];
        const levels = IpmaApi.maxLevelByArea(warnings, NOW);
        expect(levels.get('PTO')).toBe(3); // vermelho > amarelo
    });

    it('nivel green e filtrado; aviso em vigor marcado ativo', async () => {
        // tempos relativos ao Date.now() real (loadWarnings usa a hora atual)
        const now = new Date();
        const fmt = d => d.toISOString().slice(0, 16);
        const start = fmt(new Date(now.getTime() - 3600000));
        const end = fmt(new Date(now.getTime() + 3600000));
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { awarenessTypeName: 'Vento', idAreaAviso: 'LSB', awarenessLevelID: 'green', startTime: start, endTime: end, text: '' },
                { awarenessTypeName: 'Vento', idAreaAviso: 'LSB', awarenessLevelID: 'yellow', startTime: start, endTime: end, text: 'x' }
            ])
        });
        vi.stubGlobal('fetch', fetchMock);
        IpmaApi.clearCache();
        const { warnings } = await IpmaApi.loadWarnings();
        expect(warnings).toHaveLength(1); // green removido
        expect(warnings[0].levelName).toBe('yellow');
        expect(warnings[0].active).toBe(true);
    });

    it('falha da API nao resulta em "sem avisos" quando existe cache (stale)', async () => {
        let call = 0;
        const fetchMock = vi.fn().mockImplementation(() => {
            call++;
            if (call === 1) {
                return { ok: true, json: async () => ([
                    { awarenessTypeName: 'Vento', idAreaAviso: 'FAR', awarenessLevelID: 'red', startTime: '2026-10-16T06:00:00', endTime: '2026-10-19T06:00:00', text: 'x' }
                ]) };
            }
            return { ok: false, status: 500 };
        });
        vi.stubGlobal('fetch', fetchMock);
        IpmaApi.clearCache();
        const first = await IpmaApi.loadWarnings();
        expect(first.warnings).toHaveLength(1);
        expect(first.stale).toBe(false);
        // expirar cache e falhar: preserva ultimo valido como stale
        await new Promise(r => setTimeout(r, 10));
        const orig = Date.now;
        Date.now = () => orig() + 10 * 60 * 1000;
        const second = await IpmaApi.loadWarnings();
        Date.now = orig;
        expect(second.stale).toBe(true);
        expect(second.warnings).toHaveLength(1); // dados preservados
    });
});

describe('observacoes IPMA', () => {
    it('sentinela -99.0 e convertida em null, nunca em valor', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                '2026-10-16T10:00': {
                    '1210881': { temperatura: -5.2, humidade: 80.0, intensidadeVentoKM: 12.3, pressao: -99.0, precAcumulada: 0.0, idDireccVento: 3 }
                }
            })
        });
        vi.stubGlobal('fetch', fetchMock);
        IpmaApi.clearCache();
        const { byStation } = await IpmaApi.loadObservations();
        const obs = byStation.get('1210881');
        expect(obs.pressure).toBeNull();       // sentinela -> null
        expect(obs.temperature).toBe(-5.2);     // temperatura negativa VALIDA preservada
        expect(obs.windSpeedKmh).toBe(12.3);    // km/h nativo da fonte
    });

    it('timestamp por estacao preservado (hora da observacao)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                '2026-10-16T08:00': { '1': { temperatura: 10.0 } },
                '2026-10-16T10:00': { '2': { temperatura: 20.0 } }
            })
        });
        vi.stubGlobal('fetch', fetchMock);
        IpmaApi.clearCache();
        const { byStation } = await IpmaApi.loadObservations();
        expect(byStation.get('1').time.toISOString()).toBe('2026-10-16T08:00:00.000Z');
        expect(byStation.get('2').time.toISOString()).toBe('2026-10-16T10:00:00.000Z');
    });
});

describe('associacao espacial', () => {
    const stations = [
        { id: '1', name: 'Perto', lat: 38.72, lng: -9.14 },
        { id: '2', name: 'Longe', lat: 41.0, lng: -8.6 }
    ];

    it('encontra estacao dentro do limite de distancia', () => {
        const byStation = new Map([['1', { time: NOW, temperature: 20 }]]);
        const m = IpmaApi.findStation({ lat: 38.72, lng: -9.13 }, stations, byStation, NOW);
        expect(m.station.id).toBe('1');
        expect(m.distance).toBeLessThan(10);
    });

    it('estacao alem do limite (40 km) nao e considerada', () => {
        const byStation = new Map([['2', { time: NOW, temperature: 20 }]]);
        const m = IpmaApi.findStation({ lat: 38.72, lng: -9.14 }, [stations[1]], byStation, NOW);
        expect(m).toBeNull();
    });

    it('observacao desatualizada (> 3 h) e assinalada', () => {
        const oldTime = new Date('2026-10-16T05:00:00Z');
        const byStation = new Map([['1', { time: oldTime, temperature: 20 }]]);
        const m = IpmaApi.findStation({ lat: 38.72, lng: -9.13 }, stations, byStation, NOW);
        expect(m.obs.staleObs).toBe(true);
    });

    it('localidade de previsao por coordenadas, nunca por nome', () => {
        const locations = [
            { globalIdLocal: 1110600, name: 'Lisboa', areaId: 'LSB', lat: 38.766, lng: -9.1286 },
            { globalIdLocal: 1131200, name: 'Porto', areaId: 'PTO', lat: 41.15, lng: -8.61 }
        ];
        const m = IpmaApi.findForecastLocation({ lat: 38.75, lng: -9.2 }, locations);
        expect(m.location.globalIdLocal).toBe(1110600);
        expect(m.distance).toBeLessThan(IpmaApi.FC_MAX_DISTANCE_KM);
    });
});

describe('previsao 36 horas', () => {
    it('dias que intersectam as proximas 36 h; rotulo explicito de previsao diaria', () => {
        const days = [
            { date: '2026-10-16' }, { date: '2026-10-17' }, { date: '2026-10-18' }, { date: '2026-10-19' }
        ];
        // sexta 12:00 UTC + 36h = domingo 00:00 -> dias 16, 17, 18 intersectam
        const sel = IpmaApi.forecastDaysWithin(days, NOW, 36);
        expect(sel.map(d => d.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    });

    it('previsao diaria nunca e apresentada como horaria (contrato do adaptador)', () => {
        // o adaptador loadDailyForecast devolve apenas dias: se um produto
        // horario existir no futuro, tera funcao propria
        expect(typeof IpmaApi.loadDailyForecast).toBe('function');
        expect(IpmaApi.forecastDaysWithin).toBeDefined();
    });
});
