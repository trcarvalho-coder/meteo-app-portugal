// ===== Map Module para ArcGIS 5.1.26 =====
import { Config, Helpers } from './config.js';

const MapModule = (function() {
    'use strict';

    let map, view;
    let mapInitialized = false;
    let currentBasemap = Config.arcgis.basemaps.streets;
    let currentLocation = Config.app.defaultLocation;
    let weatherLayer, alertsLayer;
    let mapSelectionMode = false;
    let selectionClickHandler = null;

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

            mapInitialized = true;
            Helpers.log('✅ Mapa inicializado com sucesso!');
            return { map, view };

        } catch (error) {
            Helpers.showError('Falha ao inicializar mapa', error);
            mapInitialized = false;
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

        // Botão de seleção de localização no mapa
        document.getElementById('btn-map-select')?.addEventListener('click', toggleMapSelectionMode);
    }

    // Alternar modo de seleção de localização no mapa
    function toggleMapSelectionMode() {
        if (!mapInitialized || !view) {
            Helpers.showError('Mapa não inicializado ainda. Tente novamente em alguns segundos.');
            return;
        }

        mapSelectionMode = !mapSelectionMode;
        const btn = document.getElementById('btn-map-select');

        if (mapSelectionMode) {
            // Entrar em modo de seleção
            btn?.classList.add('active');
            view.cursor = 'crosshair';
            Helpers.log('Clique no mapa para selecionar as coordenadas');

            // Remover handler anterior se existir
            if (selectionClickHandler) {
                view.off('click', selectionClickHandler);
            }

            // Adicionar novo handler de clique
            selectionClickHandler = (event) => {
                const lat = event.mapPoint.latitude.toFixed(4);
                const lng = event.mapPoint.longitude.toFixed(4);
                
                // Atualizar localização
                currentLocation = { lat: parseFloat(lat), lng: parseFloat(lng), name: 'Localização Selecionada' };
                
                // Adicionar marcador
                addLocationMarker(parseFloat(lng), parseFloat(lat), 'Localização Selecionada');
                
                // Atualizar informações de localização
                updateLocationInfo();
                
                // Sair do modo de seleção
                exitMapSelectionMode();
                
                // Atualizar dados meteorológicos
                if (typeof window.AppModule !== 'undefined') {
                    window.AppModule.updateWeatherData(parseFloat(lat), parseFloat(lng));
                }
                
                Helpers.log(`📍 Coordenadas selecionadas: ${lat}, ${lng}`);
            };

            view.on('click', selectionClickHandler);
        } else {
            exitMapSelectionMode();
        }
    }

    // Sair do modo de seleção de localização no mapa
    function exitMapSelectionMode() {
        mapSelectionMode = false;
        const btn = document.getElementById('btn-map-select');
        btn?.classList.remove('active');
        view.cursor = 'auto';

        if (selectionClickHandler) {
            view.off('click', selectionClickHandler);
            selectionClickHandler = null;
        }
    }

    // Mudar basemap
    function changeBasemap(basemapId) {
        // Guard: check if map is initialized
        if (!mapInitialized || !map) {
            Helpers.showError('Mapa não inicializado ainda. Tente novamente em alguns segundos.');
            return;
        }

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
        // Guard: check if map and view are initialized
        if (!mapInitialized || !view) {
            Helpers.showError('Mapa não inicializado ainda. Tente novamente em alguns segundos.');
            return;
        }

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
        // Guard: check if layers and view are initialized
        if (!mapInitialized || !weatherLayer || !view) {
            return;
        }

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
        // Guard: check if layers and view are initialized
        if (!mapInitialized || !weatherLayer || !view) {
            return;
        }

        // Guard: check if weatherData is valid
        if (!weatherData) {
            return;
        }

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
            text: `${Math.round(weatherData.temperature != null ? weatherData.temperature : 0)}°C`,
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
        // Guard: check if layers and view are initialized
        if (!mapInitialized || !alertsLayer || !view) {
            return;
        }

        // Guard: check if alerts is valid array
        if (!Array.isArray(alerts)) {
            return;
        }

        const { Point, TextSymbol, Graphic } = arcgis;

        alertsLayer.removeAll();

        alerts.forEach(alert => {
            if (alert && alert.coordinates && alert.coordinates.length > 0) {
                const coord = alert.coordinates[0];
                const point = new Point({
                    longitude: coord[0],
                    latitude: coord[1]
                });

                const alertColor = Helpers.getAlertLevelColor(alert.level);
                const alertIcon = Config.ipma.alertTypes[String(alert.type)]?.icon || '⚠️';

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
        // Guard: check if view is initialized
        if (!mapInitialized || !view) {
            return;
        }

        const center = view.center;
        const latEl = document.getElementById('location-lat');
        const lngEl = document.getElementById('location-lng');
        const nameEl = document.getElementById('location-name');

        if (latEl && center) latEl.textContent = center.latitude.toFixed(4);
        if (lngEl && center) lngEl.textContent = center.longitude.toFixed(4);
        if (nameEl) nameEl.textContent = currentLocation.name || 'Portugal';
    }

    // Centrar no mapa em coordenadas
    function centerOnCoordinates(longitude, latitude, zoom = null) {
        // Guard: check if view is initialized
        if (!mapInitialized || !view) {
            return;
        }

        view.goTo({
            center: [longitude, latitude],
            zoom: zoom || Config.arcgis.zoom
        });
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
        toggleMapSelectionMode,
        getView: () => view,
        isInitialized: () => mapInitialized
    };
})();

// Disponibilizar globalmente
window.MapModule = MapModule;
export default MapModule;
