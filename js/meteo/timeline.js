// ===== Linha temporal tri-horária para 72 h =====
// Política temporal:
// - Instantâneos (temperatura, vento): passos nativos de 3 h, 0..72 h.
// - Precipitação: apenas passos nativos; incrementos por diferença de
//   acumulados; sem desagregação artificial.
// - Rajadas/extremos: janelas estatísticas preservadas (não interpoladas).

const HORIZON_STEPS = 25; // 25 instantes: 0h..72h em passos de 3 h (ambos incluídos)

const Timeline = (function() {
    'use strict';

    let currentIndex = 0;
    let nativeSteps = [];
    let onStepChange = null;
    let playTimer = null;
    let speedMs = 1000;
    let loop = true;
    let timezone = 'Europe/Lisbon';
    let runBaseMs = null; // hora da execução (UTC) como base da validade

    // UTC interno; apresentação no fuso selecionado
    function init({ native, onStep, runBase }) {
        nativeSteps = native.slice();
        runBaseMs = runBase != null ? Date.parse(runBase) : null;
        onStepChange = onStep;
        const range = document.getElementById('tl-range');
        if (range) {
            range.max = String(HORIZON_STEPS - 1);
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
        // teclado no range já é nativo (setas)
    }

    function stepToIndex(step) { return Math.round(step / 3); }
    function indexToStep(index) { return index * 3; }

    function isNative(index) {
        return nativeSteps.includes(indexToStep(index));
    }

    function select(index) {
        if (index < 0) index = 0;
        if (index > HORIZON_STEPS - 1) index = HORIZON_STEPS - 1;
        currentIndex = index;
        const range = document.getElementById('tl-range');
        if (range) range.value = String(index);
        renderDatetime();
        if (onStepChange) onStepChange(currentIndex);
    }

    function renderDatetime() {
        const out = document.getElementById('tl-datetime');
        if (!out) return;
        // validade = execução (run) + prazo; nunca relativa a `new Date()`
        const hours = indexToStep(currentIndex);
        const base = runBaseMs != null && !Number.isNaN(runBaseMs)
            ? runBaseMs
            : null;
        const d = base != null
            ? new Date(base + hours * 3600000)
            : new Date(Date.UTC() + hours * 3600000);
        try {
            out.textContent = d.toLocaleString('pt-PT', {
                timeZone: timezone,
                weekday: 'short', day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }) + ` (+${hours}h, ${timezone})`;
        } catch (_) {
            out.textContent = d.toISOString();
        }
    }

    function stepInfo(index) {
        const step = indexToStep(index);
        const native = isNative(index);
        let text;
        if (native) {
            text = `Passo nativo de ${step} h`;
        } else {
            text = `Sem passo nativo (${step} h) — valor interpolado identificado ou indisponível`;
        }
        const el = document.getElementById('tl-step-info');
        if (el) el.textContent = text;
        return { step, native };
    }

    function togglePlay() {
        if (playTimer) {
            pause();
        } else {
            play();
        }
    }

    function play() {
        const btn = document.getElementById('tl-play');
        if (btn) {
            btn.setAttribute('aria-pressed', 'true');
            document.getElementById('tl-play-icon')?.classList.replace('fa-play', 'fa-pause');
        }
        playTimer = setInterval(() => {
            if (currentIndex >= HORIZON_STEPS - 1) {
                if (loop) select(0);
                else pause();
            } else {
                select(currentIndex + 1);
            }
        }, speedMs);
    }

    function setRunBase(runBase) {
        runBaseMs = runBase != null ? Date.parse(runBase) : null;
        renderDatetime();
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

    return {
        init, select, stepInfo, isNative,
        stepToIndex, indexToStep, setRunBase,
        play, pause,
        HORIZON_STEPS,
        getTimezone: () => timezone
    };
})();

if (typeof window !== 'undefined') window.Timeline = Timeline;
export default Timeline;
