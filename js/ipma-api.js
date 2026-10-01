// ===== IPMA API Module =====
import { Config, Helpers } from './config.js';

const IPMAModule = (function() {
    'use strict';

    let alertsCache = [];
    let forecastCache = {};
    let stationsCache = [];
    let lastUpdateTime = 0;
    const CACHE_DURATION = 300000; // 5 minutos

    // Fazer fetch dos dados
    async function fetchData(endpoint) {
        try {
            const response = await fetch(`${Config.ipma.baseUrl}${endpoint}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`❌ Falha ao buscar dados do IPMA: ${endpoint}`, error);
            return null;
        }
    }

    // Carregar alertas
    async function loadAlerts(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && alertsCache.length > 0 && (now - lastUpdateTime) < CACHE_DURATION) {
            return alertsCache;
        }

        const data = await fetchData(Config.ipma.endpoints.warnings);
        if (!data) return alertsCache;

        const alerts = [];
        if (data && data.data) {
            data.data.forEach(warning => {
                alerts.push({
                    id: warning.id || Math.random().toString(36).substr(2, 9),
                    type: warning.type || '1',
                    level: parseInt(warning.level) || 1,
                    description: warning.description || 'Alerta meteorológico',
                    startDate: new Date(warning.startTime || warning.startDate),
                    endDate: new Date(warning.endTime || warning.endDate),
                    district: getDistrictName(warning.districtId || warning.district),
                    districtId: warning.districtId || warning.district,
                    coordinates: getDistrictCoordinates(warning.districtId || warning.district)
                });
            });

            // Ordenar por gravidade (mais grave primeiro) e depois por data
            alerts.sort((a, b) => b.level - a.level || a.startDate - b.startDate);
        }

        alertsCache = alerts;
        lastUpdateTime = now;
        return alerts;
    }

    // Obter nome do distrito
    function getDistrictName(districtId) {
        if (!districtId) return 'Desconhecido';
        const district = Config.ipma.districts.find(d => d.id === districtId.toString());
        return district ? district.name : districtId;
    }

    // Obter coordenadas do distrito
    function getDistrictCoordinates(districtId) {
        const districtCoords = {
            '01': [[-8.8, 41.7]], '02': [[-7.7, 41.3]], '03': [[-8.4, 41.6]],
            '04': [[-6.8, 41.8]], '05': [[-7.9, 40.7]], '06': [[-7.3, 40.5]],
            '07': [[-8.4, 40.2]], '08': [[-7.5, 39.8]], '09': [[-8.8, 39.8]],
            '10': [[-9.1, 38.7]], '11': [[-7.4, 39.3]], '12': [[-8.7, 38.5]],
            '13': [[-7.9, 38.6]], '14': [[-7.9, 38.0]], '15': [[-7.9, 37.0]],
            '20': [[-28.0, 38.0]], '30': [[-16.0, 32.7]]
        };
        return districtCoords[districtId] || [[-8.0, 39.5]];
    }

    // Carregar cidades
    async function loadCities() {
        if (stationsCache.length > 0) return stationsCache;
        const data = await fetchData(Config.ipma.endpoints.stations);
        if (data && data.data) stationsCache = data.data;
        return stationsCache;
    }

    // Função pública
    return {
        loadAlerts,
        loadCities,
        getDistrictName,
        getDistrictCoordinates
    };
})();

// Disponibilizar globalmente
window.IPMAModule = IPMAModule;
export default IPMAModule;
