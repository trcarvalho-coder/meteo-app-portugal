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
import IpmaLayers from './meteo/ipma-layers.js';
import IpmaPopup from './meteo/ipma-popup.js';
import IpmaApi from './meteo/ipma-api.js';

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
        await IpmaLayers.init(mapResult.map);
        updateStationsStatus();

        // pop-up de selecao com seccoes IPMA (observacao/previsao/avisos)
        const view = MapModule.getView();
        if (view) {
            view.on('click', async (event) => {
                // prioridade ao evento de estacao (evita pop-up duplo)
                if (event.graphics && event.graphics.some(g => g.attributes && g.attributes.stationId)) return;
                const point = {
                    lat: event.mapPoint.latitude,
                    lng: event.mapPoint.longitude
                };
                try {
                    const popup = await IpmaPopup.buildPopupContent(point);
                    view.popup.open({
                        title: popup.title,
                        location: event.mapPoint,
                        content: popup.content
                    });
                } catch (err) {
                    console.error('[popup IPMA]', err);
                    view.popup.open({
                        title: 'Ponto selecionado',
                        location: event.mapPoint,
                        content: '<p>Sem dados IPMA para este ponto.</p>'
                    });
                }
            });
        }
    }

    LocationPanel.setOnLocationChange((location) => {
        if (!location) return;
        OpenMeteoPanel.updatePanel(location.lat, location.lng);
        OpenMeteoForecastPanel.setLocation(location.lat, location.lng, location.name);
        IPMAPanel.updatePanel(location.lat, location.lng);
        ERA5Panel.setLocation(location.lat, location.lng);
        if (MapModule.isInitialized()) {
            MapModule.centerOnCoordinates(location.lng, location.lat, 12);
            MapModule.addLocationMarker(location.lng, location.lat, location.name || 'Localizacao');
            MapModule.exitMapSelectionMode();
        }
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
