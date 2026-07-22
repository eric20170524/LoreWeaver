/**
 * RuntimeArtBinder — atlas-first art wiring for LoreWeaver gameplay adapters.
 *
 * Contract (docs/contracts/asset_pipeline_contract.md):
 *   atlas first → semantic key lookup → procedural fallback last
 *
 * Installs every frame from an imagegen-style manifest into Phaser textures,
 * then resolves roles (player / enemy / projectile / item / vfx / env …).
 */

const DEFAULT_GLOBAL_STATUS_KEY = '__LOREWEAVER_ART_PIPELINE__';

const SEMANTIC_ALIASES = Object.freeze({
    player: [
        'shihao_young_runtime',
        'player_idle',
        'player',
        'lw_runtime_player_shihao',
        'lw_runtime_player_avatar',
        'hero',
        'protagonist'
    ],
    projectile: [
        'skill_fist_projectile',
        'boss_projectile',
        'lw_skill_fist_projectile',
        'projectile'
    ],
    pickup: [
        'pickup_blood_essence',
        'chest_gold',
        'antidote_gem',
        'lw_pickup_blood_essence',
        'pickup',
        'item'
    ],
    vfx: ['vfx_effect_frame', 'lw_vfx_effect_frame', 'vfx'],
    core: ['core_eye', 'lw_art_core_eye', 'objective_totem', 'lw_art_objective_totem', 'core'],
    escort: ['escort_npc', 'lw_art_escort_npc', 'escort'],
    wall: ['wall_segment', 'lw_art_wall_segment', 'wall'],
    portal: ['portal_ring', 'lw_art_portal_ring', 'portal'],
    ballista: ['ballista_bolt', 'lw_art_ballista_bolt', 'ballista'],
    whirlpool: ['whirlpool', 'lw_art_whirlpool'],
    chest: ['chest_gold', 'lw_art_chest_gold', 'chest'],
    antidote: ['antidote_gem', 'lw_art_antidote_gem', 'antidote']
});

function publishStatus(key, patch) {
    if (typeof globalThis === 'undefined') return patch;
    const prev = globalThis[key] || {};
    const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    globalThis[key] = next;
    return next;
}

function classifyFrameKey(frameKey) {
    const k = String(frameKey || '');
    if (/^player_|^shihao_|^hero_/.test(k)) return 'heroes';
    if (/^enemy_|^boss_/.test(k)) return 'enemies';
    if (/^skill_|^projectile|bolt|bullet/.test(k)) return 'projectiles';
    if (/^pickup_|^item_|^chest_|^antidote/.test(k)) return 'items';
    if (/^vfx_|^fx_/.test(k)) return 'vfx';
    if (/^env_|^bg_|^ground_|^landmark/.test(k)) return 'setpieces';
    if (/^ui_/.test(k)) return 'ui';
    if (/core|totem|objective|portal|wall|escort|whirlpool|ballista/.test(k)) return 'props';
    return 'misc';
}

function textureKeyForFrame(frameKey) {
    // Prefer stable lw_ keys for combat bindings used by GameRunner historically
    const map = {
        shihao_young_runtime: 'lw_runtime_player_shihao',
        player_idle: 'lw_runtime_player_idle',
        enemy_wild_rhino: 'lw_enemy_wild_rhino',
        enemy_green_scaled_eagle: 'lw_enemy_green_scaled_eagle',
        enemy_rock_golem: 'lw_enemy_rock_golem',
        enemy_qiongqi_cub: 'lw_enemy_qiongqi_cub',
        skill_fist_projectile: 'lw_skill_fist_projectile',
        pickup_blood_essence: 'lw_pickup_blood_essence',
        vfx_effect_frame: 'lw_vfx_effect_frame'
    };
    if (map[frameKey]) return map[frameKey];
    if (frameKey.startsWith('enemy_') && !frameKey.includes('_walk') && !frameKey.includes('_attack')
        && !frameKey.includes('_hurt') && !frameKey.includes('_death') && !frameKey.includes('_idle')) {
        return `lw_enemy_${frameKey.replace(/^enemy_/, '')}`;
    }
    return `lw_art_${frameKey}`;
}

