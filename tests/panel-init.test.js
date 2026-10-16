// ===== Testes de regressão: init dos painéis sem elementos de toggle =====
import { describe, it, expect, beforeEach, vi } from 'vitest';

function stubDomWithoutToggleButtons() {
    const elements = {};
    return {
        getElementById: (id) => {
            if (!elements[id]) {
                // painéis carregados de templates sem toggle não têm estes IDs
                elements[id] = ['openmeteo-panel', 'openmeteo-panel-content',
                    'openmeteo-loading', 'openmeteo-current-data'].includes(id)
                    ? { classList: { add: () => {}, remove: () => {} }, style: {} }
                    : null;
            }
            return elements[id];
        }
    };
}

describe('init de painéis com DOM mínimo (sem toggle/header)', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('OpenMeteoPanel.init() não lança sem botão de toggle', async () => {
        vi.stubGlobal('document', stubDomWithoutToggleButtons());
        vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'https://x', pathname: '/' } });
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
        const mod = await import('../js/panels/openmeteo-panel.js');
        expect(() => mod.default.init()).not.toThrow();
    });
});
