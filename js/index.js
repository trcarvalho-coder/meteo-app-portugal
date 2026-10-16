// ===== Inicialização da aplicação =====
import { Config } from './config.js';
import MapModule from './map.js';
import './ipma-api.js';
import './openmeteo-api.js';
import './app.js';
import Widgets from './widgets.js';
import LocationPanel from './panels/location-panel.js';
import OpenMeteoPanel from './panels/openmeteo-panel.js';
import IPMAPanel from './panels/ipma-panel.js';
import ECMWFPanel from './panels/ecmwf-panel.js';

document.addEventListener('DOMContentLoaded', async () => {
    window.MapModule = MapModule;

    const mapResult = await MapModule.init();
    Widgets.init();

    LocationPanel.init(MapModule);
    OpenMeteoPanel.init();
    IPMAPanel.init();
    if (mapResult) {
        ECMWFPanel.init(mapResult.map);
    }

    LocationPanel.setOnLocationChange((location) => {
        if (!location) return;
        OpenMeteoPanel.updatePanel(location.lat, location.lng);
        IPMAPanel.updatePanel(location.lat, location.lng);
        if (MapModule.isInitialized()) {
            MapModule.centerOnCoordinates(location.lng, location.lat, 12);
            MapModule.addLocationMarker(location.lng, location.lat, location.name || 'Localização');
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

    const defaultLocation = Config.app.defaultLocation;
    OpenMeteoPanel.updatePanel(defaultLocation.lat, defaultLocation.lng);
    IPMAPanel.updatePanel(defaultLocation.lat, defaultLocation.lng);
});

export default null;