export default class RuntimeArtBinder {
    constructor(options = {}) {
        this.statusKey = options.statusKey || DEFAULT_GLOBAL_STATUS_KEY;
        this.atlasTextureKey = options.atlasTextureKey || 'lw_imagegen_combat_atlas';
        this.manifestCacheKey = options.manifestCacheKey || 'lw_imagegen_manifest';
        this.scene = null;
        this.manifest = null;
        this.installed = new Map(); // textureKey -> { frameKey, group, w, h }
        this.frameIndex = new Map(); // frameKey -> textureKey
        this.status = {
            status: 'idle',
            loadedCount: 0,
            expectedCount: 0,
            loadedKeys: [],
            missingKeys: [],
            groups: {},
            frameKeys: []
        };
    }

    /**
     * Queue atlas + manifest loads on a Phaser loader.
     */
    preload(scene, paths = null) {
        if (!scene?.load || !paths) {
            this.status = publishStatus(this.statusKey, {
                status: 'skipped_no_workspace_assets',
                expectedCount: 0,
                loadedCount: 0,
                loadedKeys: [],
                missingKeys: []
            });
            return this;
        }
        this.status = publishStatus(this.statusKey, {
            status: 'loading',
            mode: paths.mode || 'workspace_live',
            manifestPath: paths.manifestPath,
            atlasPath: paths.atlasPath,
            provenancePath: paths.provenancePath || null
        });
        scene.load.json(this.manifestCacheKey, paths.manifestPath);
        scene.load.image(this.atlasTextureKey, paths.atlasPath);
        return this;
    }

    /**
     * Slice all frames from the loaded atlas into individual textures.
     */
    install(scene, paths = null) {
        this.scene = scene;
        if (!paths || !scene?.textures) {
            this.status = publishStatus(this.statusKey, {
                ...this.status,
                status: 'skipped_no_workspace_assets'
            });
            return this.getStatus();
        }

        const manifest = scene.cache?.json?.get?.(this.manifestCacheKey) || this.manifest;
        this.manifest = manifest || {};
        const frames = this.manifest.frames || {};
        const frameKeys = Object.keys(frames);
        const loadedKeys = [];
        const missingKeys = [];
        const groups = {};

        for (const frameKey of frameKeys) {
            const texKey = textureKeyForFrame(frameKey);
            const ok = this.copyFrame(scene, frameKey, texKey, frames[frameKey]);
            if (ok) {
                const group = classifyFrameKey(frameKey);
                this.installed.set(texKey, {
                    frameKey,
                    group,
                    w: frames[frameKey]?.frame?.w || 64,
                    h: frames[frameKey]?.frame?.h || 64
                });
                this.frameIndex.set(frameKey, texKey);
                // also index raw frameKey as alias if different
                if (texKey !== frameKey) this.frameIndex.set(`alias:${frameKey}`, texKey);
                loadedKeys.push(texKey);
                groups[group] = groups[group] || [];
                if (!groups[group].includes(texKey)) groups[group].push(texKey);
            } else {
                missingKeys.push(frameKey);
            }
        }

        // Extra semantic aliases for primary combat keys
        this._linkAlias('shihao_young_runtime', 'lw_runtime_player_avatar');

        this.status = publishStatus(this.statusKey, {
            status: loadedKeys.length > 0 ? 'loaded' : 'error',
            mode: paths.mode || 'workspace_live',
            generatedAtlasStatus: this.manifest.generatedAtlasStatus || 'unknown',
            generationStatus: this.manifest.generationStatus || 'unknown',
            provenancePath: this.manifest.provenancePath || paths.provenancePath || null,
            sourceImage: this.manifest.sourceImage || null,
            expectedCount: frameKeys.length,
            loadedCount: loadedKeys.length,
            loadedKeys,
            missingKeys,
            groups,
            frameKeys,
            binder: 'RuntimeArtBinder'
        });
        return this.getStatus();
    }

