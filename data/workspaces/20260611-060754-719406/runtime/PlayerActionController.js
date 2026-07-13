/**
 * Owns player-triggered combat decisions: dash, active technique, and charged burst.
 * Auto-cast skills remain a separate build layer and must never fire these actions.
 */

const ACTION_IDS = Object.freeze(['dash', 'active', 'burst']);

const BUILTIN_ACTIVE = Object.freeze({
    id: 'manual_active_technique',
    name: '真解·怒拳',
    icon: '✊',
    rarity: 'common',
    school: 'primordial_true_record',
    type: 'aoe_burst',
    castMode: 'manual',
    description: '主动术法：周身拳罡爆发',
    baseDamage: 28,
    cooldown: 5.5,
    radius: 140,
    levelScaling: { damage: 12, radius: 8, cooldown: -0.15 },
    vfx: 'bone_script_fist',
    sfx: 'short_fist_whoosh'
});

const BUILTIN_BURST = Object.freeze({
    id: 'manual_burst',
    name: '荒域爆发',
    icon: '💥',
    rarity: 'rare',
    school: 'primordial_true_record',
    type: 'aoe_burst',
    castMode: 'manual',
    description: '蓄能爆发：大范围清压',
    baseDamage: 70,
    cooldown: 1.0,
    radius: 220,
    levelScaling: { damage: 25, radius: 12 },
    vfx: 'golden_roar_ring',
    sfx: 'beast_roar_sweep'
});

const MANUAL_TYPES = new Set(['active_dodge', 'screen_clear', 'transform']);

function round(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 100) / 100
        : null;
}

export function isManualOnlySkillType(type) {
    return MANUAL_TYPES.has(type);
}

export function shouldAutoCastSkill(skillData, boundManualIds = new Set()) {
    if (!skillData) return false;
    if (skillData.castMode === 'manual') return false;
    if (isManualOnlySkillType(skillData.type)) return false;
    if (boundManualIds.has(skillData.id)) return false;
    return true;
}

export class PlayerActionController {
    constructor(scene) {
        this.scene = scene;
        this.keyboardKeys = null;
        this.keyboardHandlers = null;
        this.isTornDown = true;
        this.lastFacing = { x: 0, y: -1 };
        this.lastChargeTickAt = 0;
        this.lastDecision = {
            actionId: null,
            accepted: null,
            reason: null,
            source: null,
            at: null
        };
        this.actions = {
            dash: this.createDashAction(),
            active: this.createActiveAction(),
            burst: this.createBurstAction()
        };
        this.actionZones = [];
    }

    createDashAction() {
        return {
            id: 'dash',
            label: '闪避',
            icon: '💨',
            keyLabel: 'Space',
            cooldownMs: 2500,
            invincibleMs: 360,
            distance: 168,
            readyAt: 0,
            pressed: false,
            disabled: false,
            skillId: null,
            level: 1
        };
    }

    createActiveAction() {
        return {
            id: 'active',
            label: BUILTIN_ACTIVE.name,
            icon: BUILTIN_ACTIVE.icon,
            keyLabel: 'J',
            cooldownMs: BUILTIN_ACTIVE.cooldown * 1000,
            readyAt: 0,
            pressed: false,
            disabled: false,
            skillId: BUILTIN_ACTIVE.id,
            skillData: { ...BUILTIN_ACTIVE },
            level: 1
        };
    }

    createBurstAction() {
        return {
            id: 'burst',
            label: BUILTIN_BURST.name,
            icon: BUILTIN_BURST.icon,
            keyLabel: 'K',
            cooldownMs: 800,
            readyAt: 0,
            pressed: false,
            disabled: false,
            skillId: BUILTIN_BURST.id,
            skillData: { ...BUILTIN_BURST },
            level: 1,
            charge: 0,
            chargeMax: 100,
            chargeCost: 100
        };
    }

    setup() {
        this.teardown();
        this.resolveLoadout();
        this.bindKeyboard();
        this.isTornDown = false;
        this.refreshZones();
        this.scene.publishNodeTestState?.();
    }

