// ===== IPMA Autonomous Panel with Expand/Collapse =====
import { Config, Helpers } from '../config.js';

const IPMAPanel = (function() {
    'use strict';

    let currentLocation = null;
    let alertsCache = [];
    let forecastCache = {};
    let stationsCache = [];
    let isExpanded = true;
    const CACHE_DURATION = 300000;

    // ===== DOM Elements =====
    const getElements = () => ({
        panel: document.getElementById('ipma-panel'),
        header: document.getElementById('ipma-panel-header'),
        toggleBtn: document.getElementById('ipma-panel-toggle'),
        content: document.getElementById('ipma-panel-content'),
        alertsContainer: document.getElementById('ipma-alerts-data'),
        forecastContainer: document.getElementById('ipma-forecast-data'),
        districtSelect: document.getElementById('ipma-district-filter'),
        forecastDaysSelect: document.getElementById('ipma-forecast-days'),
        loadingIndicator: document.getElementById('ipma-loading')
    });

    // ===== API Functions =====

    async function fetchIPMAData(endpoint) {
        try {
            const url = `${Config.ipma.baseUrl}${endpoint}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[IPMAPanel] Erro ao buscar dados do IPMA:', error);
            return null;
        }
    }

    async function loadAlerts(forceRefresh = false) {
        const now = Date.now();
        const lastUpdate = localStorage.getItem('ipmaAlertsLastUpdate');

        if (!forceRefresh && alertsCache.length > 0 && lastUpdate && (now - parseInt(lastUpdate)) < CACHE_DURATION) {
            return alertsCache;
        }

        const data = await fetchIPMAData(Config.ipma.endpoints.warnings);
        
        if (!data || !data.data) {
            return alertsCache;
        }

        const alerts = processAlertsData(data);
        alertsCache = alerts;
        localStorage.setItem('ipmaAlertsLastUpdate', now.toString());
        
        return alerts;
    }

    function processAlertsData(data) {
        const alerts = [];

        if (data && data.data && Array.isArray(data.data)) {
            data.data.forEach(warning => {
                if (!warning) return;

                const alert = {
                    id: warning.id || `alert-${Math.random().toString(36).substr(2, 9)}`,
                    type: warning.type || '1',
                    level: parseInt(warning.level) || 1,
                    description: warning.description || warning.descricao || 'Alerta meteorológico',
                    startDate: warning.startTime || warning.dataInicio ? new Date(warning.startTime || warning.dataInicio) : new Date(),
                    endDate: warning.endTime || warning.dataFim ? new Date(warning.endTime || warning.dataFim) : new Date(),
                    district: getDistrictName(warning.districtId || warning.distrito),
                    districtId: warning.districtId || warning.distrito,
                    coordinates: getDistrictCoordinates(warning.districtId || warning.distrito),
                    source: 'IPMA'
                };

                alerts.push(alert);
            });

            alerts.sort((a, b) => {
                if (b.level !== a.level) return b.level - a.level;
                return a.startDate - b.startDate;
            });
        }

        return alerts;
    }

    function getDistrictName(districtId) {
        if (!districtId) return 'Desconhecido';
        const district = Config.ipma.districts.find(d => d.id === String(districtId));
        return district ? district.name : String(districtId);
    }

    function getDistrictCoordinates(districtId) {
        const districtCoords = {
            '01': [[-8.8, 41.7]],    // Viana do Castelo
            '02': [[-7.7, 41.3]],    // Vila Real
            '03': [[-8.4, 41.6]],    // Braga
            '04': [[-6.8, 41.8]],    // Bragança
            '05': [[-7.9, 40.7]],    // Viseu
            '06': [[-7.3, 40.5]],    // Guarda
            '07': [[-8.4, 40.2]],    // Coimbra
            '08': [[-7.5, 39.8]],    // Castelo Branco
            '09': [[-8.8, 39.8]],    // Leiria
            '10': [[-9.1, 38.7]],    // Lisboa
            '11': [[-7.4, 39.3]],    // Portalegre
            '12': [[-8.7, 38.5]],    // Setúbal
            '13': [[-7.9, 38.6]],    // Évora
            '14': [[-7.9, 38.0]],    // Beja
            '15': [[-7.9, 37.0]],    // Faro
            '20': [[-28.0, 38.0]],   // Açores
            '30': [[-16.0, 32.7]]    // Madeira
        };

        return districtCoords[String(districtId)] || [[-8.0, 39.5]];
    }

    async function loadForecast(cityId, days = 3) {
        try {
            const data = await fetchIPMAData(`${Config.ipma.endpoints.forecast}/${cityId}.json`);

            if (!data || !data.data || !Array.isArray(data.data)) {
                return [];
            }

            const forecast = [];
            const forecastData = data.data;

            for (let i = 0; i < Math.min(days, forecastData.length); i++) {
                const dayData = forecastData[i];
                if (!dayData) continue;

                forecast.push({
                    date: dayData.data ? new Date(dayData.data) : new Date(),
                    minTemp: dayData.tMin,
                    maxTemp: dayData.tMax,
                    precipitation: dayData.precipitaProb,
                    windSpeed: dayData.idVentoPred,
                    windDirection: dayData.ddVentoPred,
                    humidity: dayData.idRelativeHumid,
                    weatherDescription: getIPMAWeatherDescription(dayData.idWeatherType),
                    weatherIcon: getIPMAWeatherIcon(dayData.idWeatherType)
                });
            }

            return forecast;
        } catch (error) {
            console.error('[IPMAPanel] Error loading forecast:', error);
            return [];
        }
    }

    function getIPMAWeatherDescription(weatherCode) {
        const descriptions = {
            '1': 'Céu limpo',
            '2': 'Poucas nuvens',
            '3': 'Nuvens dispersas',
            '4': 'Nuvens muito nublado',
            '5': 'Nublado',
            '6': 'Chuva fraca',
            '7': 'Chuva',
            '8': 'Chuva forte',
            '9': 'Aguaceiros fracos',
            '10': 'Aguaceiros',
            '11': 'Aguaceiros fortes',
            '12': 'Neve fraca',
            '13': 'Neve',
            '14': 'Neve forte',
            '15': 'Neblina',
            '16': 'Geada',
            '17': 'Trovoada',
            '18': 'Vento forte'
        };

        return descriptions[String(weatherCode)] || 'Desconhecido';
    }

    function getIPMAWeatherIcon(weatherCode) {
        const icons = {
            '1': '☀️', '2': '⛅', '3': '☁️', '4': '☁️', '5': '☁️',
            '6': '🌦️', '7': '🌧️', '8': '🌧️', '9': '🌦️', '10': '🌦️', '11': '🌧️',
            '12': '❄️', '13': '❄️', '14': '❄️', '15': '🌫️',
            '16': '❄️', '17': '⛈️', '18': '🌪️'
        };

        return icons[String(weatherCode)] || '🌦️';
    }

    async function loadCities() {
        if (stationsCache.length > 0) return stationsCache;

        const data = await fetchIPMAData(Config.ipma.endpoints.stations);

        if (data && data.data && Array.isArray(data.data)) {
            stationsCache = data.data;
        }

        return stationsCache;
    }

    // ===== Display Functions =====

    function formatValue(value, unit = '') {
        if (value === null || value === undefined) return '--';
        return `${Math.round(value)}${unit}`;
    }

    function formatWindSpeed(value) {
        if (value === null || value === undefined) return '-- km/h';
        return `${value} km/h`;
    }

    function formatWindDirection(value) {
        if (value === null || value === undefined) return '--';
        return Helpers.getWindDirection(parseInt(value));
    }

    function renderAlerts(alerts) {
        const container = document.getElementById('ipma-alerts-data');
        if (!container) return;

        container.innerHTML = '';

        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<p class="text-center">✅ Sem alertas ativos no momento</p>';
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

            container.appendChild(alertCard);
        });
    }

    function renderForecast(forecast) {
        const container = document.getElementById('ipma-forecast-data');
        if (!container) return;

        container.innerHTML = '';
        if (!forecast || forecast.length === 0) {
            container.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
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
                    <span class="detail-value">${formatWindSpeed(dayData.windSpeed)}</span>
                </div>
            `;

            dayElement.appendChild(dayHeader);
            dayElement.appendChild(dayDetails);
            container.appendChild(dayElement);
        });
    }

    // ===== Panel Management =====

    function togglePanel() {
        isExpanded = !isExpanded;
        const elements = getElements();
        
        if (isExpanded) {
            elements.panel.classList.add('expanded');
            elements.panel.classList.remove('collapsed');
            elements.content.style.display = 'block';
            elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        } else {
            elements.panel.classList.add('collapsed');
            elements.panel.classList.remove('expanded');
            elements.content.style.display = 'none';
            elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        }
    }

    function showLoading() {
        const loading = document.getElementById('ipma-loading');
        if (loading) loading.style.display = 'block';
    }

    function hideLoading() {
        const loading = document.getElementById('ipma-loading');
        if (loading) loading.style.display = 'none';
    }

    // ===== Event Handlers =====

    function setupEventListeners() {
        const elements = getElements();
        
        if (elements.toggleBtn) {
            elements.toggleBtn.addEventListener('click', togglePanel);
        }
        
        if (elements.districtSelect) {
            elements.districtSelect.addEventListener('change', filterAlerts);
        }
        
        if (elements.forecastDaysSelect) {
            elements.forecastDaysSelect.addEventListener('change', loadForecastData);
        }
    }

    function filterAlerts() {
        const elements = getElements();
        const districtFilter = elements.districtSelect?.value || '';
        const filteredAlerts = alertsCache.filter(alert => {
            return !districtFilter || String(alert.districtId) === String(districtFilter);
        });
        renderAlerts(filteredAlerts);
    }

    async function loadForecastData() {
        const elements = getElements();
        const days = parseInt(elements.forecastDaysSelect?.value) || 3;
        
        showLoading();
        
        try {
            // For now, use a default city (Lisboa)
            const forecast = await loadForecast('1110600', days);
            renderForecast(forecast);
            hideLoading();
        } catch (error) {
            console.error('[IPMAPanel] Error loading forecast:', error);
            hideLoading();
        }
    }

    function populateDistrictDropdown() {
        const elements = getElements();
        const districtSelect = elements.districtSelect;
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

    // ===== Public API =====

    async function updatePanel(latitude, longitude) {
        currentLocation = { lat: latitude, lng: longitude };
        
        showLoading();
        
        try {
            const alerts = await loadAlerts(true);
            renderAlerts(alerts);
            
            // Load forecast for nearest city
            await loadForecastData();
            
            hideLoading();
        } catch (error) {
            console.error('[IPMAPanel] Error updating panel:', error);
            hideLoading();
        }
    }

    function setLocation(lat, lng) {
        currentLocation = { lat, lng };
    }

    function getCurrentLocation() {
        return currentLocation;
    }

    function init() {
        setupEventListeners();
        populateDistrictDropdown();
        
        const elements = getElements();
        
        // Initialize panel state
        if (isExpanded) {
            elements.panel.classList.add('expanded');
            elements.content.style.display = 'block';
            elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        } else {
            elements.panel.classList.add('collapsed');
            elements.content.style.display = 'none';
            elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        }
        
        // Load initial data
        loadAlerts();
        loadForecastData();
    }

    return {
        init,
        updatePanel,
        setLocation,
        getCurrentLocation,
        togglePanel,
        loadAlerts,
        loadForecast,
        renderAlerts,
        renderForecast
    };
})();

window.IPMAPanel = IPMAPanel;
export default IPMAPanel;
