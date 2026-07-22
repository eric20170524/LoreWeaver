// js/data.js
// 静态配置表 (Registries) - 经过统一 Power Budget 动态平衡

let characterDesignCatalog, enemyDesignCatalog;

if (typeof window !== 'undefined') {
    if (window.__LOREWEAVER_EMBEDDED_SPEC__) {
        characterDesignCatalog = window.__LOREWEAVER_EMBEDDED_SPEC__.characterDesignCatalog || {};
        enemyDesignCatalog = window.__LOREWEAVER_EMBEDDED_SPEC__.enemyDesignCatalog || {};
    } else {
        const loadJsonSync = (url) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send(null);
            if (xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
            throw new Error(`Failed to load JSON: ${url}`);
        };
        
        const scriptUrl = new URL(import.meta.url);
        const basePath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/js/'));
        
        characterDesignCatalog = loadJsonSync(basePath + '/loreweaver/character-design-catalog.json');
        enemyDesignCatalog = loadJsonSync(basePath + '/loreweaver/enemy-design-catalog.json');
    }
} else {
    const fsModule = 'node:fs';
    const pathModule = 'node:path';
    const urlModule = 'node:url';

    const fs = await import(fsModule);
    const path = await import(pathModule);
    const { fileURLToPath } = await import(urlModule);
    const dirname = path.dirname(fileURLToPath(import.meta.url));

    characterDesignCatalog = JSON.parse(fs.readFileSync(path.join(dirname, '../loreweaver/character-design-catalog.json'), 'utf8'));
    enemyDesignCatalog = JSON.parse(fs.readFileSync(path.join(dirname, '../loreweaver/enemy-design-catalog.json'), 'utf8'));
}

export const CHARACTER_DESIGN_CATALOG = characterDesignCatalog;
export const ENEMY_DESIGN_CATALOG = enemyDesignCatalog;

