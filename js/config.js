// ===== Application Configuration =====
export const Config = {
    // ===== No config.js, substitua a secção arcgis por esta ===
arcgis: {
    apiUrl: 'https://js.arcgis.com/5.1.26/',
    basemaps: {
        streets: 'topo-vector',      // ❌ era 'arcgis-topographic'
        satellite: 'satellite',      // ✅ mantém
        terrain: 'terrain'           // ✅ mantém
    },
    center: [-8.0, 39.5],
    zoom: 7
},

    // IPMA API Configuration
    ipma: {
        baseUrl: 'https://api.ipma.pt',
        endpoints: {
            warnings: '/open-data/forecast/warnings/warnings_www.json',
            forecast: '/open-data/forecast/meteorology/cities/daily',
            current: '/open-data/observation/meteorology/stations',
            stations: '/open-data/forecast/meteorology/cities.json'
        },
        districts: [
            { id: '01', name: 'Viana do Castelo' },
            { id: '02', name: 'Vila Real' },
            { id: '03', name: 'Braga' },
            { id: '04', name: 'Bragança' },
            { id: '05', name: 'Viseu' },
            { id: '06', name: 'Guarda' },
            { id: '07', name: 'Coimbra' },
            { id: '08', name: 'Castelo Branco' },
            { id: '09', name: 'Leiria' },
            { id: '10', name: 'Lisboa' },
            { id: '11', name: 'Portalegre' },
            { id: '12', name: 'Setúbal' },
            { id: '13', name: 'Évora' },
            { id: '14', name: 'Beja' },
            { id: '15', name: 'Faro' },
            { id: '20', name: 'Região Autónoma dos Açores' },
            { id: '30', name: 'Região Autónoma da Madeira' }
        ],
        alertTypes: {
            '1': { name: 'Vento Forte', icon: '🌬️', color: '#3498db' },
            '2': { name: 'Precipitação', icon: '🌧️', color: '#2980b9' },
            '3': { name: 'Temperatura', icon: '🌡️', color: '#e74c3c' },
            '4': { name: 'Neve', icon: '❄️', color: '#9b59b6' },
            '5': { name: 'Trovoada', icon: '⛈️', color: '#f39c12' }
        }
    },

    // OpenMeteo API Configuration
    openmeteo: {
        baseUrl: 'https://api.open-meteo.com/v1',
        endpoints: {
            forecast: '/forecast'
        },
        defaultParams: {
            current: [
                'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
                'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
                'pressure_msl', 'visibility', 'uv_index', 'cloud_cover'
            ],
            daily: [
                'weather_code', 'temperature_2m_max', 'temperature_2m_min',
                'precipitation_sum', 'wind_speed_10m_max'
            ]
        },
        weatherCodes: {
            0: { icon: '☀️', description: 'Céu limpo' },
            1: { icon: '⛅', description: 'Poucas nuvens' },
            2: { icon: '☁️', description: 'Nuvens dispersas' },
            3: { icon: '☁️', description: 'Nuvens quebradas' },
            45: { icon: '🌫️', description: 'Neblina' },
            48: { icon: '🌫️', description: 'Neblina gelada' },
            51: { icon: '🌧️', description: 'Chuva fraca' },
            53: { icon: '🌧️', description: 'Chuva moderada' },
            55: { icon: '🌧️', description: 'Chuva forte' },
            56: { icon: '🌧️', description: 'Chuva gelada' },
            57: { icon: '🌧️', description: 'Chuva forte gelada' },
            61: { icon: '🌧️', description: 'Chuva fraca' },
            63: { icon: '🌧️', description: 'Chuva moderada' },
            65: { icon: '🌧️', description: 'Chuva forte' },
            66: { icon: '❄️', description: 'Neve fraca' },
            67: { icon: '❄️', description: 'Neve forte' },
            71: { icon: '❄️', description: 'Granizo' },
            73: { icon: '❄️', description: 'Granizo forte' },
            75: { icon: '❄️', description: 'Granizo muito forte' },
            77: { icon: '❄️', description: 'Granizo ou neve' },
            80: { icon: '🌧️', description: 'Aguaceiros fracos' },
            81: { icon: '🌧️', description: 'Aguaceiros moderados' },
            82: { icon: '🌧️', description: 'Aguaceiros fortes' },
            85: { icon: '❄️', description: 'Aguaceiros de neve fracos' },
            86: { icon: '❄️', description: 'Aguaceiros de neve fortes' },
            95: { icon: '⛈️', description: 'Trovoada' },
            96: { icon: '⛈️', description: 'Trovoada com granizo' },
            99: { icon: '⛈️', description: 'Trovoada forte com granizo' }
        }
    },

    // Application Settings
    app: {
        defaultLocation: {
            lat: 38.7223,
            lng: -9.1393,
            name: 'Lisboa, Portugal'
        },
        updateInterval: 300000, // 5 minutos
        maxForecastDays: 7,
        debug: false
    },

    // Wind direction mapping
    windDirections: [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ]
};

