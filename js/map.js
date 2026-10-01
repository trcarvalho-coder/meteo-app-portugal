// ===== Map Module =====
import { Config, Helpers } from './config.js';

const MapModule = (function() {
    'use strict';

    let map, view;
    let currentBasemap = Config.arcgis.basemaps.streets;
    let currentLocation = Config.app.defaultLocation;
    let weatherLayer, alertsLayer;

    // Função principal de inicialização
    function init() {
        try {
            // Verificar se o ArcGIS está carregado
            if (typeof arcgis === 'undefined' || typeof arcgis.Map === 'undefined') {
                console.log('⏳ ArcGIS não carregado. Tentando novamente...');
                setTimeout(init, 200);
                return null;
            }

            // Criar o mapa
            map = new arcgis.Map({
                basemap: currentBasemap
            });

            // Criar a vista do mapa
            view = new arcgis.MapView({
                container: 'map-view',
                map: map,
                center: [currentLocation.lng, currentLocation.lat],
                zoom: Config.arcgis.zoom,
                ui: {
                    components: ['zoom', 'compass', 'attribution']
                }
            });

            // Inicializar camadas
            weatherLayer = new arcgis.GraphicsLayer();
            alertsLayer = new arcgis.GraphicsLayer();
            map.add(weatherLayer);
            map.add(alertsLayer);

            // Configurar event listeners
            setupEventListeners();
            updateLocationInfo();

            console.log('✅ Mapa inicializado com sucesso (ArcGIS 5.1.26)!');
            return { map, view };

        } catch (error) {
            console.error('❌ Falha ao inicializar mapa:', error);
            return null;
        }
    }

    // Configurar event listeners
    function setupEventListeners() {
        // Botões de basemap
        document.getElementById('basemap-streets')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.streets);
        });

        document.getElementById('basemap-satellite')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.satellite);
        });

        document.getElementById('basemap-terrain')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.terrain);
        });

        // Botões de localização
        document.getElementById('btn-location')?.addEventListener('click', getCurrentLocation);
        document.getElementById('btn-refresh')?.addEventListener('click', refreshData);

        // Evento de clique no mapa
        view?.on('click', (event) => {
            const lat = event.mapPoint.latitude;
            const lng = event.mapPoint.longitude;
            currentLocation = { lat, lng, name: 'Localização Selecionada' };
            addLocationMarker(lng, lat, 'Localização Selecionada');
            updateLocationInfo();

            if (typeof window.AppModule !== 'undefined') {
                window.AppModule.updateWeatherData(lat, lng);
            }
        });
    }

    // Mudar basemap
    function changeBasemap(basemapId) {
        currentBasemap = basemapId;
        map.basemap = basemapId;

        // Atualizar botões ativos
        document.querySelectorAll('.basemap-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-basemap="${basemapId}"]`)?.classList.add('active');
    }

    // Obter localização atual
    function getCurrentLocation() {
        if (navigator.geolocation) {
            const statusEl = document.getElementById('current-location');
            if (statusEl) statusEl.textContent = 'A obter localização...';

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    currentLocation = { lat, lng, name: 'Localização Atual' };

                    view.goTo({
                        center: [lng, lat],
                        zoom: 12
                    });

                    addLocationMarker(lng, lat, 'Sua Localização');
                    updateLocationInfo();

                    if (typeof window.AppModule !== 'undefined') {
                        window.AppModule.updateWeatherData(lat, lng);
                    }
                },
                (error) => {
                    console.error('❌ Erro ao obter localização:', error);
                    if (statusEl) statusEl.textContent = 'Erro ao obter localização';
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            alert('⚠️ Geolocalização não suportada pelo navegador');
        }
    }

    // Adicionar marcador de localização
    function addLocationMarker(longitude, latitude, title = '') {
        if (!weatherLayer || !view) return;

        const point = new arcgis.Point({
            longitude: longitude,
            latitude: latitude
        });

        const markerSymbol = new arcgis.SimpleMarkerSymbol({
            style: 'circle',
            color: [255, 0, 0],
            size: 12,
            outline: {
                color: [255, 255, 255],
                width: 2
            }
        });

        const graphic = new arcgis.Graphic({
            geometry: point,
            symbol: markerSymbol,
            attributes: { title: title }
        });

        weatherLayer.add(graphic);
    }

    // Adicionar dados meteorológicos ao mapa
    function addWeatherData(longitude, latitude, weatherData) {
        if (!weatherLayer || !view) return;

        weatherLayer.removeAll();

        const point = new arcgis.Point({
            longitude: longitude,
            latitude: latitude
        });

        const weatherIcon = Helpers.getWeatherIcon(weatherData.weatherCode);
        const weatherSymbol = new arcgis.TextSymbol({
            text: weatherIcon,
            font: {
                size: 24,
                family: 'emoji'
            },
            color: [255, 255, 255],
            haloColor: [52, 152, 219], // Azul
            haloSize: 2
        });

        weatherLayer.add(new arcgis.Graphic({
            geometry: point,
            symbol: weatherSymbol
        }));

        // Adicionar label de temperatura
        const tempLabel = new arcgis.TextSymbol({
            text: `${Math.round(weatherData.temperature || 0)}°C`,
            font: {
                size: 12,
                weight: 'bold'
            },
            color: [255, 255, 255],
            haloColor: [0, 0, 0, 0.5],
            haloSize: 1,
            yoffset: 25
        });

        weatherLayer.add(new arcgis.Graphic({
            geometry: point,
            symbol: tempLabel
        }));
    }

    // Adicionar alertas ao mapa
    function addAlertsToMap(alerts) {
        if (!alertsLayer || !view) return;

        alertsLayer.removeAll();

        alerts.forEach(alert => {
            if (alert.coordinates && alert.coordinates.length > 0) {
                const coord = alert.coordinates[0];
                const point = new arcgis.Point({
                    longitude: coord[0],
                    latitude: coord[1]
                });

                const alertColor = Helpers.getAlertLevelColor(alert.level);
                const alertIcon = Config.ipma.alertTypes[alert.type]?.icon || '⚠️';

                const alertSymbol = new arcgis.TextSymbol({
                    text: alertIcon,
                    font: {
                        size: 20,
                        family: 'emoji'
                    },
                    color: [255, 255, 255],
                    haloColor: Helpers.hexToRgb(alertColor),
                    haloSize: 2
                });

                alertsLayer.add(new arcgis.Graphic({
                    geometry: point,
                    symbol: alertSymbol
                }));
            }
        });
    }

    // Atualizar informações de localização
    function updateLocationInfo() {
        if (!view) return;

        const center = view.center;
        const locationInfo = document.getElementById('current-location');

        if (locationInfo) {
            const lat = center.latitude.toFixed(4);
            const lng = center.longitude.toFixed(4);
            locationInfo.innerHTML = `<strong>Lat: ${lat}, Lng: ${lng}</strong>`;
        }
    }

    // Atualizar dados
    function refreshData() {
        if (currentLocation && typeof window.AppModule !== 'undefined') {
            window.AppModule.updateWeatherData(currentLocation.lat, currentLocation.lng);
        }
        if (typeof window.AppModule !== 'undefined') {
            window.AppModule.loadAlerts();
        }
    }

    // Centrar no mapa em coordenadas
    function centerOnCoordinates(longitude, latitude, zoom = null) {
        if (view) {
            view.goTo({
                center: [longitude, latitude],
                zoom: zoom || Config.arcgis.zoom
            });
        }
    }

    // Função pública
    return {
        init,
        changeBasemap,
        getCurrentLocation,
        addLocationMarker,
        addWeatherData,
        addAlertsToMap,
        updateLocationInfo,
        centerOnCoordinates
    };
})();

// Disponibilizar globalmente
window.MapModule = MapModule;
export default MapModule;
