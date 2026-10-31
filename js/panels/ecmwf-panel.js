// ===== Widget "ECMWF — Previsão 72 h" =====
// Integra backend que processa GRIB2 do bucket AWS ecmwf-forecasts.
// Estados: loading, erro (com nova tentativa), indisponível, ativo.
// Horizonte: 0 h a 72 h, passos de 3 h -> 25 instantes.

import { VARIABLE_CATALOG, SCALES } from '../meteo/catalog.js';
import EcmwfApi from '../meteo/ecmwf-api.js';
import EcmwfLayer from '../meteo/ecmwf-layer.js';
import OmTimeline from '../meteo/om-timeline.js';
import { Helpers } from '../config.js';

const ECMWFPanel = (function() {
    'use strict';

    let currentVariable = 'temperature';
    let currentStep = 0;
    let runInfo = null;
    let activeField = null;
    let inFlight = null; // AbortController para cancelar pedidos obsoletos
    let nativeSteps = [];
    let prefetchInFlight = 0;
    const PREFETCH_CONCURRENCY = 2;

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

        try {
            runInfo = await EcmwfApi.getRun();
            // fonte de verdade: nativeSteps (availableSteps) do índice latest.json
            const { nativeSteps: steps } = await EcmwfApi.getSteps();
            nativeSteps = steps && steps.length ? steps : nativeStepList();
        } catch (err) {
            nativeSteps = nativeStepList();
        }

        // Partilha a mesma linha temporal de 15 dias (OmTimeline) com o painel
        // de camadas Open-Meteo; esta fonte (AWS) so tem dados ate 72 h.
        OmTimeline.init({});
        OmTimeline.addStepListener((step) => {
            currentStep = step;
            loadStep(step);
            prefetchNextSteps(step);
        });

        if (e.runInfo && runInfo) {
            e.runInfo.textContent =
                `Execução ${runInfo} — IFS HRES oper 0.25° (AWS). Selecionada por ser a ` +
                `execução 00z/12z completa mais recente que cobre 72 h.`;
        }

        updateVariableMeta();
        OmTimeline.select(0);
    }

    function nativeStepList() {
        const steps = [];
        for (let h = 0; h <= 72; h += 3) steps.push(h);
        return steps;
    }

    function runBaseIso() {
        // hora da execução (ex.: "20261016/00z") em ISO UTC; nula se indisponível
        if (!runInfo) return null;
        const m = /^(\d{4})(\d{2})(\d{2})\/(\d{2})z$/.exec(runInfo);
        if (!m) return null;
        return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:00:00Z`;
    }

    // Pré-carrega os 2-3 passos seguintes durante a navegação/animação,
    // com limite de concorrência.
    function prefetchNextSteps(step) {
        const next = nativeSteps.filter(s => s > step).slice(0, 3);
        for (const s of next) {
            if (prefetchInFlight >= PREFETCH_CONCURRENCY) break;
            const key = `${currentVariable}-${s}`;
            if (EcmwfApi.isCached && EcmwfApi.isCached(key)) continue;
            prefetchInFlight++;
            EcmwfApi.getField(currentVariable, s).catch(() => { /* indisponível */ })
                .finally(() => { prefetchInFlight--; });
        }
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
                    if (err.code === 'unavailable' || String(err.message).includes('Passo não nativo')) {
                        throw Object.assign(
                            new Error(`Precipitação indisponível no passo de ${step} h: sem passo nativo; não é feita desagregação artificial.`),
                            { code: 'unavailable' }
                        );
                    }
                    throw err;
                }
            } else if (step <= 72 && nativeSteps.includes(step)) {
                field = await EcmwfApi.getField(currentVariable, step, { signal: inFlight.signal });
            } else {
                throw Object.assign(
                    new Error(`Fonte ECMWF AWS apenas cobre até 72 h; o passo de ${step} h está disponível nas camadas Open-Meteo (15 dias).`),
                    { code: 'unavailable' }
                );
            }

            activeField = field;
            e.loading?.setAttribute('hidden', '');

            const view = window.MapModule?.getView?.();
            if (view && window.arcgis) {
                const meta = VARIABLE_CATALOG[currentVariable];
                const scaleKey = scaleKeyFor(currentVariable);
                if (!scaleKey) {
                    throw Object.assign(
                        new Error(`Sem escala definida no catálogo para '${currentVariable}'.`),
                        { code: 'unavailable' }
                    );
                }
                EcmwfLayer.renderField(view.map, field, {
                    displayName: meta.displayName,
                    unit: field.unit,
                    source: field.source,
                    run: field.run,
                    validTimeUtc: field.validTimeUtc,
                    temporalType: field.temporalType,
                    scaleKey,
                    opacity: parseInt(els().opacity?.value || '70', 10) / 100
                });
                renderLegend(field);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            e.loading?.setAttribute('hidden', '');
            if (err.code === 'unavailable' || err instanceof EcmwfApi.StepUnavailableError) {
                showUnavailable(err instanceof EcmwfApi.StepUnavailableError
                    ? 'Passo ainda não publicado para esta execução.'
                    : err.message);
            } else {
                showError(err);
            }
        }
    }

    function scaleKeyFor(variable) {
        // a escala vive no catálogo: VARIABLE_CATALOG[variable].scale
        // (windSpeed usa SCALES.wind; devolver 'windSpeed' era a causa da
        // camada de vento a negro: SCALES.windSpeed não existe)
        const meta = VARIABLE_CATALOG[variable];
        if (!meta || !meta.scale || !SCALES[scaleKeyOfScale(meta.scale)]) {
            return null;
        }
        return scaleKeyOfScale(meta.scale);
    }

    function scaleKeyOfScale(scale) {
        for (const [key, value] of Object.entries(SCALES)) {
            if (value === scale) return key;
        }
        return null;
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
            // no site publicado não existe backend local: não pedir ao
            // utilizador para correr backend/server.py
            e.errorMessage.textContent = `Falha ao obter camada ECMWF: ${err.message}.`;
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