// ===== Helper Functions =====
export const Helpers = {
    // Format temperature
    formatTemperature: (temp) => {
        if (temp === null || temp === undefined) return '--';
        return `${Math.round(temp)}°C`;
    },

    // Format wind speed
    formatWindSpeed: (speed) => {
        if (speed === null || speed === undefined) return '--';
        return `${Math.round(speed * 3.6)} km/h`;
    },

    // Format humidity
    formatHumidity: (humidity) => {
        if (humidity === null || humidity === undefined) return '--';
        return `${Math.round(humidity)}%`;
    },

    // Format precipitation
    formatPrecipitation: (precip) => {
        if (precip === null || precip === undefined) return '--';
        return `${precip.toFixed(1)} mm`;
    },

    // Format pressure
    formatPressure: (pressure) => {
        if (pressure === null || pressure === undefined) return '--';
        return `${Math.round(pressure)} hPa`;
    },

    // Format visibility
    formatVisibility: (visibility) => {
        if (visibility === null || visibility === undefined) return '--';
        return `${(visibility / 1000).toFixed(1)} km`;
    },

    // Format UV index
    formatUVIndex: (uvIndex) => {
        if (uvIndex === null || uvIndex === undefined) return '--';
        return `${Math.round(uvIndex)}`;
    },

    // Format cloud cover
    formatCloudCover: (cloudCover) => {
        if (cloudCover === null || cloudCover === undefined) return '--';
        return `${Math.round(cloudCover)}%`;
    },

    // Get wind direction
    getWindDirection: (degrees) => {
        if (degrees === null || degrees === undefined) return '--';
        const index = Math.round(degrees / 22.5) % 16;
        return Config.windDirections[index];
    },

    // Get weather icon from code
    getWeatherIcon: (code) => {
        return Config.openmeteo.weatherCodes[code]?.icon || '🌦️';
    },

    // Get weather description from code
    getWeatherDescription: (code) => {
        return Config.openmeteo.weatherCodes[code]?.description || 'Desconhecido';
    },

    // Format date
    formatDate: (dateString) => {
        if (!dateString) return '--';
        const date = new Date(dateString);
        const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    },

    // Format alert level
    formatAlertLevel: (level) => {
        const levels = ['', 'Minor', 'Moderado', 'Severo', 'Extremo'];
        return levels[level] || 'Desconhecido';
    },

    // Get alert level color
    getAlertLevelColor: (level) => {
        const colors = ['', '#2ecc71', '#f39c12', '#e74c3c', '#c0392b'];
        return colors[level] || '#7f8c8d';
    },

    // Convert hex color to RGB array
    hexToRgb: (hex) => {
        if (!hex || hex === '') return [0, 0, 0];
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    },

    // Log debug messages
    log: (message, data = null) => {
        if (Config.app.debug) {
            console.log(`[DEBUG] ${message}`, data);
        }
    },

    // Show error messages
    showError: (message, error = null) => {
        console.error(`[ERROR] ${message}`, error);
    }
};

// Disponibilizar globalmente para o HTML
window.Config = Config;
window.Helpers = Helpers;
