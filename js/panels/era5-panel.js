// ===== Widget "ERA5 - Historico" (via Open-Meteo Historical API) =====
// Requisitos: selecao de periodo historico; contexto temporal independente
// da linha temporal de previsao; identificacao clara da fonte (Open-Meteo/ERA5,
// interina ate ARCO-ERA5/BigQuery); sem dados simulados.

import Era5Api from '../meteo/era5-api.js';

const ERA5Panel = (function() {
    'use strict';

    let currentLocation = null;
    let inFlight = null;

    const els = () => ({
        loading: document.getElementById('era5-loading'),
        error: document.getElementById('era5-error'),
        errorMessage: document.getElementById('era5-error-message'),
        retry: document.getElementById('era5-retry'),
        startDate: document.getElementById('era5-start-date'),
        endDate: document.getElementById('era5-end-date'),
        searchBtn: document.getElementById('era5-search-btn'),
        results: document.getElementById('era5-results'),
        source: document.getElementById('era5-source')
    });

    function init() {
        const e = els();
        const today = new Date();
        const end = new Date(today.getFullYear() - 1, 11, 31);
        const start = new Date(today.getFullYear() - 1, 11, 24);
        if (e.startDate) e.startDate.value = toISO(start);
        if (e.endDate) e.endDate.value = toISO(end);

        e.searchBtn?.addEventListener('click', load);
        e.retry?.addEventListener('click', load);
        if (currentLocation) load(); // localizacao definida antes do painel abrir
    }

    function toISO(d) {
        return d.toISOString().slice(0, 10);
    }

    function setLocation(lat, lng, name) {
        currentLocation = { lat, lng, name: name || null };
        load();
    }

    async function load() {
        const e = els();
        if (!currentLocation) return;
        if (!e.startDate && !e.variable && !e.results && !e.hourly) return; // painel ainda nao aberto
        const startDate = e.startDate?.value;
        const endDate = e.endDate?.value;
        if (!startDate || !endDate) return;
        if (startDate > endDate) {
            showError('A data inicial tem de ser anterior ou igual a final.');
            return;
        }

        if (inFlight) inFlight.abort();
        inFlight = new AbortController();

        e.error?.setAttribute('hidden', '');
        e.loading?.removeAttribute('hidden');

        try {
            const data = await Era5Api.loadDailyHistory(
                currentLocation.lat, currentLocation.lng, startDate, endDate,
                { signal: inFlight.signal });
            e.loading?.setAttribute('hidden', '');
            render(data);
        } catch (err) {
            if (err.name === 'AbortError') return;
            e.loading?.setAttribute('hidden', '');
            showError('Falha ao obter historico ERA5: ' + err.message);
        }
    }

    function render(data) {
        const e = els();
        if (e.source) {
            e.source.textContent = data.source +
                ' - Local: ' + data.latitude.toFixed(3) + ', ' + data.longitude.toFixed(3) +
                (data.elevation != null ? ' - Altitude: ' + Math.round(data.elevation) + ' m' : '');
        }
        if (!e.results) return;
        e.results.innerHTML = '';

        if (!data.daily.length) {
            e.results.innerHTML = '<p class="text-center">Sem dados para o periodo solicitado.</p>';
            return;
        }

        const scroll = document.createElement('div');
        scroll.className = 'daily-scroll';

        for (const day of data.daily) {
            const item = document.createElement('div');
            item.className = 'daily-item';
            item.innerHTML =
                '<div class="hourly-time">' + day.date + '</div>' +
                '<div class="hourly-temp">' + (day.meanTemp != null ? Math.round(day.meanTemp) + '&deg;C' : '--') + '</div>' +
                '<div class="era5-minmax">' +
                    '<span class="forecast-max">' + (day.maxTemp != null ? Math.round(day.maxTemp) + '&deg;' : '--') + '</span>' +
                    '<span class="forecast-min">' + (day.minTemp != null ? Math.round(day.minTemp) + '&deg;' : '--') + '</span>' +
                '</div>' +
                '<div class="era5-detail">💧 ' + (day.precipitation != null ? day.precipitation.toFixed(1) + ' mm' : '--') + '</div>' +
                '<div class="era5-detail">🌬️ ' + (day.maxWind != null ? Math.round(day.maxWind) + ' km/h' : '--') + '</div>';
            scroll.appendChild(item);
        }
        e.results.appendChild(scroll);
    }

    function showError(message) {
        const e = els();
        e.loading?.setAttribute('hidden', '');
        e.error?.removeAttribute('hidden');
        if (e.errorMessage) e.errorMessage.textContent = message;
    }

    return { init, setLocation, load };
})();

window.ERA5Panel = ERA5Panel;
export default ERA5Panel;
