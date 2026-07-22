export const CHANNEL_INTERACTION_STATES = Object.freeze({
    IDLE: 'idle',
    CHANNELING: 'channeling',
    INTERRUPTED: 'interrupted',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
});

const DEFAULT_CONFIG = Object.freeze({
    leavePolicy: 'reset',
    damagePolicy: 'regress',
    damageRegressMs: 400
});

const VALID_POLICIES = new Set(['reset', 'hold', 'regress', 'cancel']);

function normalizePolicy(value, fallback) {
    return VALID_POLICIES.has(value) ? value : fallback;
}

function positiveNumber(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Theme-agnostic hold-to-interact state machine.
 *
 * The owner decides which target is in range and feeds delta time. This class
 * owns interruption, idempotent completion and a serializable test snapshot;
 * it deliberately has no Phaser, reward or presentation dependencies.
 */
export default class ChannelInteractionSystem {
    constructor(config = {}) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            leavePolicy: normalizePolicy(config.leavePolicy, DEFAULT_CONFIG.leavePolicy),
            damagePolicy: normalizePolicy(config.damagePolicy, DEFAULT_CONFIG.damagePolicy),
            damageRegressMs: positiveNumber(config.damageRegressMs, DEFAULT_CONFIG.damageRegressMs)
        };
        this.onEvent = typeof config.onEvent === 'function' ? config.onEvent : null;
        this.completedTargetIds = new Set();
        this.eventSequence = 0;
        this.destroyed = false;
        this.resetState();
    }

    resetState() {
        this.state = CHANNEL_INTERACTION_STATES.IDLE;
        this.activeTargetId = null;
        this.durationMs = 0;
        this.progressMs = 0;
        this.metadata = null;
        this.lastInterruptReason = null;
    }

    emit(type, detail = {}) {
        const event = {
            sequence: ++this.eventSequence,
            type,
            state: this.state,
            targetId: this.activeTargetId,
            progressMs: this.progressMs,
            durationMs: this.durationMs,
            progress: this.progressRatio(),
            metadata: this.metadata,
            ...detail
        };
        this.onEvent?.(event);
        return event;
    }

    progressRatio() {
        if (this.durationMs <= 0) return 0;
        return Math.max(0, Math.min(1, this.progressMs / this.durationMs));
    }

    begin(targetId, durationMs, metadata = null) {
        if (!targetId || this.destroyed || this.completedTargetIds.has(targetId)) return false;

        const canResume = this.activeTargetId === targetId
            && this.state === CHANNEL_INTERACTION_STATES.INTERRUPTED;
        this.activeTargetId = targetId;
        this.durationMs = positiveNumber(durationMs, 1);
        this.metadata = metadata;
        if (!canResume) this.progressMs = 0;
        this.state = CHANNEL_INTERACTION_STATES.CHANNELING;
        this.emit('started', { resumed: canResume });
        return true;
    }

    /**
     * Advance the current target. Passing no target applies the configured
     * leave-range policy. Passing canRun=false freezes progress for pause/end.
     */
    step({ targetId = null, durationMs = 0, deltaMs = 0, canRun = true, metadata = null } = {}) {
        if (this.destroyed || !canRun) return this.getSnapshot();

        if (!targetId) {
            if (
                this.state === CHANNEL_INTERACTION_STATES.CHANNELING
                || (
                    this.state === CHANNEL_INTERACTION_STATES.INTERRUPTED
                    && this.activeTargetId
                    && this.lastInterruptReason !== 'left_range'
                )
            ) {
                this.interrupt('left_range', { policy: this.config.leavePolicy });
            } else if (this.state === CHANNEL_INTERACTION_STATES.COMPLETED) {
                this.resetState();
            }
            return this.getSnapshot();
        }

        if (this.completedTargetIds.has(targetId)) {
            return this.getSnapshot();
        }

        if (this.activeTargetId !== targetId) {
            if (this.state === CHANNEL_INTERACTION_STATES.CHANNELING) {
                this.interrupt('target_changed', { policy: 'reset' });
            }
            this.activeTargetId = null;
            this.state = CHANNEL_INTERACTION_STATES.IDLE;
            this.progressMs = 0;
        }

        if (this.state !== CHANNEL_INTERACTION_STATES.CHANNELING) {
            this.begin(targetId, durationMs, metadata);
        } else {
            this.durationMs = positiveNumber(durationMs, this.durationMs || 1);
            this.metadata = metadata;
        }

        if (this.state !== CHANNEL_INTERACTION_STATES.CHANNELING) return this.getSnapshot();

        this.progressMs = Math.min(
            this.durationMs,
            this.progressMs + Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0)
        );
        this.emit('progressed');

        if (this.progressMs >= this.durationMs) this.complete();
        return this.getSnapshot();
    }

    interrupt(reason = 'interrupted', options = {}) {
        if (
            this.destroyed
            || ![
                CHANNEL_INTERACTION_STATES.CHANNELING,
                CHANNEL_INTERACTION_STATES.INTERRUPTED
            ].includes(this.state)
        ) {
            return false;
        }

        const fallback = reason === 'damage' ? this.config.damagePolicy : this.config.leavePolicy;
        const policy = normalizePolicy(options.policy, fallback);
        if (policy === 'cancel') return this.cancel(reason);

        if (policy === 'reset') {
            this.progressMs = 0;
        } else if (policy === 'regress') {
            const regressMs = positiveNumber(options.regressMs, this.config.damageRegressMs);
            this.progressMs = Math.max(0, this.progressMs - regressMs);
        }

        this.state = CHANNEL_INTERACTION_STATES.INTERRUPTED;
        this.lastInterruptReason = reason;
        this.emit('interrupted', { reason, policy });
        return true;
    }

    complete() {
        const targetId = this.activeTargetId;
        if (
            this.destroyed
            || !targetId
            || this.state !== CHANNEL_INTERACTION_STATES.CHANNELING
            || this.completedTargetIds.has(targetId)
        ) {
            return false;
        }

        this.progressMs = this.durationMs;
        this.state = CHANNEL_INTERACTION_STATES.COMPLETED;
        this.completedTargetIds.add(targetId);
        this.emit('completed');
        return true;
    }

    cancel(reason = 'cancelled') {
        if (this.destroyed || this.state === CHANNEL_INTERACTION_STATES.CANCELLED) return false;
        this.state = CHANNEL_INTERACTION_STATES.CANCELLED;
        this.lastInterruptReason = reason;
        this.emit('cancelled', { reason });
        return true;
    }

    destroy(reason = 'lifecycle_destroyed') {
        if (this.destroyed) return;
        if (
            this.state === CHANNEL_INTERACTION_STATES.CHANNELING
            || this.state === CHANNEL_INTERACTION_STATES.INTERRUPTED
        ) {
            this.cancel(reason);
        }
        this.destroyed = true;
        this.onEvent = null;
    }

    getSnapshot() {
        return {
            state: this.state,
            targetId: this.activeTargetId,
            progressMs: this.progressMs,
            durationMs: this.durationMs,
            progress: this.progressRatio(),
            lastInterruptReason: this.lastInterruptReason,
            completedTargetIds: [...this.completedTargetIds],
            destroyed: this.destroyed,
            metadata: this.metadata
        };
    }
}

export { DEFAULT_CONFIG as CHANNEL_INTERACTION_DEFAULT_CONFIG };
