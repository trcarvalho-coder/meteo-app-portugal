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
    let clickEventHandle = null;

    async function init() {
        try {
            Helpers.log('Inicializando mapa...');

            if (typeof arcgis === 'undefined') {
                Helpers.log('ArcGIS não carregado. Tentando novamente...');
                setTimeout(init, 200);
                return null;
            }

            const { Map, MapView, GraphicsLayer } = arcgis;

            map = new Map({ basemap: currentBasemap });
            view = new MapView({
                container: 'map-view',
                map: map,
                center: [currentLocation.lng, currentLocation.lat],
                zoom: Config.arcgis.zoom
            });

            await view.when();

            weatherLayer = new GraphicsLayer();
            alertsLayer = new GraphicsLayer();
            map.add(weatherLayer);
            map.add(alertsLayer);

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

    function setupEventListeners() {
        document.getElementById('basemap-streets')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.streets);
        });

        document.getElementById('basemap-satellite')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.satellite);
        });

        document.getElementById('basemap-terrain')?.addEventListener('click', () => {
            changeBasemap(Config.arcgis.basemaps.terrain);
        });

        document.getElementById('btn-gps')?.addEventListener('click', getCurrentLocation);
        document.getElementById('btn-clear-selection')?.addEventListener('click', clearMapSelection);
    }

    function toggleMapSelectionMode() {
        if (!mapInitialized || !view) {
            Helpers.showError('Mapa não inicializado ainda. Tente novamente em alguns segundos.');
            return;
        }

        mapSelectionMode = !mapSelectionMode;
        const btn = document.getElementById('btn-map-select');
        const clearBtn = document.getElementById('btn-clear-selection');

        if (mapSelectionMode) {
            btn?.classList.add('active');
            view.cursor = 'crosshair';
            Helpers.log('📍 Clique no mapa para selecionar as coordenadas');

            exitMapSelectionMode();

            clickEventHandle = view.on('click', handleMapClick);
        } else {
            exitMapSelectionMode();
        }
    }

    function handleMapClick(event) {
        const lat = Number(event.mapPoint.latitude);
        const lng = Number(event.mapPoint.longitude);

        currentLocation = { lat, lng, name: 'Localização Selecionada' };
        weatherLayer.removeAll();
        addLocationMarker(lng, lat, 'Localização Selecionada');
        updateLocationInfo();

        const locationSearch = document.getElementById('location-search');
        if (locationSearch) {
            locationSearch.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        const clearBtn = document.getElementById('btn-clear-selection');
        if (clearBtn) clearBtn.style.display = 'inline-block';

        if (typeof window.AppModule !== 'undefined') {
            window.AppModule.updateWeatherData(lat, lng);
        }

        Helpers.log(`✅ Coordenadas selecionadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }

    function exitMapSelectionMode() {
        mapSelectionMode = false;
        const btn = document.getElementById('btn-map-select');
        btn?.classList.remove('active');
        if (view) view.cursor = 'auto';

        if (clickEventHandle) {
            clickEventHandle.remove();
            clickEventHandle = null;
        }
    }

    function clearMapSelection() {
        const locationSearch = document.getElementById('location-search');
        const clearBtn = document.getElementById('btn-clear-selection');
        const latEl = document.getElementById('location-lat');
        const lngEl = document.getElementById('location-lng');
        const nameEl = document.getElementById('location-name');

        if (locationSearch) locationSearch.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        if (latEl) latEl.textContent = '--';
        if (lngEl) lngEl.textContent = '--';
        if (nameEl) nameEl.textContent = '--';

        weatherLayer.removeAll();
        exitMapSelectionMode();
        Helpers.log('🔄 Seleção limpa');
    }

    function changeBasemap(basemapId) {
        if (!mapInitialized || !map) {
            Helpers.showError('Mapa não inicializado ainda. Tente novamente em alguns segundos.');
            return;
        }

        currentBasemap = basemapId;
        map.basemap = basemapId;

        document.querySelectorAll('.basemap-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-basemap="${basemapId}"]`)?.classList.add('active');
    }

    function getCurrentLocation() {
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

                    weatherLayer.removeAll();
                    addLocationMarker(lng, lat, 'Sua Localização');
                    updateLocationInfo();

                    const locationSearch = document.getElementById('location-search');
                    if (locationSearch) {
                        locationSearch.value = currentLocation.name;
                    }

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

    function addLocationMarker(longitude, latitude, title = '') {
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

    function addWeatherData(longitude, latitude, weatherData) {
        if (!mapInitialized || !weatherLayer || !view) {
            return;
        }

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
            font: { size: 24, family: 'emoji' },
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
            font: { size: 12, weight: 'bold' },
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

    function addAlertsToMap(alerts) {
        if (!mapInitialized || !alertsLayer || !view) {
            return;
        }

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
                    font: { size: 20, family: 'emoji' },
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

    function updateLocationInfo() {
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

    function centerOnCoordinates(longitude, latitude, zoom = null) {
        if (!mapInitialized || !view) {
            return;
        }

        view.goTo({
            center: [longitude, latitude],
            zoom: zoom || Config.arcgis.zoom
        });
    }

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
        clearMapSelection,
        exitMapSelectionMode,
        getView: () => view,
        isInitialized: () => mapInitialized
    };
})();

window.MapModule = MapModule;
export default MapModule;
