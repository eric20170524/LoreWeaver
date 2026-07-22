import imagegenManifest from '../assets/imagegen/manifest.js';

const ATLAS_TEXTURE_KEY = 'imagegen_combat_atlas';

const PLAYER_KEYS = [
    'shihao_young_runtime', 'player_idle', 'player_walk_0', 'player_walk_1',
    'player_attack', 'player_hurt', 'player_death', 'player_dash'
];
const COMMON_KEYS = [
    'skill_fist_projectile', 'pickup_blood_essence', 'vfx_effect_frame',
    'ui_icon_dash', 'ui_icon_active', 'ui_icon_burst'
];

function enemyKeys(name, clips = ['', '_walk', '_attack', '_hurt', '_death']) {
    return clips.map((c) => `enemy_${name}${c === '' ? '' : c}`);
}

const NODE_EXPECTED_TEXTURES = {
    node1: [
        ...PLAYER_KEYS,
        ...enemyKeys('wild_rhino'),
        ...enemyKeys('green_scaled_eagle', ['', '_walk', '_attack']),
        ...enemyKeys('rock_golem', ['', '_attack']),
        ...enemyKeys('qiongqi_cub', ['', '_attack', '_hurt']),
        ...COMMON_KEYS,
        'env_bg_desert', 'env_landmark_rock', 'env_ground_patch', 'objective_totem'
    ],
    node2: [
        ...PLAYER_KEYS,
        ...enemyKeys('bandit_cultivator', ['', '_walk', '_attack']),
        ...enemyKeys('burrow_wyrm', ['', '_attack']),
        ...enemyKeys('sky_predator', ['', '_walk', '_attack']),
        ...enemyKeys('rock_golem', ['', '_attack']),
        ...enemyKeys('ancient_beast_king', ['', '_attack', '_hurt']),
        'chest_gold', ...COMMON_KEYS, 'env_bg_cliff'
    ],
    node3: [
        ...PLAYER_KEYS,
        ...enemyKeys('human_genius', ['', '_walk', '_attack']),
        ...enemyKeys('genius_beast', ['', '_attack']),
        ...enemyKeys('shi_yi_projection', ['', '_attack']),
        ...enemyKeys('huo_linger_projection', ['', '_attack']),
        ...enemyKeys('shi_yi_phantom', ['', '_attack', '_hurt']),
        'boss_projectile', ...COMMON_KEYS, 'env_bg_arena'
    ],
    node4: [
        ...PLAYER_KEYS,
        ...enemyKeys('sky_predator', ['', '_walk', '_attack']),
        ...enemyKeys('bandit_cultivator', ['', '_attack']),
        ...enemyKeys('ancient_beast_king', ['', '_attack']),
        'whirlpool', ...COMMON_KEYS, 'env_bg_tide'
    ],
    node5: [
        ...PLAYER_KEYS,
        ...enemyKeys('bandit_cultivator', ['', '_attack']),
        ...enemyKeys('human_genius', ['', '_attack']),
        ...enemyKeys('rock_golem', ['', '_attack']),
        ...enemyKeys('qiongqi_cub', ['', '_attack']),
        'core_eye', ...COMMON_KEYS, 'env_bg_city'
    ],
    node6: [
        ...PLAYER_KEYS,
        ...enemyKeys('burrow_wyrm', ['', '_walk', '_attack']),
        ...enemyKeys('wild_rhino', ['', '_attack']),
        ...enemyKeys('ancient_beast_king', ['', '_attack']),
        'antidote_gem', ...COMMON_KEYS, 'env_bg_poison'
    ],
    node7: [
        ...PLAYER_KEYS,
        ...enemyKeys('human_genius', ['', '_attack']),
        ...enemyKeys('genius_beast', ['', '_attack']),
        ...enemyKeys('shi_yi_projection', ['', '_attack']),
        ...enemyKeys('huo_linger_projection', ['', '_attack']),
        ...enemyKeys('shi_yi_phantom', ['', '_attack', '_hurt']),
        ...COMMON_KEYS, 'env_bg_tournament'
    ],
    node8: [
        ...PLAYER_KEYS,
        ...enemyKeys('human_genius', ['', '_attack']),
        ...enemyKeys('genius_beast', ['', '_attack']),
        ...enemyKeys('sky_predator', ['', '_attack']),
        ...enemyKeys('ancient_beast_king', ['', '_attack']),
        'portal_ring', ...COMMON_KEYS, 'env_bg_ruins'
    ],
    node9: [
        ...PLAYER_KEYS,
        ...enemyKeys('bandit_cultivator', ['', '_attack']),
        ...enemyKeys('human_genius', ['', '_attack']),
        ...enemyKeys('qiongqi_cub', ['', '_attack']),
        'escort_npc', ...COMMON_KEYS, 'env_bg_escort'
    ],
    node10: [
        ...PLAYER_KEYS,
        ...enemyKeys('rock_golem', ['', '_attack']),
        ...enemyKeys('wild_rhino', ['', '_attack']),
        ...enemyKeys('genius_beast', ['', '_attack']),
        ...enemyKeys('shi_yi_phantom', ['', '_attack']),
        'wall_segment', 'ballista_bolt', ...COMMON_KEYS, 'env_bg_wall'
    ],
    node11: [
        ...PLAYER_KEYS,
        ...enemyKeys('human_genius', ['', '_attack']),
        ...enemyKeys('bandit_cultivator', ['', '_attack']),
        ...enemyKeys('sky_predator', ['', '_attack']),
        ...enemyKeys('huo_linger_projection', ['', '_attack']),
        ...enemyKeys('shi_yi_projection', ['', '_attack']),
        ...enemyKeys('ancient_beast_king', ['', '_attack']),
        ...COMMON_KEYS, 'env_bg_void'
    ],
    node12: [
        ...PLAYER_KEYS,
        ...enemyKeys('shi_yi_phantom', ['', '_walk', '_attack', '_hurt', '_death']),
        ...enemyKeys('ancient_beast_king', ['', '_attack']),
        'boss_projectile', ...COMMON_KEYS, 'env_bg_finale'
    ]
};

