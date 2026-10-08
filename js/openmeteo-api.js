// ===== OpenMeteo API Module =====
import { Config, Helpers } from './config.js';

const OpenMeteoModule = (function() {
    'use strict';

    let currentDataCache = {};
    let forecastCache = {};
    let hourlyCache = {};
    let alertsCache = {};
    const CACHE_DURATION = 300000;

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

    async function loadCurrentConditions(latitude, longitude, forceRefresh = false) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
        const now = Date.now();
        const cached = currentDataCache[cacheKey];

        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const params = {
            latitude: latitude,
            longitude: longitude,
            current: Config.openmeteo.defaultParams.current.join(','),
            timezone: 'Europe/Lisbon'
        };

        const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
        if (!data) return cached ? cached.data : null;

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

        currentDataCache[cacheKey] = {
            data: conditions,
            timestamp: now
        };
        return conditions;
    }

    async function loadHourlyForecast(latitude, longitude, forceRefresh = false) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}-hourly`;
        const now = Date.now();
        const cached = hourlyCache[cacheKey];

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

        const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
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
                windGust: hourlyData.wind_gusts_10m ? hourlyData.wind_gusts_10m[i] : null,
                precipitation: hourlyData.precipitation[i],
                cloudCover: hourlyData.cloud_cover[i],
                weatherDescription: Helpers.getWeatherDescription(hourlyData.weather_code[i]),
                weatherIcon: Helpers.getWeatherIcon(hourlyData.weather_code[i])
            });
        }

        hourlyCache[cacheKey] = {
            data: hourly,
            timestamp: now
        };
        return hourly;
    }

    async function loadDailyForecast(latitude, longitude, days = 7, forceRefresh = false) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}-${days}`;
        const now = Date.now();
        const cached = forecastCache[cacheKey];

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

        const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
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
                windGust: dailyData.wind_gusts_10m_max ? dailyData.wind_gusts_10m_max[i] : null,
                windDirection: dailyData.wind_direction_10m_dominant ? dailyData.wind_direction_10m_dominant[i] : null,
                cloudCover: dailyData.cloud_cover_mean ? dailyData.cloud_cover_mean[i] : null,
                weatherDescription: Helpers.getWeatherDescription(dailyData.weather_code[i]),
                weatherIcon: Helpers.getWeatherIcon(dailyData.weather_code[i])
            });
        }

        forecastCache[cacheKey] = {
            data: forecast,
            timestamp: now
        };
        return forecast;
    }

    async function loadAlerts(latitude, longitude, forceRefresh = false) {
        const cacheKey = `${latitude.toFixed(4)}-${longitude.toFixed(4)}-alerts`;
        const now = Date.now();
        const cached = alertsCache[cacheKey];

        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        try {
            const params = {
                latitude: latitude,
                longitude: longitude
            };

            const data = await fetchData(Config.openmeteo.endpoints.forecast, params);
            if (!data || !data.alerts) {
                alertsCache[cacheKey] = {
                    data: [],
                    timestamp: now
                };
                return [];
            }

            const alerts = data.alerts.map(alert => ({
                event: alert.event || 'Alerta',
                headline: alert.headline || '',
                description: alert.description || '',
                onset: new Date(alert.onset),
                expires: new Date(alert.expires),
                severity: alert.severity || 'unknown',
                senderName: alert.senderName || '',
                urgency: alert.urgency || '',
                certainty: alert.certainty || '',
                instruction: alert.instruction || '',
                parameters: alert.parameters || {}
            }));

            alertsCache[cacheKey] = {
                data: alerts,
                timestamp: now
            };
            return alerts;
        } catch (error) {
            console.error('Error loading alerts:', error);
            return cached ? cached.data : [];
        }
    }

    async function loadAllForecastData(latitude, longitude, forceRefresh = false) {
        try {
            const current = await loadCurrentConditions(latitude, longitude, forceRefresh);
            const hourly = await loadHourlyForecast(latitude, longitude, forceRefresh);
            const daily3 = await loadDailyForecast(latitude, longitude, 3, forceRefresh);
            const daily5 = await loadDailyForecast(latitude, longitude, 5, forceRefresh);
            const daily7 = await loadDailyForecast(latitude, longitude, 7, forceRefresh);
            const alerts = await loadAlerts(latitude, longitude, forceRefresh);

            return {
                current,
                hourly,
                daily3,
                daily5,
                daily7,
                alerts
            };
        } catch (error) {
            console.error('Error loading all forecast data:', error);
            return null;
        }
    }

    return {
        loadCurrentConditions,
        loadDailyForecast,
        loadHourlyForecast,
        loadAlerts,
        loadAllForecastData
    };
})();

window.OpenMeteoModule = OpenMeteoModule;
export default OpenMeteoModule;
