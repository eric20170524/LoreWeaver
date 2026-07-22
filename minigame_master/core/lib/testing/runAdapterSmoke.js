/**
 * Headless adapter smoke helpers (enter / spawnOrProgress / retreat).
 * Used by workflow/scripts/run_node_smoke.mjs and unit tests.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMockPhaser } from './MockPhaserScene.js';
import { validatePlayabilityContract } from '../contracts/PlayabilityContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GP_ROOT = path.resolve(__dirname, '../gameplay');

function load(rel) {
    return async () =>
        (await import(pathToFileURL(path.join(GP_ROOT, rel)).href)).default;
}

export const ADAPTER_LOADERS = {
    survivor_horde: load('survivor_horde/SurvivorHordeAdapter.js'),
    rhythm_timing: load('tap_reaction/TapReactionAdapter.js'),
    tap_reaction: load('tap_reaction/TapReactionAdapter.js'),
    drag_collect_grid: load('collect_dodge/CollectDodgeAdapter.js'),
    collect_dodge: load('collect_dodge/CollectDodgeAdapter.js'),
    turn_based_skill_battle: load('turn_based_skill_battle/TurnBasedSkillBattleAdapter.js'),
    sequence_synthesis: load('sequence_synthesis/SequenceSynthesisAdapter.js'),
    energy_balance: load('energy_balance/EnergyBalanceAdapter.js'),
    pressure_survival: load('pressure_survival/PressureSurvivalAdapter.js'),
    reaction_pick: load('reaction_pick/ReactionPickAdapter.js'),
    observe_capture: load('observe_capture/ObserveCaptureAdapter.js'),
    shooter_duel: load('shooter_duel/ShooterDuelAdapter.js'),
    drag_to_core: load('drag_to_core/DragToCoreAdapter.js'),
    dodge_counter_boss: load('dodge_counter_boss/DodgeCounterBossAdapter.js'),
    maze_exploration_choice: load('maze_exploration_choice/MazeExplorationChoiceAdapter.js'),
    platform_escape: load('platform_escape/PlatformEscapeAdapter.js'),
    hazard_collect_waves: load('hazard_collect_waves/HazardCollectWavesAdapter.js'),
    sequence_puzzle_combo: load('sequence_puzzle_combo/SequencePuzzleComboAdapter.js'),
    rhythm_then_pickup: load('rhythm_then_pickup/RhythmThenPickupAdapter.js'),
    qix_area_capture: load('qix_area_capture/QixAreaCaptureAdapter.js'),
    point_drag_progression: load('point_drag_progression/PointDragProgressionAdapter.js'),
    rune_connect_sequence: load('rune_connect_sequence/RuneConnectSequenceAdapter.js'),
    branching_dialogue_check: load('branching_dialogue_check/BranchingDialogueCheckAdapter.js'),
    side_scrolling_brawler: load('side_scrolling_brawler/SideScrollingBrawlerAdapter.js')
};

export function defaultCardIdForNode(node = {}) {
    return node.gameplay?.cardId || node.mechanics || '';
}

/**
 * @param {object} node campaign node
 * @param {object} [opts]
 * @param {number} [opts.wallMs=3000]
 * @param {number} [opts.simulatedSec=10]
 */
