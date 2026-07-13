// js/store.js
// 状态管理 (Store) - 包装并复用 @core/core/Store.js

import Store from '../../../../minigame_master/core/lib/core/Store.js';
import { REALM_REGISTRY, CAVE_COST_REGISTRY, SKILL_POOL_REGISTRY, PASSIVE_SKILL_REGISTRY, ABILITY_CATALOG } from './data.js';
import {
    applyResultToState,
    createBackupKey,
    createSaveV2Defaults,
    persistRawSaveMigration
} from './save-contract.js';

function buildDefaultPerkTree() {
    const tree = {};
    Object.entries(PASSIVE_SKILL_REGISTRY).forEach(([tier, perks]) => {
        tree[tier] = perks.map(perk => ({
            id: perk.id,
            bought: false,
            name: perk.name,
            uiCopy: perk.uiCopy,
            description: perk.description,
            cost: perk.cost,
            requires: perk.requires,
            effects: perk.effects
        }));
    });
    return tree;
}

export const DEFAULT_STATE = {
    version: 2,
    lastSaveTime: Date.now(),
    statistics: {
        totalPlaySeconds: 0,
        totalNodesCompleted: 0,
        totalMonstersKilled: 0
    },
    resources: {
        bloodEssence: 0,
        suanBoneScript: 0,
        pureBlood: 0
    },
    progression: {
        realm: 1,
        realmName: "搬血境",
        totalExp: 0,
        cavesOpened: [],
        cavesActive: [],
        nextCaveCost: 100
    },
    stats: {
        baseHp: 100,
        baseAtk: 10,
        baseSpeed: 200,
        basePickupRange: 120,
        baseCritRate: 0.05,
        baseCritDmg: 1.5
    },
    perks: {
        unlocked: [],
        pointsAvailable: 0,
        tree: buildDefaultPerkTree()
    },
    abilities: {
        unlocked: ["primordial_true_record", "willow_guard"]
    },
    storyFlags: [],
    unlockedNodes: [1],
    nodeResults: {},
    nodeCooldowns: {},
    equipment: {
        active: [],
        inventory: []
    },
    saveVersion2: createSaveV2Defaults()
};

export class GameStore {
    constructor() {
        this.saveKey = 'shihao_save';
    }

    init() {
        const migration = persistRawSaveMigration(localStorage, this.saveKey, { defaultState: DEFAULT_STATE });
        const preservedLastSaveTime = migration.state.lastSaveTime;
        Store.init(this.saveKey, migration.state);
        if (preservedLastSaveTime !== undefined) this.state.lastSaveTime = preservedLastSaveTime;
        this.ensurePassiveTreeSchema(false);
        this.ensureAbilitySchema(false);
        this.persistPreservingTimestamp();
    }

    get state() {
        return Store.getState();
    }

    reset() {
        const raw = localStorage.getItem(this.saveKey);
        if (raw !== null) {
            const backupKey = createBackupKey(`${this.saveKey}.manual-reset`, this.state?.version || 0, raw);
            if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
        }
        Store.clear();
        this.init();
    }

    persistPreservingTimestamp() {
        localStorage.setItem(this.saveKey, JSON.stringify(this.state));
    }

