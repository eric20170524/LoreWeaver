#!/usr/bin/env node

// Deterministic combat unit tests. Phaser timers/physics are test doubles;
// this suite does not claim browser rendering, collision broadphase, or balance coverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import SurvivorHordeAdapter, {
  SURVIVOR_HORDE_DEFAULT_CONFIG
} from '../../minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js';
import WeaponStanceCycleModifier from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/WeaponStanceCycleModifier.js';

function entity(x = 0, y = 0, values = {}) {
  const data = new Map(Object.entries(values));
  return {
    x, y, active: true, destroyed: 0,
    body: { enable: true, velocity: { x: 1, y: 1 }, stop() { this.velocity = { x: 0, y: 0 }; } },
    getData(key) { return data.get(key); },
    setData(key, value) { data.set(key, value); return this; },
    setDepth() { return this; },
    setStrokeStyle() { return this; },
    destroy() { this.active = false; this.destroyed += 1; }
  };
}

function group() {
  const members = [];
  return { add(value) { members.push(value); }, getChildren() { return members; } };
}

function fixture({ collectibles = false, stance = true, knobs = {} } = {}) {
  const timers = [];
  const delayed = [];
  const moves = [];
  const clips = [];
  // Isolate the adapter's combat methods from scene boot and rendering.
  const adapter = Object.create(SurvivorHordeAdapter.prototype);
  Object.assign(adapter, {
    context: {}, status: 'running', payload: null,
    config: structuredClone(SURVIVOR_HORDE_DEFAULT_CONFIG),
    state: {
      hp: 100, elapsedSeconds: 0, timeRemaining: 120, kills: 0, score: 0,
      collectedRewards: {}, lastPlayerHitAt: -Infinity, bossSpawned: false
    },
    player: entity(), world: { width: 1280, height: 720 },
    groups: { enemies: group(), bullets: group(), collectibles: group() },
    runtimeEventListeners: new Map(), runtimeEventHistory: [], runtimeEventSequence: 0,
    artStats: { projectiles: 'pending', pickups: 'pending' },
    runtimeArt: { playClip: (...args) => clips.push(args) },
    lifecycle: { transitionLocked: false, trackTimer(value) { return value; } },
    scene: {
      time: {
        now: 0,
        addEvent(spec) { timers.push(spec); return spec; },
        delayedCall(delay, callback) { const spec = { delay, callback }; delayed.push(spec); return spec; }
      },
      add: { circle: (x, y) => entity(x, y) },
      physics: {
        add: { existing() {} },
        moveToObject(object, target, speed) { moves.push({ object, target, speed }); }
      }
    }
  });
  adapter.config.collectibles.enabled = collectibles;
  const modifier = stance ? new WeaponStanceCycleModifier(knobs) : null;
  adapter.modifiers = modifier ? [modifier] : [];
  if (modifier) modifier.id = 'weapon_stance_cycle';
  // Match create(): the timer must not capture the pre-modifier implementation.
  adapter.startTimers();
  adapter.installModifiers();
  function tick(index = 1) {
    const timer = timers[index];
    timer.callback.call(timer.callbackScope);
  }
  function enemy({ hp = 10, x = 10, y = 0, score = 1 } = {}) {
    const target = entity(x, y, { id: 'test_enemy', hp, damage: 10, speed: 80, reward: { score } });
    adapter.groups.enemies.add(target);
    return target;
  }
  return { adapter, modifier, timers, delayed, moves, clips, tick, enemy };
}

function events(adapter, type) {
  return adapter.runtimeEventHistory.filter((event) => event.type === type);
}

test('a timer created before modifier installation executes the melee sweep', () => {
  const f = fixture();
  const enemy = f.enemy();
  f.tick();
  assert.equal(enemy.getData('hp'), 6);
  assert.equal(f.adapter.groups.bullets.getChildren().length, 0);
  assert.equal(events(f.adapter, 'weapon-stance-attack').at(-1)?.hitCount, 1);
});

test('the same timer cycles melee -> ranged -> melee; ranged bullets deal real damage', () => {
  const f = fixture();
  const enemy = f.enemy({ hp: 12 });
  f.tick();
  f.adapter.state.elapsedSeconds = 6;
  f.adapter.scene.time.now = 6000;
  f.tick();
  const bullets = f.adapter.groups.bullets.getChildren();
  assert.equal(bullets.length, 2);
  for (const bullet of bullets) f.adapter.handleBulletEnemyOverlap(bullet, enemy);
  assert.equal(enemy.getData('hp'), 4);
  f.adapter.state.elapsedSeconds = 10;
  f.tick();
  assert.equal(enemy.getData('hp'), 0);
  assert.equal(f.adapter.state.kills, 1);
  assert.deepEqual(events(f.adapter, 'weapon-stance-attack').map((event) => event.stance), ['melee', 'ranged', 'melee']);
});

