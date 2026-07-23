import Phaser from 'phaser';
import {
    SurvivorHordeAdapter,
    createSurvivorHordeModifiers
} from '../../lib/gameplay/survivor_horde/index.js';
import {
    createNodePayload,
    TestHooks
} from '../../lib/contracts/index.js';
import { ThemeContentResolver, validateThemeContentPack } from '../../lib/utils/ThemeContentResolver.js';
import themeWasteland from '../../../gameplay/cards/fixtures/survivor_horde/theme_content_pack.fixture.json';
import themeCyberPulse from '../../../gameplay/cards/fixtures/survivor_horde/theme_content_pack.cyber_pulse.json';

const LAST_RESULT_KEY = '__LW_SURVIVOR_DEMO_LAST_RESULT__';
/** Stable demo identity for E2E reports (not production releaseEligible). */
const DEMO_CARD_ID = 'survivor_horde';
const DEMO_SPEC_HASH = 'survivor_horde:core_demo:v2_theme_skin';
const DEMO_RUNTIME_VERSION = 'minigame_master.core.demo.survivor_horde';
window.Phaser = Phaser;

const THEME_PACKS = {
    wasteland: themeWasteland,
    default: themeWasteland,
    cyber: themeCyberPulse,
    cyber_pulse: themeCyberPulse
};

function readQuery() {
    try {
        return new URLSearchParams(window.location.search || '');
    } catch {
        return new URLSearchParams();
    }
}

function resolveThemePack() {
    const q = readQuery();
    const key = String(q.get('theme') || q.get('skin') || 'wasteland').toLowerCase();
    const locale = q.get('locale') || q.get('lang') || 'zh-CN';
    const pack = THEME_PACKS[key] || THEME_PACKS.wasteland;
    const validation = validateThemeContentPack(pack);
    const resolver = new ThemeContentResolver(pack, locale);
    const themeApi = {
        themeKey: THEME_PACKS[key] ? key : 'wasteland',
        themeId: pack.themeId || key,
        locale,
        pack,
        validation,
        getText: (k, params, fallback) => resolver.getText(k, params, fallback),
        hudParts() {
            const raw = resolver.getText('level.hudLabels', {}, 'HP|Time|Kills|Score');
            const labels = String(raw || '').split('|').map((s) => s.trim()).filter(Boolean);
            return {
                hp: labels[0] || resolver.getText('level.hud.hp'),
                time: labels[1] || resolver.getText('level.hud.time'),
                kills: labels[2] || 'Kills',
                score: labels[3] || resolver.getText('level.hud.score')
            };
        }
    };

    window.__LW_THEME__ = themeApi;
    window.__LW_SURVIVOR_DEMO_META__ = {
        cardId: DEMO_CARD_ID,
        specHash: DEMO_SPEC_HASH,
        runtimeVersion: DEMO_RUNTIME_VERSION,
        releaseEligible: false,
        themeKey: themeApi.themeKey,
        themeId: themeApi.themeId,
        locale: themeApi.locale,
        title: themeApi.getText('level.title'),
        victoryText: themeApi.getText('level.victory'),
        failureText: themeApi.getText('level.failure'),
        retreatText: themeApi.getText('level.retreat')
    };
    return themeApi;
}

const theme = resolveThemePack();

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
    const next = {
        cardId: DEMO_CARD_ID,
        specHash: DEMO_SPEC_HASH,
        runtimeVersion: DEMO_RUNTIME_VERSION,
        releaseEligible: false,
        themeKey: theme.themeKey,
        themeId: theme.themeId,
        locale: theme.locale,
        title: theme.getText('level.title'),
        ...previous,
        ...patch
    };
    testStateNode.textContent = JSON.stringify(next);
    Object.entries(next).forEach(([key, value]) => {
        if (typeof value !== 'object') {
            testStateNode.dataset[key] = String(value);
        }
    });
    return next;
}

function readDemoDurationSec() {
    try {
        const q = readQuery();
        const n = Number(q.get('durationSec') || q.get('duration') || 30);
        if (Number.isFinite(n) && n >= 10 && n <= 3600) return Math.floor(n);
    } catch {
        /* ignore */
    }
    return 30;
}

