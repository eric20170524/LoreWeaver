import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const MATERIAL_PALETTE = [
    { id: 'wood', label: 'Wood', color: 0x22c55e },
    { id: 'fire', label: 'Fire', color: 0xef4444 },
    { id: 'water', label: 'Water', color: 0x3b82f6 },
    { id: 'metal', label: 'Metal', color: 0xeab308 },
    { id: 'earth', label: 'Earth', color: 0xa16207 },
    { id: 'wind', label: 'Wind', color: 0x2dd4bf },
    { id: 'thunder', label: 'Thunder', color: 0xa855f7 },
    { id: 'ice', label: 'Ice', color: 0x67e8f9 }
];

const DEFAULT_CONFIG = Object.freeze({
    id: 'sequence_synthesis',
    recipeLength: 4,
    materialPoolSize: 6,
    wrongInputProgressPenalty: 30,
    explodeOnConsecutiveMistakes: 2,
    /** When true, consecutive mistakes hard-fail instead of recipe reset */
    explodeFails: false,
    durationSec: 45,
    playerHp: 100,
    runSeed: 0,
    rewardTable: { score: 1 },
    allowQuit: true,
    allowPause: true
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            output[key] = value.slice();
        } else if (value && typeof value === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

function bounded(value, fallback, min, max, integer = false) {
    const n = value === null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
    const safe = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    return integer ? Math.floor(safe) : safe;
}

function seededRandom(seed) {
    let s = Number(seed) >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export default class SequenceSynthesisAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.materialButtons = [];
        this.ui = {};
        this.state = {
            progress: 0,
            recipe: [],
            pool: [],
            stepIndex: 0,
            mistakes: 0,
            consecutiveMistakes: 0,
            elapsedSeconds: 0,
            timeRemaining: DEFAULT_CONFIG.durationSec,
            resets: 0,
            hp: 100
        };
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));

        this.config.recipeLength = bounded(this.config.recipeLength, 4, 1, 20, true);
        this.config.materialPoolSize = bounded(this.config.materialPoolSize, 6, 2, MATERIAL_PALETTE.length, true);
        this.config.wrongInputProgressPenalty = bounded(this.config.wrongInputProgressPenalty, 30, 0, 100);
        this.config.explodeOnConsecutiveMistakes = bounded(this.config.explodeOnConsecutiveMistakes, 2, 1, 10, true);
        this.config.explodeFails = this.config.explodeFails === true;
        this.config.allowPause = this.config.allowPause !== false;
        this.config.allowQuit = this.config.allowQuit !== false;
        const duration = knobs.timeLimitSec ?? knobs.durationSec ?? knobs.duration
            ?? nodeConfig.duration ?? nodeConfig.durationLimit ?? this.config.durationSec;
        this.config.durationSec = bounded(duration, 45, 5, 180);
        this.config.playerHp = bounded(knobs.playerHp ?? payload.playerStats?.hp ?? this.config.playerHp, 100, 1, 300);
        this.config.runSeed = bounded(payload.runSeed ?? knobs.runSeed ?? this.config.runSeed, 0, 0, 999999999, true);
        this.readPlayabilityKnobs({ ...payload, nodeConfig: {
            ...nodeConfig, gameplay: { ...gameplayConfig, knobs: {
                ...knobs, timeLimitSec: this.config.durationSec, durationSec: this.config.durationSec,
                goalValue: 100, needAmount: 100,
                allowPause: this.config.allowPause, allowQuit: this.config.allowQuit
            } }
        } }, 'sequence_synthesis');

        this.themePack =
            nodeConfig.themeContentPack || knobs.themeContentPack || payload.themeContentPack || null;
        this.themeLocale =
            knobs.locale || nodeConfig.locale || this.themePack?.defaultLocale || 'zh-CN';

        // Zero is a valid reproducible seed; never use wall time or random sort.
        const rng = seededRandom(this.config.runSeed);
        const poolSize = Math.min(MATERIAL_PALETTE.length, this.config.materialPoolSize);
        const shuffled = MATERIAL_PALETTE.slice();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        this.state.pool = shuffled.slice(0, poolSize).map((m) => ({
            ...m,
            label: this.t(`material_${m.id}`, m.label)
        }));
        this.state.recipe = Array.from({ length: this.config.recipeLength }, () => {
            const pick = this.state.pool[Math.floor(rng() * this.state.pool.length)];
            return pick.id;
        });

        this.state.progress = 0;
        this.state.stepIndex = 0;
        this.state.mistakes = 0;
        this.state.consecutiveMistakes = 0;
        this.state.elapsedSeconds = 0;
        this.state.hp = this.config.playerHp;
        this.state.timeRemaining = this.config.durationSec;
        this.state.resets = 0;
        this.result = null;
        this.acceptingInput = false;
        return this;
    }

    t(key, fallback) {
        const pack = this.themePack;
        if (!pack) return fallback;
        const locale = this.themeLocale || pack.defaultLocale || 'zh-CN';
        const fb = pack.defaultLocale || 'zh-CN';
        if (pack.copyKeys?.[key]) {
            const v = pack.copyKeys[key];
            if (typeof v === 'object') return v[locale] || v[fb] || Object.values(v)[0] || fallback;
            if (typeof v === 'string') return v;
        }
        return fallback;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) {
            throw new Error('SequenceSynthesisAdapter requires Phaser in adapter context.');
        }
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        const { width, height } = scene.scale;
        this.drawCauldron(width, height);
        this.drawRecipeHint(width, height);
        this.drawMaterialPool(width, height);
        this.drawProgress(width, height);

        this.lifecycle.trackListener(scene.input?.keyboard, 'keydown', (event) => {
            if (!this.isRunning() || event?.repeat || event?.ctrlKey || event?.altKey || event?.metaKey) return;
            const index = /^[1-8]$/.test(event?.key || '') ? Number(event.key) - 1 : -1;
            if (index < 0 || !this.state.pool[index]) return;
            event.preventDefault?.();
            this.onMaterialClick(this.state.pool[index]);
        });


        this.publishTestState();
        return this;
    }

    drawCauldron(width, height) {
        const g = this.scene.add.graphics();
        g.fillStyle(0x1e293b, 0.8);
        g.fillRoundedRect(width * 0.18, height * 0.16, width * 0.64, height * 0.28, 18);
        g.lineStyle(2, 0xf59e0b, 0.5);
        g.strokeRoundedRect(width * 0.18, height * 0.16, width * 0.64, height * 0.28, 18);

        this.ui.title = this.scene.add.text(width / 2, height * 0.2, this.t('title_inline', 'Sequence Synthesis'), {
            fontFamily: 'Inter, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#f8fafc'
        }).setOrigin(0.5);

        this.ui.stepText = this.scene.add.text(width / 2, height * 0.28, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            color: '#fbbf24'
        }).setOrigin(0.5);

        this.ui.feedback = this.scene.add.text(
            width / 2,
            height * 0.36,
            this.t('hint_feed', 'Feed materials in order'),
            {
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                color: '#94a3b8'
            }
        ).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            g.destroy();
            this.ui.title?.destroy();
            this.ui.stepText?.destroy();
            this.ui.feedback?.destroy();
        });
        this.refreshStepText();
    }

    drawRecipeHint(width, height) {
        const labels = this.state.recipe.map((id) => {
            const mat = this.state.pool.find((m) => m.id === id) || MATERIAL_PALETTE.find((m) => m.id === id);
            return mat?.label || id;
        });
        const recipePrefix = this.t('recipe_prefix', 'Recipe:');
        this.ui.recipeHint = this.scene.add.text(width / 2, height * 0.48, `${recipePrefix} ${labels.join(' → ')}`, {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#cbd5e1',
            wordWrap: { width: width - 48 }
        }).setOrigin(0.5);
        this.lifecycle.addCleanup(() => this.ui.recipeHint?.destroy());
    }

    drawMaterialPool(width, height) {
        const pool = this.state.pool;
        const cols = Math.min(pool.length, 4);
        const gap = 16;
        const btnW = Math.min(128, (width - 48 - (cols - 1) * gap) / cols);
        const btnH = 92;
        const rows = Math.ceil(pool.length / cols);
        const totalW = cols * btnW + (cols - 1) * gap;
        const startX = (width - totalW) / 2 + btnW / 2;
        const startY = height * 0.62;

        pool.forEach((mat, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * (btnW + gap);
            const y = startY + row * (btnH + gap);
            const bg = this.scene.add.rectangle(x, y, btnW, btnH, mat.color, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.3)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y, `${index + 1} · ${mat.label}`, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#0f172a'
            }).setOrigin(0.5);
            this.lifecycle.trackListener(bg, 'pointerdown', () => this.onMaterialClick(mat));
            this.materialButtons.push({ bg, label, id: mat.id });
        });

        this.lifecycle.addCleanup(() => {
            this.materialButtons.forEach((b) => {
                b.bg?.destroy();
                b.label?.destroy();
            });
            this.materialButtons = [];
        });
    }

    drawProgress(width, height) {
        this.ui.progressBar = this.scene.add.graphics();
        this.ui.progressText = this.scene.add.text(width / 2, height * 0.54, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#e2e8f0'
        }).setOrigin(0.5);
        this.refreshProgress();
        this.lifecycle.addCleanup(() => {
            this.ui.progressBar?.destroy();
            this.ui.progressText?.destroy();
        });
    }

    refreshStepText() {
        const nextId = this.state.recipe[this.state.stepIndex];
        const mat = this.state.pool.find((m) => m.id === nextId);
        const step = this.t('step_fmt', 'Step {i}/{n} · need: {m}')
            .replace('{i}', String(Math.min(this.state.stepIndex + 1, this.state.recipe.length)))
            .replace('{n}', String(this.state.recipe.length))
            .replace('{m}', mat?.label || nextId || '—');
        this.ui.stepText?.setText(step);
    }

    refreshProgress() {
        const { width } = this.scene.scale;
        const ratio = Math.max(0, Math.min(1, this.state.progress / 100));
        const g = this.ui.progressBar;
        if (!g?.active) return;
        g.clear();
        g.fillStyle(0x1e293b, 0.9);
        g.fillRoundedRect(width * 0.2, this.scene.scale.height * 0.5, width * 0.6, 14, 7);
        g.fillStyle(0xf59e0b, 1);
        g.fillRoundedRect(width * 0.2, this.scene.scale.height * 0.5, width * 0.6 * ratio, 14, 7);
        this.ui.progressText?.setText(
            this.t('progress_fmt', 'Progress {p}% · mistakes {m} · streak {c}/{max}')
                .replace('{p}', String(Math.round(this.state.progress)))
                .replace('{m}', String(this.state.mistakes))
                .replace('{c}', String(this.state.consecutiveMistakes))
                .replace('{max}', String(this.config.explodeOnConsecutiveMistakes))
        );
    }

    onMaterialClick(mat) {
        if (!this.isRunning() || this.acceptingInput) return false;
        const material = this.state.pool.find(item => item.id === mat?.id);
        if (!material) return false;
        this.acceptingInput = true;
        try {
            const expected = this.state.recipe[this.state.stepIndex];
            if (material.id === expected) {
                this.state.consecutiveMistakes = 0;
                this.state.stepIndex += 1;
                this.state.progress = this.state.stepIndex * 100 / this.state.recipe.length;
                // Settle terminal input before presentation callbacks can re-enter.
                if (this.state.stepIndex >= this.state.recipe.length) {
                    this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                    return true;
                }
                this.ui.feedback?.setText(this.t('ok_feed', 'Correct: [{m}]').replace('{m}', material.label)).setColor('#34d399');
                this.scene?.cameras?.main?.flash?.(80, 52, 211, 153);
                this.context.spawnParticles?.(this.scene.scale.width / 2, this.scene.scale.height * 0.3, material.color);
            } else {
                this.state.mistakes += 1;
                this.state.consecutiveMistakes += 1;
                // Progress means an accepted recipe prefix. A percentage penalty
                // rolls back whole ingredients (rounded up), not a cosmetic bar
                // which previously jumped to 100 despite unearned progress.
                const rollback = Math.ceil(this.config.wrongInputProgressPenalty * this.state.recipe.length / 100);
                this.state.stepIndex = Math.max(0, this.state.stepIndex - rollback);
                this.state.progress = this.state.stepIndex * 100 / this.state.recipe.length;
                this.ui.feedback?.setText(this.t('bad_feed_steps', 'Wrong material! -{n} steps').replace('{n}', String(rollback))).setColor('#f87171');
                this.scene?.cameras?.main?.shake?.(120, 0.008);
                if (this.state.consecutiveMistakes >= this.config.explodeOnConsecutiveMistakes) {
                    if (this.config.explodeFails) {
                        this.finish(false, NODE_RESULT_REASONS.FAILED);
                        return true;
                    }
                    this.state.stepIndex = this.state.progress = this.state.consecutiveMistakes = 0;
                    this.state.resets += 1;
                    this.ui.feedback?.setText(this.t('explode_reset', 'Overheat! Recipe reset')).setColor('#ef4444');
                }
            }
            if (this.isRunning()) {
                this.refreshStepText();
                this.refreshProgress();
                this.publishTestState();
            }
            return true;
        } finally {
            this.acceptingInput = false;
        }
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta < 0) return;
        this.state.elapsedSeconds = Math.min(this.config.durationSec, this.state.elapsedSeconds + delta / 1000);
        this.state.timeRemaining = Math.max(0, this.config.durationSec - this.state.elapsedSeconds);
        if (this.state.timeRemaining <= 0) {
            this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
            return;
        }
        this.publishTestState();
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'SequenceSynthesisAdapter',
            adapterId: this.config.id,
            status: this.status,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            goalValue: 100,
            runSeed: this.config.runSeed,
            resets: this.state.resets,
            materials: this.state.pool.map(mat => ({ id: mat.id, label: mat.label })),
            buttons: this.materialButtons.filter(b => b.bg?.active).map(b => ({ id: b.id, x: b.bg.x, y: b.bg.y })),
            score: Math.round(this.state.progress),
            progress: this.state.progress,
            stepIndex: this.state.stepIndex,
            recipeLength: this.state.recipe.length,
            recipe: this.state.recipe.slice(),
            mistakes: this.state.mistakes,
            consecutiveMistakes: this.state.consecutiveMistakes,
            elapsedSeconds: this.state.elapsedSeconds,
            lastResult: this.result
        };
    }

    /** Test helper: force fail path */
    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning() || !Number.isFinite(amount) || amount <= 0) return false;
        this.state.hp = Math.max(0, this.state.hp - amount);
        this.publishTestState();
        if (this.state.hp <= 0) this.finish(false, failReason);
    }

    /** Legacy demo helper. Requires explicit test-only opt-in; not a player action. */
    forceComplete() {
        if (!this.context.allowTestCommands || !this.isRunning()) return false;
        this.state.stepIndex = this.state.recipe.length;
        this.state.progress = 100;
        return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
    }

    finish(success, reason = null) {
        // The host's generic score threshold is not authority for this recipe.
        if (success && (!this.state.recipe.length || this.state.stepIndex !== this.state.recipe.length || this.state.timeRemaining <= 0)) return this.result;
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        const rewards = success
            ? { ...(this.config.rewardTable || {}), score: this.config.rewardTable?.score ?? 1 }
            : {};

        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards,
            telemetry: {
                mistakes: this.state.mistakes,
                recipeLength: this.state.recipe.length,
                elapsedSec: this.state.elapsedSeconds,
                progress: this.state.progress,
                stepsCompleted: this.state.stepIndex,
                resets: this.state.resets,
                runSeed: this.config.runSeed,
                timeRemaining: this.state.timeRemaining
            }
        });

        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.publishTestState();
        this.context.onEnd?.(result, this);
        return result;
    }

    pause() {
        if (this.config.allowPause) super.pause();
    }

    retreat() {
        if (!this.config.allowQuit) return null;
        return this.finish(false, NODE_RESULT_REASONS.RETREATED);
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    destroy() {
        this.lifecycle?.destroy();
        this.ui = {};
        super.destroy();
    }

    publishTestState() {
        this.context.testHooks?.update(this.getTestState());
    }

}

export { DEFAULT_CONFIG as SEQUENCE_SYNTHESIS_DEFAULT_CONFIG };