test('uninstall restores the original attack for an already registered timer', () => {
  const f = fixture();
  const enemy = f.enemy();
  f.modifier.uninstall(f.adapter.createRuntimeContext());
  f.tick();
  assert.equal(f.adapter.groups.bullets.getChildren().length, 1);
  assert.equal(enemy.getData('hp'), 10);
  assert.equal(events(f.adapter, 'weapon-stance-attack').length, 0);
});

test('spawn and second timers also dispatch to the current method', () => {
  const f = fixture({ stance: false });
  let spawned = 0;
  let seconds = 0;
  f.adapter.spawnWave = () => { spawned += 1; };
  f.adapter.onSecondTick = () => { seconds += 1; };
  f.tick(0);
  f.tick(2);
  assert.equal(spawned, 1);
  assert.equal(seconds, 1);
});

test('a death animation grants exactly one kill and one reward', () => {
  const f = fixture({ stance: false });
  const enemy = f.enemy({ hp: 2, score: 3 });
  assert.equal(f.adapter.damageEnemy(enemy, 2), true);
  assert.equal(f.adapter.damageEnemy(enemy, 2), false);
  assert.equal(enemy.active, true, 'death clip must remain renderable');
  assert.equal(enemy.getData('hp'), 0);
  assert.equal(enemy.body.enable, false);
  assert.deepEqual(enemy.body.velocity, { x: 0, y: 0 });
  assert.equal(f.adapter.state.kills, 1);
  assert.equal(f.adapter.state.score, 3);
  assert.equal(events(f.adapter, 'enemy-defeated').length, 1);
  f.delayed.find((timer) => timer.delay === 120).callback();
  assert.equal(enemy.active, false);
  assert.equal(enemy.destroyed, 1);
});

test('reentrant damage cannot settle the same defeat twice', () => {
  const f = fixture({ stance: false });
  const enemy = f.enemy({ hp: 2 });
  let nested;
  let attempted = false;
  let settledScore;
  f.adapter.onRuntimeEvent('enemy-damaged', () => {
    if (attempted) return;
    attempted = true;
    nested = f.adapter.damageEnemy(enemy, 2);
  });
  f.adapter.onRuntimeEvent('enemy-defeated', () => { settledScore = f.adapter.state.score; });
  f.adapter.damageEnemy(enemy, 2);
  assert.equal(nested, false);
  assert.equal(f.adapter.state.kills, 1);
  assert.equal(settledScore, 1, 'listeners must see the settled reward');
});

test('pickup-mode defeat creates one drop; one pickup cannot be collected twice', () => {
  const f = fixture({ stance: false, collectibles: true });
  const enemy = f.enemy({ hp: 1, score: 3 });
  f.adapter.damageEnemy(enemy, 4);
  f.adapter.damageEnemy(enemy, 4);
  const drops = f.adapter.groups.collectibles.getChildren();
  assert.equal(drops.length, 1);
  assert.equal(f.adapter.state.score, 0);
  f.adapter.handleCollectibleOverlap(f.adapter.player, drops[0]);
  f.adapter.handleCollectibleOverlap(f.adapter.player, drops[0]);
  assert.equal(f.adapter.state.score, 3);
  assert.equal(f.adapter.state.collectedRewards.score, 3);
});

test('dying enemies neither chase, attract aim, block bullets, nor damage the player', () => {
  const f = fixture({ stance: false });
  const dead = f.enemy({ hp: 1, x: 1 });
  const live = f.enemy({ x: 20 });
  f.adapter.damageEnemy(dead, 1);
  assert.equal(f.adapter.findNearestEnemy(), live);
  f.adapter.updateEnemies();
  assert.deepEqual(f.moves.map((move) => move.object), [live]);
  const bullet = entity(0, 0, { damage: 2 });
  f.adapter.handleBulletEnemyOverlap(bullet, dead);
  assert.equal(bullet.active, true);
  f.adapter.handlePlayerEnemyOverlap(f.adapter.player, dead);
  assert.equal(f.adapter.state.hp, 100);
  assert.equal(f.adapter.state.lastPlayerHitAt, -Infinity);
  f.adapter.handlePlayerEnemyOverlap(f.adapter.player, live);
  assert.equal(f.adapter.state.hp, 90);
});

