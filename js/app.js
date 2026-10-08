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

            const mapResult = await MapModule.init();
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
                window.MapModule.addAlertsToMap(alerts);

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
                window.MapModule.addWeatherData(longitude, latitude, currentConditions);
                window.MapModule.centerOnCoordinates(longitude, latitude, 12);
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

    async function loadOpenMeteoData() {
        try {
            if (!currentLocation) return;

            const data = await OpenMeteoModule.loadAllForecastData(
                currentLocation.lat,
                currentLocation.lng,
                true
            );

            if (data) {
                displayOpenMeteoData(data);
            }
        } catch (error) {
            Helpers.showError('Falha ao carregar dados OpenMeteo', error);
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
            window.MapModule.updateLocationInfo();
        } else if (panelId === 'current' && currentLocation) {
            updateWeatherData(currentLocation.lat, currentLocation.lng);
        } else if (panelId === 'openmeteo' && currentLocation) {
            loadOpenMeteoData();
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
                window.MapModule.centerOnCoordinates(location.lng, location.lat, 12);
                window.MapModule.exitMapSelectionMode();
            } else {
                const coords = trimmedQuery.split(',').map(s => parseFloat(s.trim()));
                if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                    await updateWeatherData(coords[0], coords[1]);
                    const locationSearch = document.getElementById('location-search');
                    if (locationSearch) locationSearch.value = `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
                    window.MapModule.centerOnCoordinates(coords[1], coords[0], 12);
                    window.MapModule.exitMapSelectionMode();
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
        const gustEl = document.getElementById('current-gust');
        const precipEl = document.getElementById('current-precip');
        const iconEl = document.getElementById('current-weather-icon');

        if (tempEl) tempEl.textContent = Math.round(conditions.temperature || 0);
        if (descEl) descEl.textContent = conditions.weatherDescription || 'Desconhecido';
        if (humidityEl) humidityEl.textContent = Math.round(conditions.humidity || 0);
        if (windEl) windEl.textContent = Math.round((conditions.windSpeed || 0) * 3.6);
        if (directionEl) directionEl.textContent = Helpers.getWindDirection(conditions.windDirection);
        if (gustEl) gustEl.textContent = conditions.windGust != null ? Math.round(conditions.windGust * 3.6) : '--';
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

    function displayOpenMeteoData(data) {
        if (!data) return;

        displayOpenMeteoCurrent(data.current);
        displayOpenMeteoHourly(data.hourly);
        displayOpenMeteoAlerts(data.alerts);
        displayOpenMeteoForecast(data.daily3, data.daily5, data.daily7);
    }

    function displayOpenMeteoCurrent(current) {
        const tempEl = document.getElementById('openmeteo-temp');
        const feelsEl = document.getElementById('openmeteo-feels');
        const cloudEl = document.getElementById('openmeteo-cloud');
        const precipEl = document.getElementById('openmeteo-precip');
        const windEl = document.getElementById('openmeteo-wind');
        const gustEl = document.getElementById('openmeteo-gust');
        const windDirEl = document.getElementById('openmeteo-wind-dir');
        const pressureEl = document.getElementById('openmeteo-pressure');

        if (current) {
            if (tempEl) tempEl.textContent = current.temperature != null ? `${Math.round(current.temperature)}°C` : '--°C';
            if (feelsEl) feelsEl.textContent = current.apparentTemperature != null ? `${Math.round(current.apparentTemperature)}°C` : '--°C';
            if (cloudEl) cloudEl.textContent = current.cloudCover != null ? `${Math.round(current.cloudCover)}%` : '--%';
            if (precipEl) precipEl.textContent = current.precipitation != null ? `${current.precipitation.toFixed(1)} mm` : '-- mm';
            if (windEl) windEl.textContent = current.windSpeed != null ? `${Math.round(current.windSpeed * 3.6)} km/h` : '-- km/h';
            if (gustEl) gustEl.textContent = current.windGust != null ? `${Math.round(current.windGust * 3.6)} km/h` : '-- km/h';
            if (windDirEl) windDirEl.textContent = current.windDirection != null ? Helpers.getWindDirection(current.windDirection) : '--';
            if (pressureEl) pressureEl.textContent = current.pressure != null ? `${Math.round(current.pressure)} hPa` : '-- hPa';
        }
    }

    function displayOpenMeteoHourly(hourly) {
        const hourlyContainer = document.getElementById('openmeteo-hourly');
        if (!hourlyContainer) return;

        hourlyContainer.innerHTML = '';
        if (!hourly || hourly.length === 0) {
            hourlyContainer.innerHTML = '<p class="text-center">Sem dados horários disponíveis</p>';
            return;
        }

        const hourlyScroll = document.createElement('div');
        hourlyScroll.className = 'hourly-scroll-content';

        hourly.forEach(hour => {
            const hourElement = document.createElement('div');
            hourElement.className = 'hourly-item';
            const timeStr = hour.time.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
            const icon = hour.weatherIcon || '🌦️';

            hourElement.innerHTML = `
                <div class="hourly-time">${timeStr}</div>
                <div class="hourly-icon">${icon}</div>
                <div class="hourly-temp">${hour.temperature != null ? Math.round(hour.temperature) + '°C' : '--'}</div>
                <div class="hourly-details">
                    <span>🌬️ ${hour.windSpeed != null ? Math.round(hour.windSpeed * 3.6) + ' km/h' : '--'}</span>
                    <span>💧 ${hour.precipitation != null ? hour.precipitation.toFixed(1) + ' mm' : '0'}</span>
                    <span>☁️ ${hour.cloudCover != null ? Math.round(hour.cloudCover) + '%' : '--'}</span>
                </div>
            `;
            hourlyScroll.appendChild(hourElement);
        });

        hourlyContainer.appendChild(hourlyScroll);
    }

    function displayOpenMeteoAlerts(alerts) {
        const alertsContainer = document.getElementById('openmeteo-alerts');
        if (!alertsContainer) return;

        alertsContainer.innerHTML = '';
        if (!alerts || alerts.length === 0) {
            alertsContainer.innerHTML = '<p class="text-center">Sem alertas meteorológicos OpenMeteo</p>';
            return;
        }

        alerts.forEach(alert => {
            const alertCard = document.createElement('div');
            alertCard.className = 'alert-card';

            const onsetStr = alert.onset ? alert.onset.toLocaleString('pt-PT') : 'Desconhecido';
            const expiresStr = alert.expires ? alert.expires.toLocaleString('pt-PT') : 'Desconhecido';
            const duration = alert.onset && alert.expires ? 
                Math.round((alert.expires - alert.onset) / (1000 * 60 * 60)) + ' horas' : 'Desconhecido';

            const severityColor = {
                'extreme': '#e74c3c',
                'severe': '#e74c3c',
                'moderate': '#f39c12',
                'minor': '#2ecc71',
                'unknown': '#7f8c8d'
            };
            const color = severityColor[alert.severity?.toLowerCase()] || '#7f8c8d';

            alertCard.style.borderLeftColor = color;

            alertCard.innerHTML = `
                <div class="alert-header">
                    <div class="alert-title">⚠️ ${alert.event || 'Alerta'}</div>
                    <div class="alert-badge" style="background-color: ${color};">${alert.severity || 'Desconhecido'}</div>
                </div>
                <div class="alert-details">${alert.headline || alert.description || 'Alerta meteorológico'}</div>
                <div class="alert-meta">
                    <div><strong>Início:</strong> ${onsetStr}</div>
                    <div><strong>Fim:</strong> ${expiresStr}</div>
                    <div><strong>Duração:</strong> ${duration}</div>
                </div>
                ${alert.instruction ? `<div class="alert-instruction"><strong>Medidas:</strong> ${alert.instruction}</div>` : ''}
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    function displayOpenMeteoForecast(daily3, daily5, daily7) {
        const forecastContainer = document.getElementById('openmeteo-daily');
        if (!forecastContainer) return;

        forecastContainer.innerHTML = '';

        const createForecastSection = (data, title) => {
            if (!data || data.length === 0) return null;

            const section = document.createElement('div');
            section.className = 'forecast-section';

            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'forecast-section-header';
            sectionHeader.textContent = title;

            const sectionContent = document.createElement('div');
            sectionContent.className = 'forecast-section-content';

            data.forEach(day => {
                const dayElement = document.createElement('div');
                dayElement.className = 'forecast-day-small';
                const formattedDate = Helpers.formatDate(day.date);
                const icon = day.weatherIcon || '🌦️';

                dayElement.innerHTML = `
                    <div class="forecast-day-header-small">
                        <span class="forecast-date-small">${formattedDate}</span>
                        <span class="forecast-icon-small">${icon}</span>
                    </div>
                    <div class="forecast-temps">
                        <span class="forecast-max">${day.maxTemp != null ? Math.round(day.maxTemp) + '°C' : '--'}</span>
                        <span class="forecast-min">${day.minTemp != null ? Math.round(day.minTemp) + '°C' : '--'}</span>
                    </div>
                    <div class="forecast-day-details">
                        <span>💧 ${day.precipitation != null ? day.precipitation.toFixed(1) + ' mm' : '0'}</span>
                        <span>🌬️ ${day.windSpeed != null ? Math.round(day.windSpeed * 3.6) + ' km/h' : '--'}</span>
                    </div>
                `;
                sectionContent.appendChild(dayElement);
            });

            section.appendChild(sectionHeader);
            section.appendChild(sectionContent);
            return section;
        };

        if (daily3 && daily3.length > 0) {
            forecastContainer.appendChild(createForecastSection(daily3, 'Previsão 3 Dias'));
        }
        if (daily5 && daily5.length > 0) {
            forecastContainer.appendChild(createForecastSection(daily5, 'Previsão 5 Dias'));
        }
        if (daily7 && daily7.length > 0) {
            forecastContainer.appendChild(createForecastSection(daily7, 'Previsão 7 Dias'));
        }

        if (!daily3 && !daily5 && !daily7) {
            forecastContainer.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
        }
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