    _linkAlias(sourceFrameKey, aliasTextureKey) {
        const src = this.frameIndex.get(sourceFrameKey) || this.frameIndex.get(`alias:${sourceFrameKey}`);
        if (!src || !this.scene?.textures?.exists(src)) return;
        if (this.scene.textures.exists(aliasTextureKey)) return;
        // re-copy under alias if we know frame
        const meta = this.installed.get(src);
        if (!meta) return;
        const frameSpec = this.manifest?.frames?.[meta.frameKey];
        if (this.copyFrame(this.scene, meta.frameKey, aliasTextureKey, frameSpec)) {
            this.installed.set(aliasTextureKey, { ...meta, frameKey: meta.frameKey });
            this.frameIndex.set(aliasTextureKey, aliasTextureKey);
        }
    }

    copyFrame(scene, frameKey, textureKey, frameSpec) {
        const frame = frameSpec?.frame;
        if (!frame || !scene.textures.exists(this.atlasTextureKey)) return false;
        const atlasTexture = scene.textures.get(this.atlasTextureKey);
        const sourceImage = atlasTexture.getSourceImage?.();
        if (!sourceImage) return false;

        try {
            if (scene.textures.exists(textureKey)) {
                scene.textures.remove(textureKey);
            }
            const canvasTexture = scene.textures.createCanvas(textureKey, frame.w, frame.h);
            const ctx = canvasTexture.getContext();
            ctx.clearRect(0, 0, frame.w, frame.h);
            ctx.drawImage(sourceImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
            canvasTexture.refresh();
            return true;
        } catch (error) {
            console.warn('[RuntimeArtBinder] copyFrame failed', frameKey, error);
            return false;
        }
    }

    getStatus() {
        return { ...this.status, installedCount: this.installed.size };
    }

    has(textureOrFrameKey) {
        if (!textureOrFrameKey) return false;
        if (this.scene?.textures?.exists(textureOrFrameKey)) return true;
        const mapped = this.frameIndex.get(textureOrFrameKey)
            || this.frameIndex.get(`alias:${textureOrFrameKey}`);
        return Boolean(mapped && this.scene?.textures?.exists(mapped));
    }

    /**
     * Resolve a texture key for a semantic role or enemy id.
     */
    resolve(roleOrId, options = {}) {
        const clip = options.clip || null; // idle|walk|attack|hurt|death
        const candidates = [];

        if (roleOrId === 'player' || roleOrId === 'hero') {
            if (clip) {
                candidates.push(`player_${clip}`, `player_${clip}_0`, `lw_runtime_player_${clip}`);
            }
            candidates.push(...SEMANTIC_ALIASES.player);
        } else if (roleOrId === 'enemy' || options.enemyId) {
            const id = options.enemyId || options.id || roleOrId;
            const base = String(id).replace(/^enemy_/, '').replace(/^lw_enemy_/, '');
            if (clip) {
                candidates.push(`enemy_${base}_${clip}`, `enemy_${base}_${clip}_0`);
            }
            candidates.push(
                `lw_enemy_${base}`,
                `enemy_${base}`,
                `enemy_${base}_idle`,
                base
            );
        } else if (SEMANTIC_ALIASES[roleOrId]) {
            candidates.push(...SEMANTIC_ALIASES[roleOrId]);
        } else {
            const id = String(roleOrId);
            candidates.push(id, `lw_art_${id}`, `lw_enemy_${id}`, `enemy_${id}`, `player_${id}`);
        }

        if (Array.isArray(options.prefer)) candidates.unshift(...options.prefer);

        for (const key of candidates) {
            if (this.scene?.textures?.exists(key)) return key;
            const mapped = this.frameIndex.get(key) || this.frameIndex.get(`alias:${key}`);
            if (mapped && this.scene?.textures?.exists(mapped)) return mapped;
        }
        return options.fallback || null;
    }

    /**
     * List texture keys for a clip (player multi-frame or enemy single/multi).
     */
    resolveClipKeys(roleOrId, clip = 'walk', options = {}) {
        const keys = [];
        const push = (k) => {
            if (k && this.scene?.textures?.exists(k) && !keys.includes(k)) keys.push(k);
        };
        const resolveFrame = (frameKey) => {
            if (this.scene?.textures?.exists(frameKey)) return frameKey;
            const mapped = this.frameIndex.get(frameKey);
            if (mapped && this.scene?.textures?.exists(mapped)) return mapped;
            const lw = textureKeyForFrame(frameKey);
            if (this.scene?.textures?.exists(lw)) return lw;
            return null;
        };

        if (roleOrId === 'player' || roleOrId === 'hero') {
            for (let i = 0; i < 8; i += 1) {
                push(resolveFrame(`player_${clip}_${i}`));
            }
            push(resolveFrame(`player_${clip}`));
            // idle fallback chain
            if (clip === 'idle') {
                push(this.resolve('player'));
                push(resolveFrame('player_idle'));
            }
            if (clip === 'walk' && keys.length < 2) {
                push(resolveFrame('player_idle'));
                push(resolveFrame('player_walk_0'));
                push(resolveFrame('player_walk_1'));
            }
            return keys;
        }

        const id = String(options.enemyId || roleOrId || '')
            .replace(/^enemy_/, '')
            .replace(/^lw_enemy_/, '');
        // Prefer explicit clip frames, then numbered, then base
        push(resolveFrame(`enemy_${id}_${clip}`));
        for (let i = 0; i < 4; i += 1) {
            push(resolveFrame(`enemy_${id}_${clip}_${i}`));
        }
        if (clip === 'idle' || clip === 'walk') {
            push(resolveFrame(`enemy_${id}`));
            push(resolveFrame(`enemy_${id}_idle`));
            push(this.resolve('enemy', { enemyId: id }));
        }
        // For attack/hurt/death with only one frame, pair with idle for a 2-frame blink
        if (keys.length === 1 && clip !== 'idle') {
            const idle = resolveFrame(`enemy_${id}_idle`) || resolveFrame(`enemy_${id}`) || this.resolve('enemy', { enemyId: id });
            if (idle && idle !== keys[0]) keys.unshift(idle);
        }
        return keys;
    }

    /**
     * Register a Phaser animation from clip keys if possible.
     * @returns {string|null} animation key
     */
    ensureAnimation(scene, animKey, textureKeys, config = {}) {
        if (!scene?.anims || !Array.isArray(textureKeys) || textureKeys.length === 0) return null;
        const existing = scene.anims.exists?.(animKey) || scene.anims.get?.(animKey);
        if (existing) return animKey;

        const frames = textureKeys
            .filter((k) => scene.textures.exists(k))
            .map((key) => ({ key }));
        if (!frames.length) return null;

        // Single-frame "anim" still useful for setTexture switching
        if (frames.length === 1) {
            this._singleFrameAnims = this._singleFrameAnims || new Set();
            this._singleFrameAnims.add(animKey);
            this._animFrameMap = this._animFrameMap || new Map();
            this._animFrameMap.set(animKey, frames[0].key);
            return animKey;
        }

        try {
            scene.anims.create({
                key: animKey,
                frames,
                frameRate: config.frameRate || (frames.length <= 2 ? 6 : 10),
                repeat: config.repeat == null ? -1 : config.repeat
            });
            return animKey;
        } catch (error) {
            console.warn('[RuntimeArtBinder] ensureAnimation failed', animKey, error);
            return null;
        }
    }

    /**
     * Ensure and play a role/clip animation on a sprite.
     */
    playClip(sprite, roleOrId, clip = 'walk', options = {}) {
        if (!sprite || !this.scene) return null;
        const enemyId = options.enemyId || (roleOrId !== 'player' && roleOrId !== 'hero' ? roleOrId : null);
        const keys = this.resolveClipKeys(
            roleOrId === 'player' || roleOrId === 'hero' ? 'player' : (enemyId || roleOrId),
            clip,
            { enemyId }
        );
        const animKey = options.animKey
            || `lw_${roleOrId === 'player' || roleOrId === 'hero' ? 'player' : `enemy_${enemyId}`}_${clip}`;

        const ensured = this.ensureAnimation(this.scene, animKey, keys, {
            frameRate: options.frameRate,
            repeat: options.repeat
        });
        if (!ensured) return null;

        // single-frame: just set texture
        if (this._singleFrameAnims?.has(animKey)) {
            const tex = this._animFrameMap.get(animKey);
            if (tex && sprite.setTexture) {
                sprite.setTexture(tex);
                sprite.setData?.('artClip', clip);
                sprite.setData?.('artAnim', animKey);
            }
            return animKey;
        }

        if (sprite.play && this.scene.anims.exists(animKey)) {
            const current = sprite.anims?.currentAnim?.key;
            if (current !== animKey || !sprite.anims?.isPlaying) {
                sprite.play(animKey, true);
            }
            sprite.setData?.('artClip', clip);
            sprite.setData?.('artAnim', animKey);
        }
        return animKey;
    }

    /**
     * Create a tiled / stretched environment background from env_* frames.
     */
    createBackground(scene, options = {}) {
        const width = options.width || scene.scale.width;
        const height = options.height || scene.scale.height;
        const container = scene.add.container(0, 0).setDepth(options.depth ?? -10);

        const envKey = options.envKey
            || this.resolveEnvKey(options.nodeId, options.prefer)
            || null;

        const bgTex = envKey && scene.textures.exists(envKey) ? envKey : null;
        if (bgTex) {
            // Stretch primary bg
            const bg = scene.add.image(width / 2, height / 2, bgTex);
            const scale = Math.max(width / Math.max(bg.width, 1), height / Math.max(bg.height, 1));
            bg.setScale(scale * 1.05);
            bg.setAlpha(options.alpha ?? 0.55);
            container.add(bg);
        } else {
            const g = scene.add.graphics();
            g.fillGradientStyle(0x020617, 0x020617, 0x0f172a, 0x0b1220, 1);
            g.fillRect(0, 0, width, height);
            container.add(g);
        }

        // Optional ground / landmark deco
        const ground = this.resolve('env_ground_patch', { prefer: ['env_ground_patch', 'lw_art_env_ground_patch'] })
            || (scene.textures.exists('lw_art_env_ground_patch') ? 'lw_art_env_ground_patch' : null)
            || (scene.textures.exists(textureKeyForFrame('env_ground_patch')) ? textureKeyForFrame('env_ground_patch') : null);
        const groundKey = this._existing([
            this.frameIndex.get('env_ground_patch'),
            textureKeyForFrame('env_ground_patch'),
            'env_ground_patch'
        ], scene);
        if (groundKey) {
            for (let i = 0; i < 5; i += 1) {
                const patch = scene.add.image(
                    (width * (i + 0.5)) / 5,
                    height * 0.82 + (i % 2) * 12,
                    groundKey
                ).setAlpha(0.35).setScale(1.2);
                container.add(patch);
            }
        }

        const rockKey = this._existing([
            this.frameIndex.get('env_landmark_rock'),
            textureKeyForFrame('env_landmark_rock'),
            'env_landmark_rock'
        ], scene);
        if (rockKey && options.landmarks !== false) {
            const rock = scene.add.image(width * 0.18, height * 0.7, rockKey).setAlpha(0.4).setScale(1.4);
            const rock2 = scene.add.image(width * 0.86, height * 0.65, rockKey).setAlpha(0.32).setScale(1.1).setFlipX(true);
            container.add(rock);
            container.add(rock2);
        }

        container.setData?.('envKey', envKey || 'procedural');
        container.setData?.('artSource', envKey ? 'atlas' : 'procedural');
        return container;
    }

    resolveEnvKey(nodeId, prefer = null) {
        if (Array.isArray(prefer)) {
            for (const p of prefer) {
                const k = this._existing([p, textureKeyForFrame(p), this.frameIndex.get(p)], this.scene);
                if (k) return k;
            }
        }
        const id = Number(String(nodeId || '').replace(/\D/g, '')) || 0;
        const table = [
            'env_bg_desert', 'env_bg_cliff', 'env_bg_arena', 'env_bg_tide',
            'env_bg_city', 'env_bg_poison', 'env_bg_tournament', 'env_bg_ruins',
            'env_bg_escort', 'env_bg_wall', 'env_bg_void', 'env_bg_finale'
        ];
        const pick = table[(Math.max(id, 1) - 1) % table.length] || table[0];
        return this._existing([
            this.frameIndex.get(pick),
            textureKeyForFrame(pick),
            pick,
            'lw_art_env_bg_desert'
        ], this.scene);
    }

    _existing(candidates, scene) {
        for (const k of candidates) {
            if (k && scene?.textures?.exists(k)) return k;
        }
        return null;
    }

    /**
     * Create a sprite using atlas art when available, else invoke fallbackFactory.
     */
    createSprite(scene, roleOrId, options = {}) {
        const textureKey = this.resolve(roleOrId, options);
        if (textureKey && scene.textures.exists(textureKey)) {
            const sprite = scene.add.sprite(options.x || 0, options.y || 0, textureKey);
            if (options.displaySize) sprite.setDisplaySize(options.displaySize, options.displaySize);
            if (options.displayWidth) sprite.setDisplaySize(options.displayWidth, options.displayHeight || options.displayWidth);
            if (options.depth != null) sprite.setDepth(options.depth);
            sprite.setData('artSource', 'atlas');
            sprite.setData('artKey', textureKey);
            sprite.setData('artRole', roleOrId);
            if (options.clip) {
                this.playClip(sprite, roleOrId, options.clip, {
                    enemyId: options.enemyId,
                    frameRate: options.frameRate,
                    repeat: options.repeat
                });
            }
            return sprite;
        }
        if (typeof options.fallbackFactory === 'function') {
            const node = options.fallbackFactory(scene, options);
            if (node?.setData) {
                node.setData('artSource', 'fallback');
                node.setData('artRole', roleOrId);
            }
            return node;
        }
        // last resort circle
        const color = options.color || 0x94a3b8;
        const r = options.radius || 14;
        const circle = scene.add.circle(options.x || 0, options.y || 0, r, color, 1);
        circle.setData?.('artSource', 'primitive');
        circle.setData?.('artRole', roleOrId);
        return circle;
    }

    /**
     * Build a lightweight art context object for adapters.
     */
    createContext(scene = this.scene) {
        const binder = this;
        // ensure binder.scene points at active scene for anims
        if (scene) binder.scene = scene;
        return {
            binder,
            status: () => binder.getStatus(),
            has: (key) => binder.has(key),
            resolve: (role, opts) => binder.resolve(role, opts),
            resolveClipKeys: (role, clip, opts) => binder.resolveClipKeys(role, clip, opts),
            ensureAnimation: (animKey, keys, cfg) => binder.ensureAnimation(scene, animKey, keys, cfg),
            playClip: (sprite, role, clip, opts) => binder.playClip(sprite, role, clip, opts),
            createSprite: (role, opts) => binder.createSprite(scene, role, opts),
            createBackground: (opts) => binder.createBackground(scene, opts),
            resolveEnvKey: (nodeId, prefer) => binder.resolveEnvKey(nodeId, prefer),
            playerKey: () => binder.resolve('player'),
            enemyKey: (id, clip) => binder.resolve('enemy', { enemyId: id, clip }),
            projectileKey: () => binder.resolve('projectile'),
            pickupKey: () => binder.resolve('pickup'),
            vfxKey: () => binder.resolve('vfx'),
            propKey: (name) => binder.resolve(name, {
                prefer: [name, `lw_art_${name}`, textureKeyForFrame(name)]
            })
        };
    }
}

export {
    DEFAULT_GLOBAL_STATUS_KEY,
    SEMANTIC_ALIASES,
    textureKeyForFrame,
    classifyFrameKey
};
