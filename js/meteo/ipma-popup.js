// ===== Pop-up de selecao de localizacao: observacao e previsao IPMA =====
// Seccoes claramente separadas e identificadas:
//   A. "Estado atual - observacao IPMA" (estacao, distancia, hora da observacao)
//   B. "Previsao - IPMA" (dias que intersectam as proximas 36 h; diario)
//   C. Avisos IPMA que afetam a area do ponto
// A observacao pertence a estacao (nunca ao ponto clicado); a previsao
// pertence a localidade oficial. Fonte identificada em cada seccao.

import IpmaApi from './ipma-api.js';
import { formatNumber } from '../format.js';

const SELECTED_KEY = '__ipmaSelected';

function timeStr(date) {
    if (!date) return '--';
    return date.toLocaleString('pt-PT', {
        timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

function obsRow(label, value, unit) {
    return value == null ? '' : `<div class="ipma-pop-row"><span>${label}</span><strong>${value}${unit || ''}</strong></div>`;
}

async function buildPopupContent(point) {
    const now = new Date();
    const sections = [];

    // carregar catalogos (cache)
    const [{ stations }, { byStation }, { locations }] = await Promise.all([
        IpmaApi.loadStations(),
        IpmaApi.loadObservations(),
        IpmaApi.loadLocations()
    ]);

    // ===== A. Observacao IPMA =====
    const stationMatch = IpmaApi.findStation(point, stations, byStation, now);
    let obsHtml;
    if (!stationMatch) {
        obsHtml = '<p class="ipma-pop-na">Sem observa&ccedil;&atilde;o IPMA recente nas proximidades.</p>';
    } else {
        const { station, distance, obs } = stationMatch;
        obsHtml = `<p class="ipma-pop-meta">Estação: <strong>${station.name}</strong> (${station.id}) &middot; ${distance.toFixed(1)} km do ponto</p>`;
        if (!obs) {
            obsHtml += '<p class="ipma-pop-na">Estação sem observação disponível.</p>';
        } else {
            if (obs.staleObs) obsHtml += '<p class="ipma-pop-stale">Observação desatualizada.</p>';
            obsHtml += `<p class="ipma-pop-meta">Observado às ${timeStr(obs.time)} (hora da estação)</p>`;
            obsHtml += '<div class="ipma-pop-obs">';
            obsHtml += obsRow('Temperatura', obs.temperature != null ? formatNumber(obs.temperature, 1) : null, ' °C');
            obsHtml += obsRow('Humidade', obs.humidity != null ? Math.round(obs.humidity) : null, ' %');
            obsHtml += obsRow('Vento', obs.windSpeedKmh != null ? formatNumber(obs.windSpeedKmh, 1) : null, ' km/h');
            obsHtml += obsRow('Pressão', obs.pressure != null ? Math.round(obs.pressure) : null, ' hPa');
            obsHtml += obsRow('Precipitação (acumulada)', obs.precipitation != null ? formatNumber(obs.precipitation, 1) : null, ' mm');
            obsHtml += '</div>';
        }
    }
    sections.push('<div class="ipma-pop-section"><h4>Estado atual — observação IPMA</h4>' + obsHtml +
        '<p class="ipma-pop-src">Fonte: IPMA (estação, não o ponto clicado)</p></div>');

    // ===== B. Previsao IPMA =====
    const fcMatch = IpmaApi.findForecastLocation(point, locations);
    let fcHtml;
    if (!fcMatch) {
        fcHtml = '<p class="ipma-pop-na">Sem localidade de previsão IPMA nas proximidades (fora da cobertura).</p>';
    } else {
        const { location, distance } = fcMatch;
        const fc = await IpmaApi.loadDailyForecast(location.globalIdLocal);
        const days36 = IpmaApi.forecastDaysWithin(fc.days, now, 36);
        fcHtml = `<p class="ipma-pop-meta">Localidade: <strong>${location.name}</strong> &middot; ${distance.toFixed(1)} km do ponto</p>`;
        if (!days36.length) {
            fcHtml += '<p class="ipma-pop-na">Previsão indisponível para as próximas 36 horas.</p>';
        } else {
            fcHtml += '<p class="ipma-pop-label">Previsão diária — detalhe horário indisponível (próximas ~36 h)</p>';
            fcHtml += '<div class="ipma-pop-days">';
            for (const d of days36) {
                fcHtml += `<div class="ipma-pop-day">
                    <span class="ipma-pop-date">${d.date.slice(8)}/${d.date.slice(5, 7)}</span>
                    <span class="ipma-pop-temps">${d.tMax != null ? Math.round(d.tMax) + '°' : '--'}/${d.tMin != null ? Math.round(d.tMin) + '°' : '--'}</span>
                    <span class="ipma-pop-extra">${d.precipProb != null ? Math.round(d.precipProb) + '% chuva' : ''}</span>
                    <span class="ipma-pop-extra">${d.windDirection || ''} ${d.windClass != null ? 'vento cl.' + d.windClass : ''}</span>
                </div>`;
            }
            fcHtml += '</div>';
        }
        fcHtml += `<p class="ipma-pop-src">Fonte: IPMA — previsão diária (não é medição da estação)</p>`;
    }
    sections.push('<div class="ipma-pop-section"><h4>Previsão — IPMA</h4>' + fcHtml + '</div>');

    // ===== C. Avisos IPMA na area =====
    const { warnings } = await IpmaApi.loadWarnings();
    const areaId = fcMatch ? fcMatch.location.areaId : null;
    const pointWarnings = areaId ? warnings.filter(w => w.areaId === areaId) : [];
    let warnHtml;
    if (!pointWarnings.length) {
        warnHtml = '<p class="ipma-pop-na">Sem avisos IPMA ativos para esta área.</p>';
    } else {
        warnHtml = '';
        for (const w of pointWarnings) {
            warnHtml += `<div class="ipma-pop-warning level-${w.level}">
                <strong>${w.phenomenon}</strong> — nível ${w.levelName}
                <div class="ipma-pop-meta">${w.active ? 'Em vigor' : 'Previsto'}: ${timeStr(w.start)} → ${timeStr(w.end)}</div>
                ${w.text ? `<div class="ipma-pop-wtext">${w.text}</div>` : ''}
            </div>`;
        }
    }
    sections.push('<div class="ipma-pop-section"><h4>Avisos IPMA</h4>' + warnHtml + '</div>');

    return {
        title: point.name || `Ponto selecionado (${point.lat.toFixed(3)}, ${point.lng.toFixed(3)})`,
        content: sections.join('')
    };
}

export default { buildPopupContent };
