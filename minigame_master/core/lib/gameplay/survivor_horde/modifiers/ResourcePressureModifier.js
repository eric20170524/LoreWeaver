import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    resistMax: 100,
    drainPerSecond: 4,
    warnBelow: 30,
    eliteIntervalMs: 15000,
    gemRestore: 40,
    eliteHp: 12,
    eliteSpeed: 70,
    eliteColor: 0xa3e635
});

export default class ResourcePressureModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.resist = this.config.resistMax;
        this.eliteTimer = null;
        this.hud = null;
        this._originalDamageEnemy = null;
    }

    install(context) {
        super.install(context);
        this.resist = Number(this.config.resistMax || 100);

        this.hud = context.scene.add.text(12, 100, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#a3e635'
        }).setScrollFactor?.(0) || context.scene.add.text(12, 100, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#a3e635'
        });

        this.eliteTimer = context.scene.time.addEvent({
            delay: this.config.eliteIntervalMs,
            loop: true,
            callback: () => {
                if (!context.adapter.isRunning()) return;
                context.adapter.spawnEnemy({
                    id: 'antidote_elite',
                    hp: this.config.eliteHp,
                    speed: this.config.eliteSpeed,
                    damage: 12,
                    radius: 14,
                    color: this.config.eliteColor,
                    reward: { score: 6, antidote: 1 }
                });
            }
        });
        context.lifecycle.trackTimer(this.eliteTimer);

        this._originalDamageEnemy = context.adapter.damageEnemy.bind(context.adapter);
        const self = this;
        context.adapter.damageEnemy = function (enemy, damage) {
            const id = enemy?.getData?.('id');
            const before = enemy?.active;
            self._originalDamageEnemy(enemy, damage);
            if (before && enemy && !enemy.active && id === 'antidote_elite') {
                self.resist = Math.min(self.config.resistMax, self.resist + self.config.gemRestore);
                self.refreshHud();
            }
        };
    }

    update(context, _time, delta) {
        if (!this.installed || !context.adapter.isRunning()) return;
        this.resist = Math.max(0, this.resist - (this.config.drainPerSecond * delta) / 1000);
        this.refreshHud();
        if (this.resist <= 0) {
            context.helpers.end(false, NODE_RESULT_REASONS.CONDITION_FAILED);
        }
    }

    refreshHud() {
        if (!this.hud) return;
        const warn = this.resist < this.config.warnBelow;
        this.hud.setColor(warn ? '#f87171' : '#a3e635');
        this.hud.setText(`抗性 ${Math.ceil(this.resist)}/${this.config.resistMax}${warn ? ' ⚠' : ''}`);
    }

    uninstall(context) {
        super.uninstall(context);
        this.eliteTimer?.remove?.(false);
        this.eliteTimer = null;
        this.hud?.destroy?.();
        this.hud = null;
        if (this._originalDamageEnemy && context?.adapter) {
            context.adapter.damageEnemy = this._originalDamageEnemy;
        }
        this._originalDamageEnemy = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            resist: this.resist,
            resistMax: this.config.resistMax
        };
    }
}

export { DEFAULT_CONFIG as RESOURCE_PRESSURE_DEFAULT_CONFIG };
