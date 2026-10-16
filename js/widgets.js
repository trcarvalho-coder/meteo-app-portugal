// ===== Comportamento expansível dos widgets da direita =====
// Regras:
// - Clicar no botão de um widget fechado abre-o; clicar novamente fecha-o.
// - O botão mantém-se acessível quando o conteúdo está fechado.
// - Estado aberto/fechado visualmente inequívoco (chevron + aria-expanded).
// - Fechar um widget NÃO remove a camada ativa nem apaga seleções.
// - Teclado: Enter/Espaço nativos de <button>; foco visível via CSS.

const Widgets = (function() {
    'use strict';

    const state = new Map(); // widgetKey -> { open: boolean, restore: () => void }

    function init() {
        document.querySelectorAll('.widget').forEach(widget => {
            const key = widget.dataset.widget;
            const btn = widget.querySelector('.widget-toggle');
            if (!btn) return;

            const open = !widget.classList.contains('collapsed');
            state.set(key, { open });
            apply(widget, open);

            btn.addEventListener('click', () => toggle(key));
        });
    }

    function apply(widget, open) {
        const btn = widget.querySelector('.widget-toggle');
        if (btn) btn.setAttribute('aria-expanded', String(open));
        widget.classList.toggle('collapsed', !open);
    }

    function toggle(key) {
        const entry = state.get(key);
        if (!entry) return false;
        entry.open = !entry.open;
        const widget = document.querySelector(`.widget[data-widget="${key}"]`);
        if (widget) apply(widget, entry.open);
        return entry.open;
    }

    function isOpen(key) {
        return state.get(key)?.open === true;
    }

    return { init, toggle, isOpen };
})();

window.Widgets = Widgets;
export default Widgets;
