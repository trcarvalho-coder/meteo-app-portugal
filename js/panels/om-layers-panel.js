// ===== Painel "Camadas" — selecao multipla de camadas Open-Meteo (ECMWF) =====
// - Um botao por parametro meteorologico (isobaras, vento, rajada,
//   precipitacao, precipitacao acumulada, descargas eletricas, temp. max,
//   temp. min). Podem estar varias camadas ativas em simultaneo.
// - Por defeito, a camada visivel e a das isobaras.
// - O time slider percorre TODAS as camadas selecionadas (3 h ate 72 h;
//   6 h apos 72 h; horizonte 15 dias).
// - Fonte: Open-Meteo, modelo ECMWF ecmwf_ifs025 (open-data, sem custos),
//   dados pre-computados 2x/dia e servidos como JSON estatico (data/om/).

import { OM_LAYERS, OM_LAYER_ORDER, OM_MODEL, legendStopsFor, scaleKeyForOm } from '../meteo/om-catalog.js';
import OmApi from '../meteo/om-api.js';
import OmFieldLayer from '../meteo/om-field-layer.js';
import OmTimeline from '../meteo/om-timeline.js';

const OmLayersPanel = (function() {
    'use strict';

    let initialized = false;
    let map = null;
    let currentStep = 0;
    let runInfo = null;
    const activeLayers = new Set();
    let inFlight = null;

    const els = () => ({
        buttons: document.getElementById('om-layer-buttons'),
        runInfo: document.getElementById('om-run-info'),
        status: document.getElementById('om-layers-status'),
        opacity: document.getElementById('om-layer-opacity'),
        legend: document.getElementById('om-legend-list'),
        refresh: document.getElementById('om-refresh-btn')
    });

    function buildButtons() {
        const container = els().buttons;
        if (!container) return;
        container.innerHTML = '';
        for (const key of OM_LAYER_ORDER) {
            const layer = OM_LAYERS[key];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'om-layer-btn';
            btn.id = `om-layer-btn-${key}`;
            btn.dataset.layer = key;
            btn.setAttribute('aria-pressed', String(activeLayers.has(key)));
            btn.title = layer.description;
            btn.innerHTML = `<i class="fas ${layer.icon}" aria-hidden="true"></i><span>${layer.label}</span>`;
            btn.addEventListener('click', () => toggleLayer(key));
            container.appendChild(btn);
        }
    }

    function updateButtonStates() {
        for (const key of OM_LAYER_ORDER) {
            const btn = document.getElementById(`om-layer-btn-${key}`);
            if (!btn) continue;
            const on = activeLayers.has(key);
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', String(on));
        }
    }

    async function toggleLayer(key) {
        if (activeLayers.has(key)) {
            activeLayers.delete(key);
            OmFieldLayer.removeLayer(key);
        } else {
            activeLayers.add(key);
            await loadLayerAtStep(key, currentStep);
        }
        updateButtonStates();
        renderLegends();
    }

    async function loadLayerAtStep(key, step) {
        const layer = OM_LAYERS[key];
        // isobaras usam o campo de pressao (pressure) para desenhar as isolinhas
        const fieldKey = layer.kind === 'isobars' ? 'isobars' : key;
        try {
            const field = await OmApi.getField(fieldKey, step, { signal: inFlight?.signal });
            OmFieldLayer.renderLayer(key, field);
            return field;
        } catch (err) {
            if (err.name === 'AbortError') return null;
            setStatus(`Camada ${layer.label}: ${err.code === 'unavailable' ? 'passo indisponível nesta execução.' : err.message}`);
            return null;
        }
    }

    async function loadAllActive(step) {
        if (inFlight) inFlight.abort();
        inFlight = new AbortController();
        currentStep = step;
        if (!activeLayers.size) {
            renderLegends();
            return;
        }
        setStatus('A carregar camadas…');
        const results = await Promise.all(
            [...activeLayers].map(key => loadLayerAtStep(key, step))
        );
        if (results.some(Boolean)) setStatus('');
        renderLegends();
    }

    function renderLegends() {
        const container = els().legend;
        if (!container) return;
        container.innerHTML = '';
        for (const key of activeLayers) {
            const layer = OM_LAYERS[key];
            const stops = legendStopsFor(key);
            const box = document.createElement('div');
            box.className = 'om-legend-item';
            if (layer.kind === 'isobars') {
                box.innerHTML = `<h4><i class="fas ${layer.icon}"></i> ${layer.label}</h4>
                    <p class="widget-meta">Isolinhas de ${layer.intervalHpa} em ${layer.intervalHpa} hPa (960–1044 hPa).</p>`;
            } else {
                const bar = stops.map(s => s.color).join(', ');
                const labels = stops.map(s => `<span>${s.value}</span>`).join('');
                box.innerHTML = `<h4><i class="fas ${layer.icon}"></i> ${layer.label} (${layer.unit})</h4>
                    <div class="legend-bar" style="background:linear-gradient(90deg, ${bar})"></div>
                    <div class="legend-labels">${labels}</div>
                    ${layer.accum ? '<p class="widget-meta">Previsão por janela (3 h até 72 h; 6 h após 72 h).</p>' : ''}`;
            }
            container.appendChild(box);
        }
        if (!activeLayers.size) {
            container.innerHTML = '<p class="widget-meta">Nenhuma camada selecionada. Use os botões acima.</p>';
        }
    }

    function setStatus(msg) {
        const el = els().status;
        if (el) el.textContent = msg;
    }

    function runBaseIso() {
        if (!runInfo) return null;
        const m = /^(\d{4})(\d{2})(\d{2})\/(\d{2})z$/.exec(runInfo);
        if (!m) return null;
        return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:00:00Z`;
    }

    async function init(mapInstance) {
        map = mapInstance || window.MapModule?.getView?.()?.map;
        if (!map) return;
        if (initialized) return;
        initialized = true;

        OmFieldLayer.init(map);
        buildButtons();

        // por defeito: isobaras visiveis
        activeLayers.add('isobars');
        updateButtonStates();

        els().opacity?.addEventListener('input', () => {
            OmFieldLayer.setOpacity(parseInt(els().opacity.value, 10) / 100);
        });
        els().refresh?.addEventListener('click', async () => {
            OmApi.clearCache();
            runInfo = await OmApi.getRun({ forceRefresh: true }).catch(() => runInfo);
            updateRunInfo();
            await loadAllActive(currentStep);
        });

        try {
            runInfo = await OmApi.getRun();
        } catch (_) {
            runInfo = null;
        }
        updateRunInfo();

        OmTimeline.init({
            baseIso: runBaseIso(),
            onStep: (step) => { loadAllActive(step); }
        });

        OmTimeline.select(0);
    }

    function updateRunInfo() {
        const el = els().runInfo;
        if (!el) return;
        if (runInfo) {
            el.textContent = `Fonte: Open-Meteo — modelo ECMWF IFS 0.25° (${OM_MODEL}), open-data CC-BY 4.0, sem custos. ` +
                `Execução ${runInfo}. Atualização automática 2×/dia. Horizonte 15 dias: passos de 3 h até 72 h e de 6 h após 72 h.`;
        } else {
            el.textContent = 'Fonte: Open-Meteo — modelo ECMWF IFS 0.25° (ecmwf_ifs025). Dados ainda não publicados para este site.';
        }
    }

    // devolve amostras das camadas ativas num ponto (para o popup do mapa)
    function sampleAtPoint(lat, lon) {
        return OmFieldLayer.sampleAtPoint(lat, lon);
    }

    return { init, toggleLayer, loadAllActive, sampleAtPoint, activeKeys: () => [...activeLayers] };
})();

window.OmLayersPanel = OmLayersPanel;
export default OmLayersPanel;