const runtimeArtStatus = {
    status: 'idle',
    manifestPath: 'assets/imagegen/manifest.json',
    atlasPath: imagegenManifest.atlasImage,
    atlasTextureKey: ATLAS_TEXTURE_KEY,
    atlasLoaded: false,
    generationStatus: imagegenManifest.generationStatus || 'unknown',
    provenancePath: imagegenManifest.provenancePath || null,
    sourceImage: imagegenManifest.sourceImage || null,
    transparentSourceImage: imagegenManifest.transparentSourceImage || null,
    expectedCount: Object.keys(imagegenManifest.frames || {}).length,
    loadedCount: 0,
    loadedKeys: [],
    fallbackKeys: [],
    missingKeys: [],
    frameKeys: Object.keys(imagegenManifest.frames || {}),
    nodeExpectedTextureKeys: getExpectedNodeTextureKeys(),
    nodeCoverage: {},
    gapSummary: {}
};

function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
}

function cloneStatus(value) {
    return JSON.parse(JSON.stringify(value));
}

function getExpectedNodeTextureKeys() {
    return unique(Object.values(NODE_EXPECTED_TEXTURES).flat());
}

function getNodeCoverage() {
    const frameKeys = new Set(runtimeArtStatus.frameKeys);
    const loadedKeys = new Set(runtimeArtStatus.loadedKeys);
    const fallbackKeys = new Set(runtimeArtStatus.fallbackKeys);
    const missingKeys = new Set(runtimeArtStatus.missingKeys);

    return Object.fromEntries(Object.entries(NODE_EXPECTED_TEXTURES).map(([nodeKey, expectedKeys]) => {
        const atlasFrameKeys = expectedKeys.filter((key) => frameKeys.has(key));
        const loadedAtlasKeys = expectedKeys.filter((key) => loadedKeys.has(key));
        const proceduralFallbackKeys = expectedKeys.filter((key) => fallbackKeys.has(key));
        const missingAtlasKeys = expectedKeys.filter((key) => !frameKeys.has(key));
        const unresolvedKeys = expectedKeys.filter((key) => missingKeys.has(key) && !fallbackKeys.has(key) && !loadedKeys.has(key));

        return [nodeKey, {
            expectedKeys,
            atlasFrameKeys,
            loadedAtlasKeys,
            proceduralFallbackKeys,
            missingAtlasKeys,
            unresolvedKeys,
            atlasCoveragePct: Math.round((atlasFrameKeys.length / Math.max(1, expectedKeys.length)) * 100),
            runtimeResolvedPct: Math.round(((loadedAtlasKeys.length + proceduralFallbackKeys.length) / Math.max(1, expectedKeys.length)) * 100)
        }];
    }));
}

