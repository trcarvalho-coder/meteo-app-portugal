// ===== Rail de botoes compactos + painel flutuante unico =====
// Comportamento:
// - Clicar num botao fechado abre o painel respetivo no floating-panel.
// - Clicar novamente no mesmo botao fecha-o.
// - O botao permanece visivel; estado ativo claramente identificado.
// - Apenas um painel principal aberto de cada vez (evita sobreposicao),
//   sem desativar camadas ao fechar.
// - Abrir painel != ativar/desativar camada (botoes dedicados ON/OFF).
// - Teclado: enter/espaco nativos de <button>; foco visivel (CSS).

const Rail = (function() {
    'use strict';

    let openPanel = null;      // painel atualmente aberto
    let firstOpen = new Map();  // name -> init fn ja executada

    const PANEL_TITLES = {
        openmeteo: 'Estado atual — Open-Meteo',
        omforecast: 'Previsão Open-Meteo',
        ecmwf: 'ECMWF — Previsão 7 dias',
        ipma: 'Avisos IPMA',
        stations: 'Estações IPMA',
        era5: 'ERA5 — Histórico',
        location: 'Localização'
    };

    const PANEL_INITS = new Map(); // name -> () => void (lazy)

    function init(inits) {
        if (inits) for (const [name, fn] of Object.entries(inits)) PANEL_INITS.set(name, fn);

        document.querySelectorAll('.rail-btn[data-panel]').forEach(btn => {
            btn.addEventListener('click', () => toggle(btn.dataset.panel));
        });

        // botoes ON/OFF de camadas (independentes de abrir/fechar painel)
        document.getElementById('rail-toggle-warnings')?.addEventListener('click', () => {
            const btn = document.getElementById('rail-toggle-warnings');
            const on = btn.getAttribute('aria-pressed') === 'true';
            btn.setAttribute('aria-pressed', String(!on));
            btn.querySelector('span').textContent = on ? 'Avisos OFF' : 'Avisos ON';
            if (window.IpmaLayers) window.IpmaLayers.setWarningsVisible(!on);
        });
        document.getElementById('rail-toggle-stations')?.addEventListener('click', () => {
            const btn = document.getElementById('rail-toggle-stations');
            const on = btn.getAttribute('aria-pressed') === 'true';
            btn.setAttribute('aria-pressed', String(!on));
            btn.querySelector('span').textContent = on ? 'Estações OFF' : 'Estações ON';
            if (window.IpmaLayers) window.IpmaLayers.setStationsVisible(!on);
        });
    }

    function toggle(name) {
        if (openPanel === name) {
            close();
            return;
        }
        open(name);
    }

    function open(name) {
        const panel = document.getElementById('floating-panel');
        const tpl = document.getElementById('tpl-' + name);
        if (!panel || !tpl) return;

        // limpar e montar o painel a partir do template
        panel.innerHTML = '';
        panel.appendChild(tpl.content.cloneNode(true));
        panel.hidden = false;

        // marcar botao ativo
        document.querySelectorAll('.rail-btn[data-panel]').forEach(btn => {
            const isActive = btn.dataset.panel === name;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-expanded', String(isActive));
        });

        openPanel = name;

        // init lazy (so na primeira abertura; selecoes preservadas depois)
        if (!firstOpen.has(name) && PANEL_INITS.has(name)) {
            try { PANEL_INITS.get(name)(); } catch (err) { console.error('[rail] init', name, err); }
            firstOpen.set(name, true);
        }
        // foco no painel para teclado
        panel.focus?.();
    }

    function close() {
        const panel = document.getElementById('floating-panel');
        if (panel) { panel.hidden = true; panel.innerHTML = ''; }
        document.querySelectorAll('.rail-btn[data-panel]').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-expanded', 'false');
        });
        openPanel = null;
    }

    function isOpen(name) { return openPanel === name; }
    function currentPanel() { return openPanel; }

    return { init, toggle, open, close, isOpen, currentPanel, PANEL_TITLES };
})();

window.Rail = Rail;
export default Rail;
