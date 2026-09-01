const ALGORITHM = 'fnv1a32+mulberry32-v1';

function seedText(seed) {
    if (Number.isInteger(seed)) return String(seed);
    if (typeof seed === 'string' && seed.trim()) return seed.trim();
    throw new Error('deterministic_seed_required');
}

function fnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Verification-only deterministic random source.
 *
 * This utility is never installed globally and never monkey-patches Math.random.
 * A host must explicitly inject `random` into an Adapter that supports dependency
 * injection. Integer arithmetic keeps the stream stable across JS engines.
 */
export function createDeterministicRandom(seed) {
    const normalizedSeed = seedText(seed);
    const initialState = fnv1a32(normalizedSeed) || 0x6d2b79f5;
    let state = initialState >>> 0;
    let calls = 0;

    const random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        value = (value ^ (value >>> 14)) >>> 0;
        calls += 1;
        return value / 4294967296;
    };

    return {
        random,
        metadata: () => ({
            schemaVersion: 'loreweaver.seeded-random.v1',
            controlled: true,
            source: 'seeded_prng',
            scope: 'adapter',
            seed: normalizedSeed,
            algorithm: ALGORITHM,
            initialState,
            state,
            calls
        })
    };
}

export { ALGORITHM as DETERMINISTIC_RANDOM_ALGORITHM };