function getGapSummary() {
    const expectedKeys = runtimeArtStatus.nodeExpectedTextureKeys;
    const frameKeys = new Set(runtimeArtStatus.frameKeys);
    const fallbackKeys = new Set(runtimeArtStatus.fallbackKeys);
    const loadedKeys = new Set(runtimeArtStatus.loadedKeys);
    return {
        node1To12ExpectedCount: expectedKeys.length,
        atlasCoveredCount: expectedKeys.filter((key) => frameKeys.has(key)).length,
        loadedAtlasCount: expectedKeys.filter((key) => loadedKeys.has(key)).length,
        proceduralFallbackCount: expectedKeys.filter((key) => fallbackKeys.has(key)).length,
        missingAtlasKeys: expectedKeys.filter((key) => !frameKeys.has(key)),
        proceduralFallbackKeys: expectedKeys.filter((key) => fallbackKeys.has(key)),
        priorityNotes: [
            'Campaign atlas covers player clips, 13 enemy kinds with action frames, 12 chapter backgrounds, and objective props.',
            'Node2-12 production keys are declared in NODE_EXPECTED_TEXTURES and resolved via atlas first.'
        ]
    };
}

function publishRuntimeArtStatus() {
    runtimeArtStatus.loadedCount = runtimeArtStatus.loadedKeys.length;
    runtimeArtStatus.nodeCoverage = getNodeCoverage();
    runtimeArtStatus.gapSummary = getGapSummary();
    if (typeof window !== 'undefined') {
        window.__DAHUANG_ART_PIPELINE__ = cloneStatus(runtimeArtStatus);
    }
}

