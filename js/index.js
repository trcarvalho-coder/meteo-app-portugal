// ===== Inicializacao da aplicacao =====
import { Config } from './config.js';
import MapModule from './map.js';
import './ipma-api.js';
import './openmeteo-api.js';
import './app.js';
import Rail from './rail.js';
import LocationPanel from './panels/location-panel.js';
import OpenMeteoPanel from './panels/openmeteo-panel.js';
import OpenMeteoForecastPanel from './panels/omforecast-panel.js';
import IPMAPanel from './panels/ipma-panel.js';
import ERA5Panel from './panels/era5-panel.js';
import ECMWFPanel from './panels/ecmwf-panel.js';
import IpmaLayers, { attachWarningsHover } from './meteo/ipma-layers.js';
import IpmaPopup from './meteo/ipma-popup.js';
import IpmaApi from './meteo/ipma-api.js';
import { formatNumber } from './format.js';

window.IpmaLayers = IpmaLayers;

document.addEventListener('DOMContentLoaded', async () => {
    window.MapModule = MapModule;

    const mapResult = await MapModule.init();

    // rail de botoes compactos; paineis com init lazy na primeira abertura
    Rail.init({
        openmeteo: () => OpenMeteoPanel.init(),
        omforecast: () => OpenMeteoForecastPanel.init(),
        ecmwf: () => { if (mapResult) ECMWFPanel.init(mapResult.map); },
        ipma: () => IPMAPanel.init(),
        stations: () => updateStationsStatus(),
        era5: () => ERA5Panel.init(),
        location: () => LocationPanel.init(MapModule)
    });

    // camadas IPMA (avisos + estacoes), visiveis por defeito
    if (mapResult) {
        const _view = MapModule.getView();
        await IpmaLayers.init(mapResult.map, _view);
        if (_view) attachWarningsHover(_view);
        updateStationsStatus();

        // ===== Handler de clique UNICO e coordenado =====
        // Prioridade: 1) estacao IPMA (hitTest) 2) modo selecao (map.js)
        //             3) popup IPMA + amostra ECMWF
        const view = MapModule.getView();
        if (view) {
            view.on('click', async (event) => {
                // 1) estacao IPMA: dar prioridade ao evento da estacao
                try {
                    const hit = await view.hitTest(event);
                    const stationGraphic = hit.results
                        .map(r => r.graphic)
                        .find(g => g && g.attributes && g.attributes.stationId);
                    if (stationGraphic) {
                        const a = stationGraphic.attributes;
                        const obs = IpmaLayers.getState().byStation.get(a.stationId);
                        let content = `<div class="ipma-pop-section"><h4>${a.stationName || 'Estação IPMA'}</h4>`;
                        if (obs) {
                            content += `<p class="ipma-pop-meta">Observado às ${obs.time.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (hora da estação)</p>`;
                            content += obs.temperature != null ? `<div class="ipma-pop-row"><span>Temperatura</span><strong>${formatNumber(obs.temperature, 1, '°C')}</strong></div>` : '';
                            content += obs.humidity != null ? `<div class="ipma-pop-row"><span>Humidade</span><strong>${Math.round(obs.humidity)} %</strong></div>` : '';
                            content += obs.windSpeedKmh != null ? `<div class="ipma-pop-row"><span>Vento</span><strong>${formatNumber(obs.windSpeedKmh, 1, 'km/h')}</strong></div>` : '';
                            content += obs.pressure != null ? `<div class="ipma-pop-row"><span>Pressão</span><strong>${Math.round(obs.pressure)} hPa</strong></div>` : '';
                            content += obs.precipitation != null ? `<div class="ipma-pop-row"><span>Precipitação (acumulada)</span><strong>${formatNumber(obs.precipitation, 1, 'mm')}</strong></div>` : '';
                            if (obs.staleObs) content += '<p class="ipma-pop-stale">Observação desatualizada.</p>';
                        } else {
                            content += '<p class="ipma-pop-na">Sem observação disponível.</p>';
                        }
                        // previsao da localidade oficial adequada (identificada como previsao, nao medicao)
                        try {
                            const { locations } = await IpmaApi.loadLocations();
                            const fl = IpmaApi.findForecastLocation({ lat: event.mapPoint.latitude, lng: event.mapPoint.longitude }, locations);
                            if (fl) {
                                const fc = await IpmaApi.loadDailyForecast(fl.location.globalIdLocal);
                                const days36 = IpmaApi.forecastDaysWithin(fc.days, new Date(), 36);
                                content += `</div><div class="ipma-pop-section"><h4>Previsão — IPMA (${fl.location.name})</h4>`;
                                content += '<p class="ipma-pop-label">Previsão diária — detalhe horário indisponível (não é medição da estação)</p><div class="ipma-pop-days">';
                                for (const d of days36) {
                                    content += `<div class="ipma-pop-day"><span class="ipma-pop-date">${d.date.slice(8)}/${d.date.slice(5, 7)}</span><span class="ipma-pop-temps">${d.tMax != null ? Math.round(d.tMax) + '°' : '--'}/${d.tMin != null ? Math.round(d.tMin) + '°' : '--'}</span><span class="ipma-pop-extra">${d.precipProb != null ? Math.round(d.precipProb) + '%' : ''}</span><span class="ipma-pop-extra">${d.windDirection || ''}</span></div>`;
                                }
                                content += '</div>';
                            }
                        } catch (_) { /* previsao da localidade indisponivel */ }
                        content += '<p class="ipma-pop-src">Fonte: IPMA</p></div>';
                        view.popup.open({
                            title: a.stationName || 'Estação IPMA',
                            location: event.mapPoint,
                            content
                        });
                        return; // prioridade a estacao: nao abre segunda popup
                    }
                } catch (_) { /* hitTest indisponivel */ }

                // 2) modo selecao ativo: o handler do map.js trata; nao abrir popup
                if (MapModule.isSelectionMode && MapModule.isSelectionMode()) return;

                // 3) popup IPMA (observacao + previsao + avisos) com amostra ECMWF
                const point = {
                    lat: event.mapPoint.latitude,
                    lng: event.mapPoint.longitude
                };
                try {
                    const popup = await IpmaPopup.buildPopupContent(point);
                    // acrescentar amostra da camada ECMWF ativa, se existir
                    let extra = '';
                    const sample = window.ECMWFPanel && window.ECMWFPanel.sampleAtPoint
                        ? window.ECMWFPanel.sampleAtPoint(point.lat, point.lng) : null;
                    if (sample && sample.value != null) {
                        extra = `<div class="ipma-pop-section"><h4>ECMWF (camada ativa)</h4>` +
                            `<div class="ipma-pop-row"><span>${sample.meta.displayName}</span><strong>${sample.value} ${sample.field.unit}</strong></div>` +
                            `<p class="ipma-pop-src">${sample.field.source} · Execução ${sample.field.run} · Validade ${sample.field.validTimeUtc} · célula nativa 0.25°</p></div>`;
                    }
                    view.popup.open({
                        title: popup.title,
                        location: event.mapPoint,
                        content: popup.content + extra
                    });
                } catch (err) {
                    console.error('[popup]', err);
                    view.popup.open({
                        title: 'Ponto selecionado',
                        location: event.mapPoint,
                        content: '<p>Sem dados IPMA para este ponto.</p>'
                    });
                }
            });
        }
    }

    let locationChangeTimer = null;
    LocationPanel.setOnLocationChange((location) => {
        if (!location) return;
        if (locationChangeTimer) clearTimeout(locationChangeTimer);
        locationChangeTimer = setTimeout(() => {
            OpenMeteoPanel.updatePanel(location.lat, location.lng);
            OpenMeteoForecastPanel.setLocation(location.lat, location.lng, location.name);
            IPMAPanel.updatePanel(location.lat, location.lng);
            ERA5Panel.setLocation(location.lat, location.lng);
            if (MapModule.isInitialized()) {
                MapModule.centerOnCoordinates(location.lng, location.lat, 12);
                MapModule.addLocationMarker(location.lng, location.lat, location.name || 'Localizacao');
                MapModule.exitMapSelectionMode();
            }
        }, 300);
    });

    const mapSelectBtn = document.getElementById('location-map-select-btn');
    if (mapSelectBtn) {
        mapSelectBtn.addEventListener('click', () => {
            if (typeof MapModule.toggleMapSelectionMode === 'function') {
                MapModule.toggleMapSelectionMode();
            }
        });
    }

    window.AppModule.init();

    const def = Config.app.defaultLocation;
    OpenMeteoPanel.updatePanel(def.lat, def.lng);
    OpenMeteoForecastPanel.setLocation(def.lat, def.lng, def.name);
});

async function updateStationsStatus() {
    const el = document.getElementById('stations-status');
    if (!el) return;
    const state = IpmaLayers.getState();
    const total = state.stations.length;
    const withObs = state.byStation.size;
    el.textContent = total
        ? `${total} estações no catálogo público · ${withObs} com observação recente`
        : 'A carregar catálogo de estações…';
}

export default null;