function colorToNumber(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const parsed = Number.parseInt(value.replace('#', ''), 16);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function inferEnemyArchetype(enemyId, silhouette = '') {
    const read = `${enemyId} ${silhouette}`;
    if (/eagle|predator|鹰|禽|翼|鸟/.test(read)) return 'winged_beast';
    if (/golem|rock|傀儡|岩|石/.test(read)) return 'stone_golem';
    if (/wyrm|serpent|龙|蛇|穿山/.test(read)) return 'serpent';
    if (/huo|火/.test(read)) return 'fire_elite';
    if (/shi_yi|紫曜瞳|投影|虚影/.test(read)) return 'rival_projection';
    if (/qiongqi|king|boss|穷奇|兽王|巨兽/.test(read)) return 'boss';
    if (/human|bandit|cultivator|人形|修士|天才/.test(read)) return 'humanoid';
    return 'horned_beast';
}

// ----------------------------------------------------
// UNIFIED POWER BUDGET & PROGRESSION MATH
// ----------------------------------------------------
const scaleFactor = 1.35;
const numNodes = 12;

const freshHP = [];
const freshATK = [];
const fullHP = [];
const fullATK = [];
const realmHpBonus = [];
const realmAtkBonus = [];
const caveHpBonuses = [];
const caveAtkBonuses = [];

// Calculate stats for Realm 1
freshHP[1] = 150;
freshATK[1] = 15;
fullHP[1] = 180;
fullATK[1] = 18;
realmHpBonus[1] = 50;
realmAtkBonus[1] = 5;

// Caves 1, 2, 3
caveHpBonuses[1] = 8; caveAtkBonuses[1] = 1;
caveHpBonuses[2] = 10; caveAtkBonuses[2] = 1;
caveHpBonuses[3] = 12; caveAtkBonuses[3] = 1;

let sumCaveHP = 8 + 10 + 12;
let sumCaveATK = 1 + 1 + 1;

for (let n = 2; n <= numNodes; n++) {
    const s = Math.pow(scaleFactor, n - 1);
    freshHP[n] = Math.round(150 * s);
    freshATK[n] = Math.round(15 * s);
    fullHP[n] = Math.round(freshHP[n] * 1.25);
    fullATK[n] = Math.round(freshATK[n] * 1.25);

    realmHpBonus[n] = freshHP[n] - 100 - sumCaveHP;
    realmAtkBonus[n] = freshATK[n] - 10 - sumCaveATK;

    const deltaH = fullHP[n] - freshHP[n];
    const deltaA = fullATK[n] - freshATK[n];

    const c1 = 2 * n;
    const c2 = 2 * n + 1;

    caveHpBonuses[c1] = Math.round(deltaH * 0.45);
    caveAtkBonuses[c1] = Math.round(deltaA * 0.45);

    caveHpBonuses[c2] = deltaH - caveHpBonuses[c1];
    caveAtkBonuses[c2] = deltaA - caveAtkBonuses[c1];

    sumCaveHP += caveHpBonuses[c1] + caveHpBonuses[c2];
    sumCaveATK += caveAtkBonuses[c1] + caveAtkBonuses[c2];
}

// Calculate rewards and costs for each node
const expectedBE = [];
const expectedSBS = [];
const expectedPB = [];

const fixedBE = [];
const fixedSBS = [];
const fixedPB = [];

const bossLootBE = [];
const bossLootSBS = [];
const bossLootPB = [];

const caveCostRegistry = [];
// Realm 1 (3 caves)
caveCostRegistry[1] = 75;
caveCostRegistry[2] = 100;
caveCostRegistry[3] = 125;

for (let n = 1; n <= numNodes; n++) {
    const s = Math.pow(scaleFactor, n - 1);
    expectedBE[n] = Math.round(500 * s);
    expectedSBS[n] = [1, 5, 6, 9, 10, 11, 12].includes(n) ? Math.round(2 * s) : 0;
    expectedPB[n] = n >= 2 && n !== 5 && n !== 6 ? Math.round(2 * s) : 0;

    // Fixed rewards (80%)
    fixedBE[n] = Math.round(expectedBE[n] * 0.8);
    fixedSBS[n] = expectedSBS[n] > 0 ? Math.round(expectedSBS[n] * 0.8) : 0;
    fixedPB[n] = expectedPB[n] > 0 ? Math.round(expectedPB[n] * 0.8) : 0;

    // Boss loot count (remaining 20% / 0.75)
    bossLootBE[n] = Math.round((expectedBE[n] - fixedBE[n]) / 0.75);
    bossLootSBS[n] = expectedSBS[n] > 0 ? Math.round((expectedSBS[n] - fixedSBS[n]) / 0.75) : 0;
    bossLootPB[n] = expectedPB[n] > 0 ? Math.round((expectedPB[n] - fixedPB[n]) / 0.75) : 0;

    // Recompute expected from boss loot
    expectedBE[n] = fixedBE[n] + Math.round(bossLootBE[n] * 0.75);
    if (expectedSBS[n] > 0) expectedSBS[n] = fixedSBS[n] + Math.round(bossLootSBS[n] * 0.75);
    if (expectedPB[n] > 0) expectedPB[n] = fixedPB[n] + Math.round(bossLootPB[n] * 0.75);
}

for (let n = 2; n <= numNodes; n++) {
    const c1 = 2 * n;
    const c2 = 2 * n + 1;
    const costVal = Math.round(expectedBE[n] * 0.3);
    caveCostRegistry[c1] = costVal;
    caveCostRegistry[c2] = costVal;
}

const breakthroughBE = [];
const breakthroughSBS = [];
const breakthroughPB = [];

for (let n = 1; n <= numNodes; n++) {
    breakthroughBE[n + 1] = Math.round(expectedBE[n] * 1.2);
    if ([5, 6, 9, 10, 11].includes(n)) {
        breakthroughSBS[n + 1] = Math.round(expectedSBS[n] * 1.0);
    } else {
        breakthroughSBS[n + 1] = 0;
    }
    if (n >= 7) {
        breakthroughPB[n + 1] = Math.round(expectedPB[n] * 1.0);
    } else {
        breakthroughPB[n + 1] = 0;
    }
}

// ----------------------------------------------------
// REGISTRIES DEFINITIONS
// ----------------------------------------------------

// Mild crit curve (LW-044): late realms used to grant +0.25 crit / +6.0 critDmg, which
// exploded representative DPS and forced multi-minute Boss TTKs once HP was rebalanced.
const REALM_CRIT_RATE = [0, 0, 0.01, 0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.05, 0.05, 0.05, 0.06];
const REALM_CRIT_DMG = [0, 0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];

export const REALM_REGISTRY = [
    { id: 1, name: "搬血境", caveCount: 3, totalCaveCost: 300, breakthroughCost: { bloodEssence: 1500 }, unlockNodes: [1], statBonus: { hp: 50, atk: 5 }, description: "以凶兽精血熬炼己身" },
    { id: 2, name: "洞天境", caveCount: 5, totalCaveCost: 1000, breakthroughCost: { bloodEssence: 6000 }, unlockNodes: [2], statBonus: { hp: 100, atk: 15, speed: 20 }, description: "开辟洞天，容纳万法" },
    { id: 3, name: "化灵境", caveCount: 7, totalCaveCost: 15000, breakthroughCost: { bloodEssence: 15000 }, unlockNodes: [3], statBonus: { hp: 200, atk: 30 }, description: "重塑真我，化灵为神" },
    { id: 4, name: "铭纹境", caveCount: 9, totalCaveCost: 50000, breakthroughCost: { bloodEssence: 50000 }, unlockNodes: [4], statBonus: { hp: 400, atk: 60 }, description: "铭刻天地法则" },
    { id: 5, name: "列阵境", caveCount: 11, totalCaveCost: 120000, breakthroughCost: { bloodEssence: 120000, suanBoneScript: 10 }, unlockNodes: [5], statBonus: { hp: 800, atk: 120 }, description: "体内刻阵，王侯之威" },
    { id: 6, name: "尊者境", caveCount: 13, totalCaveCost: 250000, breakthroughCost: { bloodEssence: 250000, suanBoneScript: 25 }, unlockNodes: [6], statBonus: { hp: 1500, atk: 250 }, description: "凡人极致，超凡脱俗" },
    { id: 7, name: "神火境", caveCount: 15, totalCaveCost: 500000, breakthroughCost: { bloodEssence: 500000, pureBlood: 5 }, unlockNodes: [7], statBonus: { hp: 3000, atk: 500, speed: 30 }, description: "点燃神火，超脱凡俗" },
    { id: 8, name: "真一境", caveCount: 17, totalCaveCost: 1000000, breakthroughCost: { bloodEssence: 1000000, pureBlood: 10 }, unlockNodes: [8], statBonus: { hp: 6000, atk: 1000, speed: 40 }, description: "真我归一，神道之始" },
    { id: 9, name: "天神境", caveCount: 19, totalCaveCost: 2000000, breakthroughCost: { bloodEssence: 2000000, pureBlood: 20, suanBoneScript: 50 }, unlockNodes: [9], statBonus: { hp: 12000, atk: 2000, speed: 50 }, description: "天神之威，俯瞰众生" },
    { id: 10, name: "虚道/斩我境", caveCount: 21, totalCaveCost: 4000000, breakthroughCost: { bloodEssence: 4000000, pureBlood: 40, suanBoneScript: 80 }, unlockNodes: [10], statBonus: { hp: 25000, atk: 4000, speed: 60 }, description: "斩尽旧我，明悟虚道" },
    { id: 11, name: "遁一/至尊境", caveCount: 23, totalCaveCost: 8000000, breakthroughCost: { bloodEssence: 8000000, pureBlood: 80, suanBoneScript: 120 }, unlockNodes: [11], statBonus: { hp: 50000, atk: 8000, speed: 70 }, description: "执掌乾坤，九天无敌" },
    { id: 12, name: "真仙/仙王境", caveCount: 25, totalCaveCost: 15000000, breakthroughCost: { bloodEssence: 15000000, pureBlood: 150, suanBoneScript: 200 }, unlockNodes: [12], statBonus: { hp: 100000, atk: 16000, speed: 80 }, description: "仙道巅峰，不死不灭" }
];

// Dynamically set breakthroughCost, totalCaveCost, and statBonus for realms
for (let n = 1; n <= numNodes; n++) {
    const realm = REALM_REGISTRY[n - 1];
    realm.statBonus.hp = realmHpBonus[n];
    realm.statBonus.atk = realmAtkBonus[n];
    if (REALM_CRIT_RATE[n]) realm.statBonus.critRate = REALM_CRIT_RATE[n];
    else delete realm.statBonus.critRate;
    if (REALM_CRIT_DMG[n]) realm.statBonus.critDmg = REALM_CRIT_DMG[n];
    else delete realm.statBonus.critDmg;
    if (n > 1) {
        realm.breakthroughCost = { bloodEssence: breakthroughBE[n] };
        if (breakthroughSBS[n] > 0) realm.breakthroughCost.suanBoneScript = breakthroughSBS[n];
        if (breakthroughPB[n] > 0) realm.breakthroughCost.pureBlood = breakthroughPB[n];
    }
    // Calculate total cave cost for this realm
    const start = n === 1 ? 1 : 2 * n;
    const end = n === 1 ? 3 : 2 * n + 1;
    let sumVal = 0;
    for (let c = start; c <= end; c++) sumVal += caveCostRegistry[c];
    realm.totalCaveCost = sumVal;
}

export const CAVE_COST_REGISTRY = Array.from({ length: 25 }, (_, index) => {
    const idx = index + 1;
    const originalCaves = [
        { index: 1, cost: 100, hpBonus: 20, atkBonus: 2 },
        { index: 2, cost: 200, hpBonus: 25, atkBonus: 3 },
        { index: 3, cost: 400, hpBonus: 30, atkBonus: 4 },
        { index: 4, cost: 800, hpBonus: 40, atkBonus: 6, speedBonus: 5 },
        { index: 5, cost: 1500, hpBonus: 50, atkBonus: 8, speedBonus: 5 },
        { index: 6, cost: 3000, hpBonus: 65, atkBonus: 10, pickupBonus: 10 },
        { index: 7, cost: 5000, hpBonus: 80, atkBonus: 15, critBonus: 0.02 },
        { index: 8, cost: 8000, hpBonus: 100, atkBonus: 20, pickupBonus: 15 },
        { index: 9, cost: 12000, hpBonus: 130, atkBonus: 25, critBonus: 0.03 },
        { index: 10, cost: 20000, hpBonus: 200, atkBonus: 40, critBonus: 0.05, critDmgBonus: 0.5 },
        { index: 11, cost: 35000, hpBonus: 300, atkBonus: 60, critBonus: 0.05 },
        { index: 12, cost: 50000, hpBonus: 450, atkBonus: 80, critBonus: 0.05 },
        { index: 13, cost: 80000, hpBonus: 600, atkBonus: 100, critDmgBonus: 0.5 },
        { index: 14, cost: 120000, hpBonus: 800, atkBonus: 130, speedBonus: 10 },
        { index: 15, cost: 180000, hpBonus: 1100, atkBonus: 170, pickupBonus: 20 },
        { index: 16, cost: 250000, hpBonus: 1500, atkBonus: 220, critBonus: 0.02 },
        { index: 17, cost: 350000, hpBonus: 2000, atkBonus: 300, speedBonus: 10 },
        { index: 18, cost: 500000, hpBonus: 2800, atkBonus: 400, pickupBonus: 25 },
        { index: 19, cost: 700000, hpBonus: 3800, atkBonus: 550, critBonus: 0.03 },
        { index: 20, cost: 1000000, hpBonus: 5000, atkBonus: 800, critDmgBonus: 0.5 },
        { index: 21, cost: 1500000, hpBonus: 7000, atkBonus: 1100, speedBonus: 15 },
        { index: 22, cost: 2200000, hpBonus: 10000, atkBonus: 1600, pickupBonus: 30 },
        { index: 23, cost: 3200000, hpBonus: 15000, atkBonus: 2400, critBonus: 0.04 },
        { index: 24, cost: 4500000, hpBonus: 22000, atkBonus: 3500, speedBonus: 20 },
        { index: 25, cost: 6000000, hpBonus: 30000, atkBonus: 5000, critBonus: 0.05, critDmgBonus: 1.0 }
    ];
    const orig = originalCaves[index];
    const item = {
        index: idx,
        cost: caveCostRegistry[idx],
        hpBonus: caveHpBonuses[idx],
        atkBonus: caveAtkBonuses[idx]
    };
    if (orig.speedBonus) item.speedBonus = orig.speedBonus;
    if (orig.pickupBonus) item.pickupBonus = orig.pickupBonus;
    // Cap cave crit so cumulative trees stay meaningful without trivializing late Bosses.
    if (orig.critBonus) item.critBonus = Math.min(orig.critBonus, 0.02);
    if (orig.critDmgBonus) item.critDmgBonus = Math.min(orig.critDmgBonus, 0.25);
    return item;
});

export const SKILL_POOL_REGISTRY = {
    tier1: [
        { id: "suan_ni_roar", name: "雷吼骨术·怒啸", icon: "🦁", rarity: "common", school: "suan_ni_baoshu", type: "aoe_burst", description: "范围爆发：周身金色波纹扩散", baseDamage: 30, cooldown: 4.0, radius: 150, levelScaling: { damage: 15, radius: 10 }, vfx: "golden_roar_ring", sfx: "beast_roar_sweep" },
        { id: "primordial_fist", name: "原始真解·基础拳", icon: "👊", rarity: "common", school: "primordial_true_record", type: "projectile", description: "向前发射一道拳罡", baseDamage: 20, cooldown: 1.2, range: 400, levelScaling: { damage: 12, cooldown: -0.05 }, vfx: "bone_script_fist", sfx: "short_fist_whoosh" },
        { id: "willow_blessing", name: "青枝赐护·回春", icon: "🌿", rarity: "common", school: "willow_guard", type: "passive_heal", description: "每5秒回复生命值", baseHeal: 5, interval: 5.0, levelScaling: { heal: 3, interval: -0.2 }, vfx: "willow_leaf_heal", sfx: "soft_leaf_chime" },
        { id: "green_scaled_eagle", name: "青鳞鹰宝术·俯冲", icon: "🦅", rarity: "common", school: "green_eagle_art", type: "targeted_aoe", description: "召唤鹰影俯冲攻击最近敌人", baseDamage: 45, cooldown: 6.0, levelScaling: { damage: 20, cooldown: -0.3 }, vfx: "green_eagle_dive", sfx: "eagle_wind_cut" },
        { id: "bone_shield", name: "宝骨护体", icon: "🛡️", rarity: "common", school: "willow_guard", type: "passive_shield", description: "获得可吸收伤害的护盾，每15秒刷新", baseShield: 50, interval: 15.0, levelScaling: { shield: 30 }, vfx: "pale_bone_barrier", sfx: "wooden_shield_knock" },
        { id: "willow_seed_field", name: "柳叶生息", icon: "🍃", rarity: "common", school: "willow_guard", type: "aura", description: "生成贴身柳叶场，持续灼伤近身敌人", baseDamage: 8, tickInterval: 0.6, radius: 90, levelScaling: { damage: 5, radius: 6 }, vfx: "willow_leaf_field", sfx: "leaf_hum" }
    ],
    tier2: [
        { id: "thunder_god_finger", name: "裂雷指", icon: "⚡", rarity: "rare", school: "suan_ni_baoshu", element: "thunder", type: "chain_lightning", description: "连锁闪电：命中后弹跳至附近3个敌人", baseDamage: 25, cooldown: 2.5, chainCount: 3, chainRange: 200, levelScaling: { damage: 15, chainCount: 1 }, vfx: "white_blue_chain", sfx: "electric_arc_snap" },
        { id: "suan_ni_thunder_pulse", name: "雷吼雷环", icon: "🔆", rarity: "rare", school: "suan_ni_baoshu", element: "thunder", type: "aoe_burst", description: "爆出雷纹圆环，震退近身兽潮", baseDamage: 55, cooldown: 7.0, radius: 210, levelScaling: { damage: 22, radius: 14, cooldown: -0.25 }, vfx: "thunder_bone_ring", sfx: "roar_thunder_pulse" },
        { id: "kunpeng_dodge", name: "潮翼身法", icon: "🌊", rarity: "rare", school: "kunpeng_art", type: "active_dodge", description: "主动闪避冲刺+短暂无敌帧", cooldown: 8.0, invincibleDuration: 0.5, dashDistance: 180, levelScaling: { cooldown: -0.5, dashDistance: 15 }, vfx: "black_blue_wing_dash", sfx: "air_suction_dash" },
        { id: "divine_vine", name: "神藤缠绕", icon: "🌱", rarity: "rare", school: "willow_guard", type: "aoe_root", description: "缠绕范围内敌人并造成持续伤害", baseDamage: 15, cooldown: 10.0, radius: 180, duration: 3.0, levelScaling: { damage: 8, radius: 15 }, vfx: "green_vine_root", sfx: "grass_bind_sweep" },
        { id: "true_phoenix_fire", name: "真凰之火", icon: "🔥", rarity: "rare", school: "true_phoenix_art", element: "fire", type: "aura", description: "周身烈焰光环，持续灼烧靠近的敌人", baseDamage: 10, tickInterval: 0.5, radius: 100, levelScaling: { damage: 6, radius: 8 }, vfx: "phoenix_fire_aura", sfx: "soft_fire_crackle" },
        { id: "void_slash", name: "虚空斩", icon: "🗡️", rarity: "rare", school: "kunpeng_art", type: "slash_cone", description: "前方扇形大范围斩击", baseDamage: 60, cooldown: 5.0, arcAngle: 120, range: 250, levelScaling: { damage: 30, arcAngle: 10 }, vfx: "void_blue_arc", sfx: "sharp_space_cut" },
        { id: "kunpeng_tide_pull", name: "潮翼潮汐", icon: "🌀", rarity: "rare", school: "kunpeng_art", type: "aoe_root", description: "以潮汐漩涡束缚敌人并造成持续伤害", baseDamage: 18, cooldown: 9.0, radius: 210, duration: 2.5, levelScaling: { damage: 9, radius: 12, cooldown: -0.25 }, vfx: "black_tide_root", sfx: "low_tide_pull" }
    ],
    tier3: [
        { id: "heaven_hand", name: "上苍之手", icon: "✋", rarity: "legendary", school: "supreme_bone", type: "screen_clear", description: "超大范围一击清屏！CD极长", baseDamage: 300, cooldown: 30.0, radius: 600, levelScaling: { damage: 150 }, vfx: "giant_heaven_palm", sfx: "deep_bell_impact" },
        { id: "dual_pupil", name: "紫曜瞳·轮回", icon: "👁️", rarity: "legendary", school: "dual_pupil", type: "laser_beam", description: "持续发射毁灭光束，可旋转方向", baseDamage: 40, cooldown: 12.0, beamWidth: 30, duration: 3.0, levelScaling: { damage: 25, beamWidth: 8 }, vfx: "purple_white_beam", sfx: "focused_beam_hum" },
        { id: "supreme_bone_awaken", name: "星骨·觉醒", icon: "💀", rarity: "legendary", school: "supreme_bone", type: "transform", description: "觉醒星骨，全能力大幅提升持续10秒", damageMultiplier: 3.0, speedMultiplier: 1.5, cooldown: 60.0, duration: 10.0, levelScaling: { duration: 2 }, vfx: "supreme_bone_core", sfx: "heartbeat_bell" },
        { id: "ten_cave_resonance", name: "十洞天共鸣", icon: "⭕", rarity: "legendary", school: "supreme_bone", type: "screen_clear", description: "十口洞天同振，爆发环形清场冲击", baseDamage: 220, cooldown: 24.0, radius: 520, levelScaling: { damage: 120, radius: 30 }, vfx: "ten_cave_rings", sfx: "stacked_cave_resonance" },
        { id: "heaven_willow_domain", name: "青枝法域", icon: "🌳", rarity: "legendary", school: "willow_guard", type: "aura", description: "展开青枝法域，持续净化近身敌潮", baseDamage: 24, tickInterval: 0.45, radius: 150, levelScaling: { damage: 12, radius: 10 }, vfx: "willow_domain", sfx: "deep_leaf_chorus" },
        { id: "he_hua_projection", name: "万象化影·影", icon: "✨", rarity: "legendary", school: "he_hua_zizai", type: "transform", description: "唤出未来身残影，短时间大幅提升速度与伤害", damageMultiplier: 4.0, speedMultiplier: 1.35, cooldown: 75.0, duration: 8.0, levelScaling: { duration: 1.5 }, vfx: "future_projection_afterimage", sfx: "layered_voice_bell" }
    ]
};

export const PASSIVE_SKILL_REGISTRY = {
    tier1: [
        { id: "perk_suan_dmg_1", name: "骨文初解", uiCopy: "宝术威力+15%", cost: 1, description: "所有宝术伤害提高15%。", effects: [{ target: "baoshuDamage", op: "multiply", value: 1.15 }] },
        { id: "perk_speed_1", name: "蛮荒疾行", uiCopy: "移动速度+10%", cost: 1, description: "移动速度提高10%，更适合走位 and 拾取。", effects: [{ target: "baseSpeed", op: "multiply", value: 1.1 }] },
        { id: "perk_range_1", name: "洞天牵引", uiCopy: "拾取范围+20%", cost: 1, description: "拾取范围提高20%。", effects: [{ target: "basePickupRange", op: "multiply", value: 1.2 }] },
        { id: "perk_hp_1", name: "搬血厚体", uiCopy: "生命上限+25%", cost: 1, description: "生命上限提高25%。", effects: [{ target: "baseHp", op: "multiply", value: 1.25 }] },
        { id: "perk_crit_1", name: "荒域少年眼", uiCopy: "暴击率+5%", cost: 1, description: "暴击率提高5%。", effects: [{ target: "baseCritRate", op: "add", value: 0.05 }] }
    ],
    tier2: [
        { id: "perk_suan_dmg_2", name: "骨文通明", uiCopy: "宝术威力+25%", cost: 2, requires: "perk_suan_dmg_1", description: "所有宝术伤害再提高25%。", effects: [{ target: "baoshuDamage", op: "multiply", value: 1.25 }] },
        { id: "perk_extra_projectile", name: "拳印分光", uiCopy: "宝术+1投射物", cost: 2, description: "投射类宝术额外发射1枚拳印。", effects: [{ target: "projectileCount", op: "add", value: 1 }] },
        { id: "perk_lifesteal", name: "战血回涌", uiCopy: "击杀回复2%生命", cost: 2, description: "击杀敌人时回复2%最大生命。", effects: [{ target: "killHealMaxHpPct", op: "add", value: 0.02 }] },
        { id: "perk_cdr", name: "骨文流转", uiCopy: "宝术冷却-15%", cost: 2, description: "宝术冷却缩短15%。", effects: [{ target: "skillCooldown", op: "multiply", value: 0.85 }] }
    ],
    tier3: [
        { id: "perk_supreme_bone", name: "星骨再生", uiCopy: "星骨觉醒", cost: 3, requires: "perk_suan_dmg_2", description: "传说宝术伤害提高，并开局携带星骨觉醒。", effects: [{ target: "legendaryDamage", op: "multiply", value: 1.5 }, { target: "initialSkill", op: "append", value: "supreme_bone_awaken" }] },
        { id: "perk_thunder_god", name: "裂雷之怒", uiCopy: "雷系强化", cost: 3, description: "雷系宝术伤害提高20%，连锁闪电多弹跳1次。", effects: [{ target: "thunderDamage", op: "multiply", value: 1.2 }, { target: "chainLightningCount", op: "add", value: 1 }] },
        { id: "perk_kunpeng", name: "潮翼极速", uiCopy: "潮翼身法强化", cost: 3, description: "移动速度提高15%，潮翼身法冷却缩短25%。", effects: [{ target: "baseSpeed", op: "multiply", value: 1.15 }, { target: "dodgeCooldown", op: "multiply", value: 0.75 }] }
    ]
};

export const NODE_REGISTRY = [
    {
        id: 1, name: "荒域历练", subtitle: "十万蛮兽来袭", realmRequired: 1, duration: 120,
        enemyPool: ["wild_rhino", "green_scaled_eagle", "rock_golem"], bossId: "qiongqi_cub",
        skillTierAvailable: "tier1", rewards: { bloodEssence: 200, suanBoneScript: [0, 1] },
        failRewardMultiplier: 0.5, sceneClass: "Node1Scene", description: "星骁初出星槎村，荒域蛮兽闻风而动！",
        intro: "星骁初出星槎村，荒域之中万兽蛰伏。今日，你要以这十万蛮兽的精血，为你洗礼肉身！",
        taunts: ["穷奇幼崽：蝼蚁，也敢觊觎我的真血！", "星骁：好大一只凶兽，吃掉一定大补！"]
    },
    {
        id: 2, name: "千崖秘径", subtitle: "夺宝群战", realmRequired: 2, duration: 150,
        enemyPool: ["bandit_cultivator", "burrow_wyrm", "sky_predator", "rock_golem"], bossId: "ancient_beast_king",
        skillTierAvailable: "tier2", hasChests: true, chestCount: 6, chestOpenTime: 3.0,
        rewards: { bloodEssence: 500, pureBlood: [0, 1] }, failRewardMultiplier: 0.6,
        sceneClass: "Node2Scene", description: "千崖秘径遗迹中宝箱遍地，群敌环伺！",
        intro: "千崖秘径遗迹开启，诸神后裔齐聚夺宝。挡我者，杀无赦！",
        taunts: ["千崖兽王：此地机缘，尽归吾所有！", "星骁：你的宝骨，我看上了！"]
    },
    {
        id: 3, name: "镜魄试炼场", subtitle: "封王之战", realmRequired: 3, duration: 180,
        enemyPool: ["human_genius", "genius_beast", "shi_yi_projection", "huo_linger_projection"], bossId: "shi_yi_phantom_node3",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 1000, pureBlood: [2, 2] },
        failRewardMultiplier: 0.5, cooldownOnFail: 2, unlocksFlag: "young_supreme",
        sceneClass: "Node3Scene", description: "镜魄试炼场中天才云集，唯有一人力压群雄！",
        intro: "镜魄试炼场内打破极致，今日，便要在这镜魄试炼场封王，镇压一切敌！",
        taunts: ["玄曜虚影：我的好弟弟，你终究是不如我！", "星骁：你少得意，今日便要败你！"]
    },
    {
        id: 4, name: "天潮巢", subtitle: "极限海战", realmRequired: 4, duration: 180,
        enemyPool: ["sky_predator", "bandit_cultivator"], bossId: "ancient_beast_king_node4",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 2000, pureBlood: [2, 4] },
        failRewardMultiplier: 0.0, sceneClass: "Node4Scene", description: "海面平台极速移动战，躲避深海漩涡！",
        intro: "天潮巢开启，诸强争霸。不经风雨，怎见真龙！",
        taunts: ["尊者投影：小辈，交出潮翼法！", "星骁：想要我的法，拿命来换！"]
    },
    {
        id: 5, name: "石都大战", subtitle: "皇宫守卫", realmRequired: 5, duration: 240,
        enemyPool: ["human_genius", "bandit_cultivator", "rock_golem"], bossId: "qiongqi_cub_node5",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 5000, pureBlood: [3, 5] },
        failRewardMultiplier: 0.2, sceneClass: "Node5Scene", description: "塔防型割草，保护皇宫大阵阵眼不被摧毁。",
        intro: "三教修士围攻石都，身为石皇，当镇压一切叛乱！",
        taunts: ["三教教主：大势已去，星垣城当灭！", "星骁：我为石皇，当镇世间一切敌！"]
    },
    {
        id: 6, name: "药都风云", subtitle: "毒雾求生", realmRequired: 6, duration: 240,
        enemyPool: ["burrow_wyrm", "wild_rhino"], bossId: "ancient_beast_king_node6",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 10000, pureBlood: [4, 6] },
        failRewardMultiplier: 0.3, sceneClass: "Node6Scene", description: "毒雾环境生存战，不断击杀精英怪维持血量。",
        intro: "药都毒雾弥漫，唯有杀戮方能获取解药，寻得那一线生机。",
        taunts: ["毒雾幻影：在此沉沦吧……", "星骁：区区毒雾，也想困住我？"]
    },
    {
        id: 7, name: "三千星州", subtitle: "天才争霸", realmRequired: 7, duration: 300,
        enemyPool: ["human_genius", "genius_beast"], bossId: "shi_yi_phantom_node7",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 25000, pureBlood: [5, 10] },
        failRewardMultiplier: 0.4, sceneClass: "Node7Scene", description: "微型竞技场模式，连续面对神火境天才精英怪。",
        intro: "三千星州天才汇聚，谁敢称无敌？谁敢言不败？",
        taunts: ["初代天骄：星骁，你的路到头了！", "星骁：就凭你们，也敢阻我？"]
    },
    {
        id: 8, name: "星古遗地", subtitle: "无限迷宫", realmRequired: 8, duration: 300,
        enemyPool: ["human_genius", "genius_beast", "sky_predator"], bossId: "ancient_beast_king_node8",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 50000, pureBlood: [10, 15] },
        failRewardMultiplier: 0.5, sceneClass: "Node8Scene", description: "多层随机房间，挑战你的极限生存能力。",
        intro: "星古遗地开启，造化与危机并存。深入其中，夺取仙道法则！",
        taunts: ["仙古原住民：外来者，死！", "星骁：这里的造化，我全都要！"]
    },
    {
        id: 9, name: "星脉书院", subtitle: "火线护送", realmRequired: 9, duration: 300,
        enemyPool: ["bandit_cultivator", "human_genius"], bossId: "qiongqi_cub_node9",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 100000, pureBlood: [15, 20] },
        failRewardMultiplier: 0.1, sceneClass: "Node9Scene", description: "护送长老虚影突破裂隙边境斥候的防线。",
        intro: "裂隙边境大军来袭，护送长老突围，传承不灭，希望长存！",
        taunts: ["裂隙边境斥候：杀光九天十地的人！", "星骁：想动长老，先过我这一关！"]
    },
    {
        id: 10, name: "边境星关", subtitle: "绝望守城", realmRequired: 10, duration: 300,
        enemyPool: ["rock_golem", "wild_rhino", "genius_beast"], bossId: "shi_yi_phantom_node10",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 250000, pureBlood: [20, 30] },
        failRewardMultiplier: 0.2, sceneClass: "Node10Scene", description: "同屏数百裂隙边境大军冲击城墙，利用床弩与宝术清屏。",
        intro: "边境星关，身后便是故土。吾等当死战不退！",
        taunts: ["不朽者：星关必破，九天当灭！", "星骁：有我在，星关不倒！"]
    },
    {
        id: 11, name: "裂隙边境大战", subtitle: "孤军深入", realmRequired: 11, duration: 300,
        enemyPool: ["human_genius", "bandit_cultivator", "sky_predator"], bossId: "ancient_beast_king_node11",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 500000, pureBlood: [30, 50] },
        failRewardMultiplier: 0.5, sceneClass: "Node11Scene", description: "极高强度的生存挑战，精英怪和Boss混合出现。",
        intro: "杀入裂隙边境，沐浴敌血。今日，我要让裂隙边境天翻地覆！",
        taunts: ["裂隙边境至尊：狂妄的后生，这里是裂隙边境！", "星骁：裂隙边境又如何？照样杀穿！"]
    },
    {
        id: 12, name: "终极血战", subtitle: "万象化影", realmRequired: 12, duration: 360,
        enemyPool: ["shi_yi_phantom", "ancient_beast_king"], bossId: "shi_yi_phantom",
        skillTierAvailable: "tier3", rewards: { bloodEssence: 999999, pureBlood: [100, 100] },
        failRewardMultiplier: 0.1, sceneClass: "Node12Scene", description: "对抗不朽之王的投影，机制复杂的弹幕躲避与阶段性爆发。",
        intro: "星渊终局开启！金阙君、玄垒君，来战！",
        taunts: ["金阙君：纵使背负天渊，亦要镇守帝城，金阙之威不灭！", "星骁：万象化影，他化万古！镇杀！"]
    }
];

