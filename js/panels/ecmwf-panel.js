// ===== Widget "ECMWF — Previsão 7 dias" =====
// Integra backend que processa GRIB2 do bucket AWS ecmwf-forecasts.
// Estados: loading, erro (com nova tentativa), indisponível, ativo.

import { VARIABLE_CATALOG, SCALES } from '../meteo/catalog.js';
import EcmwfApi from '../meteo/ecmwf-api.js';
import EcmwfLayer from '../meteo/ecmwf-layer.js';
import Timeline from '../meteo/timeline.js';
import { Helpers } from '../config.js';

const ECMWFPanel = (function() {
    'use strict';

    let currentVariable = 'temperature';
    let currentStep = 0;
    let runInfo = null;
    let activeField = null;
    let inFlight = null; // AbortController para cancelar pedidos obsoletos

    const els = () => ({
        loading: document.getElementById('ecmwf-loading'),
        error: document.getElementById('ecmwf-error'),
        errorMessage: document.getElementById('ecmwf-error-message'),
        retry: document.getElementById('ecmwf-retry'),
        variableSelect: document.getElementById('ecmwf-variable'),
        variableMeta: document.getElementById('ecmwf-variable-meta'),
        runInfo: document.getElementById('ecmwf-run-info'),
        opacity: document.getElementById('ecmwf-layer-opacity'),
        legend: document.getElementById('legend-panel'),
        legendTitle: document.getElementById('legend-title'),
        legendBar: document.getElementById('legend-bar'),
        legendLabels: document.getElementById('legend-labels'),
        legendMeta: document.getElementById('legend-meta')
    });

    async function init(map) {
        const e = els();
        e.variableSelect?.addEventListener('change', () => {
            currentVariable = e.variableSelect.value;
            loadStep(currentStep);
        });
        e.retry?.addEventListener('click', () => loadStep(currentStep));
        e.opacity?.addEventListener('input', () => {
            EcmwfLayer.setActiveOpacity(parseInt(e.opacity.value, 10) / 100);
        });

        Timeline.init({
            native: nativeStepList(),
            onStep: (index) => {
                const { step } = Timeline.stepInfo(index);
                currentStep = step;
                loadStep(step);
            }
        });

        try {
            runInfo = await EcmwfApi.getRun();
            if (e.runInfo) {
                e.runInfo.textContent =
                    `Execução ${runInfo} — IFS HRES oper 0.25° (AWS). Selecionada por ser a ` +
                    `execução 00z/12z completa mais recente que cobre 168 h.`;
            }
        } catch (err) {
            if (e.runInfo) e.runInfo.textContent = 'Backend ECMWF indisponível.';
            showError(err);
        }

        updateVariableMeta();
        Timeline.select(0);
    }

    function nativeStepList() {
        const steps = [];
        for (let h = 0; h <= 144; h += 3) steps.push(h);
        for (let h = 150; h <= 168; h += 6) steps.push(h);
        return steps;
    }

    function updateVariableMeta() {
        const e = els();
        const meta = VARIABLE_CATALOG[currentVariable];
        if (e.variableMeta && meta) {
            e.variableMeta.textContent =
                `${meta.source} · unidade original ${meta.originalUnit} → ${meta.displayUnit} · ` +
                `${meta.temporalType} · ${meta.height}`;
        }
    }

    async function loadStep(step) {
        const e = els();
        if (inFlight) inFlight.abort();
        inFlight = new AbortController();

        e.error?.setAttribute('hidden', '');
        e.loading?.removeAttribute('hidden');

        try {
            let field;
            if (currentVariable === 'precipitation') {
                // Política temporal: passos nativos apenas, incrementos por diferença.
                try {
                    field = await EcmwfApi.getPrecipIncrement(step, { signal: inFlight.signal });
                } catch (err) {
                    if (String(err.message).includes('Passo não nativo')) {
                        throw Object.assign(
                            new Error(`Precipitação indisponível no passo de ${step} h: sem passo nativo; não é feita desagregação artificial.`),
                            { code: 'unavailable' }
                        );
                    }
                    throw err;
                }
            } else if (Timeline.isNative(step / 3)) {
                field = await EcmwfApi.getField(currentVariable, step, { signal: inFlight.signal });
            } else {
                throw Object.assign(
                    new Error(`Passo de ${step} h não nativo para variável instantânea; interpolação identificada ainda não implementada para este passo.`),
                    { code: 'unavailable' }
                );
            }

            activeField = field;
            e.loading?.setAttribute('hidden', '');

            const view = window.MapModule?.getView?.();
            if (view && window.arcgis) {
                const meta = VARIABLE_CATALOG[currentVariable];
                EcmwfLayer.renderField(view.map, field, {
                    displayName: meta.displayName,
                    unit: field.unit,
                    source: field.source,
                    run: field.run,
                    validTimeUtc: field.validTimeUtc,
                    temporalType: field.temporalType,
                    scaleKey: scaleKeyFor(currentVariable),
                    opacity: parseInt(els().opacity?.value || '70', 10) / 100
                });
                renderLegend(field);
                    }
        } catch (err) {
            if (err.name === 'AbortError') return;
            e.loading?.setAttribute('hidden', '');
            if (err.code === 'unavailable') {
                showUnavailable(err.message);
            } else {
                showError(err);
            }
        }
    }

    function scaleKeyFor(variable) {
        return variable; // temperature/windSpeed/precipitation em SCALES
    }

    function renderLegend(field) {
        const e = els();
        const meta = VARIABLE_CATALOG[currentVariable];
        const scale = SCALES[scaleKeyFor(currentVariable)];
        if (!e.legend || !scale) return;
        e.legend.removeAttribute('hidden');
        e.legendTitle.textContent = `${meta.displayName} (${field.unit})`;
        e.legendBar.style.background =
            `linear-gradient(90deg, ${scale.stops.map(s => s.color).join(', ')})`;
        e.legendLabels.innerHTML =
            scale.stops.map(s => `<span>${s.value}</span>`).join('');
        e.legendMeta.textContent =
            `Fonte: ${field.source} · Execução ${field.run} · Validade ${field.validTimeUtc} (UTC) · ` +
            `${field.temporalType} · Resolução nativa ${field.spatialResolution} · ` +
            `Passo ${field.nativeStep ? 'nativo' : 'interpolado/indisponível'}`;
    }


    function showError(err) {
        const e = els();
        e.loading?.setAttribute('hidden', '');
        e.error?.removeAttribute('hidden');
        if (e.errorMessage) {
            e.errorMessage.textContent =
                `Falha ao obter camada ECMWF: ${err.message}. ` +
                `Verifique se o backend local está a correr (python backend/server.py).`;
        }
    }

    function showUnavailable(message) {
        const e = els();
        e.loading?.setAttribute('hidden', '');
        e.error?.removeAttribute('hidden');
        if (e.errorMessage) e.errorMessage.textContent = message;
        if (e.retry) e.retry.setAttribute('hidden', '');
        // mantém a última camada válida visível, identificada como anterior
        if (activeField) renderLegend(activeField);
    }

    function sampleAtPoint(lat, lon) {
        if (!activeField) return null;
        const { lats, lons, values } = activeField;
        let bi = 0, bj = 0, best = Infinity;
        for (let i = 0; i < lats.length; i++) {
            for (let j = 0; j < lons.length; j++) {
                const d = (lats[i] - lat) ** 2 + (lons[j] - lon) ** 2;
                if (d < best) { best = d; bi = i; bj = j; }
            }
        }
        return { value: values[bi][bj], meta: VARIABLE_CATALOG[currentVariable], field: activeField };
    }

    return { init, loadStep, sampleAtPoint };
})();

window.ECMWFPanel = ECMWFPanel;
export default ECMWFPanel;