    get(path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], this.state);
    }

    set(path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => acc[part], this.state);
        if (target) {
            target[last] = value;
            Store.save();
        }
    }

    addResource(type, amount) {
        if (this.state.resources[type] !== undefined) {
            let current = this.state.resources[type];
            if (typeof current !== "number" || isNaN(current)) current = 0;
            if (typeof amount !== "number" || isNaN(amount)) amount = 0;
            this.state.resources[type] = current + amount;
            Store.save();
        }
    }

    spendResource(type, amount) {
        let current = this.state.resources[type];
        if (typeof current !== "number" || isNaN(current)) current = 0;
        
        if (this.state.resources[type] !== undefined && current >= amount) {
            this.state.resources[type] = current - amount;
            Store.save();
            return true;
        }
        return false;
    }

    applyNodeResult(result) {
        const knownAbilityIds = new Set(ABILITY_CATALOG.map(ability => ability.id));
        const application = applyResultToState(this.state, result, { knownAbilityIds });
        Store.save();
        return application;
    }

    getEffectiveStats() {
        let stats = { ...this.state.stats };
        
        // Add Cave bonuses
        let cavesOpened = this.state.progression.cavesOpened;
        if (!Array.isArray(cavesOpened)) cavesOpened = [];
        
        cavesOpened.forEach(caveIndex => {
            const cave = CAVE_COST_REGISTRY.find(c => c.index === caveIndex);
            if (cave) {
                if (cave.hpBonus) stats.baseHp += cave.hpBonus;
                if (cave.atkBonus) stats.baseAtk += cave.atkBonus;
                if (cave.speedBonus) stats.baseSpeed += cave.speedBonus;
                if (cave.pickupBonus) stats.basePickupRange += cave.pickupBonus;
                if (cave.critBonus) stats.baseCritRate += cave.critBonus;
                if (cave.critDmgBonus) stats.baseCritDmg += cave.critDmgBonus;
            }
        });

        // Add Realm bonuses
        const realm = REALM_REGISTRY.find(r => r.id === this.state.progression.realm);
        if (realm && realm.statBonus) {
            if (realm.statBonus.hp) stats.baseHp += realm.statBonus.hp;
            if (realm.statBonus.atk) stats.baseAtk += realm.statBonus.atk;
            if (realm.statBonus.speed) stats.baseSpeed += realm.statBonus.speed;
            if (realm.statBonus.critRate) stats.baseCritRate += realm.statBonus.critRate;
            if (realm.statBonus.critDmg) stats.baseCritDmg += realm.statBonus.critDmg;
        }

        // Add passive tree bonuses from bone-script mastery.
        const unlocked = new Set(this.getUnlockedPerks());
        if (unlocked.has('perk_hp_1')) stats.baseHp = Math.floor(stats.baseHp * 1.25);
        if (unlocked.has('perk_speed_1')) stats.baseSpeed = Math.floor(stats.baseSpeed * 1.1);
        if (unlocked.has('perk_kunpeng')) stats.baseSpeed = Math.floor(stats.baseSpeed * 1.15);
        if (unlocked.has('perk_range_1')) stats.basePickupRange = Math.floor(stats.basePickupRange * 1.2);
        if (unlocked.has('perk_crit_1')) stats.baseCritRate += 0.05;

        return stats;
    }

    getUnlockedPerks() {
        return this.state.perks?.unlocked || [];
    }

    getUnlockedAbilities() {
        this.ensureAbilitySchema(false);
        return this.state.abilities.unlocked;
    }

    unlockAbilities(abilityIds) {
        if (!Array.isArray(abilityIds) || abilityIds.length === 0) return [];
        this.ensureAbilitySchema(false);
        const knownAbilityIds = new Set(ABILITY_CATALOG.map(ability => ability.id));
        const newlyUnlocked = [];

        abilityIds.forEach(abilityId => {
            if (knownAbilityIds.has(abilityId) && !this.state.abilities.unlocked.includes(abilityId)) {
                this.state.abilities.unlocked.push(abilityId);
                newlyUnlocked.push(abilityId);
            }
        });

        if (newlyUnlocked.length > 0) Store.save();
        return newlyUnlocked;
    }

    getAbilityName(abilityId) {
        return ABILITY_CATALOG.find(ability => ability.id === abilityId)?.name || abilityId;
    }

    getAvailableSkillPool(skillTier, nodeConfig = null) {
        this.ensureAbilitySchema(false);
        const unlocked = new Set(this.state.abilities.unlocked);
        const nodeAbilityPool = new Set(
            nodeConfig?.planning?.runSkillPool?.length
                ? nodeConfig.planning.runSkillPool
                : ABILITY_CATALOG.map(ability => ability.id)
        );

        const allowedSkillIds = new Set();
        ABILITY_CATALOG.forEach(ability => {
            const isFinaleTemporary = nodeConfig?.id === 12 && ability.id === 'he_hua_zizai';
            if (nodeAbilityPool.has(ability.id) && (unlocked.has(ability.id) || isFinaleTemporary)) {
                ability.runtimeSkillIds.forEach(skillId => allowedSkillIds.add(skillId));
            }
        });

        const tierOrder = ['tier1', 'tier2', 'tier3'];
        const maxTierIndex = Math.max(tierOrder.indexOf(skillTier), 0);
        const tierKeys = tierOrder.slice(0, maxTierIndex + 1);
        const skills = tierKeys
            .flatMap(tier => SKILL_POOL_REGISTRY[tier] || [])
            .filter(skill => allowedSkillIds.has(skill.id));

        return skills.length > 0 ? skills : (SKILL_POOL_REGISTRY[skillTier] || []);
    }

    checkResources(costs) {
        if (!costs) return { success: true };
        for (const [type, amount] of Object.entries(costs)) {
            const current = this.state.resources[type];
            const currentVal = (typeof current === 'number' && !isNaN(current)) ? current : 0;
            if (currentVal < amount) {
                return { success: false, missing: type, needed: amount - currentVal };
            }
        }
        return { success: true };
    }

    spendResources(costs) {
        const check = this.checkResources(costs);
        if (!check.success) return false;

        for (const [type, amount] of Object.entries(costs)) {
            this.spendResource(type, amount);
        }
        return true;
    }

    ensurePassiveTreeSchema(save = true) {
        const defaults = buildDefaultPerkTree();
        const state = this.state;
        state.perks = state.perks && typeof state.perks === 'object' && !Array.isArray(state.perks) ? state.perks : {};
        state.perks.unlocked = Array.isArray(state.perks.unlocked) ? state.perks.unlocked : [];
        const previousTree = state.perks.tree && typeof state.perks.tree === 'object' && !Array.isArray(state.perks.tree) ? state.perks.tree : {};

        state.perks.tree = { ...previousTree };
        Object.entries(defaults).forEach(([tier, perks]) => {
            const previousTier = Array.isArray(previousTree[tier]) ? previousTree[tier] : [];
            const knownIds = new Set(perks.map(perk => perk.id));
            state.perks.tree[tier] = perks.map(perk => {
                const previous = previousTier.find(item => item?.id === perk.id);
                const bought = Boolean(previous?.bought || state.perks.unlocked.includes(perk.id));
                return { ...perk, ...(previous || {}), bought };
            }).concat(previousTier.filter(item => !knownIds.has(item?.id)));
        });

        if (save) Store.save();
    }

    ensureAbilitySchema(save = true) {
        const state = this.state;
        state.abilities = state.abilities || {};
        const current = Array.isArray(state.abilities.unlocked) ? state.abilities.unlocked : [];
        const initial = ABILITY_CATALOG
            .filter(ability => ability.unlockSource === 'initial' || ability.id === 'willow_guard')
            .map(ability => ability.id);
        state.abilities.unlocked = Array.from(new Set([...initial, ...current]))
            .filter(abilityId => typeof abilityId === 'string' && abilityId.length > 0);

        if (save) Store.save();
    }

    save() {
        Store.save();
    }
}

const store = new GameStore();
store.init();

// Export the singleton store instance
export default store;
if (typeof window !== 'undefined') {
    window.store = store; // Also bind to window to preserve standard HTML sidebar scripts
}
