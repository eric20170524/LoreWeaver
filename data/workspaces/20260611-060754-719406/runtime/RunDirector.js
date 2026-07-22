/**
 * LW-021: Beat-driven run director + lightweight object budgets/pools.
 */

export const BEAT_KINDS = Object.freeze([
    'intro',
    'teach',
    'pressure',
    'elite',
    'climax',
    'resolution'
]);

/** Node1 LevelContract: 90s authored campaign slice. */
export const NODE1_LEVEL_CONTRACT = Object.freeze({
    version: 'loreweaver.level-contract.v1',
    nodeId: 1,
    durationSeconds: 90,
    seed: 1040394750,
    budgets: Object.freeze({
        maxActiveEnemies: 18,
        maxActiveProjectiles: 40,
        maxActivePickups: 30,
        maxParticles: 48
    }),
    beats: Object.freeze([
        {
            id: 'intro_move',
            kind: 'intro',
            atSecond: 2,
            callout: '拖动摇杆移动',
            spawns: [{ enemyType: 'wild_rhino', count: 1, radius: 400, archetype: 'chase_melee' }],
            completeWhen: 'spawned',
            teach: ['movement']
        },
        {
            id: 'teach_pickup',
            kind: 'teach',
            atSecond: 10,
            callout: '拾取气血精华升级',
            spawns: [{ enemyType: 'wild_rhino', count: 3, radius: 400, archetype: 'chase_melee' }],
            completeWhen: 'spawned',
            teach: ['pickup', 'level_up']
        },
        {
            id: 'teach_dash',
            kind: 'teach',
            atSecond: 20,
            callout: '点击图标闪避攻击',
            spawns: [{ enemyType: 'green_scaled_eagle', count: 4, radius: 450, archetype: 'ranged_pressure' }],
            completeWhen: 'spawned',
            teach: ['dash', 'ranged_cue']
        },
        {
            id: 'teach_active',
            kind: 'pressure',
            atSecond: 35,
            callout: '主动施放术法！',
            spawns: [{ enemyType: 'rock_golem', count: 6, radius: 450, archetype: 'zone_control' }],
            completeWhen: 'spawned',
            teach: ['active_technique', 'zone_cue']
        },
        {
            id: 'elite_silver',
            kind: 'elite',
            atSecond: 50,
            callout: '精英凶禽来袭！',
            spawns: [
                { enemyType: 'green_scaled_eagle', count: 1, radius: 420, archetype: 'charge', elite: true },
                { enemyType: 'wild_rhino', count: 4, radius: 450, archetype: 'chase_melee' }
            ],
            completeWhen: 'spawned',
            teach: ['elite_pressure']
        },
        {
            id: 'climax_boss',
            kind: 'climax',
            atSecond: 75,
            callout: '穷奇幼崽降临！',
            boss: true,
            completeWhen: 'boss_spawned',
            teach: ['boss_break']
        },
        {
            id: 'resolution',
            kind: 'resolution',
            atSecond: 90,
            callout: null,
            endRun: true,
            completeWhen: 'time'
        }
    ]),
    filler: Object.freeze({
        fromSecond: 36,
        toSecond: 74,
        everySeconds: 5,
        spawns: [{ count: 2, radius: 450 }]
    })
});

