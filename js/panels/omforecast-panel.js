// ===== Widget "Previsao Open-Meteo" (independente do estado atual) =====
// Contem apenas previsao Open-Meteo: local, validade, fonte, selecao de
// variaveis, previsao horaria/diaria em tabela compacta. Fechar nao apaga
// local, filtros ou variaveis; nao altera camadas nem a linha temporal.

import { Helpers } from '../config.js';
import { normalizeWindSpeed } from '../meteo/units.js';

const OM_FORECAST_BASE = 'https://' + 'api.open-meteo.com' + '/v1/forecast';

const OpenMeteoForecastPanel = (function() {
    'use strict';

    let currentLocation = null;
    let selectedVariable = 'temperature';
    let inFlight = null;
    let dataCache = new Map();
    const CACHE_TTL = 15 * 60 * 1000;

    const els = () => ({
        loading: document.getElementById('omf-loading'),
        error: document.getElementById('omf-error'),
        errorMessage: document.getElementById('omf-error-message'),
        retry: document.getElementById('omf-retry'),
        variable: document.getElementById('omf-variable'),
        location: document.getElementById('omf-location'),
        updated: document.getElementById('omf-updated'),
        hourly: document.getElementById('omf-hourly-table'),
        daily: document.getElementById('omf-daily-table')
    });

    const VAR_DEFS = {
        temperature: { hourly: 'temperature_2m', daily: 'temperature_2m_max,temperature_2m_min', unit: '\u00b0C' },
        wind: { hourly: 'wind_speed_10m,wind_gusts_10m', daily: 'wind_speed_10m_max,wind_gusts_10m_max', unit: 'km/h' },
        precipitation: { hourly: 'precipitation,precipitation_probability', daily: 'precipitation_sum', unit: 'mm' }
    };

    function init() {
        const e = els();
        e.variable?.addEventListener('change', () => {
            selectedVariable = e.variable.value;
            load();
        });
        e.retry?.addEventListener('click', load);
    }

    function setLocation(lat, lng, name) {
        currentLocation = { lat, lng, name: name || null };
        load();
    }

    async function fetchForecast() {
        const key = currentLocation.lat.toFixed(3) + ',' + currentLocation.lng.toFixed(3) + ',' + selectedVariable;
        const now = Date.now();
        const cached = dataCache.get(key);
        if (cached && (now - cached.timestamp) < CACHE_TTL) return cached.data;

        const v = VAR_DEFS[selectedVariable];
        const params = new URLSearchParams({
            latitude: String(currentLocation.lat),
            longitude: String(currentLocation.lng),
            hourly: v.hourly,
            daily: v.daily + ',weather_code',
            forecast_days: '7',
            timezone: 'Europe/Lisbon',
            wind_speed_unit: 'kmh',
            temperature_unit: 'celsius',
            precipitation_unit: 'mm'
        });
        const res = await fetch(OM_FORECAST_BASE + '?' + params);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        dataCache.set(key, { data, timestamp: now });
        return data;
    }

    async function load() {
        const e = els();
        if (!currentLocation) return;
        if (inFlight) inFlight.abort();
        inFlight = new AbortController();

        e.error?.setAttribute('hidden', '');
        e.loading?.removeAttribute('hidden');

        try {
            const data = await fetchForecast();
            e.loading?.setAttribute('hidden', '');
            render(data);
        } catch (err) {
            if (err.name === 'AbortError') return;
            e.loading?.setAttribute('hidden', '');
            e.error?.removeAttribute('hidden');
            if (e.errorMessage) e.errorMessage.textContent = 'Falha ao obter previsao Open-Meteo: ' + err.message;
        }
    }

    function render(data) {
        const e = els();
        const tz = data.timezone || 'Europe/Lisbon';
        if (e.location) {
            e.location.textContent = (currentLocation.name ||
                currentLocation.lat.toFixed(3) + ', ' + currentLocation.lng.toFixed(3)) +
                ' \u00b7 Valido a partir de ' + new Date().toLocaleString('pt-PT', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        }
        if (e.updated) {
            e.updated.textContent = 'Fonte: Open-Meteo (previsao \u2014 nao e observacao)';
        }

        if (e.hourly) {
            e.hourly.innerHTML = '';
            const scroll = document.createElement('div');
            scroll.className = 'hourly-scroll';
            const times = (data.hourly && data.hourly.time) || [];
            const nowStr = new Date().toISOString().slice(0, 13);
            let start = Math.max(0, times.findIndex(t => t.slice(0, 13) >= nowStr));
            const v = VAR_DEFS[selectedVariable];
            const fields = v.hourly.split(',');
            for (let i = start; i < Math.min(start + 12, times.length); i++) {
                const item = document.createElement('div');
                item.className = 'hourly-item';
                let html = '<div class="hourly-time">' + (data.hourly.time[i] || '').slice(11, 16) + '</div>';
                for (const f of fields) {
                    const vals = data.hourly[f] || [];
                    const val = vals[i];
                    if (val == null) {
                        html += '<div class="hourly-detail">--</div>';
                    } else if (f.indexOf('wind') >= 0) {
                        html += '<div class="hourly-detail">' + Math.round(normalizeWindSpeed(val, 'kmh')) + ' km/h</div>';
                    } else if (f.indexOf('probability') >= 0) {
                        html += '<div class="hourly-detail">' + Math.round(val) + '%</div>';
                    } else {
                        html += '<div class="hourly-detail">' + (Math.round(val * 10) / 10) + '</div>';
                    }
                }
                item.innerHTML = html;
                scroll.appendChild(item);
            }
            e.hourly.appendChild(scroll);
        }

        if (e.daily) {
            e.daily.innerHTML = '';
            const scroll = document.createElement('div');
            scroll.className = 'daily-scroll';
            const times = (data.daily && data.daily.time) || [];
            const v = VAR_DEFS[selectedVariable];
            const fields = v.daily.split(',');
            for (let i = 0; i < times.length; i++) {
                const item = document.createElement('div');
                item.className = 'daily-item';
                let html = '<div class="hourly-time">' + times[i].slice(8) + '/' + times[i].slice(5, 7) + '</div>';
                for (const f of fields) {
                    const vals = data.daily[f] || [];
                    if (vals[i] == null) { html += '<div class="era5-detail">--</div>'; continue; }
                    if (f.indexOf('wind') >= 0) html += '<div class="era5-detail">' + Math.round(normalizeWindSpeed(vals[i], 'kmh')) + ' km/h</div>';
                    else html += '<div class="era5-detail">' + (Math.round(vals[i] * 10) / 10) + ' ' + v.unit + '</div>';
                }
                const code = data.daily.weather_code && data.daily.weather_code[i];
                const desc = code != null ? Helpers.getWeatherDescription(code) : '';
                if (desc) html += '<div class="era5-detail omf-desc">' + desc + '</div>';
                item.innerHTML = html;
                scroll.appendChild(item);
            }
            e.daily.appendChild(scroll);
        }
    }

    return { init, setLocation, load };
})();

window.OpenMeteoForecastPanel = OpenMeteoForecastPanel;
export default OpenMeteoForecastPanel;
