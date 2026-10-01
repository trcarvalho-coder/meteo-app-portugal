// ===== OpenMeteo API Module =====
import { Config, Helpers } from './config.js';

const OpenMeteoModule = (function() {
    'use strict';

    let currentDataCache = {};
    let forecastCache = {};
    let lastUpdateTime = 0;
    const CACHE_DURATION = 300000; // 5 minutos

    // Fazer fetch dos dados
    async function fetchData(endpoint, params = {}) {
        try {
            const url = `${Config.openmeteo.baseUrl}${endpoint}`;
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${url}?${queryString}`);

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`❌ Falha ao buscar dados do OpenMeteo: ${endpoint}`, error);
            return null;
        }
    }

    // Carregar condições atuais
    async function loadCurrentConditions(latitude, longitude, forceRefresh = false) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
        const now = Date.now();

        if (!forceRefresh && currentDataCache[cacheKey] && (now - lastUpdateTime) < CACHE_DURATION) {
            return currentDataCache[cacheKey];
        }

        const params = {
            latitude: latitude,
            longitude: longitude,
            current: Config.openmeteo.defaultParams.current.join(','),
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
        if (!data) return currentDataCache[cacheKey] || null;

        const conditions = {
            temperature: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            apparentTemperature: data.current.apparent_temperature,
            precipitation: data.current.precipitation,
            weatherCode: data.current.weather_code,
            windSpeed: data.current.wind_speed_10m,
            windDirection: data.current.wind_direction_10m,
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

        currentDataCache[cacheKey] = conditions;
        lastUpdateTime = now;
        return conditions;
    }

    // Carregar previsão diária
    async function loadDailyForecast(latitude, longitude, days = 3) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}-${days}`;
        if (forecastCache[cacheKey]) return forecastCache[cacheKey];

        const params = {
            latitude: latitude,
            longitude: longitude,
            forecast_days: days,
            daily: Config.openmeteo.defaultParams.daily.join(','),
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
        if (!data || !data.daily) return forecastCache[cacheKey] || null;

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
                weatherDescription: Helpers.getWeatherDescription(dailyData.weather_code[i]),
                weatherIcon: Helpers.getWeatherIcon(dailyData.weather_code[i])
            });
        }

        forecastCache[cacheKey] = forecast;
        return forecast;
    }

    // Função pública
    return {
        loadCurrentConditions,
        loadDailyForecast
    };
})();

// Disponibilizar globalmente
window.OpenMeteoModule = OpenMeteoModule;
export default OpenMeteoModule;
