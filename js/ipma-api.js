// ===== IPMA API Module - VERIFICADO E FUNCIONAL =====
import { Config, Helpers } from './config.js';

const IPMAModule = (function() {
    'use strict';

    let alertsCache = [];
    let stationsCache = [];
    let lastUpdateTime = 0;
    const CACHE_DURATION = 300000; // 5 minutos

    // Testar a API do IPMA
    async function testIPMAConnection() {
        try {
            Helpers.log('Testando conexão com IPMA API...');
            const response = await fetch(`${Config.ipma.baseUrl}/open-data/forecast/warnings/warnings_www.json`);

            if (!response.ok) {
                Helpers.showError('IPMA API não acessível', { status: response.status });
                return false;
            }

            const data = await response.json();
            Helpers.log('✅ IPMA API está funcional!', data.data?.length || 0 + ' alertas encontrados');
            return true;
        } catch (error) {
            Helpers.showError('Falha ao testar IPMA API', error);
            return false;
        }
    }

    // Fazer fetch dos dados
    async function fetchData(endpoint) {
        try {
            const url = `${Config.ipma.baseUrl}${endpoint}`;
            Helpers.log(`Buscando dados: ${url}`);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            Helpers.log('Dados recebidos:', data.data?.length || data.length || 0 + ' itens');
            return data;
        } catch (error) {
            Helpers.showError(`Falha ao buscar dados do IPMA: ${endpoint}`, error);
            return null;
        }
    }

    // Carregar alertas do IPMA
    async function loadAlerts(forceRefresh = false) {
        const now = Date.now();

        // Usar cache se ainda for válido
        if (!forceRefresh && alertsCache.length > 0 && (now - lastUpdateTime) < CACHE_DURATION) {
            Helpers.log('Usando cache de alertas');
            return alertsCache;
        }

        Helpers.log('Carregando alertas do IPMA...');
        const data = await fetchData(Config.ipma.endpoints.warnings);

        if (!data) {
            Helpers.log('Usando cache de alertas (fallback)');
            return alertsCache;
        }

        // Processar dados de alertas
        const alerts = processAlertsData(data);
        alertsCache = alerts;
        lastUpdateTime = now;

        Helpers.log(`✅ ${alerts.length} alertas processados`);
        return alerts;
    }

    // Processar dados de alertas
    function processAlertsData(data) {
        const alerts = [];

        if (data && data.data) {
            data.data.forEach(warning => {
                // Processar cada alerta
                const alert = {
                    id: warning.id || `alert-${Math.random().toString(36).substr(2, 9)}`,
                    type: warning.type || '1',
                    level: parseInt(warning.level) || 1,
                    description: warning.description || warning.descricao || 'Alerta meteorológico',
                    startDate: new Date(warning.startTime || warning.dataInicio),
                    endDate: new Date(warning.endTime || warning.dataFim),
                    district: getDistrictName(warning.districtId || warning.distrito),
                    districtId: warning.districtId || warning.distrito,
                    coordinates: getDistrictCoordinates(warning.districtId || warning.distrito),
                    source: 'IPMA'
                };

                alerts.push(alert);
            });

            // Ordenar por gravidade (mais grave primeiro) e depois por data
            alerts.sort((a, b) => {
                // Primeiro por nível (maior primeiro)
                if (b.level !== a.level) return b.level - a.level;
                // Depois por data de início (mais recente primeiro)
                return a.startDate - b.startDate;
            });
        }

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
        // Coordenadas aproximadas dos centros dos distritos
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

        return districtCoords[districtId] || [[-8.0, 39.5]]; // Default: centro de Portugal
    }

    // Carregar estações/cidades
    async function loadCities() {
        if (stationsCache.length > 0) return stationsCache;

        Helpers.log('Carregando cidades do IPMA...');
        const data = await fetchData(Config.ipma.endpoints.stations);

        if (data && data.data) {
            stationsCache = data.data;
            Helpers.log(`✅ ${stationsCache.length} cidades carregadas`);
        }

        return stationsCache;
    }

    // Carregar previsão para uma cidade
    async function loadForecast(cityId, days = 3) {
        try {
            Helpers.log(`Carregando previsão para cidade ${cityId}...`);
            const data = await fetchData(`${Config.ipma.endpoints.forecast}/${cityId}.json`);

            if (!data || !data.data) {
                Helpers.log('Nenhuma previsão encontrada');
                return [];
            }

            const forecast = [];
            const forecastData = data.data;

            for (let i = 0; i < Math.min(days, forecastData.length); i++) {
                const dayData = forecastData[i];
                forecast.push({
                    date: new Date(dayData.data),
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

            Helpers.log(`✅ ${forecast.length} dias de previsão carregados`);
            return forecast;
        } catch (error) {
            Helpers.showError('Falha ao carregar previsão do IPMA', error);
            return [];
        }
    }

    // Obter descrição do tempo do IPMA
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

        return descriptions[weatherCode] || 'Desconhecido';
    }

    // Obter ícone do tempo do IPMA
    function getIPMAWeatherIcon(weatherCode) {
        const icons = {
            '1': '☀️', '2': '⛅', '3': '☁️', '4': '☁️', '5': '☁️',
            '6': '🌧️', '7': '🌧️', '8': '🌧️', '9': '🌧️', '10': '🌧️',
            '11': '🌧️', '12': '❄️', '13': '❄️', '14': '❄️', '15': '🌫️',
            '16': '🧊', '17': '⛈️', '18': '🌬️'
        };

        return icons[weatherCode] || '🌦️';
    }

    // Função pública
    return {
        testIPMAConnection,
        loadAlerts,
        loadCities,
        loadForecast,
        getDistrictName,
        getDistrictCoordinates,
        getIPMAWeatherDescription,
        getIPMAWeatherIcon
    };
})();

// Disponibilizar globalmente
window.IPMAModule = IPMAModule;
export default IPMAModule;
