// ===== Main Application Module =====
import { Config, Helpers } from './config.js';
import MapModule from './map.js';
import IPMAModule from './ipma-api.js';
import OpenMeteoModule from './openmeteo-api.js';

const AppModule = (function() {
    'use strict';

    let currentLocation = Config.app.defaultLocation;
    let currentWeatherData = null;
    let currentForecastData = null;
    let currentAlertsData = [];
    let activePanel = 'current';
    let periodicUpdateInterval = null;

    async function init() {
        try {
            Helpers.log('🚀 Inicializando aplicação...');

            const ipmaConnected = await IPMAModule.testIPMAConnection();
            if (!ipmaConnected) {
                alert('⚠️ Não foi possível conectar à API do IPMA. A aplicação pode não funcionar corretamente.');
            }

            const mapResult = MapModule.init();
            if (!mapResult) {
                Helpers.showError('Falha ao inicializar mapa');
                return;
            }

            setupEventListeners();
            await loadInitialData();
            startPeriodicUpdates();

            Helpers.log('✅ Aplicação inicializada com sucesso!');
        } catch (error) {
            Helpers.showError('Falha ao inicializar aplicação', error);
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelId = btn.dataset.panel;
                switchPanel(panelId);
            });
        });

        document.querySelectorAll('.basemap-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                MapModule.changeBasemap(btn.dataset.basemap);
            });
        });

        const searchBtn = document.getElementById('search-btn');
        const locationSearch = document.getElementById('location-search');

        if (searchBtn && locationSearch) {
            searchBtn.addEventListener('click', () => {
                searchLocation(locationSearch.value);
            });

            locationSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    searchLocation(locationSearch.value);
                }
            });
        }

        const gpsBtn = document.getElementById('btn-gps');
        if (gpsBtn) {
            gpsBtn.addEventListener('click', () => {
                MapModule.getCurrentLocation();
            });
        }

        const mapSelectBtn = document.getElementById('btn-map-select');
        if (mapSelectBtn) {
            mapSelectBtn.addEventListener('click', () => {
                MapModule.toggleMapSelectionMode();
            });
        }

        const alertDistrict = document.getElementById('alert-district');
        if (alertDistrict) {
            alertDistrict.addEventListener('change', filterAlerts);
        }

        const forecastDays = document.getElementById('forecast-days');
        if (forecastDays) {
            forecastDays.addEventListener('change', loadForecastData);
        }
    }

    async function loadInitialData() {
        try {
            Helpers.log('📥 Carregando dados iniciais...');

            await updateWeatherData(currentLocation.lat, currentLocation.lng);

            await loadAlerts();

            populateDistrictDropdown();

            Helpers.log('✅ Dados iniciais carregados!');
        } catch (error) {
            Helpers.showError('Falha ao carregar dados iniciais', error);
        }
    }

    async function loadAlerts() {
        try {
            Helpers.log('Carregando alertas do IPMA...');
            const alerts = await IPMAModule.loadAlerts();

            if (alerts) {
                currentAlertsData = alerts;
                displayAlerts(alerts);
                MapModule.addAlertsToMap(alerts);

                const activeAlerts = alerts.filter(a => a.level >= 2).length;
                const badgeEl = document.getElementById('alerts-badge');
                if (badgeEl) {
                    badgeEl.textContent = activeAlerts > 0 ? activeAlerts : '';
                    badgeEl.style.display = activeAlerts > 0 ? 'inline' : 'none';
                }
            }
        } catch (error) {
            Helpers.showError('Falha ao carregar alertas', error);
        }
    }

    async function updateWeatherData(latitude, longitude) {
        try {
            currentLocation = { lat: latitude, lng: longitude, name: 'Localização' };

            const currentConditions = await OpenMeteoModule.loadCurrentConditions(latitude, longitude);

            if (currentConditions) {
                currentWeatherData = currentConditions;
                displayCurrentConditions(currentConditions);
                MapModule.addWeatherData(longitude, latitude, currentConditions);
                MapModule.centerOnCoordinates(longitude, latitude, 12);
            }

            await loadForecastData();
        } catch (error) {
            Helpers.showError('Falha ao atualizar dados meteorológicos', error);
        }
    }

    async function loadForecastData() {
        try {
            const days = parseInt(document.getElementById('forecast-days')?.value) || 3;
            const forecast = await OpenMeteoModule.loadDailyForecast(
                currentLocation.lat,
                currentLocation.lng,
                days
            );

            if (forecast) {
                currentForecastData = forecast;
                displayForecast(forecast);
            }
        } catch (error) {
            Helpers.showError('Falha ao carregar previsão', error);
        }
    }

    function switchPanel(panelId) {
        document.querySelectorAll('.info-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        const targetPanel = document.getElementById(`panel-${panelId}`);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }

        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panel === panelId);
        });

        activePanel = panelId;

        if (panelId === 'alerts') {
            loadAlerts();
        } else if (panelId === 'forecast') {
            loadForecastData();
        } else if (panelId === 'location') {
            MapModule.updateLocationInfo();
        } else if (panelId === 'current' && currentLocation) {
            updateWeatherData(currentLocation.lat, currentLocation.lng);
        }
    }

    async function searchLocation(query) {
        try {
            const trimmedQuery = (query || '').trim();
            if (!trimmedQuery) {
                alert('⚠️ Introduza uma localização ou coordenadas.');
                return;
            }

            const locations = [
                { name: 'Lisboa', lat: 38.7223, lng: -9.1393 },
                { name: 'Porto', lat: 41.1496, lng: -8.6110 },
                { name: 'Braga', lat: 41.5501, lng: -8.4200 },
                { name: 'Coimbra', lat: 40.2111, lng: -8.4291 },
                { name: 'Faro', lat: 37.0194, lng: -7.9309 },
                { name: 'Évora', lat: 38.5742, lng: -7.9126 },
                { name: 'Aveiro', lat: 40.6405, lng: -8.6538 },
                { name: 'Viseu', lat: 40.6588, lng: -7.9141 },
                { name: 'Guarda', lat: 40.5370, lng: -7.2671 },
                { name: 'Beja', lat: 38.0153, lng: -7.8632 },
                { name: 'Setúbal', lat: 38.5244, lng: -8.8882 },
                { name: 'Leiria', lat: 39.7445, lng: -8.8051 },
                { name: 'Castelo Branco', lat: 39.8222, lng: -7.4914 },
                { name: 'Portalegre', lat: 39.2966, lng: -7.4306 },
                { name: 'Viana do Castelo', lat: 41.6945, lng: -8.8308 },
                { name: 'Vila Real', lat: 41.3010, lng: -7.7503 }
            ];

            const location = locations.find(loc =>
                loc.name.toLowerCase().includes(trimmedQuery.toLowerCase())
            );

            if (location) {
                await updateWeatherData(location.lat, location.lng);
                const locationSearch = document.getElementById('location-search');
                if (locationSearch) locationSearch.value = location.name;
            } else {
                const coords = trimmedQuery.split(',').map(s => parseFloat(s.trim()));
                if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                    await updateWeatherData(coords[0], coords[1]);
                    const locationSearch = document.getElementById('location-search');
                    if (locationSearch) locationSearch.value = '';
                } else {
                    alert('⚠️ Localização não encontrada. Tente um nome de cidade ou coordenadas (lat, lng).');
                }
            }
        } catch (error) {
            Helpers.showError('Falha ao pesquisar localização', error);
        }
    }

    function displayCurrentConditions(conditions) {
        const tempEl = document.getElementById('current-temp');
        const descEl = document.getElementById('current-desc');
        const humidityEl = document.getElementById('current-humidity');
        const windEl = document.getElementById('current-wind');
        const directionEl = document.getElementById('current-direction');
        const precipEl = document.getElementById('current-precip');
        const iconEl = document.getElementById('current-weather-icon');

        if (tempEl) tempEl.textContent = Math.round(conditions.temperature || 0);
        if (descEl) descEl.textContent = conditions.weatherDescription || 'Desconhecido';
        if (humidityEl) humidityEl.textContent = Math.round(conditions.humidity || 0);
        if (windEl) windEl.textContent = Math.round((conditions.windSpeed || 0) * 3.6);
        if (directionEl) directionEl.textContent = Helpers.getWindDirection(conditions.windDirection);
        if (precipEl) precipEl.textContent = (conditions.precipitation || 0).toFixed(1);
        if (iconEl) iconEl.textContent = conditions.weatherIcon || '🌦️';
    }

    function displayAlerts(alerts) {
        const alertsContainer = document.getElementById('alerts-container');
        if (!alertsContainer) return;

        alertsContainer.innerHTML = '';

        if (!alerts || alerts.length === 0) {
            alertsContainer.innerHTML = '<p class="text-center">✅ Sem alertas ativos no momento</p>';
            return;
        }

        alerts.forEach(alert => {
            const alertCard = document.createElement('div');
            alertCard.className = `alert-card alert-level-${alert.level}`;

            const startDate = new Date(alert.startDate).toLocaleString('pt-PT');
            const endDate = new Date(alert.endDate).toLocaleString('pt-PT');
            const alertTypeInfo = Config.ipma.alertTypes[alert.type] || { name: 'Desconhecido', icon: '⚠️' };
            const levelNames = ['', 'Minor', 'Moderado', 'Severo', 'Extremo'];
            const levelName = levelNames[alert.level] || 'Desconhecido';

            alertCard.innerHTML = `
                <div class="alert-header">
                    <div class="alert-title">${alertTypeInfo.icon} ${alertTypeInfo.name}</div>
                    <div class="alert-badge alert-level-${alert.level}">${levelName}</div>
                </div>
                <div class="alert-details">${alert.description || 'Alerta meteorológico'}</div>
                <div class="alert-meta">
                    <div><strong>Distrito:</strong> ${alert.district || 'Desconhecido'}</div>
                    <div><strong>Início:</strong> ${startDate}</div>
                    <div><strong>Fim:</strong> ${endDate}</div>
                </div>
            `;

            alertsContainer.appendChild(alertCard);
        });
    }

    function filterAlerts() {
        const districtFilter = document.getElementById('alert-district')?.value || '';
        const filteredAlerts = currentAlertsData.filter(alert => {
            return !districtFilter || String(alert.districtId) === String(districtFilter);
        });
        displayAlerts(filteredAlerts);
    }

    function populateDistrictDropdown() {
        const districtSelect = document.getElementById('alert-district');
        if (!districtSelect) return;

        while (districtSelect.options.length > 1) {
            districtSelect.remove(1);
        }

        Config.ipma.districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district.id;
            option.textContent = district.name;
            districtSelect.appendChild(option);
        });
    }

    function displayForecast(forecast) {
        const forecastContainer = document.getElementById('forecast-container');
        if (!forecastContainer) return;

        forecastContainer.innerHTML = '';
        if (!forecast || forecast.length === 0) {
            forecastContainer.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
            return;
        }

        forecast.forEach(dayData => {
            const dayElement = document.createElement('div');
            dayElement.className = 'forecast-day';

            const formattedDate = Helpers.formatDate(dayData.date);

            const dayHeader = document.createElement('div');
            dayHeader.className = 'forecast-day-header';
            dayHeader.innerHTML = `
                <div class="forecast-day-date">${formattedDate}</div>
                <div class="forecast-day-summary">${dayData.weatherDescription || 'Desconhecido'}</div>
            `;

            const dayDetails = document.createElement('div');
            dayDetails.className = 'forecast-details';
            dayDetails.innerHTML = `
                <div class="forecast-detail">
                    <span class="detail-label">Máx:</span>
                    <span class="detail-value">${dayData.maxTemp != null ? Math.round(dayData.maxTemp) + '°C' : '--'}</span>
                </div>
                <div class="forecast-detail">
                    <span class="detail-label">Mín:</span>
                    <span class="detail-value">${dayData.minTemp != null ? Math.round(dayData.minTemp) + '°C' : '--'}</span>
                </div>
                <div class="forecast-detail">
                    <span class="detail-label">Precipitação:</span>
                    <span class="detail-value">${dayData.precipitation != null ? dayData.precipitation.toFixed(1) + ' mm' : '0 mm'}</span>
                </div>
                <div class="forecast-detail">
                    <span class="detail-label">Vento:</span>
                    <span class="detail-value">${dayData.windSpeed != null ? Math.round(dayData.windSpeed * 3.6) + ' km/h' : '--'}</span>
                </div>
            `;

            dayElement.appendChild(dayHeader);
            dayElement.appendChild(dayDetails);
            forecastContainer.appendChild(dayElement);
        });
    }

    function startPeriodicUpdates() {
        if (periodicUpdateInterval) {
            clearInterval(periodicUpdateInterval);
        }

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
        loadForecastData,
        switchPanel,
        searchLocation,
        getCurrentWeather: () => currentWeatherData,
        getCurrentForecast: () => currentForecastData,
        getCurrentAlerts: () => currentAlertsData,
        getCurrentLocation: () => currentLocation
    };
})();

window.AppModule = AppModule;
export default AppModule;
