// ===== Map Module =====
const MapModule = (function() {
    'use strict';

    let map, view;
    let currentBasemap = Config.arcgis.basemaps.streets;
    let currentLocation = Config.app.defaultLocation;
    let weatherLayer, alertsLayer;

    function initMap() {
        try {
            map = new Map({ basemap: currentBasemap });
            view = new MapView({
                container: 'map-view',
                map: map,
                center: [currentLocation.lng, currentLocation.lat],
                zoom: Config.arcgis.zoom,
                ui: { components: ['zoom', 'compass', 'attribution'] }
            });

            setupEventListeners();
            initLayers();
            updateLocationInfo();
            return { map, view };
        } catch (error) {
            console.error('Failed to initialize map', error);
            return null;
        }
    }

    function setupEventListeners() {
        document.getElementById('basemap-streets').addEventListener('click', () => changeBasemap(Config.arcgis.basemaps.streets));
        document.getElementById('basemap-satellite').addEventListener('click', () => changeBasemap(Config.arcgis.basemaps.satellite));
        document.getElementById('basemap-terrain').addEventListener('click', () => changeBasemap(Config.arcgis.basemaps.terrain));
        document.getElementById('btn-location').addEventListener('click', getCurrentLocation);
        document.getElementById('btn-refresh').addEventListener('click', () => AppModule.updateWeatherData(currentLocation.lat, currentLocation.lng));

        view.on('click', (event) => {
            const lat = event.mapPoint.latitude;
            const lng = event.mapPoint.longitude;
            currentLocation = { lat, lng, name: 'Localização Selecionada' };
            addLocationMarker(lng, lat, 'Localização Selecionada');
            updateLocationInfo();
            AppModule.updateWeatherData(lat, lng);
        });
    }

    function initLayers() {
        weatherLayer = new GraphicsLayer(); map.add(weatherLayer);
        alertsLayer = new GraphicsLayer(); map.add(alertsLayer);
    }

    function changeBasemap(basemapId) {
        currentBasemap = basemapId;
        map.basemap = basemapId;
        document.querySelectorAll('.basemap-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-basemap="${basemapId}"]`).classList.add('active');
    }

    function getCurrentLocation() {
        if (navigator.geolocation) {
            document.getElementById('current-location').textContent = 'A obter localização...';
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    currentLocation = { lat, lng, name: 'Localização Atual' };
                    view.goTo({ center: [lng, lat], zoom: 12 });
                    addLocationMarker(lng, lat, 'Sua Localização');
                    updateLocationInfo();
                    AppModule.updateWeatherData(lat, lng);
                },
                (error) => {
                    console.error('Erro ao obter localização', error);
                    document.getElementById('current-location').textContent = 'Erro ao obter localização';
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            alert('Geolocalização não suportada');
        }
    }

    function addLocationMarker(longitude, latitude, title = '') {
        const point = new Point({ longitude, latitude });
        const markerSymbol = new SimpleMarkerSymbol({
            style: 'circle', color: new Color([255, 0, 0]), size: 12,
            outline: { color: [255, 255, 255], width: 2 }
        });
        const graphic = new Graphic({ geometry: point, symbol: markerSymbol, attributes: { title } });
        weatherLayer.add(graphic);
    }

    function addWeatherData(longitude, latitude, weatherData) {
        weatherLayer.removeAll();
        const point = new Point({ longitude, latitude });
        const weatherIcon = Helpers.getWeatherIcon(weatherData.weatherCode);
        const weatherSymbol = new TextSymbol({
            text: weatherIcon, font: { size: 24, family: 'emoji' },
            color: new Color([255, 255, 255]), haloColor: new Color('#3498db'), haloSize: 2
        });
        weatherLayer.add(new Graphic({ geometry: point, symbol: weatherSymbol }));

        const tempLabel = new TextSymbol({
            text: `${Math.round(weatherData.temperature)}°C`, font: { size: 12, weight: 'bold' },
            color: new Color([255, 255, 255]), haloColor: new Color([0, 0, 0, 0.5]), haloSize: 1, yoffset: 25
        });
        weatherLayer.add(new Graphic({ geometry: point, symbol: tempLabel }));
    }

    function addAlertsToMap(alerts) {
        alertsLayer.removeAll();
        alerts.forEach(alert => {
            if (alert.coordinates && alert.coordinates.length > 0) {
                const coord = alert.coordinates[0];
                const point = new Point({ longitude: coord[0], latitude: coord[1] });
                const alertColor = Helpers.getAlertLevelColor(alert.level);
                const alertSymbol = new TextSymbol({
                    text: Config.ipma.alertTypes[alert.type]?.icon || '⚠️',
                    font: { size: 20, family: 'emoji' },
                    color: new Color([255, 255, 255]), haloColor: new Color(alertColor), haloSize: 2
                });
                alertsLayer.add(new Graphic({ geometry: point, symbol: alertSymbol }));
            }
        });
    }

    function updateLocationInfo() {
        if (!view) return;
        const center = view.center;
        const locationInfo = document.getElementById('current-location');
        const lat = center.latitude.toFixed(4), lng = center.longitude.toFixed(4);
        locationInfo.innerHTML = `<strong>Lat: ${lat}, Lng: ${lng}</strong>`;
    }

    function centerOnCoordinates(longitude, latitude, zoom = null) {
        view.goTo({ center: [longitude, latitude], zoom: zoom || Config.arcgis.zoom });
    }

    return {
        initMap, changeBasemap, getCurrentLocation, addLocationMarker,
        addWeatherData, addAlertsToMap, updateLocationInfo, centerOnCoordinates
    };
})();
window.MapModule = MapModule;