// Dynamically set rewards and map enemy pools/bosses to node-specific versions
for (let n = 1; n <= numNodes; n++) {
    const node = NODE_REGISTRY[n - 1];
    node.rewards = { bloodEssence: fixedBE[n] };
    if (fixedSBS[n] > 0) node.rewards.suanBoneScript = fixedSBS[n];
    if (fixedPB[n] > 0) node.rewards.pureBlood = fixedPB[n];
}

export const NODE_ABILITY_PLANS = {
    1: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard"],
        rewardUnlocks: ["suan_ni_baoshu"],
        firstNodeGrowthLoop: {
            collectionSource: "beast_essence_exp_from_enemy_defeat",
            growthTrigger: "12 点蛮兽血气经验触发首个宝术成长",
            runtimeMutation: "activeSkills[primordial_fist].level 由 1 提升到 2；后续阈值追加 suan_ni_roar / willow_blessing",
            playerFeedback: "技能 HUD、浮字、VFX、SFX 与镜头闪光同步反馈",
            combatImpact: "Lv.2 基础拳提高 projectile 伤害，雷吼怒啸提供早期 AoE 清怪，青枝守护回春提供失败压力前的续航",
            testAssertion: "firstNodeGrowthSkillMutation / firstNodeGrowthCombatImpact"
        }
    },
    2: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "green_eagle_art"],
        rewardUnlocks: ["green_eagle_art"]
    },
    3: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "green_eagle_art", "dual_pupil"],
        rewardUnlocks: ["dual_pupil"]
    },
    4: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "green_eagle_art", "dual_pupil", "kunpeng_art"],
        rewardUnlocks: ["kunpeng_art"]
    },
    5: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art"],
        rewardUnlocks: [],
        notes: "首通意图: reinforce_existing(willow_guard,dual_pupil,kunpeng_art); Node5 是守城/阵眼压力测试，强化已悟防御、光束和机动组合，不新增 runtime unlock."
    },
    6: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art"],
        rewardUnlocks: ["true_phoenix_art"]
    },
    7: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art"],
        rewardUnlocks: [],
        notes: "首通意图: reinforce_existing(dual_pupil,kunpeng_art,true_phoenix_art); Node7 是竞技场连战，用已有光束、身法和贴身光环形成构筑熟练度."
    },
    8: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art", "supreme_bone"],
        rewardUnlocks: ["supreme_bone"]
    },
    9: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art", "supreme_bone"],
        rewardUnlocks: [],
        notes: "首通意图: reinforce_existing(willow_guard,supreme_bone); Node9 护送压力强化守护/星骨防守价值，首通奖励仍以纯血和后续境界推进为主."
    },
    10: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art", "supreme_bone"],
        rewardUnlocks: [],
        notes: "首通意图: reinforce_existing(kunpeng_art,true_phoenix_art,supreme_bone); Node10 守城强化机动、光环和清屏组合，不重复展示新悟宝术."
    },
    11: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art", "supreme_bone"],
        rewardUnlocks: [],
        notes: "首通意图: reinforce_existing(dual_pupil,true_phoenix_art,supreme_bone); Node11 是终局前综合压测，资源与熟练度收束到最终战."
    },
    12: {
        runSkillPool: ["primordial_true_record", "suan_ni_baoshu", "willow_guard", "dual_pupil", "kunpeng_art", "true_phoenix_art", "supreme_bone", "he_hua_zizai"],
        rewardUnlocks: ["he_hua_zizai"],
        notes: "首通意图: unlock_finale(he_hua_zizai); 终极血战胜利后把终局临时技能记入能力目录，作为通关兑现."
    }
};

