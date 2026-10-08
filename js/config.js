// ===== Application Configuration =====
export const Config = {
    arcgis: {
        apiUrl: 'https://js.arcgis.com/5.1.26/',
        basemaps: {
            streets: 'topo-vector',
            satellite: 'satellite',
            terrain: 'terrain'
        },
        center: [-8.0, 39.5],
        zoom: 7
    },

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
            { id: '20', name: 'Açores' },
            { id: '30', name: 'Madeira' }
        ],
        alertTypes: {
            '1': { name: 'Vento Forte', icon: '🌬️', color: '#3498db' },
            '2': { name: 'Precipitação', icon: '🌧️', color: '#2980b9' },
            '3': { name: 'Temperatura', icon: '🌡️', color: '#e74c3c' },
            '4': { name: 'Neve', icon: '❄️', color: '#9b59b6' },
            '5': { name: 'Trovoada', icon: '⛈️', color: '#f39c12' }
        }
    },

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
            48: { icon: '🌫️', description: 'Neblina com geada' },
            51: { icon: '🌧️', description: 'Chuva fraca' },
            53: { icon: '🌧️', description: 'Chuva moderada' },
            55: { icon: '🌧️', description: 'Chuva forte' },
            56: { icon: '🌧️', description: 'Chuva forte' },
            57: { icon: '🌧️', description: 'Chuva forte' },
            61: { icon: '🌧️', description: 'Chuva fraca' },
            63: { icon: '🌧️', description: 'Chuva moderada' },
            65: { icon: '🌧️', description: 'Chuva forte' },
            66: { icon: '❄️', description: 'Neve fraca' },
            67: { icon: '❄️', description: 'Neve forte' },
            71: { icon: '❄️', description: 'Neve fraca' },
            73: { icon: '❄️', description: 'Neve moderada' },
            75: { icon: '❄️', description: 'Neve forte' },
            77: { icon: '❄️', description: 'Granizo' },
            80: { icon: '🌧️', description: 'Aguaceiros' },
            81: { icon: '🌧️', description: 'Aguaceiros moderados' },
            82: { icon: '🌧️', description: 'Aguaceiros fortes' },
            85: { icon: '❄️', description: 'Neve miúda' },
            86: { icon: '❄️', description: 'Neve miúda forte' },
            95: { icon: '⛈️', description: 'Trovoada' }
        }
    },

    app: {
        defaultLocation: {
            lat: 38.7223,
            lng: -9.1393,
            name: 'Lisboa, Portugal'
        },
        updateInterval: 300000,
        maxForecastDays: 7,
        debug: true
    },

    windDirections: [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ]
};

export const Helpers = {
    formatTemperature: (temp) => temp != null ? `${Math.round(temp)}°C` : '--',
    formatWindSpeed: (speed) => speed != null ? `${Math.round(speed * 3.6)} km/h` : '--',
    formatHumidity: (humidity) => humidity != null ? `${Math.round(humidity)}%` : '--',
    formatPrecipitation: (precip) => precip != null ? `${precip.toFixed(1)} mm` : '--',
    formatPressure: (pressure) => pressure != null ? `${Math.round(pressure)} hPa` : '--',
    formatVisibility: (visibility) => visibility != null ? `${(visibility / 1000).toFixed(1)} km` : '--',
    formatUVIndex: (uvIndex) => uvIndex != null ? `${Math.round(uvIndex)}` : '--',
    formatCloudCover: (cloudCover) => cloudCover != null ? `${Math.round(cloudCover)}%` : '--',

    getWindDirection: (degrees) => {
        if (degrees == null || Number.isNaN(Number(degrees))) return '--';
        const normalized = Number(degrees) % 360;
        const index = Math.round((normalized + 360) % 360 / 22.5) % 16;
        return Config.windDirections[index];
    },

    getWeatherIcon: (code) => Config.openmeteo.weatherCodes[code]?.icon || '🌦️',
    getWeatherDescription: (code) => Config.openmeteo.weatherCodes[code]?.description || 'Desconhecido',

    formatDate: (dateString) => {
        if (!dateString) return '--';
        const date = new Date(dateString);
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
    },

    formatAlertLevel: (level) => ['', 'Minor', 'Moderado', 'Severo', 'Extremo'][level] || 'Desconhecido',
    getAlertLevelColor: (level) => ['', '#2ecc71', '#f39c12', '#e74c3c', '#c0392b'][level] || '#7f8c8d',

    hexToRgb: (hex) => {
        if (!hex) return [255, 255, 255];
        const cleaned = hex.replace('#', '').trim();
        if (cleaned.length === 3) {
            return cleaned.split('').map(ch => parseInt(ch + ch, 16));
        }
        if (cleaned.length !== 6) return [255, 255, 255];
        const r = parseInt(cleaned.slice(0, 2), 16);
        const g = parseInt(cleaned.slice(2, 4), 16);
        const b = parseInt(cleaned.slice(4, 6), 16);
        return [r, g, b];
    },

    log: (message, data = null) => {
        if (Config.app.debug) console.log(`[DEBUG] ${message}`, data);
    },

    showError: (message, error = null) => {
        console.error(`[ERROR] ${message}`, error);
    }
};

window.Config = Config;
window.Helpers = Helpers;
