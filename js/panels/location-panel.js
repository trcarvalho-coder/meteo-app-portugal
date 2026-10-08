// ===== Autonomous Location Panel with Search and Map Selection =====

const LocationPanel = (function() {
    'use strict';

    let currentLocation = null;
    let isExpanded = true;
    let onLocationChangeCallback = null;

    // ===== DOM Elements =====
    const getElements = () => ({
        panel: document.getElementById('location-panel'),
        header: document.getElementById('location-panel-header'),
        toggleBtn: document.getElementById('location-panel-toggle'),
        content: document.getElementById('location-panel-content'),
        searchInput: document.getElementById('location-search-input'),
        searchBtn: document.getElementById('location-search-btn'),
        gpsBtn: document.getElementById('location-gps-btn'),
        mapSelectBtn: document.getElementById('location-map-select-btn'),
        clearSelectionBtn: document.getElementById('location-clear-selection-btn'),
        latDisplay: document.getElementById('location-lat-display'),
        lngDisplay: document.getElementById('location-lng-display'),
        nameDisplay: document.getElementById('location-name-display')
    });

    // ===== Location Database =====
    const locations = [
        { name: 'Lisboa', lat: 38.7223, lng: -9.1393 },
        { name: 'Porto', lat: 41.1496, lng: -8.6110 },
        { name: 'Braga', lat: 41.5501, lng: -8.4200 },
        { name: 'Coimbra', lat: 40.2111, lng: -8.4291 },
        { name: 'Faro', lat: 37.0194, lng: -7.9309 },
        { name: 'Évora', lat: 38.5742, lng: -7.9126 },
        { name: 'Aveiro', lat: 40.6405, lng: -8.6538 },
        { name: 'Viseu', lat: 40.6588, lng: -7.9141 },
        { name: 'Guarda', lat: 40.5370, lng: -7.2671 },
        { name: 'Beja', lat: 38.0153, lng: -7.8632 },
        { name: 'Setúbal', lat: 38.5244, lng: -8.8882 },
        { name: 'Leiria', lat: 39.7445, lng: -8.8051 },
        { name: 'Castelo Branco', lat: 39.8222, lng: -7.4914 },
        { name: 'Portalegre', lat: 39.2966, lng: -7.4306 },
        { name: 'Viana do Castelo', lat: 41.6945, lng: -8.8308 },
        { name: 'Vila Real', lat: 41.3010, lng: -7.7503 },
        { name: 'Funchal', lat: 32.6667, lng: -16.9 },
        { name: 'Ponta Delgada', lat: 37.7333, lng: -25.6667 }
    ];

    // ===== Panel Management =====

    function togglePanel() {
        isExpanded = !isExpanded;
        const elements = getElements();
        
        if (elements.panel && elements.content && elements.toggleBtn) {
            if (isExpanded) {
                elements.panel.classList.add('expanded');
                elements.panel.classList.remove('collapsed');
                elements.content.style.display = 'block';
                elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            } else {
                elements.panel.classList.add('collapsed');
                elements.panel.classList.remove('expanded');
                elements.content.style.display = 'none';
                elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
            }
        }
    }

    // ===== Location Search =====

    async function searchLocation(query) {
        try {
            const trimmedQuery = (query || '').trim();
            if (!trimmedQuery) {
                alert('⚠️ Introduza uma localização ou coordenadas.');
                return null;
            }

            // Try to find by name
            const location = locations.find(loc =>
                loc.name.toLowerCase().includes(trimmedQuery.toLowerCase())
            );

            if (location) {
                setLocation(location.lat, location.lng, location.name);
                return location;
            }

            // Try to parse as coordinates
            const coords = trimmedQuery.split(',').map(s => parseFloat(s.trim()));
            if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                setLocation(coords[0], coords[1], 'Localização');
                return { lat: coords[0], lng: coords[1], name: 'Localização' };
            }

            alert('⚠️ Localização não encontrada. Tente um nome de cidade ou coordenadas (lat, lng).');
            return null;
        } catch (error) {
            console.error('[LocationPanel] Error searching location:', error);
            return null;
        }
    }

    // ===== Location Management =====

    function setLocation(lat, lng, name = '') {
        currentLocation = { lat, lng, name };
        updateLocationDisplay();
        notifyLocationChange();
    }

    function getCurrentLocation() {
        return currentLocation;
    }

    function clearSelection() {
        currentLocation = null;
        updateLocationDisplay();
        notifyLocationChange();
    }

    function updateLocationDisplay() {
        const elements = getElements();
        
        if (currentLocation) {
            if (elements.latDisplay) elements.latDisplay.textContent = currentLocation.lat.toFixed(4);
            if (elements.lngDisplay) elements.lngDisplay.textContent = currentLocation.lng.toFixed(4);
            if (elements.nameDisplay) elements.nameDisplay.textContent = currentLocation.name || 'Desconhecido';
        } else {
            if (elements.latDisplay) elements.latDisplay.textContent = '--';
            if (elements.lngDisplay) elements.lngDisplay.textContent = '--';
            if (elements.nameDisplay) elements.nameDisplay.textContent = '--';
        }
    }

    // ===== GPS Location =====

    function getCurrentGPSLocation() {
        if (navigator.geolocation) {
            const elements = getElements();
            if (elements.latDisplay) elements.latDisplay.textContent = '...';

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    setLocation(lat, lng, 'Localização Atual');
                },
                (error) => {
                    console.error('[LocationPanel] GPS Error:', error);
                    if (elements.latDisplay) elements.latDisplay.textContent = '--';
                    alert('⚠️ Erro ao obter localização GPS');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            alert('⚠️ Geolocalização não suportada pelo navegador');
        }
    }

    // ===== Map Selection Integration =====

    function setupMapSelection(mapModule) {
        const elements = getElements();
        
        if (elements.mapSelectBtn) {
            elements.mapSelectBtn.addEventListener('click', () => {
                if (mapModule && typeof mapModule.toggleMapSelectionMode === 'function') {
                    mapModule.toggleMapSelectionMode();
                }
            });
        }
        
        if (elements.clearSelectionBtn) {
            elements.clearSelectionBtn.addEventListener('click', () => {
                clearSelection();
                if (mapModule && typeof mapModule.clearMapSelection === 'function') {
                    mapModule.clearMapSelection();
                }
            });
        }
    }

    // ===== Callback System =====

    function setOnLocationChange(callback) {
        onLocationChangeCallback = callback;
    }

    function notifyLocationChange() {
        if (onLocationChangeCallback && typeof onLocationChangeCallback === 'function') {
            onLocationChangeCallback(currentLocation);
        }
    }

    // ===== Event Listeners =====

    function setupEventListeners(mapModule = null) {
        const elements = getElements();
        
        if (elements.toggleBtn) {
            elements.toggleBtn.addEventListener('click', togglePanel);
        }
        
        if (elements.searchBtn && elements.searchInput) {
            elements.searchBtn.addEventListener('click', () => {
                searchLocation(elements.searchInput.value);
            });
            
            elements.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    searchLocation(elements.searchInput.value);
                }
            });
        }
        
        if (elements.gpsBtn) {
            elements.gpsBtn.addEventListener('click', getCurrentGPSLocation);
        }
        
        if (mapModule) {
            setupMapSelection(mapModule);
        }
    }

    // ===== Public API =====

    function init(mapModule = null) {
        setupEventListeners(mapModule);
        updateLocationDisplay();
        
        const elements = getElements();
        
        // Initialize panel state
        if (elements.panel && elements.content && elements.toggleBtn) {
            if (isExpanded) {
                elements.panel.classList.add('expanded');
                elements.content.style.display = 'block';
                elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            } else {
                elements.panel.classList.add('collapsed');
                elements.content.style.display = 'none';
                elements.toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
            }
        }
    }

    return {
        init,
        togglePanel,
        searchLocation,
        setLocation,
        getCurrentLocation,
        clearSelection,
        getCurrentGPSLocation,
        setOnLocationChange,
        updateLocationDisplay
    };
})();

window.LocationPanel = LocationPanel;
export default LocationPanel;
