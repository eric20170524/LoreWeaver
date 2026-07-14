export class RunDirector {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.config = config;
        this.surviveTime = 0;
        this.beat = 'intro';
        this.objectiveProgress = 0;
        this.spawnBudget = 0;
        this.activeCounts = {
            enemies: 0,
            pickups: 0,
            projectiles: 0
        };
        this.bossSpawned = false;
        this.eliteSpawned = false;
    }

    onSecondTick(time, nodeConfig) {
        if (this.scene.isGameOver || this.scene.isPaused) return;

        this.surviveTime++;
        this.scene.uiScene?.updateTime?.(this.surviveTime, nodeConfig.duration);
        this.objectiveProgress = Math.min(1, this.surviveTime / nodeConfig.duration);

        // Deterministic Beats Management
        if (this.surviveTime < 15) this.beat = 'intro';
        else if (this.surviveTime < 35) this.beat = 'teach';
        else if (this.surviveTime < 55) this.beat = 'pressure';
        else if (this.surviveTime < 70) this.beat = 'elite';
        else if (this.surviveTime < 90) this.beat = 'climax';
        else this.beat = 'resolution';

        this.spawnBudget = this.calculateSpawnBudget(this.beat);

        const activeEnemies = this.scene.enemies?.countActive(true) || 0;
        this.activeCounts.enemies = activeEnemies;

        // Ensure we respect active budget
        const spawnCount = Math.max(0, this.spawnBudget - activeEnemies);
        for (let i = 0; i < spawnCount; i++) {
            this.scene.spawnEnemy({
                radius: nodeConfig.id === 1 && this.surviveTime <= 10 ? 360 : undefined
            });
        }

        if (this.beat === 'elite' && !this.eliteSpawned) {
            if (this.scene.spawnEliteSilverWingedEagle) {
                this.scene.spawnEliteSilverWingedEagle();
                this.eliteSpawned = true;
            }
        }

        if (this.beat === 'climax' && !this.bossSpawned) {
            if (this.scene.spawnBoss) {
                this.scene.spawnBoss();
                this.bossSpawned = true;
            }
        }

        if (this.surviveTime >= nodeConfig.duration) {
            this.scene.endGame(true);
        }
    }

    calculateSpawnBudget(beat) {
        switch (beat) {
            case 'intro': return 2;
            case 'teach': return 4;
            case 'pressure': return 8;
            case 'elite': return 10;
            case 'climax': return 12;
            case 'resolution': return 3;
            default: return 5;
        }
    }

    getTestState() {
        return {
            beat: this.beat,
            objectiveProgress: this.objectiveProgress,
            spawnBudget: this.spawnBudget,
            activeCounts: {
                enemies: this.scene.enemies?.countActive(true) || 0,
                pickups: this.scene.pickups?.countActive(true) || 0,
                projectiles: this.scene.enemyProjectiles?.countActive(true) || 0
            }
        };
    }
}
