// scenes/AbilityCodexScene.js
// 宝术图鉴：展示 LoreWeaver 宝术目录、解锁状态与运行时技能映射

import store from '../js/store.js';
import UIHelper from '../utils/UIHelper.js';
import { ABILITY_CATALOG, NODE_ABILITY_PLANS, SKILL_POOL_REGISTRY } from '../js/data.js';

const SKILL_NAME_BY_ID = Object.fromEntries(
    Object.values(SKILL_POOL_REGISTRY)
        .flat()
        .map(skill => [skill.id, skill.name])
);

export class AbilityCodexScene extends Phaser.Scene {
    constructor() {
        super('AbilityCodexScene');
    }

    create() {
        this.width = 720;
        this.height = 1280;
        this.currentPage = 0;
        this.itemsPerPage = 4;

        this.add.rectangle(0, 0, this.width, this.height, 0x0c0905).setOrigin(0, 0);
        this.add.text(this.width / 2, 60, '宝术图鉴', {
            fontSize: '38px',
            fill: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.summaryText = this.add.text(this.width / 2, 112, '', {
            fontSize: '18px',
            fill: '#80ffea',
            align: 'center',
            wordWrap: { width: 640, useAdvancedWrap: true }
        }).setOrigin(0.5);

        this.cardContainer = this.add.container(0, 0);
        this.renderPage();

        const backBtn = this.add.text(this.width / 2, this.height - 72, '返回大荒', {
            fontSize: '28px',
            fill: '#ffffff',
            backgroundColor: '#444444',
            padding: { x: 28, y: 12 }
        }).setOrigin(0.5).setInteractive();

        UIHelper.bindButtonBounce(backBtn, () => {
            this.scene.start('MainScene');
        });
    }

    getUnlockNodeLabel(abilityId) {
        const entry = Object.entries(NODE_ABILITY_PLANS)
            .find(([, plan]) => (plan.rewardUnlocks || []).includes(abilityId));
        if (!entry) {
            if (abilityId === 'he_hua_zizai') return '终极血战临时开放';
            return '主线初始';
        }
        return `Node ${entry[0]} 通关`;
    }

    renderPage() {
        this.cardContainer.removeAll(true);
        const unlocked = new Set(store.getUnlockedAbilities());
        const unlockedCount = ABILITY_CATALOG.filter(ability => unlocked.has(ability.id)).length;
        this.summaryText.setText(`已悟 ${unlockedCount} / ${ABILITY_CATALOG.length} · 通关节点会按 LoreWeaver rewardUnlocks 追加宝术`);

        const start = this.currentPage * this.itemsPerPage;
        const pageItems = ABILITY_CATALOG.slice(start, start + this.itemsPerPage);

        pageItems.forEach((ability, index) => {
            const isUnlocked = unlocked.has(ability.id);
            const y = 190 + index * 218;
            const bgColor = isUnlocked ? 0x123b36 : 0x252525;
            const strokeColor = isUnlocked ? 0x80ffea : 0x666666;

            const card = this.add.rectangle(this.width / 2, y, 620, 184, bgColor, 0.95);
            card.setStrokeStyle(2, strokeColor);
            this.cardContainer.add(card);

            const title = this.add.text(70, y - 70, `${isUnlocked ? '已悟' : '未悟'} · ${ability.name}`, {
                fontSize: '28px',
                fill: isUnlocked ? '#80ffea' : '#aaaaaa',
                fontStyle: 'bold'
            });
            this.cardContainer.add(title);

            const desc = this.add.text(70, y - 32, ability.description, {
                fontSize: '20px',
                fill: '#f3ead7',
                wordWrap: { width: 570, useAdvancedWrap: true }
            });
            this.cardContainer.add(desc);

            const runtimeNames = ability.runtimeSkillIds
                .map(skillId => SKILL_NAME_BY_ID[skillId] || skillId)
                .join(' / ');
            const skillText = this.add.text(70, y + 24, `运行时技能: ${runtimeNames}`, {
                fontSize: '18px',
                fill: '#d4d4d4',
                wordWrap: { width: 570, useAdvancedWrap: true }
            });
            this.cardContainer.add(skillText);

            const unlockText = this.add.text(70, y + 62, `解锁: ${this.getUnlockNodeLabel(ability.id)}`, {
                fontSize: '18px',
                fill: isUnlocked ? '#c7f9e9' : '#888888'
            });
            this.cardContainer.add(unlockText);
        });

        const totalPages = Math.ceil(ABILITY_CATALOG.length / this.itemsPerPage);
        const pageY = this.height - 145;
        const pageText = this.add.text(this.width / 2, pageY, `${this.currentPage + 1} / ${totalPages}`, {
            fontSize: '18px',
            fill: '#aaaaaa'
        }).setOrigin(0.5);
        this.cardContainer.add(pageText);

        if (this.currentPage > 0) {
            const prevBtn = this.add.text(this.width / 2 - 120, pageY, '上一页', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#555555',
                padding: { x: 12, y: 6 }
            }).setOrigin(0.5).setInteractive();
            UIHelper.bindButtonBounce(prevBtn, () => {
                this.currentPage--;
                this.renderPage();
            });
            this.cardContainer.add(prevBtn);
        }

        if (this.currentPage < totalPages - 1) {
            const nextBtn = this.add.text(this.width / 2 + 120, pageY, '下一页', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#555555',
                padding: { x: 12, y: 6 }
            }).setOrigin(0.5).setInteractive();
            UIHelper.bindButtonBounce(nextBtn, () => {
                this.currentPage++;
                this.renderPage();
            });
            this.cardContainer.add(nextBtn);
        }
    }
}

export default AbilityCodexScene;