function resolveAtlasUrl(rawPath) {
    if (!rawPath) return 'assets/imagegen/atlas.png';
    const clean = rawPath.replace(/^\.\//, '');
    if (typeof window !== 'undefined') {
        const wsId = window.__LW_CURRENT_WORKSPACE_ID__ || (window.__DAHUANG_WORKSPACE__?.id);
        const wsPrefix = window.__LOREWEAVER_WORKSPACE_PREFIX__ || (wsId ? `/api/workspaces/${encodeURIComponent(wsId)}/asset-files` : null);
        if (wsPrefix && !clean.startsWith('/') && !clean.startsWith('http')) {
            return `${wsPrefix}/${clean}`;
        }
    }
    if (typeof location !== 'undefined' && location.pathname && location.pathname.includes('/nodes/')) {
        return '../' + clean;
    }
    return clean;
}

export function preloadImagegenAtlas(scene, nodeId = 1) {
    runtimeArtStatus.status = 'loading';
    updateAtlasLoaded(scene);
    publishRuntimeArtStatus();
    const atlasUrl = resolveAtlasUrl(imagegenManifest.atlasImage);
    if (!scene.textures.exists(ATLAS_TEXTURE_KEY)) {
        scene.load.image(ATLAS_TEXTURE_KEY, atlasUrl);
    }
    scene.load.once('complete', () => {
        updateAtlasLoaded(scene);
        if (runtimeArtStatus.atlasLoaded) {
            runtimeArtStatus.status = 'atlas_ready';
            preloadNodeArtKeys(scene, nodeId || scene.nodeConfig?.id || 1, true);
            if (scene.player && scene.textures.exists('shihao_young_runtime')) {
                scene.player.setTexture('shihao_young_runtime');
            }
        }
        publishRuntimeArtStatus();
    });
    scene.load.on('loaderror', (file) => {
        runtimeArtStatus.status = 'error';
        runtimeArtStatus.manifestError = `failed to load ${file?.src || file?.key || 'imagegen atlas'}`;
        publishRuntimeArtStatus();
    });
}

export function createAtlasFrameTexture(scene, frameKey, textureKey = frameKey, forceReplaceFallback = false) {
    updateAtlasLoaded(scene);
    const frame = imagegenManifest.frames?.[frameKey]?.frame;
    if (!frame || !scene.textures.exists(ATLAS_TEXTURE_KEY)) {
        if (!runtimeArtStatus.missingKeys.includes(textureKey)) runtimeArtStatus.missingKeys.push(textureKey);
        publishRuntimeArtStatus();
        return null;
    }
    const sourceImage = scene.textures.get(ATLAS_TEXTURE_KEY).getSourceImage();
    if (!sourceImage) {
        if (!runtimeArtStatus.missingKeys.includes(textureKey)) runtimeArtStatus.missingKeys.push(textureKey);
        publishRuntimeArtStatus();
        return null;
    }
    const isFallback = runtimeArtStatus.fallbackKeys.includes(textureKey);
    if (scene.textures.exists(textureKey) && !forceReplaceFallback && !isFallback) {
        if (!runtimeArtStatus.loadedKeys.includes(textureKey)) runtimeArtStatus.loadedKeys.push(textureKey);
        publishRuntimeArtStatus();
        return textureKey;
    }

    if (scene.textures.exists(textureKey) && (forceReplaceFallback || isFallback)) {
        try {
            scene.textures.remove(textureKey);
        } catch (_) {
            /* resilience */
        }
    }

    try {
        const canvasTexture = scene.textures.createCanvas(textureKey, frame.w, frame.h);
        const ctx = canvasTexture.getContext();
        ctx.clearRect(0, 0, frame.w, frame.h);
        ctx.drawImage(sourceImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
        canvasTexture.refresh();
    } catch (_) {
        if (!runtimeArtStatus.missingKeys.includes(textureKey)) runtimeArtStatus.missingKeys.push(textureKey);
        publishRuntimeArtStatus();
        return null;
    }
    runtimeArtStatus.status = 'loaded';
    if (!runtimeArtStatus.loadedKeys.includes(textureKey)) runtimeArtStatus.loadedKeys.push(textureKey);
    runtimeArtStatus.fallbackKeys = runtimeArtStatus.fallbackKeys.filter((key) => key !== textureKey);
    runtimeArtStatus.missingKeys = runtimeArtStatus.missingKeys.filter((key) => key !== textureKey);
    publishRuntimeArtStatus();
    return textureKey;
}

export function preloadNodeArtKeys(scene, nodeId, forceReplaceFallback = false) {
    const keys = NODE_EXPECTED_TEXTURES[`node${nodeId}`] || NODE_EXPECTED_TEXTURES.node1;
    keys.forEach((key) => {
        try { createAtlasFrameTexture(scene, key, key, forceReplaceFallback); } catch (_) { /* resilience */ }
    });
    return getRuntimeArtStatus();
}

export function getNodeEnvBackgroundKey(nodeId) {
    const map = {
        1: 'env_bg_desert', 2: 'env_bg_cliff', 3: 'env_bg_arena', 4: 'env_bg_tide',
        5: 'env_bg_city', 6: 'env_bg_poison', 7: 'env_bg_tournament', 8: 'env_bg_ruins',
        9: 'env_bg_escort', 10: 'env_bg_wall', 11: 'env_bg_void', 12: 'env_bg_finale'
    };
    return map[nodeId] || 'env_bg_desert';
}

export function recordProceduralFallback(textureKey) {
    if (!runtimeArtStatus.fallbackKeys.includes(textureKey)) {
        runtimeArtStatus.fallbackKeys.push(textureKey);
    }
    publishRuntimeArtStatus();
}

export function getRuntimeArtStatus() {
    publishRuntimeArtStatus();
    return cloneStatus(runtimeArtStatus);
}

export { NODE_EXPECTED_TEXTURES };
