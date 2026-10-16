// ===== Formatação partilhada de valores meteorológicos =====
// Aceita number ou string; null/undefined/NaN ou sentinela -99 devolvem
// "Indisponível" — valor nulo nunca é apresentado como 0.

export const UNAVAILABLE = 'Indisponível';

export function isValidNumber(value) {
    if (value === null || value === undefined) return false;
    const n = Number(value);
    return !Number.isNaN(n) && n !== -99;
}

export function formatNumber(value, decimals = 1, unit = '') {
    if (!isValidNumber(value)) return UNAVAILABLE;
    const n = Number(value);
    return `${n.toFixed(decimals)}${unit ? ' ' + unit : ''}`;
}

export function formatProbability(value) {
    if (!isValidNumber(value)) return UNAVAILABLE;
    const n = Number(value);
    return `${n.toFixed(1)} %`;
}
