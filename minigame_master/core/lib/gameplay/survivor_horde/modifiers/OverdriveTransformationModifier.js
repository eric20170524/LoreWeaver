import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    durationSec: 6,
    cooldownSec: 18,
    hpTriggerRatio: 0.45,
    damageMultiplier: 1.55,
    incomingDamageMultiplier: 0.7,
    speedMultiplier: 1.25,
    meleeRadiusBonus: 24,
    requiresPassive: null,
    requiresAbility: null,
    auraColor: 0xf5e6b8,
    label: 'OVERDRIVE'
});

function clampPositive(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default class OverdriveTransformationModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this._active = false;
        this._until = 0;
        this._cooldownUntil = 0;
        this._maxHp = 0;
        this._speedBefore = null;
        this._radiusBefore = null;
        this._originalDamageEnemy = null;
        this._originalDamagePlayer = null;
        this._originalHandleSemantic = null;
        this._originalSemanticActions = null;
        this._aura = null;
    }

    install(context) {
        super.install(context);
        const adapter = context.adapter;
        this._maxHp = Number(adapter?.state?.hp || adapter?.config?.player?.hp || 100);
        if (typeof adapter.damageEnemy === 'function') {
            this._originalDamageEnemy = adapter.damageEnemy.bind(adapter);
            adapter.damageEnemy = (enemy, damage) => {
                const next = this._active && Number.isFinite(damage)
                    ? damage * clampPositive(this.config.damageMultiplier, 1)
                    : damage;
                return this._originalDamageEnemy(enemy, next);
            };
        }
        if (typeof adapter.damagePlayer === 'function') {
            this._originalDamagePlayer = adapter.damagePlayer.bind(adapter);
            adapter.damagePlayer = (amount, reason) => {
                const next = this._active && Number.isFinite(amount)
                    ? amount * clampPositive(this.config.incomingDamageMultiplier, 1)
                    : amount;
                return this._originalDamagePlayer(next, reason);
            };
        }
        this._originalSemanticActions = adapter.semanticActions?.bind(adapter);
        this._originalHandleSemantic = adapter.handleSemanticInput?.bind(adapter);
        adapter.semanticActions = () => {
            const actions = this._originalSemanticActions ? this._originalSemanticActions() : [];
            if (!actions.includes('overdrive')) actions.push('overdrive');
            return actions;
        };
        adapter.handleSemanticInput = (payload = {}) => {
            if (String(payload?.action || '').trim() === 'overdrive') {
                return this.tryActivate(context, 'input');
            }
            return this._originalHandleSemantic
                ? this._originalHandleSemantic(payload)
                : { action: payload?.action, accepted: false };
        };
        adapter.triggerOverdrive = () => this.tryActivate(context, 'api');
        this.bindHotkey(context);
    }

    bindHotkey(context) {
        const keyboard = context.scene?.input?.keyboard;
        if (!keyboard) return;
        const onKey = (event) => {
            if (event?.repeat) return;
            this.tryActivate(context, 'hotkey');
        };
        if (context.lifecycle?.trackListener) {
            context.lifecycle.trackListener(keyboard, 'keydown-E', onKey);
        } else if (typeof keyboard.on === 'function') {
            keyboard.on('keydown-E', onKey);
        }
    }

    isArmed(adapter) {
        const requiredPassive = this.config.requiresPassive;
        const requiredAbility = this.config.requiresAbility;
        if (!requiredPassive && !requiredAbility) return true;
        const inventory = adapter?.payload?.inventory || {};
        const passives = inventory.unlockedPassives || [];
        const abilities = inventory.unlockedAbilities || [];
        if (requiredPassive && !passives.includes(requiredPassive)) return false;
        if (requiredAbility && !abilities.includes(requiredAbility)) return false;
        return true;
    }

    tryActivate(context, source = 'api') {
        const adapter = context?.adapter;
        const elapsed = Number(adapter?.state?.elapsedSeconds || 0);
        if (!adapter?.isRunning?.()) return { action: 'overdrive', accepted: false, reason: 'idle' };
        if (!this.isArmed(adapter)) return { action: 'overdrive', accepted: false, reason: 'unarmed' };
        if (this._active) return { action: 'overdrive', accepted: false, reason: 'active', until: this._until };
        if (elapsed < this._cooldownUntil) {
            return { action: 'overdrive', accepted: false, reason: 'cooldown', until: this._cooldownUntil };
        }
        this.activate(context, source);
        return { action: 'overdrive', accepted: true, source, until: this._until };
    }

    activate(context, source) {
        const adapter = context.adapter;
        const elapsed = Number(adapter.state.elapsedSeconds || 0);
        this._active = true;
        this._until = elapsed + clampPositive(this.config.durationSec, DEFAULT_CONFIG.durationSec);
        this._cooldownUntil = this._until + clampPositive(this.config.cooldownSec, DEFAULT_CONFIG.cooldownSec);
        this._speedBefore = Number(adapter.config?.player?.speed);
        if (Number.isFinite(this._speedBefore) && adapter.config?.player) {
            adapter.config.player.speed = this._speedBefore * clampPositive(this.config.speedMultiplier, 1);
        }
        const stance = adapter.modifiers?.find((item) => item.id === 'weapon_stance_cycle');
        if (stance?.config) {
            this._radiusBefore = Number(stance.config.meleeRadius);
            if (Number.isFinite(this._radiusBefore)) {
                stance.config.meleeRadius = this._radiusBefore + Number(this.config.meleeRadiusBonus || 0);
            }
        }
        this.mountAura(context);
        context.events?.emit?.('presentation', {
            kind: 'overdrive',
            active: true,
            source,
            label: this.config.label
        });
    }

    deactivate(context) {
        if (!this._active) return;
        const adapter = context?.adapter;
        if (adapter?.config?.player && Number.isFinite(this._speedBefore)) {
            adapter.config.player.speed = this._speedBefore;
        }
        const stance = adapter?.modifiers?.find((item) => item.id === 'weapon_stance_cycle');
        if (stance?.config && Number.isFinite(this._radiusBefore)) {
            stance.config.meleeRadius = this._radiusBefore;
        }
        this._active = false;
        this._aura?.destroy?.();
        this._aura = null;
        context?.events?.emit?.('presentation', {
            kind: 'overdrive',
            active: false,
            label: this.config.label
        });
    }

    mountAura(context) {
        const scene = context.scene;
        const player = context.player || context.adapter?.player;
        if (!scene?.add?.circle || !player) return;
        this._aura = scene.add.circle(player.x, player.y, 46, Number(this.config.auraColor), 0.22);
        this._aura.setDepth?.(6);
        context.lifecycle?.addCleanup?.(() => {
            this._aura?.destroy?.();
            this._aura = null;
        });
    }

    update(context) {
        if (!this.installed || !context.adapter?.isRunning?.()) return;
        const elapsed = Number(context.adapter.state.elapsedSeconds || 0);
        const hp = Number(context.adapter.state.hp || 0);
        if (!this._active && this.isArmed(context.adapter) && this._maxHp > 0
            && hp <= this._maxHp * clampPositive(this.config.hpTriggerRatio, 1)
            && elapsed >= this._cooldownUntil) {
            this.tryActivate(context, 'hp');
        }
        if (this._active && elapsed >= this._until) {
            this.deactivate(context);
        }
        if (this._aura && context.player) {
            this._aura.x = context.player.x;
            this._aura.y = context.player.y;
        }
    }

    uninstall(context) {
        this.deactivate(context);
        const adapter = context?.adapter;
        if (this._originalDamageEnemy && adapter) adapter.damageEnemy = this._originalDamageEnemy;
        if (this._originalDamagePlayer && adapter) adapter.damagePlayer = this._originalDamagePlayer;
        if (this._originalSemanticActions && adapter) adapter.semanticActions = this._originalSemanticActions;
        if (this._originalHandleSemantic && adapter) adapter.handleSemanticInput = this._originalHandleSemantic;
        if (adapter) delete adapter.triggerOverdrive;
        this._originalDamageEnemy = null;
        this._originalDamagePlayer = null;
        this._originalSemanticActions = null;
        this._originalHandleSemantic = null;
        super.uninstall(context);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            active: this._active,
            until: this._until,
            cooldownUntil: this._cooldownUntil,
            requiresPassive: this.config.requiresPassive || null
        };
    }
}

export { DEFAULT_CONFIG as OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG };
