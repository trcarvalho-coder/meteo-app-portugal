// index.js - Main initialization file for autonomous panels
import './config.js';
import MapModule from './map.js';
import './ipma-api.js';
import './openmeteo-api.js';
import './app.js';
import LocationPanel from './panels/location-panel.js';
import OpenMeteoPanel from './panels/openmeteo-panel.js';
import IPMAPanel from './panels/ipma-panel.js';

// Inicializar quando tudo estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    window.MapModule = MapModule;
    
    // Initialize MapModule first
    await MapModule.init();
    
    // Initialize autonomous panels
    LocationPanel.init(MapModule);
    OpenMeteoPanel.init();
    IPMAPanel.init();
    
    // Setup location change callback to update all panels
    LocationPanel.setOnLocationChange((location) => {
        if (location) {
            // Update OpenMeteo panel with new location
            OpenMeteoPanel.updatePanel(location.lat, location.lng);
            
            // Update IPMA panel with new location
            IPMAPanel.updatePanel(location.lat, location.lng);
            
            // Update map with location marker
            if (MapModule.isInitialized()) {
                MapModule.centerOnCoordinates(location.lng, location.lat, 12);
                MapModule.addLocationMarker(location.lng, location.lat, location.name || 'Localização');
                MapModule.exitMapSelectionMode();
            }
            
            // Fill the search input with coordinates
            const searchInput = document.getElementById('location-search-input');
            if (searchInput) {
                searchInput.value = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
            }
        }
    });
    
    // Setup map selection to update location panel
    const mapSelectBtn = document.getElementById('location-map-select-btn');
    if (mapSelectBtn) {
        mapSelectBtn.addEventListener('click', () => {
            if (MapModule && typeof MapModule.toggleMapSelectionMode === 'function') {
                MapModule.toggleMapSelectionMode();
            }
        });
    }
    
    // Modify handleMapClick to also update autonomous panels
    const originalHandleMapClick = MapModule.handleMapClick || (() => {});
    
    // Override the map click handler to update autonomous panels
    if (MapModule && MapModule.view) {
        MapModule.view.on('click', (event) => {
            if (MapModule.mapSelectionMode) {
                const lat = Number(event.mapPoint.latitude);
                const lng = Number(event.mapPoint.longitude);
                
                // Update location panel
                LocationPanel.setLocation(lat, lng, 'Localização Selecionada');
                
                // Fill search input
                const searchInput = document.getElementById('location-search-input');
                if (searchInput) {
                    searchInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                }
                
                // Update map marker
                MapModule.weatherLayer?.removeAll();
                MapModule.addLocationMarker(lng, lat, 'Localização Selecionada');
                
                // Exit selection mode
                MapModule.exitMapSelectionMode();
            }
        });
    }
    
    // Initialize AppModule (original application)
    window.AppModule.init();
    
    // Load initial data for autonomous panels
    const defaultLocation = { lat: 38.7223, lng: -9.1393, name: 'Lisboa' };
    OpenMeteoPanel.updatePanel(defaultLocation.lat, defaultLocation.lng);
    IPMAPanel.updatePanel(defaultLocation.lat, defaultLocation.lng);
});

export default null;
