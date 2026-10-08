// ===== Map Module para ArcGIS 5.1.26 =====
import { Config, Helpers } from './config.js';

const MapModule = (function() {
    'use strict';

    let map, view;
    let currentBasemap = Config.arcgis.basemaps.streets;
    let currentLocation = Config.app.defaultLocation;
    let weatherLayer, alertsLayer;

    // Função principal de inicialização
    async function init() {
        try {
            Helpers.log('Inicializando mapa...');

            // Verificar se o ArcGIS está carregado
            if (typeof arcgis === 'undefined') {
                Helpers.log('ArcGIS não carregado. Tentando novamente...');
                setTimeout(init, 200);
                return null;
            }

            const { Map, MapView, GraphicsLayer } = arcgis;

            // Criar o mapa
            map = new Map({
                basemap: currentBasemap
            });

            // Criar a vista do mapa (SEM UI para evitar erros)
            view = new MapView({
                container: 'map-view',
                map: map,
                center: [currentLocation.lng, currentLocation.lat],
                zoom: Config.arcgis.zoom
            });

            // Aguardar que a view esteja pronta
            await view.when();

            // Inicializar camadas
            weatherLayer = new GraphicsLayer();
            alertsLayer = new GraphicsLayer();
            map.add(weatherLayer);
            map.add(alertsLayer);

            // Configurar event listeners
            setupEventListeners();
            updateLocationInfo();

            Helpers.log('✅ Mapa inicializado com sucesso!');
            return { map, view };

        } catch (error) {
            Helpers.showError('Falha ao inicializar mapa', error);
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

        // Botão de localização
        document.getElementById('btn-gps')?.addEventListener('click', getCurrentLocation);
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
            const statusEl = document.getElementById('location-lat');
            if (statusEl) statusEl.textContent = '...';

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
                    Helpers.showError('Erro ao obter localização', error);
                    const statusEl = document.getElementById('location-lat');
                    if (statusEl) statusEl.textContent = '--';
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

        const { Point, SimpleMarkerSymbol, Graphic } = arcgis;

        const point = new Point({
            longitude: longitude,
            latitude: latitude
        });

        const markerSymbol = new SimpleMarkerSymbol({
            style: 'circle',
            color: [255, 0, 0],
            size: 12,
            outline: {
                color: [255, 255, 255],
                width: 2
            }
        });

        const graphic = new Graphic({
            geometry: point,
            symbol: markerSymbol,
            attributes: { title: title }
        });

        weatherLayer.add(graphic);
    }

    // Adicionar dados meteorológicos ao mapa
    function addWeatherData(longitude, latitude, weatherData) {
        if (!weatherLayer || !view) return;

        const { Point, TextSymbol, Graphic } = arcgis;

        weatherLayer.removeAll();

        const point = new Point({
            longitude: longitude,
            latitude: latitude
        });

        const weatherIcon = Helpers.getWeatherIcon(weatherData.weatherCode);
        const weatherSymbol = new TextSymbol({
            text: weatherIcon,
            font: {
                size: 24,
                family: 'emoji'
            },
            color: [255, 255, 255],
            haloColor: [52, 152, 219],
            haloSize: 2
        });

        weatherLayer.add(new Graphic({
            geometry: point,
            symbol: weatherSymbol
        }));

        const tempLabel = new TextSymbol({
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

        weatherLayer.add(new Graphic({
            geometry: point,
            symbol: tempLabel
        }));
    }

    // Adicionar alertas ao mapa
    function addAlertsToMap(alerts) {
        if (!alertsLayer || !view) return;

        const { Point, TextSymbol, Graphic } = arcgis;

        alertsLayer.removeAll();

        alerts.forEach(alert => {
            if (alert.coordinates && alert.coordinates.length > 0) {
                const coord = alert.coordinates[0];
                const point = new Point({
                    longitude: coord[0],
                    latitude: coord[1]
                });

                const alertColor = Helpers.getAlertLevelColor(alert.level);
                const alertIcon = Config.ipma.alertTypes[alert.type]?.icon || '⚠️';

                const alertSymbol = new TextSymbol({
                    text: alertIcon,
                    font: {
                        size: 20,
                        family: 'emoji'
                    },
                    color: [255, 255, 255],
                    haloColor: Helpers.hexToRgb(alertColor),
                    haloSize: 2
                });

                alertsLayer.add(new Graphic({
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
        const latEl = document.getElementById('location-lat');
        const lngEl = document.getElementById('location-lng');
        const nameEl = document.getElementById('location-name');

        if (latEl) latEl.textContent = center.latitude.toFixed(4);
        if (lngEl) lngEl.textContent = center.longitude.toFixed(4);
        if (nameEl) nameEl.textContent = currentLocation.name || 'Portugal';
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
        centerOnCoordinates,
        getView: () => view
    };
})();

// Disponibilizar globalmente
window.MapModule = MapModule;
export default MapModule;
