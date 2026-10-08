// ===== OpenMeteo Autonomous Panel with Expand/Collapse =====
import { Config, Helpers } from '../config.js';

const OpenMeteoPanel = (function() {
    'use strict';

    let currentLocation = null;
    let dataCache = {};
    let isExpanded = true;
    const CACHE_DURATION = 300000;

    // ===== DOM Elements =====
    const getElements = () => ({
        panel: document.getElementById('openmeteo-panel'),
        header: document.getElementById('openmeteo-panel-header'),
        toggleBtn: document.getElementById('openmeteo-panel-toggle'),
        content: document.getElementById('openmeteo-panel-content'),
        currentSection: document.getElementById('openmeteo-current-section'),
        hourlySection: document.getElementById('openmeteo-hourly-section'),
        dailySection: document.getElementById('openmeteo-daily-section'),
        alertsSection: document.getElementById('openmeteo-alerts-section'),
        loadingIndicator: document.getElementById('openmeteo-loading')
    });

    // ===== API Functions =====

    async function fetchData(endpoint, params = {}, retryCount = 0) {
        try {
            const url = `${Config.openmeteo.baseUrl}${endpoint}`;
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${url}?${queryString}`);

            if (!response.ok) {
                if (response.status === 503 && retryCount < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return fetchData(endpoint, params, retryCount + 1);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[OpenMeteoPanel] Erro ao buscar dados:', error);
            return null;
        }
    }

    async function loadCurrentConditions(latitude, longitude, forceRefresh = false) {
        const cacheKey = `current-${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
        const now = Date.now();
        const cached = dataCache[cacheKey];

        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const params = {
            latitude: latitude,
            longitude: longitude,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,uv_index,cloud_cover',
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData('/forecast', params);
        if (!data || !data.current) return cached ? cached.data : null;

        const conditions = {
            temperature: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            apparentTemperature: data.current.apparent_temperature,
            precipitation: data.current.precipitation,
            weatherCode: data.current.weather_code,
            windSpeed: data.current.wind_speed_10m,
            windDirection: data.current.wind_direction_10m,
            windGust: data.current.wind_gusts_10m,
            pressure: data.current.pressure_msl,
            visibility: data.current.visibility,
            uvIndex: data.current.uv_index,
            cloudCover: data.current.cloud_cover,
            weatherDescription: Helpers.getWeatherDescription(data.current.weather_code),
            weatherIcon: Helpers.getWeatherIcon(data.current.weather_code),
            timestamp: new Date(data.current_time),
            latitude: data.latitude,
            longitude: data.longitude
        };

        dataCache[cacheKey] = { data: conditions, timestamp: now };
        return conditions;
    }

    async function loadHourlyForecast(latitude, longitude, forceRefresh = false) {
        const cacheKey = `hourly-${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
        const now = Date.now();
        const cached = dataCache[cacheKey];

        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const params = {
            latitude: latitude,
            longitude: longitude,
            hourly: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover',
            forecast_hours: 24,
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData('/forecast', params);
        if (!data || !data.hourly) return cached ? cached.data : [];

        const hourly = [];
        const hourlyData = data.hourly;

        for (let i = 0; i < Math.min(24, hourlyData.time.length); i++) {
            hourly.push({
                time: new Date(hourlyData.time[i]),
                temperature: hourlyData.temperature_2m[i],
                weatherCode: hourlyData.weather_code[i],
                windSpeed: hourlyData.wind_speed_10m[i],
                windDirection: hourlyData.wind_direction_10m[i],
                windGust: hourlyData.wind_gusts_10m[i],
                precipitation: hourlyData.precipitation[i],
                cloudCover: hourlyData.cloud_cover[i],
                weatherDescription: Helpers.getWeatherDescription(hourlyData.weather_code[i]),
                weatherIcon: Helpers.getWeatherIcon(hourlyData.weather_code[i])
            });
        }

        dataCache[cacheKey] = { data: hourly, timestamp: now };
        return hourly;
    }

    async function loadDailyForecast(latitude, longitude, days = 7, forceRefresh = false) {
        const cacheKey = `daily-${days}-${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
        const now = Date.now();
        const cached = dataCache[cacheKey];

        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const params = {
            latitude: latitude,
            longitude: longitude,
            forecast_days: days,
            daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,cloud_cover_mean',
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData('/forecast', params);
        if (!data || !data.daily) return cached ? cached.data : [];

        const forecast = [];
        const dailyData = data.daily;

        for (let i = 0; i < dailyData.time.length; i++) {
            forecast.push({
                date: new Date(dailyData.time[i]),
                minTemp: dailyData.temperature_2m_min[i],
                maxTemp: dailyData.temperature_2m_max[i],
                precipitation: dailyData.precipitation_sum[i],
                weatherCode: dailyData.weather_code[i],
                windSpeed: dailyData.wind_speed_10m_max[i],
                windGust: dailyData.wind_gusts_10m_max[i],
                windDirection: dailyData.wind_direction_10m_dominant[i],
                cloudCover: dailyData.cloud_cover_mean[i],
                weatherDescription: Helpers.getWeatherDescription(dailyData.weather_code[i]),
                weatherIcon: Helpers.getWeatherIcon(dailyData.weather_code[i])
            });
        }

        dataCache[cacheKey] = { data: forecast, timestamp: now };
        return forecast;
    }

    // ===== Display Functions =====

    function formatValue(value, unit = '') {
        if (value === null || value === undefined) return '--';
        return `${Math.round(value)}${unit}`;
    }

    function formatDecimalValue(value, decimals = 1, unit = '') {
        if (value === null || value === undefined) return '--';
        return `${value.toFixed(decimals)}${unit}`;
    }

    function formatWindSpeed(value) {
        if (value === null || value === undefined) return '-- km/h';
        return `${Math.round(value * 3.6)} km/h`;
    }

    function formatWindGust(value) {
        if (value === null || value === undefined) return '-- km/h';
        return `${Math.round(value * 3.6)} km/h`;
    }

    function formatWindDirection(value) {
        if (value === null || value === undefined) return '--';
        return Helpers.getWindDirection(value);
    }

    function renderCurrentConditions(conditions) {
        const container = document.getElementById('openmeteo-current-data');
        if (!container) return;

        container.innerHTML = `
            <div class="weather-grid">
                <div class="weather-item">
                    <span class="label">Temperatura:</span>
                    <span class="value">${formatValue(conditions.temperature, '°C')}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Sensação Térmica:</span>
                    <span class="value">${formatValue(conditions.apparentTemperature, '°C')}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Nebulosidade:</span>
                    <span class="value">${formatValue(conditions.cloudCover, '%')}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Precipitação:</span>
                    <span class="value">${formatDecimalValue(conditions.precipitation, 1, ' mm')}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Velocidade Vento:</span>
                    <span class="value">${formatWindSpeed(conditions.windSpeed)}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Rajada Vento:</span>
                    <span class="value">${formatWindGust(conditions.windGust)}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Direção Vento:</span>
                    <span class="value">${formatWindDirection(conditions.windDirection)}</span>
                </div>
                <div class="weather-item">
                    <span class="label">Pressão:</span>
                    <span class="value">${formatValue(conditions.pressure, ' hPa')}</span>
                </div>
            </div>
        `;
    }

    function renderHourlyForecast(hourly) {
        const container = document.getElementById('openmeteo-hourly-data');
        if (!container) return;

        container.innerHTML = '';
        if (!hourly || hourly.length === 0) {
            container.innerHTML = '<p class="text-center">Sem dados horários disponíveis</p>';
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
                <div class="hourly-temp">${formatValue(hour.temperature, '°C')}</div>
                <div class="hourly-details">
                    <span>🌬️ ${formatWindSpeed(hour.windSpeed)}</span>
                    <span>💨 ${formatWindGust(hour.windGust)}</span>
                    <span>💧 ${formatDecimalValue(hour.precipitation, 1, ' mm')}</span>
                </div>
            `;
            hourlyScroll.appendChild(hourElement);
        });

        container.appendChild(hourlyScroll);
    }

    function renderDailyForecast(daily, days) {
        const container = document.getElementById(`openmeteo-daily-${days}-data`);
        if (!container) return;

        container.innerHTML = '';
        if (!daily || daily.length === 0) {
            container.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
            return;
        }

        daily.forEach(day => {
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
                    <span class="forecast-max">${formatValue(day.maxTemp, '°C')}</span>
                    <span class="forecast-min">${formatValue(day.minTemp, '°C')}</span>
                </div>
                <div class="forecast-day-details">
                    <span>💧 ${formatDecimalValue(day.precipitation, 1, ' mm')}</span>
                    <span>🌬️ ${formatWindSpeed(day.windSpeed)}</span>
                    <span>💨 ${formatWindGust(day.windGust)}</span>
                </div>
            `;
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
        const loading = document.getElementById('openmeteo-loading');
        if (loading) loading.style.display = 'block';
    }

    function hideLoading() {
        const loading = document.getElementById('openmeteo-loading');
        if (loading) loading.style.display = 'none';
    }

    // ===== Public API =====

    async function updatePanel(latitude, longitude) {
        currentLocation = { lat: latitude, lng: longitude };
        
        showLoading();
        
        try {
            const [current, hourly, daily3, daily5, daily7] = await Promise.all([
                loadCurrentConditions(latitude, longitude, true),
                loadHourlyForecast(latitude, longitude, true),
                loadDailyForecast(latitude, longitude, 3, true),
                loadDailyForecast(latitude, longitude, 5, true),
                loadDailyForecast(latitude, longitude, 7, true)
            ]);

            renderCurrentConditions(current);
            renderHourlyForecast(hourly);
            renderDailyForecast(daily3, 3);
            renderDailyForecast(daily5, 5);
            renderDailyForecast(daily7, 7);
            
            hideLoading();
        } catch (error) {
            console.error('[OpenMeteoPanel] Error updating panel:', error);
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
        const elements = getElements();
        
        if (elements.toggleBtn) {
            elements.toggleBtn.addEventListener('click', togglePanel);
        }
        
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
    }

    return {
        init,
        updatePanel,
        setLocation,
        getCurrentLocation,
        togglePanel,
        loadCurrentConditions,
        loadHourlyForecast,
        loadDailyForecast
    };
})();

window.OpenMeteoPanel = OpenMeteoPanel;
export default OpenMeteoPanel;
