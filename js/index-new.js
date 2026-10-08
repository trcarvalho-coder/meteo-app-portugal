// ===== Main Application Initialization =====
import './config.js';
import MapModule from './map.js';
import LocationPanel from './panels/location-panel.js';
import OpenMeteoPanel from './panels/openmeteo-panel.js';
import IPMAPanel from './panels/ipma-panel.js';

// Inicializar quando tudo estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Map
        const mapResult = await MapModule.init();
        if (!mapResult) {
            console.error('Falha ao inicializar mapa');
            return;
        }

        // Initialize Location Panel with MapModule reference
        LocationPanel.init(MapModule);

        // Initialize OpenMeteo Panel
        OpenMeteoPanel.init();

        // Initialize IPMA Panel
        IPMAPanel.init();

        // Set up location change callback
        LocationPanel.setOnLocationChange((location) => {
            if (location) {
                // Update OpenMeteo panel with new location
                OpenMeteoPanel.updatePanel(location.lat, location.lng);
                
                // Update IPMA panel with new location
                IPMAPanel.updatePanel(location.lat, location.lng);
                
                // Center map on new location
                MapModule.centerOnCoordinates(location.lng, location.lat, 12);
                MapModule.addLocationMarker(location.lng, location.lat, location.name || 'Localização');
            }
        });

        // Set up map selection callback
        if (typeof MapModule !== 'undefined' && MapModule) {
            const originalToggle = MapModule.toggleMapSelectionMode;
            MapModule.toggleMapSelectionMode = function() {
                originalToggle.call(this);
                
                // When map selection is active, notify location panel
                if (this.mapSelectionMode) {
                    // Store reference to update location when map is clicked
                }
            };
        }

        console.log('✅ Aplicação inicializada com sucesso!');
        
        // Set default location (Lisboa)
        LocationPanel.setLocation(38.7223, -9.1393, 'Lisboa');
        
    } catch (error) {
        console.error('Falha ao inicializar aplicação:', error);
    }
});

// Expose modules globally
window.MapModule = MapModule;
window.LocationPanel = LocationPanel;
window.OpenMeteoPanel = OpenMeteoPanel;
window.IPMAPanel = IPMAPanel;
