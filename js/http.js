// ===== Fetch com retry para APIs meteorológicas =====
// Retry com backoff exponencial e jitter para 429 e 5xx (máx. 3 tentativas);
// respeita o cabeçalho Retry-After quando presente. Nunca repete AbortError.

export const MAX_RETRIES = 3;

export async function fetchWithRetry(url, { signal } = {}, attempt = 0) {
    let response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw error;
    }
    if (response.ok) return response.json();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10);
        const base = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(8000, 500 * 2 ** attempt);
        await new Promise(r => setTimeout(r, base * (0.75 + Math.random() * 0.5)));
        return fetchWithRetry(url, { signal }, attempt + 1);
    }
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
}

export function cacheKeyOf(prefix, latitude, longitude) {
    return `${prefix}-${latitude.toFixed(2)}-${longitude.toFixed(2)}`;
}
