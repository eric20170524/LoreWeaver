// scenes/GameOverScene.js
// 结算场景 - 转换为 ES Modules

import NodeBridge from '../systems/NodeBridge.js';
import { ABILITY_CATALOG } from '../js/data.js';

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    create(data) {
        data = NodeBridge.settleResult(data);
        this.result = data;
        const width = 720;
        const height = 1280;

        const title = data.success ? "历练成功" : "历练失败";
        const color = data.success ? "#00ff00" : "#ff0000";

        this.add.text(width / 2, height / 3, title, {
            fontSize: '48px',
            fill: color,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        let y = height / 2 - 20;
        this.add.text(width / 2, y, `存活时间: ${data.duration}秒`, { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);
        y += 40;
        this.add.text(width / 2, y, `击杀数: ${data.kills}`, { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);
        y += 40;

        if (!data.success && data.failureReason) {
            this.add.text(width / 2, y, `战败原因: ${data.failureReason}`, { fontSize: '22px', fill: '#ff4444', fontStyle: 'bold' }).setOrigin(0.5);
            y += 40;
        }
        
        let rewardStr = data.settlement.replayed ? "奖励状态: 已结算" : "获得奖励: ";
        const nameMap = {
            bloodEssence: "气血精华",
            suanBoneScript: "狻猊骨文",
            pureBlood: "纯血宝血"
        };
        let rewardTextLines = [];
        if (!data.settlement.replayed && data.settlement.rewardsApplied && data.rewards) {
            for (const [k, v] of Object.entries(data.rewards)) {
                if (v > 0) {
                    const displayName = nameMap[k] || k;
                    rewardTextLines.push(`${displayName} x${v}`);
                }
            }
        }
        if (data.settlement.replayed) {
            // The persisted settlement is authoritative on a replayed result screen.
        } else if (rewardTextLines.length > 0) {
            rewardStr += rewardTextLines.join("   ");
        } else {
            rewardStr += "暂无";
        }
        this.add.text(width / 2, y, rewardStr, { fontSize: '20px', fill: '#ffd700' }).setOrigin(0.5);
        y += 42;

        const unlocks = data.abilityUnlocks || [];
        if (data.success && data.settlement.firstClear && unlocks.length > 0) {
            const abilityNames = unlocks.map(abilityId => ABILITY_CATALOG.find(ability => ability.id === abilityId)?.name || abilityId);
            this.add.text(width / 2, y, `新悟宝术: ${abilityNames.join('、')}`, {
                fontSize: '22px',
                fill: '#80ffea',
                fontStyle: 'bold',
                wordWrap: { width: 620, useAdvancedWrap: true },
                align: 'center'
            }).setOrigin(0.5);
            y += 42;
        }

        // 渲染实时掉落日志
        if (data.lootLog && data.lootLog.length > 0) {
            this.add.text(width / 2, y, "--- 蛮兽气血掉落日志 ---", { fontSize: '18px', fill: '#8f8171' }).setOrigin(0.5);
            y += 30;
            const recentLogs = data.lootLog.slice(-5); // 展示最近5行
            recentLogs.forEach(log => {
                this.add.text(width / 2, y, log, { fontSize: '16px', fill: '#bbbbbb' }).setOrigin(0.5);
                y += 24;
            });
        }

        const backBtn = this.add.text(width / 2, height - 100, '返回大荒', {
            fontSize: '32px',
            fill: '#ffffff',
            backgroundColor: '#44',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        backBtn.on('pointerdown', () => {
            backBtn.disableInteractive();
            NodeBridge.returnToMain(this, this.result);
        });
    }
}

export default GameOverScene;
