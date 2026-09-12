import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    title: 'Run Growth',
    scoreLabel: 'Growth',
    initialSkills: [],
    milestones: [],
    hud: true,
    disableLegacyFirstNodeGrowth: true
});

function asFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneSkill(skill = {}) {
    return {
        id: String(skill.id || skill.skillId || 'skill'),
        label: String(skill.label || skill.name || skill.id || skill.skillId || 'Skill'),
        level: Math.max(1, Math.floor(asFiniteNumber(skill.level, 1)))
    };
}

function readPath(target, path) {
    return String(path || '')
        .split('.')
        .filter(Boolean)
        .reduce((value, key) => value?.[key], target);
}

function writePath(target, path, value) {
    const keys = String(path || '').split('.').filter(Boolean);
    if (!target || !keys.length) return false;
    let cursor = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
    return true;
}

export default class RunGrowthMilestonesModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.progress = 0;
        this.lastScore = 0;
        this.reached = [];
        this.activeSkills = (this.config.initialSkills || []).map(cloneSkill);
        this.effectHistory = [];
        this.hud = null;
        this.ownsHud = false;
        this._legacyGrowthState = null;
    }

    install(context) {
        super.install(context);
        this.disableLegacyGrowth(context);
        this.mountHud(context);
        this.renderHud();
        context.events?.emit?.('presentation', {
            kind: 'run-growth-ready',
            title: this.config.title,
            milestones: this.normalizedMilestones().map((item) => ({
                id: item.id,
                threshold: item.threshold,
                label: item.label
            }))
        });
    }

    disableLegacyGrowth(context) {
        if (!this.config.disableLegacyFirstNodeGrowth) return;
        const scene = context.scene;
        const legacy = scene?.runGrowthState;
        if (legacy?.enabled) {
            this._legacyGrowthState = legacy;
            legacy.enabled = false;
        }
    }

    mountHud(context) {
        if (!this.config.hud || !context.scene) return;
        const scene = context.scene;
        if (scene.growthHUD?.setText) {
            this.hud = scene.growthHUD;
            this.hud.setVisible?.(true);
            return;
        }

        const height = scene.scale?.height || 720;
        this.hud = scene.add?.text?.(32, height - 72, '', {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '18px',
            color: '#fbbf24'
        }) || null;
        if (this.hud) {
            this.hud.setDepth?.(20);
            this.ownsHud = true;
        }
    }

    normalizedMilestones() {
        return (Array.isArray(this.config.milestones) ? this.config.milestones : [])
            .map((entry, index) => ({
                ...entry,
                id: String(entry.id || `milestone_${index + 1}`),
                threshold: Math.max(1, Math.floor(asFiniteNumber(entry.threshold, index + 1))),
                label: String(entry.label || entry.name || entry.id || `Milestone ${index + 1}`),
                level: Math.max(1, Math.floor(asFiniteNumber(entry.level, 1))),
                skillId: String(entry.skillId || entry.id || `milestone_${index + 1}`),
                effects: Array.isArray(entry.effects) ? entry.effects : []
            }))
            .sort((a, b) => a.threshold - b.threshold);
    }

    update(context) {
        if (!this.installed || !context.adapter?.isRunning?.()) return;
        const score = Math.max(0, Math.floor(asFiniteNumber(context.state?.score, 0)));
        if (score > this.lastScore) {
            this.progress += score - this.lastScore;
            this.lastScore = score;
        }

        for (const milestone of this.normalizedMilestones()) {
            if (this.progress < milestone.threshold || this.reached.includes(milestone.id)) continue;
            this.applyMilestone(context, milestone);
        }
        this.renderHud();
    }

    applyMilestone(context, milestone) {
        this.reached.push(milestone.id);
        const existing = this.activeSkills.find((skill) => skill.id === milestone.skillId);
        if (existing) {
            existing.level = Math.max(existing.level, milestone.level);
            if (milestone.label) existing.label = milestone.label;
        } else {
            this.activeSkills.push({
                id: milestone.skillId,
                label: milestone.label,
                level: milestone.level
            });
        }

        const appliedEffects = milestone.effects
            .map((effect) => this.applyEffect(context, effect))
            .filter(Boolean);
        this.effectHistory.push(...appliedEffects.map((effect) => ({
            milestone: milestone.id,
            ...effect
        })));

        context.events?.emit?.('presentation', {
            kind: 'run-growth-milestone',
            milestoneId: milestone.id,
            label: milestone.label,
            feedback: milestone.feedback || milestone.label,
            progress: this.progress,
            effects: appliedEffects
        });
        this.showFeedback(context, milestone.feedback || milestone.label);
    }

    applyEffect(context, effect = {}) {
        const target = String(effect.target || '');
        if (!target) return null;
        const op = String(effect.op || 'set');
        const value = asFiniteNumber(effect.value, 0);
        let root = null;
        let path = '';

        if (target.startsWith('modifier.')) {
            const [, modifierId, ...rest] = target.split('.');
            const modifier = context.adapter?.modifiers?.find((item) => item.id === modifierId);
            if (!modifier) return null;
            root = modifier.config;
            path = rest.join('.');
        } else if (target.startsWith('adapter.')) {
            root = context.adapter?.config;
            path = target.slice('adapter.'.length);
        } else if (target.startsWith('state.')) {
            root = context.state;
            path = target.slice('state.'.length);
        } else {
            return null;
        }

        const before = asFiniteNumber(readPath(root, path), 0);
        let after = value;
        if (op === 'add') after = before + value;
        if (op === 'multiply') after = before * value;
        if (op === 'max') after = Math.max(before, value);
        if (op === 'min') after = Math.min(before, value);
        if (!writePath(root, path, after)) return null;
        return { target, op, value, before, after };
    }

    showFeedback(context, text) {
        const scene = context.scene;
        if (!scene?.add?.text) return;
        const width = scene.scale?.width || 1280;
        const height = scene.scale?.height || 720;
        const fx = scene.add.text(width / 2, height - 118, String(text), {
            fontFamily: 'Inter, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#fff7d6',
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            padding: { x: 10, y: 6 }
        }).setOrigin?.(0.5)?.setDepth?.(20);

        if (fx && scene.tweens?.add) {
            scene.tweens.add({
                targets: fx,
                y: height - 150,
                alpha: 0,
                duration: 1100,
                onComplete: () => fx.destroy?.()
            });
        }
    }

    renderHud() {
        if (!this.hud?.setText) return;
        const next = this.normalizedMilestones().find((item) => !this.reached.includes(item.id));
        const skills = this.activeSkills.length
            ? this.activeSkills.map((skill) => `${skill.label} Lv.${skill.level}`).join(' / ')
            : '—';
        const progress = next ? `${this.progress}/${next.threshold}` : `${this.progress}/MAX`;
        this.hud.setText(`${this.config.title}：${this.config.scoreLabel} ${progress} · ${skills}`);
    }

    uninstall(context) {
        if (this.ownsHud) this.hud?.destroy?.();
        this.hud = null;
        this.ownsHud = false;
        super.uninstall(context);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            progress: this.progress,
            lastScore: this.lastScore,
            reached: [...this.reached],
            activeSkills: this.activeSkills.map((item) => ({ ...item })),
            effects: this.effectHistory.map((item) => ({ ...item }))
        };
    }
}

export { DEFAULT_CONFIG as RUN_GROWTH_MILESTONES_DEFAULT_CONFIG };