function createDemoPayload() {
    const durationSec = readDemoDurationSec();
    const bossAt = Math.max(12, Math.min(durationSec - 8, Math.floor(durationSec * 0.6)));
    return createNodePayload({
        nodeId: 'survivor_horde_demo',
        nodeConfig: {
            title: theme.getText('level.title'),
            duration: durationSec,
            rewards: { demoToken: 3 },
            failPenalty: { rewardMultiplier: 0.5 },
            themeContentPack: theme.pack,
            gameplay: {
                adapter: 'survivor_horde',
                knobs: {
                    durationSec,
                    duration: durationSec,
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
                        spawnAt: bossAt,
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

        const title = theme.getText('level.title');
        const intro = theme.getText('level.intro');
        const hint = theme.getText('level.control_hint');

        this.add.text(width / 2, height * 0.26, title, {
            fontSize: '36px',
            color: '#f8fafc',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: width - 48 }
        }).setOrigin(0.5);

        this.add.text(width / 2, height * 0.36, intro, {
            fontSize: '16px',
            color: '#94a3b8',
            align: 'center',
            wordWrap: { width: width - 64 }
        }).setOrigin(0.5);

        this.add.text(width / 2, height * 0.46, hint, {
            fontSize: '14px',
            color: '#5eead4',
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(width / 2, height * 0.52, `theme=${theme.themeKey} · ${theme.themeId}`, {
            fontSize: '12px',
            color: '#64748b'
        }).setOrigin(0.5);

        if (lastResult) {
            const endLabel = lastResult.success
                ? theme.getText('level.victory')
                : (lastResult.reason === 'retreated'
                    ? theme.getText('level.retreat')
                    : theme.getText('level.failure'));
            this.add.text(width / 2, height * 0.6, `${endLabel} · ${lastResult.reason}`, {
                fontSize: '16px',
                color: lastResult.success ? '#5eead4' : '#fda4af'
            }).setOrigin(0.5);
        }

        setControlMode('menu');
        writeTestState({
            mode: 'menu',
            status: 'idle',
            hasLastResult: Boolean(lastResult),
            title,
            intro,
            controlHint: hint
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
        this.hudLabels = theme.hudParts();
        this.hud = this.add.text(16, 14, '', {
            fontSize: '18px',
            color: '#e2e8f0'
        }).setDepth(50);

        this.objective = this.add.text(16, 72, theme.getText('level.objective'), {
            fontSize: '13px',
            color: '#94a3b8',
            wordWrap: { width: width - 32 }
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
            nodeId: this.adapter.payload.nodeId,
            objective: theme.getText('level.objective')
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
        const h = this.hudLabels;
        this.hud.setText([
            `${h.hp} ${state.hp}`,
            `${h.time} ${state.timer}`,
            `${h.kills} ${state.kills}`,
            `${h.score} ${state.score}`
        ]);
        writeTestState({
            mode: state.status === 'ended' ? 'result' : 'run',
            status: state.status,
            hp: state.hp,
            timer: state.timer,
            kills: state.kills,
            score: state.score,
            hudHpLabel: h.hp
        });
    }

    showResult(result) {
        window[LAST_RESULT_KEY] = result;
        const headline = result.success
            ? theme.getText('level.victory')
            : (result.reason === 'retreated'
                ? theme.getText('level.retreat')
                : theme.getText('level.failure'));
        writeTestState({
            mode: 'result',
            status: 'ended',
            resultReason: result.reason,
            resultSuccess: result.success,
            resultHeadline: headline,
            rewards: result.rewards
        });
        const { width, height } = this.scale;
        this.add.rectangle(width / 2, height / 2, Math.min(width - 40, 420), 220, 0x0f172a, 0.94)
            .setStrokeStyle(2, result.success ? 0x5eead4 : 0xf43f5e)
            .setDepth(100);

        this.add.text(width / 2, height / 2 - 58, headline, {
            fontSize: '28px',
            color: result.success ? '#5eead4' : '#fda4af',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 360 }
        }).setOrigin(0.5).setDepth(101);

        this.add.text(width / 2, height / 2 - 8, `${result.reason} | ${JSON.stringify(result.rewards)}`, {
            fontSize: '14px',
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
