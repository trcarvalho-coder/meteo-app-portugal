// index.js
import './config.js';
import './map.js';
import './ipma-api.js';
import './openmeteo-api.js';
import AppModule from './app.js';

// Inicializar quando tudo estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    AppModule.init();
});