    resolveLoadout() {
        const scene = this.scene;
        const activeSkills = Array.isArray(scene.activeSkills) ? scene.activeSkills : [];
        const findData = (id) => scene.findSkillData?.(id) || null;

        const dodge = activeSkills.find((skill) => {
            const data = findData(skill.id);
            return data?.type === 'active_dodge';
        });
        if (dodge) {
            const data = findData(dodge.id);
            this.actions.dash.skillId = dodge.id;
            this.actions.dash.level = dodge.level || 1;
            this.actions.dash.cooldownMs = Math.max(
                1200,
                ((data?.cooldown || 8) + ((dodge.level || 1) - 1) * (data?.levelScaling?.cooldown || 0)) * 1000
            );
            this.actions.dash.distance = (data?.dashDistance || 180)
                + ((dodge.level || 1) - 1) * (data?.levelScaling?.dashDistance || 0);
            this.actions.dash.invincibleMs = Math.round((data?.invincibleDuration || 0.5) * 1000);
            this.actions.dash.label = data?.name || '闪避';
            this.actions.dash.icon = data?.icon || '💨';
        }

        const preferredActiveTypes = new Set(['slash_cone', 'aoe_burst', 'targeted_aoe', 'chain_lightning', 'laser_beam', 'aoe_root', 'aura']);
        const activeCandidate = activeSkills.find((skill) => {
            if (skill.id === this.actions.dash.skillId) return false;
            const data = findData(skill.id);
            if (!data || data.type === 'projectile' || data.type === 'passive_heal' || data.type === 'passive_shield') return false;
            if (isManualOnlySkillType(data.type) && data.type !== 'slash_cone') {
                // keep defensive/burst types for dedicated slots
                return preferredActiveTypes.has(data.type) && data.type !== 'screen_clear' && data.type !== 'transform' && data.type !== 'active_dodge';
            }
            return preferredActiveTypes.has(data.type);
        });
        if (activeCandidate) {
            const data = findData(activeCandidate.id);
            this.actions.active.skillId = activeCandidate.id;
            this.actions.active.skillData = data;
            this.actions.active.level = activeCandidate.level || 1;
            this.actions.active.label = data?.name || activeCandidate.id;
            this.actions.active.icon = data?.icon || '✊';
            const cd = scene.getSkillCooldown?.(data, activeCandidate.level || 1)
                ?? data?.cooldown
                ?? 5;
            this.actions.active.cooldownMs = Math.max(800, cd * 1000);
        } else {
            this.actions.active.skillId = BUILTIN_ACTIVE.id;
            this.actions.active.skillData = { ...BUILTIN_ACTIVE };
            this.actions.active.level = 1;
            this.actions.active.label = BUILTIN_ACTIVE.name;
            this.actions.active.icon = BUILTIN_ACTIVE.icon;
            this.actions.active.cooldownMs = BUILTIN_ACTIVE.cooldown * 1000;
        }

        const burstCandidate = activeSkills.find((skill) => {
            const data = findData(skill.id);
            return data && (data.type === 'screen_clear' || data.type === 'transform');
        });
        if (burstCandidate) {
            const data = findData(burstCandidate.id);
            this.actions.burst.skillId = burstCandidate.id;
            this.actions.burst.skillData = data;
            this.actions.burst.level = burstCandidate.level || 1;
            this.actions.burst.label = data?.name || burstCandidate.id;
            this.actions.burst.icon = data?.icon || '💥';
        } else {
            this.actions.burst.skillId = BUILTIN_BURST.id;
            this.actions.burst.skillData = { ...BUILTIN_BURST };
            this.actions.burst.level = 1;
            this.actions.burst.label = BUILTIN_BURST.name;
            this.actions.burst.icon = BUILTIN_BURST.icon;
        }
    }