NODE_REGISTRY.forEach(node => {
    node.planning = {
        mainlineHooks: ["blood_tempering", "cave_opening", "bone_script_mastery"],
        ...(NODE_ABILITY_PLANS[node.id] || { runSkillPool: ["primordial_true_record"], rewardUnlocks: [] })
    };
});

// Original base enemies
const BASE_ENEMY_REGISTRY = {
    "wild_rhino": { name: "蛮犀兽", hp: 30, atk: 8, speed: 60, size: 24, exp: 5, lootList: [{ item: "bloodEssence", count: 1, chance: 0.8 }] },
    "green_scaled_eagle": { name: "青鳞鹰", hp: 20, atk: 10, speed: 100, size: 18, exp: 7, lootList: [{ item: "bloodEssence", count: 2, chance: 0.6 }] },
    "rock_golem": { name: "石傀儡", hp: 80, atk: 12, speed: 30, size: 30, exp: 15, lootList: [{ item: "bloodEssence", count: 5, chance: 0.5 }] },
    "bandit_cultivator": { name: "流寇修士", hp: 50, atk: 18, speed: 70, size: 20, exp: 12 },
    "burrow_wyrm": { name: "地底穿山龙", hp: 60, atk: 15, speed: 50, size: 22, exp: 14, behavior: "burrow_surface", burrowTime: 2.0 },
    "sky_predator": { name: "天阶凶禽", hp: 35, atk: 20, speed: 120, size: 16, exp: 10, behavior: "fly_dive", flyHeight: [80, 180] },
    "human_genius": { name: "人族天才", hp: 100, atk: 25, speed: 80, size: 20, exp: 25 },
    "genius_beast": { name: "天才战兽", hp: 120, atk: 30, speed: 90, size: 26, exp: 30 },
    "huo_linger_projection": { name: "焰翎·投影", hp: 250, atk: 40, speed: 85, size: 22, exp: 60, behavior: "elite", skills: ["fire_ring"] },
    "shi_yi_projection": { name: "玄曜·投影", hp: 350, atk: 50, speed: 75, size: 24, exp: 80, behavior: "elite", skills: ["dual_pupil_mortals"] },
    "qiongqi_cub": { name: "穷奇幼崽", hp: 600, atk: 35, speed: 40, size: 48, exp: 200, behavior: "boss", bossSkills: ["charge", "ground_slam", "dark_breath"], lootList: [{ item: "suanBoneScript", count: 1, chance: 0.4 }] },
    "ancient_beast_king": { name: "千崖兽王", hp: 1200, atk: 50, speed: 35, size: 56, exp: 400, behavior: "boss", bossSkills: ["triple_charge", "rock_barrage", "enrage"], lootList: [{ item: "pureBlood", count: 1, chance: 0.5 }] },
    "shi_yi_phantom": { name: "玄曜虚影", hp: 2500, atk: 70, speed: 45, size: 40, exp: 1000, behavior: "final_boss", bossSkills: ["dual_pupil_reincarnation", "full_screen_barrage", "tracking_orbs", "void_tear"], lootList: [{ item: "pureBlood", count: 2, chance: 1.0 }] }
};

