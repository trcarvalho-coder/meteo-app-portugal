// ===== OpenMeteo Autonomous Panel Module =====
import { Config, Helpers } from './config.js';

const OpenMeteoPanel = (function() {
    'use strict';

    let currentLocation = null;
    let dataCache = {};
    const CACHE_DURATION = 300000; // 5 minutos

    // ===== API Functions =====

    async function fetchOpenMeteoData(endpoint, params = {}, retryCount = 0) {
        try {
            const url = `${Config.openmeteo.baseUrl}${endpoint}`;
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${url}?${queryString}`);

            if (!response.ok) {
                if (response.status === 503 && retryCount < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return fetchOpenMeteoData(endpoint, params, retryCount + 1);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`[OpenMeteoPanel] Erro ao buscar dados: ${endpoint}`, error);
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

        const data = await fetchOpenMeteoData('/forecast', params);
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

        const data = await fetchOpenMeteoData('/forecast', params);
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

        const data = await fetchOpenMeteoData('/forecast', params);
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

    function displayCurrentConditions(conditions, containerId = 'openmeteo-current') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
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
        `;
    }

    function displayHourlyForecast(hourly, containerId = 'openmeteo-hourly') {
        const container = document.getElementById(containerId);
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
                    <span>☁️ ${formatValue(hour.cloudCover, '%')}</span>
                </div>
            `;
            hourlyScroll.appendChild(hourElement);
        });

        container.appendChild(hourlyScroll);
    }

    function displayDailyForecast(daily, containerId = 'openmeteo-daily', title = 'Previsão 7 Dias') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        if (!daily || daily.length === 0) {
            container.innerHTML = '<p class="text-center">Sem dados de previsão disponíveis</p>';
            return;
        }

        const section = document.createElement('div');
        section.className = 'forecast-section';

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'forecast-section-header';
        sectionHeader.textContent = title;

        const sectionContent = document.createElement('div');
        sectionContent.className = 'forecast-section-content';

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
            sectionContent.appendChild(dayElement);
        });

        section.appendChild(sectionHeader);
        section.appendChild(sectionContent);
        container.appendChild(section);
    }

    // ===== Public API =====

    async function updatePanel(latitude, longitude) {
        currentLocation = { lat: latitude, lng: longitude };
        
        const [current, hourly, daily3, daily5, daily7] = await Promise.all([
            loadCurrentConditions(latitude, longitude, true),
            loadHourlyForecast(latitude, longitude, true),
            loadDailyForecast(latitude, longitude, 3, true),
            loadDailyForecast(latitude, longitude, 5, true),
            loadDailyForecast(latitude, longitude, 7, true)
        ]);

        displayCurrentConditions(current);
        displayHourlyForecast(hourly);
        displayDailyForecast(daily3, 'openmeteo-daily', 'Previsão 3 Dias');
        displayDailyForecast(daily5, 'openmeteo-daily', 'Previsão 5 Dias');
        displayDailyForecast(daily7, 'openmeteo-daily', 'Previsão 7 Dias');
    }

    function setLocation(lat, lng) {
        currentLocation = { lat, lng };
    }

    return {
        updatePanel,
        setLocation,
        loadCurrentConditions,
        loadHourlyForecast,
        loadDailyForecast,
        displayCurrentConditions,
        displayHourlyForecast,
        displayDailyForecast
    };
})();

window.OpenMeteoPanel = OpenMeteoPanel;
export default OpenMeteoPanel;
