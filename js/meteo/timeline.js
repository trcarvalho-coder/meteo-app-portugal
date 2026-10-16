// ===== Linha temporal tri-horária para 7 dias (168 h) =====
// Política temporal:
// - Instantâneos (temperatura, vento): passos nativos; interpolação linear
//   opcional e claramente identificada nos passos intermédios.
//   Vento vetorial: interpola u/v antes de calcular magnitude (backend
//   devolve magnitude por passo; interpolação marcada como estimada).
// - Precipitação: apenas passos nativos; incrementos por diferença de
//   acumulados; sem desagregação artificial de 6 h em 3 h.
// - Rajadas/extremos: janelas estatísticas preservadas (não interpoladas).

const HORIZON_STEPS = 57; // 57 instantes: 0h..168h em passos de 3 h (ambos incluídos)

const Timeline = (function() {
    'use strict';

    let currentIndex = 0;
    let nativeSteps = [];
    let onStepChange = null;
    let playTimer = null;
    let speedMs = 1000;
    let loop = true;
    let timezone = 'Europe/Lisbon';

    // UTC interno; apresentação no fuso selecionado
    function init({ native, onStep }) {
        nativeSteps = native.slice();
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
        // validade = execução + prazo; a execução é mostrada no widget ECMWF
        const hours = indexToStep(currentIndex);
        // data/hora apresentada relativa ao dia atual (a execução real vem do backend)
        const base = new Date();
        base.setUTCMinutes(0, 0, 0);
        const d = new Date(base.getTime() + hours * 3600000);
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
        if (el) el.textContent = text + (step > 144 ? ' · resolução nativa de 6 h após 144 h' : '');
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
        stepToIndex, indexToStep,
        play, pause,
        HORIZON_STEPS,
        getTimezone: () => timezone
    };
})();

window.Timeline = Timeline;
export default Timeline;