test('an earlier hurt timer cannot overwrite the death clip', () => {
  const f = fixture({ stance: false });
  const enemy = f.enemy({ hp: 3 });
  f.adapter.damageEnemy(enemy, 1);
  f.adapter.damageEnemy(enemy, 2);
  f.delayed.find((timer) => timer.delay === 180).callback();
  assert.deepEqual(f.clips.map((clip) => clip[2]), ['hurt', 'death']);
});

test('paused/ended/destroyed adapters do not attack, apply damage, or collect rewards', () => {
  for (const status of ['paused', 'ended', 'destroyed']) {
    const f = fixture();
    const enemy = f.enemy();
    const pickup = entity(0, 0, { reward: { score: 4 } });
    f.adapter.status = status;
    for (const seconds of [0, 6]) {
      f.adapter.state.elapsedSeconds = seconds;
      f.tick();
    }
    assert.equal(f.adapter.damageEnemy(enemy, 2), false);
    f.adapter.handlePlayerEnemyOverlap(f.adapter.player, enemy);
    f.adapter.handleCollectibleOverlap(f.adapter.player, pickup);
    assert.equal(enemy.getData('hp'), 10);
    assert.equal(f.adapter.state.hp, 100);
    assert.equal(f.adapter.state.score, 0);
    assert.equal(pickup.active, true);
    assert.equal(f.adapter.groups.bullets.getChildren().length, 0);
  }
});

test('transition-locked combat callbacks cannot mutate rewards or health', () => {
  const f = fixture();
  const enemy = f.enemy();
  f.adapter.lifecycle.transitionLocked = true;
  f.tick();
  assert.equal(f.adapter.damageEnemy(enemy, 3), false);
  assert.equal(enemy.getData('hp'), 10);
  assert.equal(f.adapter.state.kills, 0);
});

test('a projectile born at time zero still expires and is destroyed only once', () => {
  const f = fixture({ stance: false });
  const bullet = entity(0, 0, { createdAt: 0 });
  f.adapter.groups.bullets.add(bullet);
  f.adapter.cleanupBullets(1000);
  assert.equal(bullet.active, true);
  f.adapter.cleanupBullets(1801);
  assert.equal(bullet.active, false);
  f.adapter.cleanupBullets(2000);
  assert.equal(bullet.destroyed, 1);
});

test('melee target limits exclude dying enemies before sorting and truncation', () => {
  const f = fixture({ knobs: { meleeMaxTargets: 1 } });
  const dead = f.enemy({ hp: 1, x: 1 });
  const live = f.enemy({ x: 20 });
  f.adapter.damageEnemy(dead, 1);
  f.tick();
  assert.equal(live.getData('hp'), 6);
  assert.equal(events(f.adapter, 'weapon-stance-attack').at(-1).hitCount, 1);
});

test('melee hit telemetry counts accepted damage, not merely selected targets', () => {
  const f = fixture();
  f.enemy();
  f.adapter.damageEnemy = () => false;
  f.tick();
  assert.equal(events(f.adapter, 'weapon-stance-attack').at(-1)?.hitCount, 0);
});

test('ranged damage multiplier is restored even when firing throws', () => {
  const f = fixture({ stance: false });
  const original = f.adapter.config.weapon.bulletDamage;
  f.adapter.fireAtNearestEnemy = () => {
    assert.equal(f.adapter.config.weapon.bulletDamage, original * 3);
    throw new Error('test projectile allocation failure');
  };
  const modifier = new WeaponStanceCycleModifier({ rangedDamageMultiplier: 3 });
  modifier.install(f.adapter.createRuntimeContext());
  f.adapter.state.elapsedSeconds = 6;
  assert.throws(() => f.adapter.fireAtNearestEnemy(), /projectile allocation failure/);
  assert.equal(f.adapter.config.weapon.bulletDamage, original);
  modifier.uninstall(f.adapter.createRuntimeContext());
});

test('invalid damage does not mutate enemy health or counters', () => {
  const f = fixture({ stance: false });
  const enemy = f.enemy();
  for (const amount of [0, -1, NaN, Infinity, '2']) {
    assert.equal(f.adapter.damageEnemy(enemy, amount), false);
  }
  assert.equal(enemy.getData('hp'), 10);
  assert.equal(f.adapter.state.kills, 0);
  assert.equal(events(f.adapter, 'enemy-damaged').length, 0);
});