export async function smokeAdapter(node, opts = {}) {
    const wallMs = opts.wallMs ?? 3000;
    const simulatedSec = opts.simulatedSec ?? 10;
    const cardId = defaultCardIdForNode(node);
    const knobs = node.gameplay?.knobs || {};
    const contract = validatePlayabilityContract(cardId, knobs, node);

    const result = {
        cardId,
        enter: false,
        spawnOrProgress: false,
        retreat: false,
        noCrash: true,
        ms: 0,
        errors: [],
        owners: [],
        contractIssues: contract.issues,
        warnings: contract.warnings,
        note: ''
    };

    if (cardId === 'node_iframe_microgame') {
        result.enter = true;
        result.spawnOrProgress = true;
        result.retreat = true;
        result.note = 'iframe: contract-only';
        return result;
    }

    const hardFail = contract.issues.some((i) => i.owner === 'gameplay' || i.owner === 'code');
    if (hardFail) {
        result.errors.push('skipped_runtime_due_to_contract');
        result.owners.push(...contract.issues.map((i) => i.owner));
        return result;
    }

    const loader = ADAPTER_LOADERS[cardId];
    if (!loader) {
        result.noCrash = false;
        result.errors.push(`no_adapter_loader:${cardId}`);
        result.owners.push('code');
        return result;
    }

    const t0 = Date.now();
    let onEndResult = null;
    const mock = createMockPhaser();

    try {
        const AdapterClass = await loader();
        const adapter = new AdapterClass({
            Phaser: mock.Phaser,
            testHooks: { update() {} },
            onEnd: (r) => {
                onEndResult = r;
            },
            spawnParticles() {}
        });

        const payload = {
            id: node.id,
            nodeId: `node_${node.id}`,
            nodeConfig: {
                duration: knobs.timeLimitSec || knobs.durationSec || node.durationLimit || 30,
                rewards: {
                    score: knobs.needAmount || knobs.collectGoal || knobs.goalValue || node.goalValue || 15
                },
                goalValue: knobs.needAmount || knobs.goalValue || node.goalValue,
                gameplay: {
                    cardId,
                    knobs: { ...knobs, cardId }
                }
            },
            playerStats: { hp: 100 }
        };

        adapter.init(payload);
        adapter.create(mock.scene);
        result.enter = true;

        const tickMs = 50;
        const targetSim = simulatedSec * 1000;
        let sim = 0;
        while (sim < targetSim && Date.now() - t0 < wallMs) {
            mock.tick(tickMs);
            adapter.update?.(sim, tickMs);
            sim += tickMs;
            const st = adapter.getTestState?.() || {};
            if (
                mock.entityCount() > 0 ||
                (typeof st.score === 'number' && st.score > 0) ||
                (typeof st.spawnedTotal === 'number' && st.spawnedTotal > 0) ||
                (typeof st.fallers === 'number' && st.fallers > 0) ||
                st.timer != null
            ) {
                result.spawnOrProgress = true;
            }
            if (result.spawnOrProgress && sim >= 500) break;
        }

        if (!result.spawnOrProgress) {
            for (const fn of [
                'spawnFallingItem',
                'spawnEnemy',
                'spawnOrb',
                'spawnWave',
                'spawnHazard',
                'spawnTarget'
            ]) {
                if (typeof adapter[fn] === 'function') {
                    try {
                        adapter[fn]();
                    } catch {
                        /* ignore */
                    }
                }
            }
            mock.tick(100);
            const st2 = adapter.getTestState?.() || {};
            if (
                mock.entityCount() > 0 ||
                (typeof st2.spawnedTotal === 'number' && st2.spawnedTotal > 0) ||
                (adapter.status === 'running' && mock.timers.some((t) => !t.removed))
            ) {
                result.spawnOrProgress = true;
            }
            if (
                !result.spawnOrProgress &&
                adapter.status === 'running' &&
                [
                    'turn_based_skill_battle',
                    'branching_dialogue_check',
                    'sequence_synthesis',
                    'rhythm_timing'
                ].includes(cardId)
            ) {
                result.spawnOrProgress = true;
                result.note = 'ui_progress';
            }
        }

        const allowQuit = knobs.allowQuit !== false && knobs.shellRetreat !== false;
        if (allowQuit) {
            onEndResult = null;
            if (typeof adapter.retreat === 'function') {
                const r = adapter.retreat();
                const reason = r?.reason || onEndResult?.reason;
                if (reason === 'retreated' || onEndResult?.reason === 'retreated') {
                    result.retreat = true;
                } else if (onEndResult && onEndResult.success === false) {
                    result.retreat = true;
                }
            }
            if (!result.retreat) {
                result.errors.push('retreat_no_onEnd');
                result.owners.push('code');
            }
        } else {
            result.retreat = true;
            result.note = (result.note || '') + 'quit_disabled';
        }

        if (!result.spawnOrProgress) {
            result.errors.push('no_spawn_or_progress');
            result.owners.push('code');
        }
    } catch (e) {
        result.noCrash = false;
        result.errors.push(String(e?.stack || e?.message || e));
        result.owners.push('code');
    }

    result.ms = Date.now() - t0;
    return result;
}

export default { ADAPTER_LOADERS, smokeAdapter, defaultCardIdForNode };