    bindKeyboard() {
        const keyboard = this.scene.input?.keyboard;
        if (!keyboard) return;

        this.keyboardKeys = keyboard.addKeys({
            dash: Phaser.Input.Keyboard.KeyCodes.SPACE,
            active: Phaser.Input.Keyboard.KeyCodes.J,
            burst: Phaser.Input.Keyboard.KeyCodes.K,
            dashAlt: Phaser.Input.Keyboard.KeyCodes.SHIFT,
            activeAlt: Phaser.Input.Keyboard.KeyCodes.U,
            burstAlt: Phaser.Input.Keyboard.KeyCodes.I
        });

        this.keyboardHandlers = {
            dash: () => this.tryAction('dash', 'keyboard'),
            active: () => this.tryAction('active', 'keyboard'),
            burst: () => this.tryAction('burst', 'keyboard')
        };

        this.keyboardKeys.dash?.on?.('down', this.keyboardHandlers.dash);
        this.keyboardKeys.dashAlt?.on?.('down', this.keyboardHandlers.dash);
        this.keyboardKeys.active?.on?.('down', this.keyboardHandlers.active);
        this.keyboardKeys.activeAlt?.on?.('down', this.keyboardHandlers.active);
        this.keyboardKeys.burst?.on?.('down', this.keyboardHandlers.burst);
        this.keyboardKeys.burstAlt?.on?.('down', this.keyboardHandlers.burst);
    }

    teardown() {
        if (this.keyboardKeys && this.keyboardHandlers) {
            this.keyboardKeys.dash?.off?.('down', this.keyboardHandlers.dash);
            this.keyboardKeys.dashAlt?.off?.('down', this.keyboardHandlers.dash);
            this.keyboardKeys.active?.off?.('down', this.keyboardHandlers.active);
            this.keyboardKeys.activeAlt?.off?.('down', this.keyboardHandlers.active);
            this.keyboardKeys.burst?.off?.('down', this.keyboardHandlers.burst);
            this.keyboardKeys.burstAlt?.off?.('down', this.keyboardHandlers.burst);
        }
        this.keyboardKeys = null;
        this.keyboardHandlers = null;
        this.actionZones = [];
        this.isTornDown = true;
    }

    refreshZones() {
        const width = this.scene.width || 720;
        const height = this.scene.height || 1280;
        const size = 76;
        const bottom = height - 48;
        const right = width - 36;
        // Right-thumb cluster: burst left of active, dash above active.
        const layout = {
            dash: { x: right - size / 2, y: bottom - size * 2 - 18, size },
            active: { x: right - size / 2, y: bottom - size / 2, size },
            burst: { x: right - size * 1.55 - 12, y: bottom - size / 2, size }
        };
        this.actionZones = ACTION_IDS.map((id) => {
            const slot = layout[id];
            return {
                id,
                x: slot.x - slot.size / 2,
                y: slot.y - slot.size / 2,
                width: slot.size,
                height: slot.size,
                cx: slot.x,
                cy: slot.y,
                size: slot.size
            };
        });
        this.scene.actionInputZones = this.actionZones;
        return this.actionZones;
    }

    isPointerOnActionButton(pointer) {
        if (!pointer) return false;
        const x = pointer.x;
        const y = pointer.y;
        return this.actionZones.some((zone) => (
            x >= zone.x && x <= zone.x + zone.width &&
            y >= zone.y && y <= zone.y + zone.height
        ));
    }

    getBoundManualSkillIds() {
        return new Set(
            [this.actions.dash.skillId, this.actions.active.skillId, this.actions.burst.skillId]
                .filter(Boolean)
        );
    }

    shouldAutoCast(skillData) {
        return shouldAutoCastSkill(skillData, this.getBoundManualSkillIds());
    }

    noteDecision(actionId, accepted, reason, source) {
        this.lastDecision = {
            actionId,
            accepted,
            reason,
            source: source || null,
            at: Math.round(this.scene.time?.now || 0)
        };
    }

    getLockReason() {
        return this.scene.getInputLockReason?.() || this.scene.touchInput?.getInputLockReason?.() || null;
    }

