// ===== Catálogo central de variáveis meteorológicas =====
// Cada entrada documenta: nome, fonte, identificador original/paramId,
// unidade original e apresentada, altura de referência, tipo temporal,
// resolução, transformações, disponibilidade, regra de valores ausentes,
// escala e legenda.

import { kelvinToCelsius, metersToMm, msToKmh, windSpeedKmhFromComponents } from './units.js';

// Escalas por variável: intervalos fixos + rótulos (não usar apenas cor).
export const SCALES = {
    temperature: {
        stops: [
            { value: -5, color: '#4c6ef5' }, { value: 0, color: '#4dabf7' },
            { value: 5, color: '#66d9e8' }, { value: 10, color: '#8ce99a' },
            { value: 15, color: '#ffe066' }, { value: 20, color: '#ffc078' },
            { value: 25, color: '#ff8787' }, { value: 30, color: '#f03e3e' },
            { value: 35, color: '#c92a2a' }
        ], unit: '°C'
    },
    wind: {
        stops: [
            { value: 0, color: '#d0f4de' }, { value: 10, color: '#a9e34b' },
            { value: 20, color: '#ffd43b' }, { value: 30, color: '#ff922b' },
            { value: 45, color: '#fa5252' }, { value: 60, color: '#e64980' },
            { value: 80, color: '#862e9c' }
        ], unit: 'km/h'
    },
    gust: {
        stops: [
            { value: 0, color: '#d0f4de' }, { value: 20, color: '#a9e34b' },
            { value: 40, color: '#ffd43b' }, { value: 60, color: '#ff922b' },
            { value: 80, color: '#fa5252' }, { value: 100, color: '#e64980' },
            { value: 120, color: '#862e9c' }
        ], unit: 'km/h'
    },
    precipitation: {
        stops: [
            { value: 0, color: '#ffffff' }, { value: 0.1, color: '#a5d8ff' },
            { value: 1, color: '#74c0fc' }, { value: 5, color: '#4dabf7' },
            { value: 10, color: '#3b5bdb' }, { value: 20, color: '#364fc7' }
        ], unit: 'mm'
    }
};

// Produtos candidatos validados no bucket ecmwf-forecasts (AWS, eu-central-1):
// 2t (paramId 167), 10u (165), 10v (166), tp (228) disponíveis nos passos
// 3 h até 72 h. Rajada a 10 m e extremos de temperatura NÃO constam do
// subconjunto publicado no AWS (validado por tentativa de obtenção e pela
// documentação do ecmwf-opendata).
export const VARIABLE_CATALOG = {
    temperature: {
        displayName: 'Temperatura a 2 m',
        source: 'ECMWF Open Data (AWS) — IFS oper 0.25°',
        sourceId: 'ecmwf-aws-oper',
        originalIdentifier: '2t',
        paramId: 167,
        originalUnit: 'K',
        displayUnit: '°C',
        height: '2 m above ground',
        temporalType: 'instantâneo',
        spatialResolution: '0.25°',
        temporalResolution: '3 h até 72 h (validado por execução)',
        transform: (v) => kelvinToCelsius(v),
        missingValueRule: 'null é apresentado como indisponível, nunca como 0',
        scale: SCALES.temperature
    },
    windSpeed: {
        displayName: 'Velocidade do vento a 10 m',
        source: 'ECMWF Open Data (AWS) — IFS oper 0.25°',
        sourceId: 'ecmwf-aws-oper',
        originalIdentifier: '10u, 10v',
        paramId: { u: 165, v: 166 },
        originalUnit: 'm/s (componentes)',
        displayUnit: 'km/h',
        height: '10 m above ground',
        temporalType: 'instantâneo',
        spatialResolution: '0.25°',
        temporalResolution: '3 h até 72 h',
        transform: (u, v) => windSpeedKmhFromComponents(u, v),
        missingValueRule: 'null é apresentado como indisponível, nunca como 0',
        scale: SCALES.wind
    },
    precipitation: {
        displayName: 'Precipitação no intervalo',
        source: 'ECMWF Open Data (AWS) — IFS oper 0.25°',
        sourceId: 'ecmwf-aws-oper',
        originalIdentifier: 'tp',
        paramId: 228,
        originalUnit: 'm de água equivalente',
        displayUnit: 'mm',
        height: 'superfície (acumulado desde a execução)',
        temporalType: 'acumulado desde a execução; incremento por diferença entre passos',
        spatialResolution: '0.25°',
        temporalResolution: '3 h até 72 h',
        transform: (v) => metersToMm(v),
        missingValueRule: 'null é apresentado como indisponível, nunca como 0',
        scale: SCALES.precipitation
    },
    gust: {
        displayName: 'Rajada de vento a 10 m',
        source: 'Indisponível no produto AWS (IFS oper publicado)',
        sourceId: null,
        originalIdentifier: null,
        paramId: null,
        originalUnit: null,
        displayUnit: 'km/h',
        height: '10 m above ground',
        temporalType: 'máximo do intervalo estatístico',
        temporalResolution: null,
        spatialResolution: null,
        transform: null,
        missingValueRule: 'Indisponibilidade apresentada explicitamente',
        scale: SCALES.gust,
        status: 'unavailable',
        fallback: {
            source: 'Open-Meteo (fonte secundária identificada)',
            variable: 'wind_gusts_10m',
            unit: 'km/h (API devolve km/h por defeito; pedido com wind_speed_unit=kmh)',
            note: 'Rajada máxima na hora; não comparável diretamente com máximos de 3/6 h'
        }
    }
};

export function getVariable(key) {
    return VARIABLE_CATALOG[key] || null;
}

export function legendStops(scaleKey) {
    return SCALES[scaleKey]?.stops || [];
}

export { msToKmh };
