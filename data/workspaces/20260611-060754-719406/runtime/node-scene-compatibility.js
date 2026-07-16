export const NODE_SCENE_COMPATIBILITY = Object.freeze({
    methods: Object.freeze([
        'init', 'create', 'update', 'onSecondTick', 'damageEnemy', 'onPlayerHit', 'endGame',
        'publishNodeTestState', 'createRuntimeEnemy', 'spawnEnemy', 'spawnPickup', 'spawnBoss',
        'showWorldFloatText', 'hasPerk', 'getChestChildrenForTest'
    ]),
    fields: Object.freeze([
        'active', 'add', 'cameras', 'enemies', 'enemyProjectiles', 'events', 'height', 'isGameOver',
        'isInvulnerable', 'isPaused', 'kills', 'lootLog', 'make', 'nodeConfig', 'physics', 'player', 'playerAbilities',
        'playerHp', 'playerMaxHp', 'playerPerks', 'playerShield', 'playerStats', 'rewards', 'scene',
        'surviveTime', 'sys', 'textures', 'time', 'tweens', 'uiScene', 'width'
    ])
});

export const PHASER_INHERITED_FIELDS = Object.freeze([
    'active', 'add', 'cameras', 'events', 'height', 'make', 'physics', 'scene', 'sys', 'textures', 'time', 'tweens', 'width'
]);

export const NODE1_OWNED_FIELDS = Object.freeze(
    NODE_SCENE_COMPATIBILITY.fields.filter((field) => !PHASER_INHERITED_FIELDS.includes(field))
);
