// ===== Orquestrador da aplicação =====
// O painel esquerdo foi removido; toda a apresentação vive nos widgets da
// direita (openmeteo-panel, ipma-panel, location-panel, ecmwf-panel, om-layers-panel).

import { Config, Helpers } from './config.js';
import MapModule from './map.js';
import IPMAModule from './ipma-api.js';
import OpenMeteoModule from './openmeteo-api.js';

const AppModule = (function() {
    'use strict';

    let currentLocation = Config.app.defaultLocation;
    let periodicUpdateInterval = null;

    async function init() {
        try {
            Helpers.log('🚀 Inicializando aplicação…');

            // o mapa e inicializado por index.js; reutilizar sem recriar a view
            if (!MapModule.isInitialized || !MapModule.isInitialized()) {
                const mapResult = await MapModule.init();
                if (!mapResult) {
                    Helpers.showError('Falha ao inicializar mapa');
                    return;
                }
            }

            setupEventListeners();
            await loadAlerts();
            startPeriodicUpdates();
        } catch (error) {
            Helpers.showError('Falha ao inicializar aplicação', error);
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.basemap-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                MapModule.changeBasemap(btn.dataset.basemap);
            });
        });
    }

    async function loadAlerts() {
        try {
            const alerts = await IPMAModule.loadAlerts();
            if (alerts) {
                window.MapModule.addAlertsToMap(alerts);
                const activeAlerts = alerts.filter(a => a.level >= 2).length;
                const badgeEl = document.getElementById('rail-alerts-badge');
                if (badgeEl) {
                    badgeEl.textContent = activeAlerts > 0 ? activeAlerts : '';
                    if (activeAlerts > 0) badgeEl.removeAttribute('hidden');
                    else badgeEl.setAttribute('hidden', '');
                }
            }
        } catch (error) {
            Helpers.showError('Falha ao carregar alertas', error);
        }
    }

    async function updateWeatherData(latitude, longitude) {
        try {
            currentLocation = { lat: latitude, lng: longitude };
            const currentConditions = await OpenMeteoModule.loadCurrentConditions(latitude, longitude);
            if (currentConditions) {
                window.MapModule.addWeatherData(longitude, latitude, currentConditions);
            }
        } catch (error) {
            Helpers.showError('Falha ao atualizar dados meteorológicos', error);
        }
    }

    function startPeriodicUpdates() {
        if (periodicUpdateInterval) clearInterval(periodicUpdateInterval);
        periodicUpdateInterval = setInterval(async () => {
            if (currentLocation) {
                await updateWeatherData(currentLocation.lat, currentLocation.lng);
                await loadAlerts();
            }
        }, Config.app.updateInterval);
    }

    return {
        init,
        updateWeatherData,
        loadAlerts,
        getCurrentLocation: () => currentLocation
    };
})();

window.AppModule = AppModule;
export default AppModule;
