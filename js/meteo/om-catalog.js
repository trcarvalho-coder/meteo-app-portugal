// ===== Catalogo das camadas Open-Meteo (modelo ECMWF ecmwf_ifs025) =====
// Fonte: Open-Meteo Forecast API, models=ecmwf_ifs025 (ECMWF IFS open-data
// 0.25, CC-BY 4.0; sem custos, sem chave, uso nao comercial < 10 000
// chamadas/dia). Horizonte: 15 dias (360 h). Temporalidade efetiva:
// passos de 3 h ate 72 h e de 6 h apos 72 h (73 instantes).
// Area de interesse: Atlantico Norte (lat 0..72N, lon -100..16E).

export const OM_MODEL = 'ecmwf_ifs025';
export const OM_FORECAST_DAYS = 15;
export const OM_MAX_STEP = 360;

export const OM_SCALES = {
    wind: {
        stops: [
            { value: 0, color: '#e8f5e9' }, { value: 10, color: '#a9e34b' },
            { value: 20, color: '#ffd43b' }, { value: 30, color: '#ff922b' },
            { value: 45, color: '#fa5252' }, { value: 60, color: '#e64980' },
            { value: 80, color: '#862e9c' }
        ], unit: 'km/h'
    },
    gust: {
        stops: [
            { value: 0, color: '#e8f5e9' }, { value: 20, color: '#a9e34b' },
            { value: 40, color: '#ffd43b' }, { value: 60, color: '#ff922b' },
            { value: 80, color: '#fa5252' }, { value: 100, color: '#e64980' },
            { value: 120, color: '#862e9c' }
        ], unit: 'km/h'
    },
    precipitation: {
        stops: [
            { value: 0, color: 'rgba(255,255,255,0.05)' }, { value: 0.1, color: '#a5d8ff' },
            { value: 1, color: '#74c0fc' }, { value: 5, color: '#4dabf7' },
            { value: 10, color: '#3b5bdb' }, { value: 20, color: '#364fc7' },
            { value: 50, color: '#1c2c8f' }
        ], unit: 'mm'
    },
    lightning: {
        stops: [
            { value: 0, color: 'rgba(255,255,255,0.05)' }, { value: 0.1, color: '#fff3bf' },
            { value: 1, color: '#ffd43b' }, { value: 5, color: '#ff922b' },
            { value: 20, color: '#fa5252' }, { value: 50, color: '#e64980' }
        ], unit: 'descargas/km²'
    },
    temperature: {
        stops: [
            { value: -10, color: '#3949ab' }, { value: -5, color: '#4c6ef5' },
            { value: 0, color: '#4dabf7' }, { value: 5, color: '#66d9e8' },
            { value: 10, color: '#8ce99a' }, { value: 15, color: '#ffe066' },
            { value: 20, color: '#ffc078' }, { value: 25, color: '#ff8787' },
            { value: 30, color: '#f03e3e' }, { value: 35, color: '#c92a2a' }
        ], unit: '°C'
    },
    pressure: {
        stops: [
            { value: 960, color: '#862e9c' }, { value: 980, color: '#3949ab' },
            { value: 1000, color: '#4dabf7' }, { value: 1010, color: '#66d9e8' },
            { value: 1020, color: '#8ce99a' }, { value: 1030, color: '#ffe066' },
            { value: 1040, color: '#ff8787' }
        ], unit: 'hPa'
    }
};

// Uma entrada por botao de camada. kind: 'field' (grelha colorida) ou
// 'isobars' (isolinhas de pressao). accum: previsao por janela (3/6 h).
export const OM_LAYERS = {
    isobars: {
        key: 'isobars',
        label: 'Isóbaras (pressão ao nível do mar)',
        icon: 'fa-chart-line',
        kind: 'isobars',
        fieldLayer: 'pressure',
        unit: 'hPa',
        intervalHpa: 4,
        defaultOn: true,
        description: 'Isolinhas de pressão_msl (hPa), de 4 em 4 hPa. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    wind: {
        key: 'wind',
        label: 'Vento (10 m)',
        icon: 'fa-wind',
        kind: 'field',
        omVar: 'wind_speed_10m',
        unit: 'km/h',
        scale: OM_SCALES.wind,
        description: 'Velocidade do vento a 10 m (km/h), valor instantâneo. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    gust: {
        key: 'gust',
        label: 'Rajada de vento (10 m)',
        icon: 'fa-burst',
        kind: 'field',
        omVar: 'wind_gusts_10m',
        unit: 'km/h',
        scale: OM_SCALES.gust,
        accum: true,
        description: 'Rajada máxima de vento a 10 m (km/h) na janela de 3 h (até 72 h) / 6 h (após 72 h). Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    precipitation: {
        key: 'precipitation',
        label: 'Precipitação (janela)',
        icon: 'fa-cloud-rain',
        kind: 'field',
        omVar: 'precipitation',
        unit: 'mm',
        scale: OM_SCALES.precipitation,
        accum: true,
        description: 'Precipitação acumulada (mm) na janela de 3 h (até 72 h) / 6 h (após 72 h) que termina no instante. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    precipAccum: {
        key: 'precipAccum',
        label: 'Precipitação acumulada (dia)',
        icon: 'fa-cloud-showers-heavy',
        kind: 'field',
        omVar: 'precipitation_sum',
        unit: 'mm',
        scale: OM_SCALES.precipitation,
        accum: true,
        daily: true,
        description: 'Precipitação total acumulada no dia (mm) da data do instante. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    lightning: {
        key: 'lightning',
        label: 'Descargas elétricas',
        icon: 'fa-bolt',
        kind: 'field',
        omVar: 'lightning_density',
        unit: 'descargas/km²',
        scale: OM_SCALES.lightning,
        accum: true,
        description: 'Densidade de descargas elétricas (descargas/km²) na janela de 3 h (até 72 h) / 6 h (após 72 h). Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    tempMax: {
        key: 'tempMax',
        label: 'Temperatura máxima',
        icon: 'fa-temperature-arrow-up',
        kind: 'field',
        omVar: 'temperature_2m_max',
        unit: '°C',
        scale: OM_SCALES.temperature,
        daily: true,
        description: 'Temperatura máxima diária (°C) da data do instante. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    },
    tempMin: {
        key: 'tempMin',
        label: 'Temperatura mínima',
        icon: 'fa-temperature-arrow-down',
        kind: 'field',
        omVar: 'temperature_2m_min',
        unit: '°C',
        scale: OM_SCALES.temperature,
        daily: true,
        description: 'Temperatura mínima diária (°C) da data do instante. Fonte: Open-Meteo (ECMWF IFS 0.25°).'
    }
};

export const OM_LAYER_ORDER = ['isobars', 'wind', 'gust', 'precipitation', 'precipAccum', 'lightning', 'tempMax', 'tempMin'];

export function getOmLayer(key) {
    return OM_LAYERS[key] || null;
}

export function legendStopsFor(layerKey) {
    const layer = OM_LAYERS[layerKey];
    if (!layer) return [];
    if (layer.kind === 'isobars') return [];
    return layer.scale?.stops || [];
}

export function scaleKeyForOm(layerKey) {
    const layer = OM_LAYERS[layerKey];
    if (!layer || layer.kind === 'isobars') return null;
    for (const [key, scale] of Object.entries(OM_SCALES)) {
        if (scale === layer.scale) return key;
    }
    return null;
}
