// ===== Linha temporal de 15 dias para as camadas Open-Meteo (ECMWF) =====
// Temporalidade efetiva (pedido do utilizador):
// - passos de 3 h desde 0 h ate 72 h (25 instantes);
// - passos de 6 h apos 72 h, ate 360 h = 15 dias (48 instantes);
// - total: 73 instantes, todos nativos da politica de passos definida.
// A validade apresentada = inicio da serie (run) + passo; nunca relativa a
// `new Date()`.

import { OM_MAX_STEP } from './om-catalog.js';

export function buildSteps() {
    const steps = [];
    for (let h = 0; h <= 72; h += 3) steps.push(h);
    for (let h = 78; h <= OM_MAX_STEP; h += 6) steps.push(h);
    return steps;
}

const OmTimeline = (function() {
    'use strict';

    let steps = buildSteps();
    let currentIndex = 0;
    let onStepChange = null;
    const stepListeners = new Set();
    let domAttached = false;
    let playTimer = null;
    let speedMs = 1000;
    let loop = true;
    let timezone = 'Europe/Lisbon';
    let baseMs = null; // inicio da serie (run) em ms UTC

    function init({ onStep, baseIso } = {}) {
        steps = buildSteps();
        onStepChange = onStep;
        if (onStep) stepListeners.add(onStep);
        baseMs = baseIso ? Date.parse(baseIso) : null;
        attachDomOnce();
    }

    // Anexa os listeners do widget slider uma unica vez, partilhado por todos
    // os subscritores (painel Camadas + painel ECMWF AWS).
    function attachDomOnce() {
        if (domAttached) return;
        domAttached = true;
        const range = document.getElementById('tl-range');
        if (range) {
            range.max = String(steps.length - 1);
            range.step = '1';
            range.value = '0';
            range.addEventListener('input', () => select(parseInt(range.value, 10)));
        }
        document.getElementById('tl-prev')?.addEventListener('click', () => select(currentIndex - 1));
        document.getElementById('tl-next')?.addEventListener('click', () => select(currentIndex + 1));
        document.getElementById('tl-play')?.addEventListener('click', togglePlay);
        document.getElementById('tl-speed')?.addEventListener('change', (e) => {
            speedMs = parseInt(e.target.value, 10);
        });
        document.getElementById('tl-loop')?.addEventListener('change', (e) => {
            loop = e.target.checked;
        });
        document.getElementById('tl-timezone')?.addEventListener('change', (e) => {
            timezone = e.target.value;
            renderDatetime();
        });
    }

    function addStepListener(cb) { stepListeners.add(cb); return () => stepListeners.delete(cb); }
    function removeStepListener(cb) { stepListeners.delete(cb); }

    function stepAt(index) { return steps[Math.max(0, Math.min(index, steps.length - 1))]; }
    function indexOfStep(step) { return steps.indexOf(step); }

    function select(index) {
        if (index < 0) index = 0;
        if (index > steps.length - 1) index = steps.length - 1;
        currentIndex = index;
        const range = document.getElementById('tl-range');
        if (range) range.value = String(index);
        renderDatetime();
        renderStepInfo();
        if (onStepChange) onStepChange(stepAt(currentIndex), currentIndex);
        for (const cb of stepListeners) {
            try { cb(stepAt(currentIndex), currentIndex); } catch (_) { /* subscritor isolado */ }
        }
    }

    function renderDatetime() {
        const out = document.getElementById('tl-datetime');
        if (!out) return;
        const hours = stepAt(currentIndex);
        const base = baseMs != null && !Number.isNaN(baseMs) ? baseMs : Date.parse('2000-01-01T00:00:00Z');
        const d = new Date(base + hours * 3600000);
        try {
            out.textContent = d.toLocaleString('pt-PT', {
                timeZone: timezone,
                weekday: 'short', day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }) + ` (+${hours}h)`;
        } catch (_) {
            out.textContent = d.toISOString() + ` (+${hours}h)`;
        }
    }

    function renderStepInfo() {
        const el = document.getElementById('tl-step-info');
        if (!el) return;
        const step = stepAt(currentIndex);
        const interval = step <= 72 ? '3 h' : '6 h';
        el.textContent = `Passo nativo de ${step} h (intervalo de ${interval}) — 15 dias (360 h), 73 instantes`;
    }

    function togglePlay() { playTimer ? pause() : play(); }

    function play() {
        const btn = document.getElementById('tl-play');
        if (btn) {
            btn.setAttribute('aria-pressed', 'true');
            document.getElementById('tl-play-icon')?.classList.replace('fa-play', 'fa-pause');
        }
        playTimer = setInterval(() => {
            if (currentIndex >= steps.length - 1) {
                if (loop) select(0); else pause();
            } else {
                select(currentIndex + 1);
            }
        }, speedMs);
    }

    function pause() {
        if (playTimer) clearInterval(playTimer);
        playTimer = null;
        const btn = document.getElementById('tl-play');
        if (btn) {
            btn.setAttribute('aria-pressed', 'false');
            document.getElementById('tl-play-icon')?.classList.replace('fa-pause', 'fa-play');
        }
    }

    function setBase(baseIso) {
        baseMs = baseIso ? Date.parse(baseIso) : null;
        renderDatetime();
    }

    return {
        init, select, play, pause, setBase,
        addStepListener, removeStepListener,
        stepAt, indexOfStep, buildSteps,
        steps: () => steps.slice(),
        getIndex: () => currentIndex,
        getStep: () => stepAt(currentIndex),
        STEP_COUNT: steps.length
    };
})();

if (typeof window !== 'undefined') window.OmTimeline = OmTimeline;
export default OmTimeline;
