// systems/NodeBridge.js
// 主干↔Node 通信协议封装 - 转换为 ES Modules

import { ABILITY_CATALOG, NODE_REGISTRY } from '../js/data.js';
import store from '../js/store.js';
import { normalizeNodeResult, RESULT_REASONS } from '../js/save-contract.js';

export class NodeBridge {
    static createAttemptId(nodeId) {
        const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        return `node-${nodeId}:${nonce}`;
    }

    static launchNode(scene, nodeId) {
        const nodeConfig = NODE_REGISTRY.find(n => n.id === nodeId);
        if (!nodeConfig) {
            console.error(`Node ${nodeId} not found!`);
            return;
        }

        // 检查境界要求
        const currentRealm = store.get('progression.realm');
        if (currentRealm < nodeConfig.realmRequired) {
            console.warn(`需要境界 ${nodeConfig.realmRequired} 才能进入此节点`);
            return false;
        }

        const data = {
            nodeId: nodeId,
            nodeConfig: nodeConfig,
            playerStats: store.getEffectiveStats(),
            playerPerks: store.getUnlockedPerks(),
            playerAbilities: store.getUnlockedAbilities(),
            availableSkillPool: store.getAvailableSkillPool(nodeConfig.skillTierAvailable, nodeConfig),
            skillTier: nodeConfig.skillTierAvailable,
            attemptId: this.createAttemptId(nodeId),
            previousFirstClear: store.get(`saveVersion2.firstClear.${nodeId}`) || null
        };

        // 停止挂机引擎（如果需要）
        if (scene.idleEngine) {
            scene.idleEngine.stop();
        }

        // 启动对应的 Scene
        scene.scene.start(nodeConfig.sceneClass, data);
        return true;
    }

    static getUnlocks(nodeConfig, success) {
        if (!success) return { nodes: [], abilities: [], flags: [] };
        const configured = nodeConfig.unlocksOnSuccess || nodeConfig.loreweaver?.unlocksOnSuccess || {};
        const fallbackNode = nodeConfig.id < 12 ? nodeConfig.id + 1 : null;
        return {
            nodes: Array.isArray(configured.nodes) && configured.nodes.length > 0 ? configured.nodes : (fallbackNode ? [fallbackNode] : []),
            abilities: Array.isArray(configured.abilities) ? configured.abilities : (nodeConfig.planning?.rewardUnlocks || []),
            flags: Array.isArray(configured.flags) ? configured.flags : []
        };
    }

    static createNodeResult(nodeScene, { success, reason = null, rewards = {}, failureReason = null } = {}) {
        const nodeConfig = nodeScene.nodeConfig || {};
        const resolvedReason = reason || (success ? RESULT_REASONS.COMPLETED : RESULT_REASONS.FAILED);
        const unlocks = this.getUnlocks(nodeConfig, success && resolvedReason === RESULT_REASONS.COMPLETED);
        const attemptId = nodeScene.attemptId || this.createAttemptId(nodeConfig.id);
        const activeSkills = (nodeScene.activeSkills || []).map(skill => ({ id: skill.id, level: skill.level }));
        const duration = nodeScene.surviveTime || 0;
        const stars = success ? Math.min(3, 1 + (duration <= (nodeConfig.duration || duration) ? 1 : 0) + ((nodeScene.kills || 0) >= 25 ? 1 : 0)) : 0;
        return normalizeNodeResult({
            resultId: attemptId,
            attemptId,
            nodeId: nodeConfig.id,
            reason: resolvedReason,
            success,
            duration,
            kills: nodeScene.kills || 0,
            stars,
            rewards,
            lootLog: nodeScene.lootLog || [],
            abilityUnlocks: unlocks.abilities,
            unlockNodes: unlocks.nodes,
            unlockNextNode: unlocks.nodes[0] || null,
            flags: unlocks.flags,
            failureReason,
            buildSnapshot: {
                activeSkills,
                playerPerks: [...(nodeScene.playerPerks || [])],
                playerAbilities: [...(nodeScene.playerAbilities || [])],
                playerStats: { ...(nodeScene.playerStats || {}) }
            }
        }, { knownAbilityIds: new Set(ABILITY_CATALOG.map(ability => ability.id)) });
    }

    static settleResult(result) {
        const application = store.applyNodeResult(result);
        return { ...application.result, settlement: { ...application, result: undefined } };
    }

    static returnToMain(scene, result) {
        const settled = this.settleResult(result);
        
        // 切换回主干
        scene.scene.start('MainScene', { lastNodeResult: settled });
        return settled;
    }

    static isNodeOnCooldown(nodeId) {
        const cooldowns = store.get('nodeCooldowns');
        if (cooldowns && cooldowns[nodeId]) {
            return Date.now() < cooldowns[nodeId];
        }
        return false;
    }
}

NodeBridge.RESULT_REASONS = RESULT_REASONS;

export default NodeBridge;
window.NodeBridge = NodeBridge; // Bind to window for global access in testing