    canAcceptActions() {
        return this.scene.canAcceptMovementInput?.() === true;
    }

    getActionAvailability(actionId, now = this.scene.time?.now || 0) {
        const action = this.actions[actionId];
        if (!action) {
            return { available: false, reason: 'unknown_action', remainingMs: 0 };
        }
        if (!this.canAcceptActions()) {
            return {
                available: false,
                reason: this.getLockReason() || 'input_locked',
                remainingMs: Math.max(0, action.readyAt - now)
            };
        }
        if (action.disabled) {
            return { available: false, reason: 'disabled', remainingMs: 0 };
        }
        if (now < action.readyAt) {
            return { available: false, reason: 'cooldown', remainingMs: Math.max(0, action.readyAt - now) };
        }
        if (actionId === 'burst' && (action.charge || 0) < (action.chargeCost || 100)) {
            return {
                available: false,
                reason: 'insufficient_charge',
                remainingMs: 0,
                charge: action.charge,
                chargeMax: action.chargeMax
            };
        }
        return { available: true, reason: null, remainingMs: 0 };
    }

    tryAction(actionId, source = 'unknown') {
        const now = this.scene.time?.now || 0;
        const availability = this.getActionAvailability(actionId, now);
        if (!availability.available) {
            this.noteDecision(actionId, false, availability.reason, source);
            this.scene.publishNodeTestState?.();
            return false;
        }

        let ok = false;
        if (actionId === 'dash') ok = this.executeDash(source);
        else if (actionId === 'active') ok = this.executeActive(source);
        else if (actionId === 'burst') ok = this.executeBurst(source);
        else {
            this.noteDecision(actionId, false, 'unknown_action', source);
            this.scene.publishNodeTestState?.();
            return false;
        }

        if (!ok) {
            // execute methods already recorded reject reason when possible
            if (this.lastDecision.actionId !== actionId || this.lastDecision.accepted !== false) {
                this.noteDecision(actionId, false, 'execute_failed', source);
            }
            this.scene.publishNodeTestState?.();
            return false;
        }

        const action = this.actions[actionId];
        action.readyAt = now + (action.cooldownMs || 1000);
        this.noteDecision(actionId, true, 'accepted', source);
        this.scene.uiScene?.updateActionBar?.(this.getHudSnapshot());
        this.scene.publishNodeTestState?.();
        return true;
    }

    rememberFacingFromMovement() {
        const movement = this.scene.getMovementVector?.() || { x: 0, y: 0 };
        if (movement.x !== 0 || movement.y !== 0) {
            this.lastFacing = { x: movement.x, y: movement.y };
        }
        return this.lastFacing;
    }

    executeDash(source) {
        const scene = this.scene;
        const action = this.actions.dash;
        if (scene.isInvulnerable && scene.dashInvulnerable) {
            this.noteDecision('dash', false, 'already_invulnerable', source);
            return false;
        }

        const facing = this.rememberFacingFromMovement();
        const runtime = scene.skillExecutionRuntime;
        if (!runtime?.executeDirectionalDash) {
            this.noteDecision('dash', false, 'runtime_missing', source);
            return false;
        }

        const result = runtime.executeDirectionalDash({
            distance: action.distance,
            invincibleDuration: (action.invincibleMs || 360) / 1000,
            direction: facing,
            label: action.label || '闪避'
        });
        if (!result) {
            this.noteDecision('dash', false, 'dash_blocked', source);
            return false;
        }
        return true;
    }

    executeActive(source) {
        const action = this.actions.active;
        const skillData = action.skillData || BUILTIN_ACTIVE;
        const level = action.level || 1;
        const cast = this.scene.skillExecutionRuntime?.execute?.(skillData, level);
        if (!cast) {
            this.noteDecision('active', false, 'no_valid_target_or_state', source);
            return false;
        }
        return true;
    }

