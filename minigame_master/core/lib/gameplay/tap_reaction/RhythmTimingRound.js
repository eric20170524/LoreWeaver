/** Pure rhythm rules. Time is advanced only by the owning adapter's active frames. */
export const RHYTHM_DEFAULTS = Object.freeze({
    beatIntervalMs: 1500, perfectWindowMs: 80, goodWindowMs: 160,
    targetProgress: 100, requiredBestCombo: 8, durationSec: 45,
    playerHp: 100, damageOnMiss: 10
});

const finite = (value, fallback, min, max) => {
    const number = value === null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
};
export function normalizeRhythmConfig(input = {}) {
    const d = RHYTHM_DEFAULTS;
    const beatIntervalMs = finite(input.beatIntervalMs ?? input.spawnIntervalMs, d.beatIntervalMs, 300, 5000);
    // Windows are half-widths around the target. They must not overlap adjacent beats.
    const goodWindowMs = finite(input.goodWindowMs, d.goodWindowMs, 10, Math.min(800, beatIntervalMs / 2 - 1));
    return {
        beatIntervalMs, goodWindowMs,
        perfectWindowMs: finite(input.perfectWindowMs, Math.min(d.perfectWindowMs, goodWindowMs), 1, goodWindowMs),
        targetProgress: Math.round(finite(input.targetProgress ?? input.goalValue, d.targetProgress, 1, 1000)),
        requiredBestCombo: Math.round(finite(input.requiredBestCombo, d.requiredBestCombo, 0, 200)),
        durationSec: finite(input.durationSec ?? input.duration, d.durationSec, 1, 600),
        playerHp: finite(input.playerHp, d.playerHp, 1, 1000),
        damageOnMiss: finite(input.damageOnMiss, d.damageOnMiss, 0, 1000)
    };
}

export default class RhythmTimingRound {
    constructor(input = {}) {
        this.config = normalizeRhythmConfig(input);
        this.state = {
            elapsedMs: 0, beatIndex: 0, resolved: false,
            score: 0, combo: 0, bestCombo: 0, perfectHits: 0, goodHits: 0, misses: 0,
            hp: this.config.playerHp, judgmentSequence: 0, lastJudgment: null,
            outcome: null
        };
    }
    get targetMs() { return (this.state.beatIndex + 1) * this.config.beatIntervalMs; }
    advance(deltaMs) {
        if (this.state.outcome || !Number.isFinite(deltaMs) || deltaMs < 0) return;
        const deadline = this.config.durationSec * 1000;
        const next = Math.min(deadline, this.state.elapsedMs + deltaMs);
        // Catch up missed beats in order even after a long frame. Never forgive a miss.
        while (next > this.targetMs + this.config.goodWindowMs) {
            this.state.elapsedMs = this.targetMs + this.config.goodWindowMs;
            if (!this.state.resolved) this.judge('miss', null, 'expired');
            if (this.state.outcome) return;
            this.state.beatIndex += 1;
            this.state.resolved = false;
        }
        this.state.elapsedMs = next;
        if (next >= deadline) this.state.outcome = { success: false, reason: 'timer_expired' };
    }
    hit() {
        const s = this.state;
        if (s.outcome || s.resolved) return { accepted: false, reason: s.outcome ? 'ended' : 'already_judged' };
        const offsetMs = s.elapsedMs - this.targetMs;
        const distance = Math.abs(offsetMs);
        const kind = distance <= this.config.perfectWindowMs ? 'perfect'
            : distance <= this.config.goodWindowMs ? 'good' : 'miss';
        this.judge(kind, offsetMs, kind === 'miss' ? 'early' : 'input');
        return { accepted: true, ...s.lastJudgment };
    }
    judge(kind, offsetMs, source) {
        const s = this.state;
        if (s.outcome || s.resolved) return;
        s.resolved = true; // Reserve before the adapter can notify any host.
        const gain = kind === 'perfect' ? 10 : kind === 'good' ? 5 : 0;
        s.score += gain;
        if (kind === 'miss') {
            s.misses += 1; s.combo = 0;
            s.hp = Math.max(0, s.hp - this.config.damageOnMiss);
        } else {
            s.combo += 1; s.bestCombo = Math.max(s.bestCombo, s.combo);
            s[kind === 'perfect' ? 'perfectHits' : 'goodHits'] += 1;
        }
        s.lastJudgment = { sequence: ++s.judgmentSequence, beatIndex: s.beatIndex,
            kind, gain, offsetMs, source, atMs: s.elapsedMs };
        if (s.hp <= 0) s.outcome = { success: false, reason: 'hp_zero' };
        else if (s.score >= this.config.targetProgress && s.bestCombo >= this.config.requiredBestCombo) {
            s.outcome = { success: true, reason: 'objective_met' };
        }
    }
    snapshot() {
        const s = this.state;
        return {
            ...s, lastJudgment: s.lastJudgment ? { ...s.lastJudgment } : null,
            outcome: s.outcome ? { ...s.outcome } : null,
            targetMs: this.targetMs, offsetMs: s.elapsedMs - this.targetMs,
            timer: Math.max(0, this.config.durationSec - s.elapsedMs / 1000),
            goalValue: this.config.targetProgress, requiredBestCombo: this.config.requiredBestCombo,
            perfectWindowMs: this.config.perfectWindowMs, goodWindowMs: this.config.goodWindowMs
        };
    }
}
