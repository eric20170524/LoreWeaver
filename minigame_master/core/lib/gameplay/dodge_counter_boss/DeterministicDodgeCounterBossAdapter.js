import DodgeCounterBossAdapterBase, {
    DODGE_COUNTER_BOSS_DEFAULT_CONFIG
} from './DodgeCounterBossAdapter.js';
import { createDeterministicRandom } from '../../utils/DeterministicRandom.js';

function verificationConfig() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const value = root?.__LOREWEAVER_DETERMINISM__;
    if (!value || value.mode !== 'verification') return null;
    const seed = typeof value.seed === 'string' ? value.seed.trim() : value.seed;
    if ((typeof seed !== 'string' || !seed) && !Number.isInteger(seed)) return null;
    return { seed, scope: value.scope || 'adapter_state_trace' };
}

/**
 * Verification-only deterministic wrapper. Normal sessions keep Math.random.
 * The wrapper injects a seeded adapter-local PRNG without patching globals.
 */
export default class DodgeCounterBossAdapter extends DodgeCounterBossAdapterBase {
    constructor(context = {}) {
        const config = verificationConfig();
        let randomHandle = null;
        let nextContext = context;
        if (!context.random && config) {
            randomHandle = createDeterministicRandom(`${config.seed}:dodge_counter_boss`);
            nextContext = {
                ...context,
                random: randomHandle.random,
                randomMetadata: randomHandle.metadata
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
        return {
            ...base,
            determinism: {
                ...this.verificationDeterminism,
                random: this.verificationRandomHandle?.metadata?.()
                    || this.verificationDeterminism.random,
                adapterStateSample: {
                    phase: base.phase,
                    phaseLeft: Number.isFinite(Number(base.phaseLeft)) ? Math.round(Number(base.phaseLeft) * 1000) / 1000 : null,
                    hp: base.hp,
                    bossHp: base.bossHp,
                    gauge: base.gauge,
                    score: base.score,
                    counters: base.counters,
                    dodges: base.dodges,
                    attackZone: base.attackZone
                }
            }
        };
    }
}

export { DODGE_COUNTER_BOSS_DEFAULT_CONFIG };