export const ENEMY_VISUAL_DESIGN = {
    "wild_rhino": {},
    "green_scaled_eagle": {},
    "rock_golem": {},
    "bandit_cultivator": {},
    "burrow_wyrm": {},
    "sky_predator": {},
    "human_genius": {},
    "genius_beast": {},
    "huo_linger_projection": {},
    "shi_yi_projection": {},
    "qiongqi_cub": {},
    "ancient_beast_king": {},
    "shi_yi_phantom": {}
};

const baseVisual = Object.fromEntries(
    enemyDesignCatalog.map((enemy) => {
        const palette = enemy.palette || [];
        return [enemy.runtimeEnemyId, {
            textureKey: `enemy_${enemy.runtimeEnemyId}`,
            displayName: enemy.name,
            archetype: inferEnemyArchetype(enemy.runtimeEnemyId, enemy.silhouette),
            bodyColor: colorToNumber(palette[0], 0x7f1d1d),
            accentColor: colorToNumber(palette[1], 0xf87171),
            glowColor: colorToNumber(palette[2], 0xffffff),
            silhouette: enemy.silhouette,
            combatRead: enemy.combatRead,
            scale: /boss|king|qiongqi|phantom|穷奇|兽王|虚影/.test(`${enemy.runtimeEnemyId} ${enemy.name}`) ? 2.05 : 1.75
        }];
    })
);