    executeBurst(source) {
        const action = this.actions.burst;
        if ((action.charge || 0) < (action.chargeCost || 100)) {
            this.noteDecision('burst', false, 'insufficient_charge', source);
            return false;
        }
        const skillData = action.skillData || BUILTIN_BURST;
        const level = action.level || 1;
        const cast = this.scene.skillExecutionRuntime?.execute?.(skillData, level);
        if (!cast) {
            this.noteDecision('burst', false, 'no_valid_target_or_state', source);
            return false;
        }
        action.charge = Math.max(0, (action.charge || 0) - (action.chargeCost || 100));
        return true;
    }

    addCharge(amount = 0, reason = 'combat') {
        const action = this.actions.burst;
        if (!action) return action?.charge || 0;
        const before = action.charge || 0;
        action.charge = Math.min(action.chargeMax || 100, before + Math.max(0, amount));
        if (action.charge !== before) {
            this.scene.uiScene?.updateActionBar?.(this.getHudSnapshot());
            this.scene.publishNodeTestState?.({
                actionChargeReason: reason
            });
        }
        return action.charge;
    }

    onEnemyDefeated() {
        // ~12 kills to full charge keeps burst earned, not free.
        this.addCharge(9, 'enemy_defeated');
    }

    onPlayerDamaged() {
        this.addCharge(3, 'player_damaged');
    }

    update(time) {
        this.rememberFacingFromMovement();
        // Passive trickle so a stalled fight still teaches the burst meter.
        if (this.canAcceptActions() && time - this.lastChargeTickAt >= 1000) {
            this.lastChargeTickAt = time;
            this.addCharge(1, 'time_tick');
        }
        this.scene.uiScene?.updateActionBar?.(this.getHudSnapshot(time));
    }

    getHudSnapshot(now = this.scene.time?.now || 0) {
        this.refreshZones();
        return {
            zones: this.actionZones,
            actions: ACTION_IDS.map((id) => {
                const action = this.actions[id];
                const availability = this.getActionAvailability(id, now);
                const remainingMs = availability.remainingMs || 0;
                const cooldownRatio = action.cooldownMs > 0
                    ? Math.min(1, remainingMs / action.cooldownMs)
                    : 0;
                return {
                    id,
                    label: action.label,
                    icon: action.icon,
                    keyLabel: action.keyLabel,
                    available: availability.available,
                    reason: availability.reason,
                    remainingMs: Math.round(remainingMs),
                    cooldownRatio,
                    charge: action.charge ?? null,
                    chargeMax: action.chargeMax ?? null,
                    pressed: Boolean(action.pressed),
                    disabled: Boolean(action.disabled)
                };
            })
        };
    }

    getTestState(now = this.scene.time?.now || 0) {
        const snapshot = this.getHudSnapshot(now);
        return {
            version: 1,
            tornDown: this.isTornDown,
            inputLockReason: this.getLockReason(),
            canAcceptActions: this.canAcceptActions(),
            lastFacing: {
                x: round(this.lastFacing.x),
                y: round(this.lastFacing.y)
            },
            lastDecision: { ...this.lastDecision },
            lastAcceptedAction: this.lastDecision.accepted === true ? this.lastDecision.actionId : null,
            lastRejectedAction: this.lastDecision.accepted === false ? this.lastDecision.actionId : null,
            lastRejectReason: this.lastDecision.accepted === false ? this.lastDecision.reason : null,
            boundManualSkillIds: [...this.getBoundManualSkillIds()],
            actions: snapshot.actions.map((action) => ({
                id: action.id,
                available: action.available,
                reason: action.reason,
                remainingMs: action.remainingMs,
                charge: action.charge,
                chargeMax: action.chargeMax,
                label: action.label
            })),
            zones: snapshot.zones
        };
    }

    getDebugState() {
        return {
            tornDown: this.isTornDown,
            keyboardBound: Boolean(this.keyboardKeys),
            zoneCount: this.actionZones.length,
            lastDecision: { ...this.lastDecision }
        };
    }
}

export default PlayerActionController;
