// ===== Camada central de normalização de unidades =====
// Único ponto do frontend onde ocorrem conversões de unidades.
// Regras:
// - Pedir explicitamente unidades à API quando o endpoint o permitir.
// - Normalizar uma única vez, aqui.
// - Nunca converter valores já na unidade apresentada.
// - Distinguir null/undefined (indisponível) de 0 (valor zero real).

export const MS_TO_KMH = 3.6;
export const K_TO_C_OFFSET = 273.15;
export const M_TO_MM = 1000;

/**
 * Converte m/s para km/h. Devolve null se o valor for null/undefined.
 */
export function msToKmh(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Number(value) * MS_TO_KMH;
}

/**
 * Converte Kelvin para Celsius. Devolve null se o valor for null/undefined.
 */
export function kelvinToCelsius(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Number(value) - K_TO_C_OFFSET;
}

/**
 * Converte metros de água equivalente para milímetros. Devolve null se o valor for null/undefined.
 */
export function metersToMm(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Number(value) * M_TO_MM;
}

/**
 * Velocidade do vento a 10 m a partir das componentes u/v (em m/s), em km/h.
 * As componentes têm de pertencer à mesma grelha, modelo, execução e instante.
 */
export function windSpeedKmhFromComponents(u, v) {
    if (u == null || v == null) return null;
    return Math.hypot(Number(u), Number(v)) * MS_TO_KMH;
}

/**
 * Normaliza velocidade do vento para km/h a partir de um valor com unidade declarada.
 * "kmh" já está na unidade apresentada: devolve sem nova conversão.
 */
export function normalizeWindSpeed(value, unit) {
    if (value == null || Number.isNaN(Number(value))) return null;
    switch (unit) {
        case 'kmh':
            return Number(value);
        case 'ms':
            return msToKmh(value);
        case 'kn':
            return Number(value) * 1.852;
        case 'mph':
            return Number(value) * 1.609344;
        default:
            throw new Error(`Unidade de vento desconhecida: ${unit}`);
    }
}

/**
 * Normaliza temperatura para °C a partir de um valor com unidade declarada.
 */
export function normalizeTemperature(value, unit) {
    if (value == null || Number.isNaN(Number(value))) return null;
    switch (unit) {
        case 'c':
        case 'celsius':
            return Number(value);
        case 'k':
        case 'kelvin':
            return kelvinToCelsius(value);
        case 'f':
        case 'fahrenheit':
            return (Number(value) - 32) / 1.8;
        default:
            throw new Error(`Unidade de temperatura desconhecida: ${unit}`);
    }
}

/**
 * Normaliza precipitação para mm a partir de um valor com unidade declarada.
 */
export function normalizePrecipitation(value, unit) {
    if (value == null || Number.isNaN(Number(value))) return null;
    switch (unit) {
        case 'mm':
            return Number(value);
        case 'm':
            return metersToMm(value);
        case 'inch':
            return Number(value) * 25.4;
        default:
            throw new Error(`Unidade de precipitação desconhecida: ${unit}`);
    }
}

/**
 * Direção do vento em graus a partir das componentes u/v.
 * u = zonal (positivo para este), v = meridional (positivo para norte).
 */
export function windDirectionFromComponents(u, v) {
    if (u == null || v == null) return null;
    return (Math.atan2(Number(u), Number(v)) * 180 / Math.PI + 360) % 360;
}

/**
 * Incremento de precipitação entre dois acumulados (mesma execução).
 * Diferenças ligeiramente negativas dentro da tolerância são fixadas a 0.
 */
export function precipitationIncrement(previousAccum, currentAccum, tolerance = 1e-9) {
    if (previousAccum == null || currentAccum == null) return null;
    const diff = Number(currentAccum) - Number(previousAccum);
    if (diff < -tolerance) return null;
    return Math.max(0, diff);
}
