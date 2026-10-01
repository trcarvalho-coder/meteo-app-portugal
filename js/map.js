// ===== Map Module =====
const MapModule = (function() {
    'use strict';

    let map, view;
    let currentBasemap = 'arcgis-topographic'; // Usar string em vez de objeto
    let currentLocation = { lat: 38.7223, lng: -9.1393, name: 'Lisboa' };
    let weatherLayer, alertsLayer;

    // Função para inicializar o mapa (chamada após ArcGIS carregar)
    function initializeMap() {
        try {
            // Verificar se ArcGIS está carregado
            if (typeof esri === 'undefined' || typeof esri.Map === 'undefined') {
                console.error('ArcGIS API não carregado!');
                setTimeout(initializeMap, 500); // Tentar novamente
                return;
            }

            // Usar esri.Map em vez de Map
            map = new esri.Map({
                basemap: currentBasemap
            });

            view = new esri.views.MapView({
                container: 'map-view',
                map: map,
                center: [currentLocation.lng, currentLocation.lat],
                zoom: 7,
                ui: {
                    components: ['zoom', 'compass', 'attribution']
                }
            });

            setupEventListeners();
            initLayers();
            updateLocationInfo();

            console.log('✅ Mapa inicializado com sucesso!');
            return { map, view };

        } catch (error) {
            console.error('❌ Falha ao inicializar mapa:', error);
            return null;
        }
    }

    function setupEventListeners() {
        // Basemap toggle
        document.getElementById('basemap-streets')?.addEventListener('click', () => {
            changeBasemap('arcgis-topographic');
        });
        document.getElementById('basemap-satellite')?.addEventListener('click', () => {
            changeBasemap('arcgis-imagery');
        });
        document.getElementById('basemap-terrain')?.addEventListener('click', () => {
            changeBasemap('arcgis-terrain');
        });

        // Localização
        document.getElementById('btn-location')?.addEventListener('click', getCurrentLocation);
        document.getElementById('btn-refresh')?.addEventListener('click', refreshData);
    }

    function initLayers() {
        weatherLayer = new esri.layers.GraphicsLayer();
        alertsLayer = new esri.layers.GraphicsLayer();
        map.add(weatherLayer);
        map.add(alertsLayer);
    }

    function changeBasemap(basemapId) {
        currentBasemap = basemapId;
        map.basemap = basemapId;

        document.querySelectorAll('.basemap-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-basemap="${basemapId}"]`)?.classList.add('active');
    }

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

                    if (typeof AppModule !== 'undefined') {
                        AppModule.updateWeatherData(lat, lng);
                    }
                },
                (error) => {
                    console.error('Erro ao obter localização:', error);
                    if (statusEl) statusEl.textContent = 'Erro ao obter localização';
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            alert('Geolocalização não suportada pelo navegador');
        }
    }

    function addLocationMarker(longitude, latitude, title = '') {
        if (!weatherLayer) return;

        const point = new esri.geometry.Point({
            longitude: longitude,
            latitude: latitude
        });

        const markerSymbol = new esri.symbols.SimpleMarkerSymbol({
            style: 'circle',
            color: [255, 0, 0],
            size: 12,
            outline: {
                color: [255, 255, 255],
                width: 2
            }
        });

        const graphic = new esri.Graphic({
            geometry: point,
            symbol: markerSymbol,
            attributes: { title: title }
        });

        weatherLayer.add(graphic);
    }

    function addWeatherData(longitude, latitude, weatherData) {
        if (!weatherLayer || !map) return;

        weatherLayer.removeAll();

        const point = new esri.geometry.Point({
            longitude: longitude,
            latitude: latitude
        });

        const weatherIcon = getWeatherIcon(weatherData.weatherCode);
        const weatherSymbol = new esri.symbols.TextSymbol({
            text: weatherIcon,
            font: {
                size: 24,
                family: 'emoji'
            },
            color: [255, 255, 255],
            haloColor: [52, 152, 219], // azul
            haloSize: 2
        });

        weatherLayer.add(new esri.Graphic({
            geometry: point,
            symbol: weatherSymbol
        }));

        const tempLabel = new esri.symbols.TextSymbol({
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

        weatherLayer.add(new esri.Graphic({
            geometry: point,
            symbol: tempLabel
        }));
    }

    function getWeatherIcon(code) {
        const icons = {
            0: '☀️', 1: '⛅', 2: '☁️', 3: '☁️',
            45: '🌫️', 51: '🌧️', 53: '🌧️', 55: '🌧️',
            61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '❄️',
            67: '❄️', 71: '❄️', 80: '🌧️', 81: '🌧️',
            82: '🌧️', 95: '⛈️'
        };
        return icons[code] || '🌦️';
    }

    function addAlertsToMap(alerts) {
        if (!alertsLayer || !map) return;

        alertsLayer.removeAll();

        alerts.forEach(alert => {
            if (alert.coordinates && alert.coordinates.length > 0) {
                const coord = alert.coordinates[0];
                const point = new esri.geometry.Point({
                    longitude: coord[0],
                    latitude: coord[1]
                });

                const alertColor = getAlertLevelColor(alert.level);
                const alertIcon = getAlertIcon(alert.type);

                const alertSymbol = new esri.symbols.TextSymbol({
                    text: alertIcon,
                    font: {
                        size: 20,
                        family: 'emoji'
                    },
                    color: [255, 255, 255],
                    haloColor: hexToRgb(alertColor),
                    haloSize: 2
                });

                alertsLayer.add(new esri.Graphic({
                    geometry: point,
                    symbol: alertSymbol
                }));
            }
        });
    }

    function getAlertIcon(type) {
        const icons = {
            '1': '🌬️', '2': '🌧️', '3': '🌡️', '4': '❄️', '5': '⛈️'
        };
        return icons[type] || '⚠️';
    }

    function getAlertLevelColor(level) {
        const colors = ['', '#2ecc71', '#f39c12', '#e74c3c', '#c0392b'];
        return colors[level] || '#7f8c8d';
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }

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

    function refreshData() {
        if (currentLocation && typeof AppModule !== 'undefined') {
            AppModule.updateWeatherData(currentLocation.lat, currentLocation.lng);
        }
        if (typeof AppModule !== 'undefined') {
            AppModule.loadAlerts();
        }
    }

    function centerOnCoordinates(longitude, latitude, zoom = null) {
        if (view) {
            view.goTo({
                center: [longitude, latitude],
                zoom: zoom || 7
            });
        }
    }

    // Função pública para inicializar
    function init() {
        // Aguardar que o ArcGIS esteja carregado
        if (typeof esri === 'undefined') {
            setTimeout(init, 200);
            return;
        }
        return initializeMap();
    }

    // Retornar API pública
    return {
        initMap: init,
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
