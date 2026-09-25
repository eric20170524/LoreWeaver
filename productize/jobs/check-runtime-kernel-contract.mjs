import assert from "node:assert/strict";
import { createNodePayload } from "../../minigame_master/core/lib/contracts/NodeContracts.js";
import SurvivorHordeAdapter, {
  SURVIVOR_HORDE_DEFAULT_CONFIG
} from "../../minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js";

assert.equal(createNodePayload({ nodeId: 0, id: 9, runSeed: 0 }).nodeId, 0);
assert.equal(createNodePayload({ runSeed: 0 }).runSeed, 0);
assert.equal(createNodePayload({ id: 0 }).nodeId, 0);
assert.equal(createNodePayload({}).runSeed, null);
assert.equal(createNodePayload({}).nodeId, "node_unknown");

const payload = {
  nodeId: "node_1",
  nodeConfig: {
    duration: 60,
    gameplay: {
      cardId: "survivor_horde",
      knobs: {
        durationSec: 60,
        enemyPool: ["wild_rhino", "green_scaled_eagle"]
      }
    }
  },
  playerStats: { hp: 100 }
};

const first = new SurvivorHordeAdapter();
first.init(payload);
assert.equal(first.config.weapon.bulletDamage, 2);
first.config.weapon.bulletDamage = 7;
first.config.enemies.pool[0].damage = 999;

const second = new SurvivorHordeAdapter();
second.init(payload);
assert.equal(second.config.weapon.bulletDamage, 2, "a new run must not inherit prior skill upgrades");
assert.notEqual(second.config.enemies.pool[0].damage, 999, "a new run must not inherit prior enemy mutations");
assert.equal(SURVIVOR_HORDE_DEFAULT_CONFIG.weapon.bulletDamage, 2, "module defaults must remain immutable by convention");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-kernel-contract.v1",
  status: "passed",
  assertions: [
    "payload preserves zero seed and zero node identity while defaulting absent values",
    "new run resets weapon damage",
    "new run resets nested enemy config",
    "module default remains unchanged"
  ]
}, null, 2));
