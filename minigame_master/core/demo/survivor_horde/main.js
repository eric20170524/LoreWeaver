import Phaser from 'phaser';
import {
    SurvivorHordeAdapter,
    createSurvivorHordeModifiers
} from '../../lib/gameplay/survivor_horde/index.js';
import {
    createNodePayload,
    TestHooks
} from '../../lib/contracts/index.js';

const LAST_RESULT_KEY = '__LW_SURVIVOR_DEMO_LAST_RESULT__';
window.Phaser = Phaser;

const controls = {
    start: document.getElementById('lw-start'),
    retreat: document.getElementById('lw-retreat'),
    back: document.getElementById('lw-back')
};
const testStateNode = document.getElementById('lw-test-state');

function setControlMode(mode) {
    controls.start.hidden = mode !== 'menu';
    controls.retreat.hidden = mode !== 'run';
    controls.back.hidden = mode !== 'result';
}

function writeTestState(patch = {}) {
    const previous = testStateNode.textContent ? JSON.parse(testStateNode.textContent) : {};
    const next = { ...previous, ...patch };
    testStateNode.textContent = JSON.stringify(next);
    Object.entries(next).forEach(([key, value]) => {
        if (typeof value !== 'object') {
            testStateNode.dataset[key] = String(value);
        }
    });
    return next;
}

function createDemoPayload() {
    return createNodePayload({
        nodeId: 'survivor_horde_demo',
        nodeConfig: {
            title: 'Survivor Horde Demo',
            duration: 30,
            rewards: { demoToken: 3 },
            failPenalty: { rewardMultiplier: 0.5 },
            gameplay: {
                adapter: 'survivor_horde',
                knobs: {
                    player: {
                        hp: 120,
                        speed: 180,
                        radius: 14,
                        color: 0x5eead4,
                        collisionCooldownMs: 500
                    },
                    enemies: {
                        spawnIntervalMs: 850,
                        spawnCount: 1,
                        spawnScaling: { everySeconds: 10, add: 1 },
                        pool: [
                            {
                                id: 'drifter',
                                hp: 2,
                                speed: 72,
                                damage: 8,
                                radius: 10,
                                color: 0x94a3b8,
                                reward: { demoDust: 1, score: 1 }
                            },
                            {
                                id: 'brute',
                                hp: 6,
                                speed: 44,
                                damage: 14,
                                radius: 16,
                                color: 0xf97316,
                                weight: 0.25,
                                reward: { demoDust: 3, score: 3 }
                            }
                        ]
                    },
                    weapon: {
                        fireIntervalMs: 700,
                        bulletSpeed: 520,
                        bulletDamage: 2,
                        bulletRadius: 5,
                        bulletColor: 0xf43f5e
                    },
                    collectibles: {
                        enabled: true,
                        radius: 6,
                        color: 0x22d3ee
                    },
                    boss: {
                        id: 'demo_boss',
                        spawnAt: 18,
                        hp: 36,
                        speed: 48,
                        damage: 18,
                        radius: 28,
                        color: 0xef4444,
                        reward: { demoDust: 12, score: 12 }
                    }
                }
            }
        },
        playerStats: { hp: 120 },
        source: {
            engine: 'phaser',
            projectId: 'core_demo'
        }
    });
}

class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create(data = {}) {
        const { width, height } = this.scale;
        const lastResult = data.lastResult || window[LAST_RESULT_KEY] || null;
        this.add.rectangle(width / 2, height / 2, width, height, 0x101216, 1);

        this.add.text(width / 2, height * 0.28, 'Survivor Horde', {
            fontSize: '42px',
            color: '#f8fafc',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height * 0.36, 'Core Adapter Demo', {
            fontSize: '20px',
            color: '#94a3b8'
        }).setOrigin(0.5);

        if (lastResult) {
            const rewardText = JSON.stringify(lastResult.rewards || {});
            this.add.text(width / 2, height * 0.47, `Last: ${lastResult.reason} | ${rewardText}`, {
                fontSize: '16px',
                color: lastResult.success ? '#5eead4' : '#fda4af'
            }).setOrigin(0.5);
        }

        setControlMode('menu');
        writeTestState({
            mode: 'menu',
            status: 'idle',
            hasLastResult: Boolean(lastResult)
        });
        controls.start.onclick = () => {
            this.scene.start('RunScene');
        };
    }
}

class RunScene extends Phaser.Scene {
    constructor() {
        super('RunScene');
    }

    create() {
        const { width, height } = this.scale;
        this.add.rectangle(width / 2, height / 2, width, height, 0x111827, 1);
        this.hud = this.add.text(16, 14, '', {
            fontSize: '18px',
            color: '#e2e8f0'
        }).setDepth(50);

        this.testHooks = new TestHooks();
        this.adapter = new SurvivorHordeAdapter({
            testHooks: this.testHooks,
            modifiers: createSurvivorHordeModifiers([
                {
                    id: 'hazard_telegraph',
                    knobs: {
                        intervalMs: 3600,
                        warningDelayMs: 900,
                        radius: 54,
                        damage: 18,
                        target: 'random'
                    }
                },
                {
                    id: 'defend_core',
                    knobs: {
                        hp: 80,
                        radius: 34,
                        color: 0x38bdf8,
                        enemyDamage: 8,
                        aggro: false
                    }
                }
            ]),
            onEnd: (result) => this.showResult(result)
        });

        this.adapter.init(createDemoPayload()).create(this);
        window.__LW_SURVIVOR_DEMO__ = this.adapter;
        writeTestState({
            mode: 'run',
            status: this.adapter.status,
            nodeId: this.adapter.payload.nodeId
        });

        setControlMode('run');
        controls.retreat.onclick = () => {
            this.adapter.retreat();
        };

        this.events.once('shutdown', () => {
            this.adapter?.destroy();
        });
    }

    update(time, delta) {
        this.adapter?.update(time, delta);
        const state = this.adapter?.getTestState();
        if (!state) return;
        this.hud.setText([
            `HP ${state.hp}`,
            `Time ${state.timer}`,
            `Kills ${state.kills}`,
            `Score ${state.score}`
        ]);
        writeTestState({
            mode: state.status === 'ended' ? 'result' : 'run',
            status: state.status,
            hp: state.hp,
            timer: state.timer,
            kills: state.kills,
            score: state.score
        });
    }

    showResult(result) {
        window[LAST_RESULT_KEY] = result;
        writeTestState({
            mode: 'result',
            status: 'ended',
            resultReason: result.reason,
            resultSuccess: result.success,
            rewards: result.rewards
        });
        const { width, height } = this.scale;
        this.add.rectangle(width / 2, height / 2, Math.min(width - 40, 420), 220, 0x0f172a, 0.94)
            .setStrokeStyle(2, result.success ? 0x5eead4 : 0xf43f5e)
            .setDepth(100);

        this.add.text(width / 2, height / 2 - 58, result.success ? 'Completed' : 'Ended', {
            fontSize: '30px',
            color: result.success ? '#5eead4' : '#fda4af',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        this.add.text(width / 2, height / 2 - 12, `${result.reason} | ${JSON.stringify(result.rewards)}`, {
            fontSize: '16px',
            color: '#e2e8f0'
        }).setOrigin(0.5).setDepth(101);

        setControlMode('result');
        controls.back.onclick = () => {
            this.scene.start('MenuScene', { lastResult: result });
        };
    }
}

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#101216',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { y: 0 }
        }
    },
    render: {
        preserveDrawingBuffer: true
    },
    scene: [MenuScene, RunScene]
};

window.game = new Phaser.Game(config);
