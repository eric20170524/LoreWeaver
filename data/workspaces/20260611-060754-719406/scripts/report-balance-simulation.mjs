import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const REPORT_DIR = path.join(ROOT_DIR, 'reports');

// Because we're a script inside the workspace, we can import from runtime/PowerBudget.js directly
import {
    NODE_POWER_BUDGETS,
    resolvePlayerCombatStats,
    resolveExpectedSkillDps,
    resolveRuntimeEnemyStats,
    getCaveCost,
    getBreakthroughCost
} from '../runtime/PowerBudget.js';

const CONFIG_PATH = path.join(ROOT_DIR, 'loreweaver', 'balance-simulation-config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const reportPath = path.join(REPORT_DIR, 'balance_simulation_latest.json');
const isGate = process.argv.includes('--gate');

const report = {
  status: "passed",
  violations: 0,
  details: [],
  violationMessages: []
};

// Simulate for each node
const nodes = Object.keys(NODE_POWER_BUDGETS).map(Number).sort((a,b) => a-b);
for (const nodeId of nodes) {
    const budget = NODE_POWER_BUDGETS[nodeId];
    const playerStats = resolvePlayerCombatStats(nodeId);

    // Simulate normal enemy
    const normalEnemy = resolveRuntimeEnemyStats({ nodeId, playerStats, role: 'normal' });
    const normalHitsToKillPlayer = playerStats.baseHp / normalEnemy.atk;

    if (normalHitsToKillPlayer < config.thresholds.minimumPlayerHitsToKill || normalHitsToKillPlayer > config.thresholds.maximumPlayerHitsToKill) {
        report.violations++;
        report.violationMessages.push(`Node ${nodeId} survivability_outside_contact_band: player hits to kill is ${normalHitsToKillPlayer}`);
    }

    // Simulate Boss
    const bossConfig = config.bossRuntime[nodeId];
    if (!bossConfig) {
        report.violations++;
        report.violationMessages.push(`Node ${nodeId} missing_runtime_boss: No boss config defined.`);
    } else {
        const bossEnemy = resolveRuntimeEnemyStats({ nodeId, playerStats, role: 'boss', phaseMultiplier: bossConfig.hpMultiplier || 1 });
        const bossTtk = bossEnemy.hp / normalEnemy.expectedDps;

        if (bossTtk < config.thresholds.minimumBossTtkSeconds) {
            report.violations++;
            report.violationMessages.push(`Node ${nodeId} boss_ttk_below_minimum: TTK is ${bossTtk}s`);
        }

        // Node 12 unexplained instant-failure/collision override issue (simulated by checking if Boss TTK isn't scaled enough for a finale)
        if (nodeId === 12 && bossTtk < config.thresholds.minimumBossTtkSeconds * 2.5) {
             report.violations++;
             report.violationMessages.push(`Node 12 final_boss_ttk_below_minimum: TTK is ${bossTtk}s`);
        }
    }
}

// Simulate economy
let totalEssence = 0;
let totalSuan = 0;
let totalPureBlood = 0;
for(let nodeId of nodes) {
   let reqCost = getCaveCost(nodeId); // assuming 1 cave upgrade per node for simple check
   let breakCost = getBreakthroughCost(nodeId);
   let costEssence = reqCost + breakCost.bloodEssence;
   let costSuan = breakCost.suanBoneScript || 0;
   let costBlood = breakCost.pureBlood || 0;

   // A node can pull resources from ANY previously unlocked node to avoid Infinity.
   // Find the best accessible node for the resource required
   let bestEssenceYield = 0;
   let bestSuanYield = 0;
   let bestBloodYield = 0;
   for (let availableNodeId = 1; availableNodeId <= nodeId; availableNodeId++) {
       const availableReward = NODE_POWER_BUDGETS[availableNodeId].rewards;
       bestEssenceYield = Math.max(bestEssenceYield, availableReward.bloodEssence || 0);
       bestSuanYield = Math.max(bestSuanYield, availableReward.suanBoneScript || 0);
       bestBloodYield = Math.max(bestBloodYield, availableReward.pureBlood || 0);
   }

   let repeatsEssence = Math.ceil(costEssence / bestEssenceYield);
   let repeatsSuan = costSuan > 0 ? Math.ceil(costSuan / bestSuanYield) : 0;
   let repeatsBlood = costBlood > 0 ? Math.ceil(costBlood / bestBloodYield) : 0;

   let maxRepeats = Math.max(repeatsEssence, repeatsSuan, repeatsBlood);
   if (maxRepeats > config.thresholds.maximumMandatoryRepeats) {
       report.violations++;
       report.violationMessages.push(`Node ${nodeId} mandatory_repeats_exceed_limit: Requires ${maxRepeats} repeats`);
   }
}

if (report.violations > 0) {
    report.status = "failed";
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`Balance simulation report generated with ${report.violations} violations.`);

if (isGate && report.violations > 0) {
  console.error(`Balance gate failed with ${report.violations} violations.`);
  report.violationMessages.forEach(msg => console.error(" - " + msg));
  process.exit(1);
}
