import SurvivorHordeAdapterBase, {
    SURVIVOR_HORDE_DEFAULT_CONFIG
} from './SurvivorHordeAdapter.js';
import { createDeterministicRandom } from '../../utils/DeterministicRandom.js';

function verificationConfig() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const value = root?.__LOREWEAVER_DETERMINISM__;
    if (!value || value.mode !== 'verification') return null;
    const seed = typeof value.seed === 'string' ? value.seed.trim() : value.seed;
    if ((typeof seed !== 'string' || !seed) && !Number.isInteger(seed)) return null;
    return { seed, scope: value.scope || 'adapter_state_trace' };
}

function rounded(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value) * 1000) / 1000 : null;
}

/**
 * The production adapter remains unchanged. This exported wrapper only injects a
 * seeded PRNG when the verification host explicitly publishes
 * `window.__LOREWEAVER_DETERMINISM__ = { mode: 'verification', seed }` before the
 * runtime boots. Normal player sessions therefore keep natural Math.random.
 */
export default class SurvivorHordeAdapter extends SurvivorHordeAdapterBase {
    constructor(context = {}) {
        const config = verificationConfig();
        let randomHandle = null;
        let nextContext = context;
        if (!context.random && config) {
            randomHandle = createDeterministicRandom(`${config.seed}:survivor_horde`);
            nextContext = {
                ...context,
                random: randomHandle.random
            };
        }
        super(nextContext);
        this.verificationDeterminism = config
            ? {
                schemaVersion: 'loreweaver.adapter-determinism.v1',
                enabled: true,
                scope: config.scope,
                random: randomHandle?.metadata?.() || {
                    controlled: Boolean(context.random),
                    source: context.random ? 'host_injected' : 'missing',
                    seed: config.seed
                }
            }
            : {
                schemaVersion: 'loreweaver.adapter-determinism.v1',
                enabled: false,
                scope: null,
                random: {
                    controlled: typeof context.random === 'function',
                    source: typeof context.random === 'function' ? 'host_injected' : 'Math.random',
                    seed: null
                }
            };
        this.verificationRandomHandle = randomHandle;
    }

    getTestState() {
        const base = super.getTestState();
        const children = this.groups?.enemies?.getChildren?.() || [];
        const enemySample = children.slice(0, 12).map((enemy) => ({
            x: rounded(enemy?.x),
            y: rounded(enemy?.y),
            active: enemy?.active !== false,
            hp: rounded(enemy?.getData?.('hp') ?? enemy?.hp)
        }));
        const random = this.verificationRandomHandle?.metadata?.()
            || this.verificationDeterminism.random;
        return {
            ...base,
            determinism: {
                ...this.verificationDeterminism,
                random,
                adapterStateSample: {
                    enemyCount: children.length,
                    enemies: enemySample
                }
            }
        };
    }
}

export { SURVIVOR_HORDE_DEFAULT_CONFIG };