function mulberry32(seed) {
    let t = seed >>> 0;
    return function next() {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export class ObjectPool {
    constructor(factory, reset, { maxSize = 64 } = {}) {
        this.factory = factory;
        this.reset = reset;
        this.maxSize = maxSize;
        this.free = [];
        this.live = new Set();
        this.created = 0;
        this.reused = 0;
    }

    acquire(...args) {
        let item = this.free.pop();
        if (item) {
            this.reused += 1;
            this.reset?.(item, ...args);
        } else {
            item = this.factory(...args);
            this.created += 1;
        }
        this.live.add(item);
        return item;
    }

    release(item) {
        if (!item || !this.live.has(item)) return;
        this.live.delete(item);
        if (this.free.length < this.maxSize) this.free.push(item);
    }

    releaseAll(predicate) {
        for (const item of [...this.live]) {
            if (!predicate || predicate(item)) this.release(item);
        }
    }

    getDebugState() {
        return {
            free: this.free.length,
            live: this.live.size,
            created: this.created,
            reused: this.reused
        };
    }
}

export class RunDirector {
    constructor(scene, contract = NODE1_LEVEL_CONTRACT) {
        this.scene = scene;
        this.contract = contract;
        this.rng = mulberry32(contract.seed || 1);
        this.firedBeatIds = new Set();
        this.currentBeatId = null;
        this.lastTransitionReason = null;
        this.objectiveProgress = 0;
        this.taught = new Set();
        this.spawnedTotal = 0;
        this.teardownFns = [];
    }

    setup() {
        this.firedBeatIds.clear();
        this.currentBeatId = null;
        this.lastTransitionReason = 'director_setup';
        this.objectiveProgress = 0;
        this.taught.clear();
        this.spawnedTotal = 0;
        return this;
    }

    teardown() {
        this.teardownFns.forEach((fn) => {
            try { fn(); } catch (_) { /* ignore */ }
        });
        this.teardownFns = [];
        this.firedBeatIds.clear();
    }

    getActiveEnemyCount() {
        const group = this.scene.enemies;
        if (!group?.children) return 0;
        try {
            if (typeof group.countActive === 'function') return group.countActive(true);
            const kids = group.getChildren?.();
            return Array.isArray(kids) ? kids.filter((e) => e?.active).length : 0;
        } catch (_) {
            return 0;
        }
    }

    canSpawn(count = 1) {
        const max = this.contract.budgets?.maxActiveEnemies ?? 20;
        return this.getActiveEnemyCount() + count <= max;
    }

    onSecond(surviveTime) {
        if (!this.contract || this.scene.nodeConfig?.id !== this.contract.nodeId) {
            return { handled: false };
        }

        const duration = this.contract.durationSeconds;
        this.objectiveProgress = Math.min(1, surviveTime / duration);

        for (const beat of this.contract.beats) {
            if (this.firedBeatIds.has(beat.id)) continue;
            if (surviveTime < beat.atSecond) continue;
            this.fireBeat(beat, surviveTime);
        }

        // Filler pressure between authored peaks, budgeted.
        const filler = this.contract.filler;
        if (
            filler
            && surviveTime >= filler.fromSecond
            && surviveTime <= filler.toSecond
            && surviveTime % filler.everySeconds === 0
            && !this.contract.beats.some((b) => b.atSecond === surviveTime)
        ) {
            this.spawnGroup(filler.spawns, { reason: 'filler_pressure', beatId: 'filler' });
        }

        // Subclass may mark objective complete (escort arrived, cores held, waves cleared).
        if (this.scene.campaignObjectiveComplete === true) {
            this.lastTransitionReason = 'objective_complete';
            return { handled: true, endRun: true, success: true, reason: 'objective_complete' };
        }

        if (surviveTime >= duration) {
            const mode = this.contract.victoryMode || 'duration_or_boss';
            if (mode === 'boss_only') {
                // Finale: time-out is failure, not false victory.
                this.lastTransitionReason = 'duration_timeout_boss_only';
                return { handled: true, endRun: true, success: false, reason: 'timeout' };
            }
            this.lastTransitionReason = 'duration_complete';
            return { handled: true, endRun: true, success: true, reason: 'duration_complete' };
        }

        return { handled: true, endRun: false };
    }

    fireBeat(beat, surviveTime) {
        this.firedBeatIds.add(beat.id);
        this.currentBeatId = beat.id;
        this.lastTransitionReason = `beat:${beat.id}@${surviveTime}`;
        (beat.teach || []).forEach((t) => this.taught.add(t));

        if (beat.callout) {
            this.scene.showWorldFloatText?.(
                this.scene.player?.x || 0,
                (this.scene.player?.y || 0) - 120,
                beat.callout,
                beat.kind === 'elite' || beat.kind === 'climax' ? '#ff4444' : '#80ffea',
                3000
            );
        }

        if (beat.boss) {
            if (!this.scene.bossSpawned) {
                this.scene.spawnBoss?.();
                this.scene.bossSpawned = true;
            }
            return;
        }

        if (beat.spawns?.length) {
            this.spawnGroup(beat.spawns, { reason: `beat:${beat.id}`, beatId: beat.id, elite: beat.kind === 'elite' });
        }
    }

    spawnGroup(spawnConfigs, meta = {}) {
        for (const config of spawnConfigs) {
            const count = config.count || 1;
            for (let i = 0; i < count; i++) {
                if (!this.canSpawn(1)) {
                    this.lastTransitionReason = `budget_block:${meta.reason || 'spawn'}`;
                    break;
                }
                const pool = this.scene.nodeConfig?.enemyPool || [];
                let enemyType = config.enemyType;
                // Prefer node-local registry ids when pool uses *_nodeN suffixes.
                if (enemyType && pool.length) {
                    const match = pool.find((id) => id === enemyType || id.startsWith(`${enemyType}_node`));
                    if (match) enemyType = match;
                }
                if (!enemyType) {
                    enemyType = pool.length
                        ? pool[Math.floor(this.rng() * pool.length)]
                        : 'wild_rhino';
                }
                const angle = (this.rng() * Math.PI * 2);
                const spawned = this.scene.spawnEnemy?.({
                    enemyType,
                    radius: config.radius || 450,
                    angle,
                    archetype: config.archetype,
                    elite: Boolean(config.elite || meta.elite),
                    data: {
                        archetype: config.archetype,
                        role: config.elite || meta.elite ? 'elite' : 'normal',
                        beatId: meta.beatId || null
                    }
                });
                if (spawned) {
                    this.spawnedTotal += 1;
                    if (config.elite || meta.elite) {
                        spawned.setData('elite', true);
                        spawned.setScale((spawned.scaleX || 1) * 1.25);
                        spawned.setData('hp', Math.round((spawned.getData('hp') || 30) * 2.2));
                        spawned.setData('exp', Math.round((spawned.getData('exp') || 5) * 2));
                    }
                    this.scene.enemyArchetypeRuntime?.attach?.(spawned, {
                        enemyType,
                        archetype: config.archetype,
                        role: spawned.getData('elite') ? 'elite' : 'normal'
                    });
                }
            }
        }
    }

    getTestState() {
        return {
            version: 1,
            nodeId: this.contract?.nodeId ?? null,
            durationSeconds: this.contract?.durationSeconds ?? null,
            currentBeatId: this.currentBeatId,
            firedBeatIds: [...this.firedBeatIds],
            lastTransitionReason: this.lastTransitionReason,
            objectiveProgress: Number(this.objectiveProgress.toFixed(3)),
            taught: [...this.taught],
            spawnedTotal: this.spawnedTotal,
            activeEnemies: this.getActiveEnemyCount(),
            budget: { ...(this.contract?.budgets || {}) },
            canSpawn: this.canSpawn(1)
        };
    }

    getDebugState() {
        return this.getTestState();
    }
}

export default RunDirector;
