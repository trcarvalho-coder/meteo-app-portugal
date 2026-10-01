// ===== Application Configuration =====
export const Config = {
    // ArcGIS Configuration
    arcgis: {
        apiUrl: 'https://js.arcgis.com/5.1.26/',
        basemaps: {
            streets: 'arcgis-topographic',
            satellite: 'arcgis-imagery',
            terrain: 'arcgis-terrain'
        },
        center: [-8.0, 39.5], // Portugal center
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
            51: { icon: '🌧️', description: 'Chuva fraca' },
            53: { icon: '🌧️', description: 'Chuva moderada' },
            55: { icon: '🌧️', description: 'Chuva forte' },
            61: { icon: '🌧️', description: 'Chuva fraca' },
            63: { icon: '🌧️', description: 'Chuva moderada' },
            65: { icon: '🌧️', description: 'Chuva forte' },
            66: { icon: '❄️', description: 'Neve fraca' },
            67: { icon: '❄️', description: 'Neve forte' },
            71: { icon: '❄️', description: 'Granizo' },
            80: { icon: '🌧️', description: 'Aguaceiros' },
            81: { icon: '🌧️', description: 'Aguaceiros moderados' },
            82: { icon: '🌧️', description: 'Aguaceiros fortes' },
            95: { icon: '⛈️', description: 'Trovoada' }
        }
    },

    // Application Settings
    app: {
        defaultLocation: {
            lat: 38.7223,
            lng: -9.1393,
            name: 'Lisboa, Portugal'
        },
        updateInterval: 300000, // 5 minutes
        maxForecastDays: 7,
        debug: false
    },

    windDirections: [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ]
};

// ===== Helper Functions =====
export const Helpers = {
    formatTemperature: (temp) => temp ? `${Math.round(temp)}°C` : '--',
    formatWindSpeed: (speed) => speed ? `${Math.round(speed * 3.6)} km/h` : '--',
    formatHumidity: (humidity) => humidity ? `${Math.round(humidity)}%` : '--',
    formatPrecipitation: (precip) => precip ? `${precip.toFixed(1)} mm` : '--',
    formatPressure: (pressure) => pressure ? `${Math.round(pressure)} hPa` : '--',
    formatVisibility: (visibility) => visibility ? `${(visibility / 1000).toFixed(1)} km` : '--',
    formatUVIndex: (uvIndex) => uvIndex ? `${Math.round(uvIndex)}` : '--',
    formatCloudCover: (cloudCover) => cloudCover ? `${Math.round(cloudCover)}%` : '--',

    getWindDirection: (degrees) => {
        if (degrees === null || degrees === undefined) return '--';
        const index = Math.round(degrees / 22.5) % 16;
        return Config.windDirections[index];
    },

    getWeatherIcon: (code) => Config.openmeteo.weatherCodes[code]?.icon || '🌦️',
    getWeatherDescription: (code) => Config.openmeteo.weatherCodes[code]?.description || 'Desconhecido',

    formatDate: (dateString) => {
        if (!dateString) return '--';
        const date = new Date(dateString);
        const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    },

    formatAlertLevel: (level) => ['', 'Minor', 'Moderado', 'Severo', 'Extremo'][level] || 'Desconhecido',
    getAlertLevelColor: (level) => ['', '#2ecc71', '#f39c12', '#e74c3c', '#c0392b'][level] || '#7f8c8d',

    hexToRgb: (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }
};

// Disponibilizar globalmente para o HTML
window.Config = Config;
window.Helpers = Helpers;