Object.entries(baseVisual).forEach(([key, val]) => {
    ENEMY_VISUAL_DESIGN[key] = val;
});

export const ENEMY_REGISTRY = {
    "wild_rhino": {},
    "green_scaled_eagle": {},
    "rock_golem": {},
    "bandit_cultivator": {},
    "burrow_wyrm": {},
    "sky_predator": {},
    "human_genius": {},
    "genius_beast": {},
    "huo_linger_projection": {},
    "shi_yi_projection": {},
    "qiongqi_cub": {},
    "ancient_beast_king": {},
    "shi_yi_phantom": {}
};

function getFullyUpgradedCritMultiplier(n) {
    let critRate = 0.05 + 0.05; // base + perk_crit_1
    let critDmg = 1.5;
    
    const maxCave = n === 1 ? 3 : 2 * n + 1;
    for (let i = 1; i <= maxCave; i++) {
        const cave = CAVE_COST_REGISTRY[i - 1];
        if (cave && cave.critBonus) critRate += cave.critBonus;
        if (cave && cave.critDmgBonus) critDmg += cave.critDmgBonus;
    }
    
    for (let i = 1; i <= n; i++) {
        const realm = REALM_REGISTRY[i - 1];
        if (realm && realm.statBonus) {
            if (realm.statBonus.critRate) critRate += realm.statBonus.critRate;
            if (realm.statBonus.critDmg) critDmg += realm.statBonus.critDmg;
        }
    }
    
    return 1 + critRate * (critDmg - 1);
}

