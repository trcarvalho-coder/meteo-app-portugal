// ===== Main Application Module =====
const AppModule = (function() {
    'use strict';

    let currentLocation = Config.app.defaultLocation;
    let currentWeatherData = null;
    let currentForecastData = null;
    let currentAlertsData = [];

    async function init() {
        try {
            const mapResult = MapModule.init();
            if (!mapResult) {
                console.error('Failed to initialize map');
                return;
            }
            setupEventListeners();
            await loadInitialData();
            startPeriodicUpdates();
        } catch (error) {
            console.error('Failed to initialize application', error);
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        const searchBtn = document.getElementById('search-btn');
        const locationSearch = document.getElementById('location-search');
        if (searchBtn && locationSearch) {
            searchBtn.addEventListener('click', () => searchLocation(locationSearch.value));
            locationSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchLocation(locationSearch.value);
            });
        }

        const alertDistrict = document.getElementById('alert-district');
        const alertType = document.getElementById('alert-type');
        if (alertDistrict) alertDistrict.addEventListener('change', filterAlerts);
        if (alertType) alertType.addEventListener('change', filterAlerts);

        const forecastSource = document.getElementById('forecast-source');
        const forecastDays = document.getElementById('forecast-days');
        if (forecastSource) forecastSource.addEventListener('change', loadForecastData);
        if (forecastDays) forecastDays.addEventListener('change', loadForecastData);
    }

    async function loadInitialData() {
        await updateWeatherData(currentLocation.lat, currentLocation.lng);
        await loadAlerts();
        populateDistrictDropdown();
    }

    async function loadAlerts() {
        const alerts = await IPMAModule.loadAlerts();
        if (alerts) {
            currentAlertsData = alerts;
            displayAlerts(alerts);
            MapModule.addAlertsToMap(alerts);
        }
    }

    async function updateWeatherData(latitude, longitude) {
        currentLocation = { lat: latitude, lng: longitude, name: 'Localização' };

        const currentConditions = await OpenMeteoModule.loadCurrentConditions(latitude, longitude);
        if (currentConditions) {
            currentWeatherData = currentConditions;
            displayCurrentConditions(currentConditions);
            MapModule.addWeatherData(longitude, latitude, currentConditions);
            MapModule.centerOnCoordinates(longitude, latitude, 12);
        }
        await loadForecastData();
    }

    async function loadForecastData() {
        const forecastDays = parseInt(document.getElementById('forecast-days')?.value) || 3;
        const forecast = await OpenMeteoModule.loadDailyForecast(currentLocation.lat, currentLocation.lng, forecastDays);
        if (forecast) {
            currentForecastData = forecast;
            displayForecast(forecast);
        }
    }

    async function searchLocation(query) {
        const locations = [
            { name: 'Lisboa', lat: 38.7223, lng: -9.1393 },
            { name: 'Porto', lat: 41.1496, lng: -8.6110 },
            { name: 'Braga', lat: 41.5501, lng: -8.4200 },
            { name: 'Coimbra', lat: 40.2111, lng: -8.4291 },
            { name: 'Faro', lat: 37.0194, lng: -7.9309 },
            { name: 'Évora', lat: 38.5742, lng: -7.9126 },
            { name: 'Aveiro', lat: 40.6405, lng: -8.6538 }
        ];

        const location = locations.find(loc => loc.name.toLowerCase().includes(query.toLowerCase()));
        if (location) {
            await updateWeatherData(location.lat, location.lng);
            const locationSearch = document.getElementById('location-search');
            if (locationSearch) locationSearch.value = location.name;
        } else {
            const coords = query.split(',').map(s => parseFloat(s.trim()));
            if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                await updateWeatherData(coords[0], coords[1]);
            } else {
                alert('Localização não encontrada. Tente um nome de cidade ou coordenadas (lat, lng).');
            }
        }
    }

    function switchTab(tabId) {
        activeTab = tabId;
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });
        if (tabId === 'alerts') loadAlerts();
        else if (tabId === 'forecast') loadForecastData();
        else if (tabId === 'current' && currentLocation) {
            updateWeatherData(currentLocation.lat, currentLocation.lng);
        }
    }

    function displayCurrentConditions(conditions) {
        const setText = (id, value, unit = '') => {
            const el = document.getElementById(id);
            if (el) el.textContent = value !== null && value !== undefined ? value + unit : '--';
        };

        setText('temp-value', Math.round(conditions.temperature), '');
        setText('humidity-value', Math.round(conditions.humidity), '%');
        setText('wind-speed', Math.round(conditions.windSpeed * 3.6));
        setText('precipitation-value', conditions.precipitation ? conditions.precipitation.toFixed(1) : '0');
        setText('feels-like', Math.round(conditions.apparentTemperature));
        setText('wind-direction', Helpers.getWindDirection(conditions.windDirection));
        setText('pressure-value', conditions.pressure ? Math.round(conditions.pressure) + ' hPa' : '--');
        setText('visibility-value', conditions.visibility ? (conditions.visibility / 1000).toFixed(1) + ' km' : '--');
        setText('uv-index', conditions.uvIndex ? Math.round(conditions.uvIndex) : '--');
        setText('cloud-cover', conditions.cloudCover ? Math.round(conditions.cloudCover) + '%' : '--');
    }

    function displayForecast(forecast) {
        const forecastContent = document.getElementById('forecast-content');
        if (!forecastContent) return;

        forecastContent.innerHTML = '';
        if (!forecast || forecast.length === 0) {
            forecastContent.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
            return;
        }

        const forecastDays = document.createElement('div');
        forecastDays.className = 'forecast-days';

        forecast.forEach(dayData => {
            const dayElement = document.createElement('div');
            dayElement.className = 'forecast-day';

            const formattedDate = new Date(dayData.date).toLocaleDateString('pt-PT', {
                weekday: 'long', day: 'numeric', month: 'long'
            });

            const dayHeader = document.createElement('div');
            dayHeader.className = 'forecast-day-header';
            dayHeader.innerHTML = `
                <div class="forecast-day-date">${formattedDate}</div>
                <div class="forecast-day-summary">${dayData.weatherDescription || 'Desconhecido'}</div>
            `;

            const dayDetails = document.createElement('div');
            dayDetails.className = 'forecast-day-details';
            dayDetails.innerHTML = `
                <div class="forecast-detail">
                    <span class="detail-label">Máx:</span>
                    <span class="detail-value">${dayData.maxTemp ? Math.round(dayData.maxTemp) + '°C' : '--'}</span>
                </div>
                <div class="forecast-detail">
                    <span class="detail-label">Mín:</span>
                    <span class="detail-value">${dayData.minTemp ? Math.round(dayData.minTemp) + '°C' : '--'}</span>
                </div>
                <div class="forecast-detail">
                    <span class="detail-label">Precipitação:</span>
                    <span class="detail-value">${dayData.precipitation ? dayData.precipitation.toFixed(1) + ' mm' : '0 mm'}</span>
                </div>
            `;

            const weatherIcon = document.createElement('div');
            weatherIcon.className = 'forecast-weather-icon';
            weatherIcon.textContent = dayData.weatherIcon || '🌦️';
            weatherIcon.style.fontSize = '2rem';

            dayElement.appendChild(dayHeader);
            dayElement.appendChild(weatherIcon);
            dayElement.appendChild(dayDetails);
            forecastDays.appendChild(dayElement);
        });

        forecastContent.appendChild(forecastDays);
    }

    function displayAlerts(alerts) {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        alertsList.innerHTML = '';
        if (!alerts || alerts.length === 0) {
            alertsList.innerHTML = '<p class="text-center">Sem alertas ativos no momento</p>';
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
            alertsList.appendChild(alertCard);
        });
    }

    function filterAlerts() {
        const districtFilter = document.getElementById('alert-district')?.value || '';
        const typeFilter = document.getElementById('alert-type')?.value || '';
        const filteredAlerts = currentAlertsData.filter(alert => {
            const districtMatch = !districtFilter || alert.districtId === districtFilter;
            const typeMatch = !typeFilter || alert.type === typeFilter;
            return districtMatch && typeMatch;
        });
        displayAlerts(filteredAlerts);
    }

    function populateDistrictDropdown() {
        const districtSelect = document.getElementById('alert-district');
        if (!districtSelect) return;
        while (districtSelect.options.length > 1) districtSelect.remove(1);
        Config.ipma.districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district.id;
            option.textContent = district.name;
            districtSelect.appendChild(option);
        });
    }

    function startPeriodicUpdates() {
        setInterval(async () => {
            if (currentLocation) {
                await updateWeatherData(currentLocation.lat, currentLocation.lng);
                await loadAlerts();
            }
        }, Config.app.updateInterval);
    }

    return { init, updateWeatherData, loadAlerts, loadForecastData, switchTab, searchLocation };
})();

// Verificar se ArcGIS já está carregado
if (typeof window.esri !== 'undefined' && typeof window.esri.Map !== 'undefined') {
    // Se já estiver carregado, inicializar agora
    document.addEventListener('DOMContentLoaded', () => AppModule.init());
} else {
    // Senão, esperar pelo evento arcgis-ready
    document.addEventListener('arcgis-ready', () => {
        // Esperar que o DOM também esteja pronto
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            AppModule.init();
        } else {
            document.addEventListener('DOMContentLoaded', () => AppModule.init());
        }
    });
}
window.AppModule = AppModule;