// Campaign balance targets (LW-044): dual-constraint Boss HP.
// 1) Fresh-save (no optional perks) should feel like a real fight, not a multi-minute slog.
// 2) Fully-upgraded (all legal caves + passive tree) must stay above the sim floor (~20s).
// Effective HP after balance-simulation hpMultiplier uses the stricter of the two targets.
const FRESH_BOSS_TARGET_TTK = Object.freeze({
    1: 90, 2: 95, 3: 100, 4: 105, 5: 110, 6: 115,
    7: 95, 8: 120, 9: 125, 10: 130, 11: 135, 12: 145
});
const FULL_BOSS_MIN_TTK = 26;
// Soft upper bound for fresh-save representative fist TTK (multi-skill runs clear faster).
const FRESH_BOSS_MAX_TTK = 170;
// Align with loreweaver/balance-simulation-config.json bossRuntime.hpMultiplier
const BOSS_RUNTIME_HP_MULTIPLIER = Object.freeze({
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1,
    7: 2, 8: 1, 9: 1, 10: 1.5, 11: 2, 12: 1
});
const FIST_BASE_DAMAGE = 20;
const FIST_COOLDOWN = 1.2;

// Build node-specific normal enemies and Bosses
for (let n = 1; n <= numNodes; n++) {
    const node = NODE_REGISTRY[n - 1];
    const s = Math.pow(scaleFactor, n - 1);
    
    // Fresh: realm-eligible ATK, no optional perks, single projectile fist.
    const apFresh = freshATK[n];
    const apFull = fullATK[n];
    const hpFresh = freshHP[n];
    const freshFistDps = (FIST_BASE_DAMAGE * (apFresh / 10)) / FIST_COOLDOWN;
    // Fully upgraded approximate (matches balance sim order of magnitude without runaway crit):
    // ATK scale * suan dmg perks * dual projectile * CDR * mild expected crit (~1.35).
    const atkScale = apFull / Math.max(1, apFresh);
    const mildExpectedCrit = 1.35;
    const fullFistDps = freshFistDps * atkScale * 1.15 * 1.25 * 2 * mildExpectedCrit / 0.85;
    const hpForFreshTarget = freshFistDps * (FRESH_BOSS_TARGET_TTK[n] || 120);
    const hpForFullFloor = fullFistDps * FULL_BOSS_MIN_TTK;
    const hpForFreshCap = freshFistDps * FRESH_BOSS_MAX_TTK;
    // Prefer dual target, but never let fresh-save TTK explode past the campaign cap.
    let desiredEffectiveHp = Math.max(hpForFreshTarget, hpForFullFloor);
    if (desiredEffectiveHp > hpForFreshCap) {
        desiredEffectiveHp = Math.max(hpForFreshCap, fullFistDps * 22);
    }
    desiredEffectiveHp = Math.round(desiredEffectiveHp);
    const m = BOSS_RUNTIME_HP_MULTIPLIER[n] || 1;
    // Registry stores pre-multiplier HP so runtime + sim (hp * multiplier) land on target.
    const targetBossHp = Math.max(1, Math.round(desiredEffectiveHp / m));
    // ~7 contact hits to kill player at fresh HP for readable pressure (not one-shots).
    const targetBossAtk = Math.max(1, Math.round(hpFresh / 7));
    
    // Get base boss definition
    const baseBossId = node.bossId.replace(/_node\d+$/, '');
    const baseBoss = BASE_ENEMY_REGISTRY[baseBossId] || BASE_ENEMY_REGISTRY["qiongqi_cub"];

    // Define the node-specific boss in ENEMY_REGISTRY
    const bossLoot = [{ item: "bloodEssence", count: bossLootBE[n], chance: 1.0 }];
    if (bossLootSBS[n] > 0) bossLoot.push({ item: "suanBoneScript", count: bossLootSBS[n], chance: 1.0 });
    if (bossLootPB[n] > 0) bossLoot.push({ item: "pureBlood", count: bossLootPB[n], chance: 1.0 });

    ENEMY_REGISTRY[node.bossId] = {
        ...baseBoss,
        hp: targetBossHp,
        atk: targetBossAtk,
        lootList: bossLoot,
        balanceMeta: {
            freshTargetTtkSeconds: FRESH_BOSS_TARGET_TTK[n],
            fullMinTtkSeconds: FULL_BOSS_MIN_TTK,
            runtimeHpMultiplier: m,
            desiredEffectiveHp,
            freshFistDps: Math.round(freshFistDps * 100) / 100,
            fullFistDps: Math.round(fullFistDps * 100) / 100,
            bindingConstraint: hpForFullFloor >= hpForFreshTarget ? 'full_min_ttk' : 'fresh_target_ttk'
        }
    };
    
    ENEMY_VISUAL_DESIGN[node.bossId] = {
        ...(baseVisual[baseBossId] || baseVisual["wild_rhino"] || {}),
        textureKey: `enemy_${baseBossId}`
    };

    // Define normal enemies for this node
    const baseNormalEnemyPool = ["wild_rhino", "green_scaled_eagle", "rock_golem", "bandit_cultivator", "burrow_wyrm", "sky_predator", "human_genius", "genius_beast", "huo_linger_projection", "shi_yi_projection"];
    const nodeNormalEnemies = new Set([...baseNormalEnemyPool, ...node.enemyPool]);
    nodeNormalEnemies.forEach(enemyType => {
        const baseEnemy = BASE_ENEMY_REGISTRY[enemyType];
        const normalHp = Math.round(targetBossHp * 0.1);
        const normalAtk = Math.round(targetBossAtk * 0.1);

        ENEMY_REGISTRY[`${enemyType}_node${n}`] = {
            ...baseEnemy,
            hp: Math.max(normalHp, 1),
            atk: Math.max(normalAtk, 1),
            lootList: []
        };
        
        ENEMY_VISUAL_DESIGN[`${enemyType}_node${n}`] = {
            ...(baseVisual[enemyType] || baseVisual["wild_rhino"] || {}),
            textureKey: `enemy_${enemyType}`
        };
    });

    // Map enemyPool to node-specific IDs
    node.enemyPool = node.enemyPool.map(id => `${id}_node${n}`);
}

// Preserve original base enemy entries for backward-compatibility
Object.entries(BASE_ENEMY_REGISTRY).forEach(([key, val]) => {
    if (!ENEMY_REGISTRY[key] || ENEMY_REGISTRY[`${key}_node1`]) {
        ENEMY_REGISTRY[key] = {
            ...val,
            hp: ENEMY_REGISTRY[`${key}_node1`]?.hp || val.hp,
            atk: ENEMY_REGISTRY[`${key}_node1`]?.atk || val.atk,
            lootList: ENEMY_REGISTRY[`${key}_node1`]?.lootList || val.lootList
        };
    }
});

// Optional per-node challenge cards for replay (LW-044). Settlement uses reason=challenge_completed.
export const NODE_CHALLENGE_REGISTRY = Object.freeze({
    1: [
        { id: 'n1_fast_clear', name: '血战急袭', description: '在契约时长 70% 内通关', goal: { type: 'duration_ratio_max', value: 0.7 }, rewardMul: 1.15 },
        { id: 'n1_survivor', name: '血肉无伤', description: '通关时生命不低于 60%', goal: { type: 'hp_ratio_min', value: 0.6 }, rewardMul: 1.1 }
    ],
    2: [
        { id: 'n2_high_risk', name: '夺宝无惧', description: '开启至少 2 个高危宝箱后通关', goal: { type: 'high_risk_chests_min', value: 2 }, rewardMul: 1.2 }
    ],
    3: [
        { id: 'n3_break_master', name: '破招宗师', description: 'Boss 破招窗口内至少打断 2 次', goal: { type: 'break_count_min', value: 2 }, rewardMul: 1.15 }
    ],
    4: [
        { id: 'n4_tide_dancer', name: '踏潮而行', description: '在漩涡激活时累计位移不少于 8 秒仍存活通关', goal: { type: 'hazard_survive_seconds', value: 8 }, rewardMul: 1.15 }
    ],
    5: [
        { id: 'n5_core_guard', name: '阵眼守护', description: '所有核心存活通关', goal: { type: 'all_cores_alive', value: 1 }, rewardMul: 1.2 }
    ],
    6: [
        { id: 'n6_antidote_run', name: '解毒突围', description: '拾取至少 3 枚解毒宝石', goal: { type: 'antidote_min', value: 3 }, rewardMul: 1.15 }
    ],
    7: [
        { id: 'n7_perfect_bracket', name: '不败赛程', description: '五波赛事全胜且自身生命不低于 40%', goal: { type: 'tournament_perfect', value: 1 }, rewardMul: 1.25 }
    ],
    8: [
        { id: 'n8_portal_explorer', name: '遗地探路', description: '至少激活 3 个不同传送门类型', goal: { type: 'portal_types_min', value: 3 }, rewardMul: 1.15 }
    ],
    9: [
        { id: 'n9_escort_safe', name: '护驾周全', description: '护送目标生命不低于 50% 抵达终点', goal: { type: 'escort_hp_min', value: 0.5 }, rewardMul: 1.2 }
    ],
    10: [
        { id: 'n10_wall_hold', name: '城垣不破', description: '城墙生命不低于 30% 通关', goal: { type: 'wall_hp_min', value: 0.3 }, rewardMul: 1.2 }
    ],
    11: [
        { id: 'n11_elite_hunter', name: '精英猎手', description: '击破至少 4 组精英连战', goal: { type: 'elite_clears_min', value: 4 }, rewardMul: 1.15 }
    ],
    12: [
        { id: 'n12_phase_rush', name: '三阶连斩', description: '终局 Boss 三阶段均在破招窗口造成伤害', goal: { type: 'finale_phase_breaks', value: 3 }, rewardMul: 1.3 }
    ]
});

export const ABILITY_CATALOG = [
    { id: "primordial_true_record", name: "原始真解", unlockSource: "initial", runtimeSkillIds: ["primordial_fist"], description: "开局自带基础拳意。" },
    { id: "suan_ni_baoshu", name: "雷吼骨术", unlockSource: "node_reward", runtimeSkillIds: ["suan_ni_roar", "thunder_god_finger", "suan_ni_thunder_pulse"], description: "荒域历练首通后解锁，提供怒啸和雷系爆发。" },
    { id: "willow_guard", name: "青枝赐护", unlockSource: "mainline", runtimeSkillIds: ["willow_blessing", "bone_shield", "divine_vine", "willow_seed_field", "heaven_willow_domain"], description: "星槎村守护线，提供回复、护盾与控制。" },
    { id: "green_eagle_art", name: "青鳞鹰宝术", unlockSource: "node_reward", runtimeSkillIds: ["green_scaled_eagle"], description: "千崖秘径后解锁的定点爆发。" },
    { id: "kunpeng_art", name: "潮翼法", unlockSource: "node_reward", runtimeSkillIds: ["kunpeng_dodge", "void_slash", "kunpeng_tide_pull"], description: "天潮巢后解锁的身法、斩击与潮汐控制。" },
    { id: "true_phoenix_art", name: "真凰宝术", unlockSource: "node_reward", runtimeSkillIds: ["true_phoenix_fire"], description: "药都风云后解锁的贴身灼烧光环。" },
    { id: "dual_pupil", name: "紫曜瞳", unlockSource: "node_reward", runtimeSkillIds: ["dual_pupil"], description: "镜魄试炼场击败玄曜投影后解锁的直线光束。" },
    { id: "supreme_bone", name: "星骨", unlockSource: "node_reward", runtimeSkillIds: ["supreme_bone_awaken", "heaven_hand", "ten_cave_resonance"], description: "星古遗地后解锁的终局变身与清屏。" },
    { id: "he_hua_zizai", name: "万象化影", unlockSource: "finale", runtimeSkillIds: ["he_hua_projection"], description: "终极血战临时开放的未来身投影。" }
];

// Bind to window for global access in tests and sidebars
if (typeof window !== 'undefined') {
    window.REALM_REGISTRY = REALM_REGISTRY;
    window.CAVE_COST_REGISTRY = CAVE_COST_REGISTRY;
    window.SKILL_POOL_REGISTRY = SKILL_POOL_REGISTRY;
    window.PASSIVE_SKILL_REGISTRY = PASSIVE_SKILL_REGISTRY;
    window.NODE_REGISTRY = NODE_REGISTRY;
    window.NODE_ABILITY_PLANS = NODE_ABILITY_PLANS;
    window.NODE_CHALLENGE_REGISTRY = NODE_CHALLENGE_REGISTRY;
    window.CHARACTER_DESIGN_CATALOG = CHARACTER_DESIGN_CATALOG;
    window.ENEMY_DESIGN_CATALOG = enemyDesignCatalog;
    window.ENEMY_VISUAL_DESIGN = ENEMY_VISUAL_DESIGN;
    window.ENEMY_REGISTRY = ENEMY_REGISTRY;
    window.ABILITY_CATALOG = ABILITY_CATALOG;
}
