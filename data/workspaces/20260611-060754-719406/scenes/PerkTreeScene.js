// scenes/PerkTreeScene.js
// 参悟骨文被动技能树场景 - 转换为 ES Modules

import store from '../js/store.js';
import UIHelper from '../utils/UIHelper.js';

export class PerkTreeScene extends Phaser.Scene {
    constructor() {
        super('PerkTreeScene');
    }

    create() {
        const width = 720;
        const height = 1280;

        this.add.rectangle(0, 0, width, height, 0x111111).setOrigin(0, 0);

        this.add.text(width / 2, 80, '参悟骨文 (被动技能树)', { fontSize: '36px', fill: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);

        this.resourceText = this.add.text(width / 2, 140, `狻猊骨文: ${store.get('resources.suanBoneScript')}`, { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);

        const backBtn = this.add.text(width / 2, height - 100, '返回大荒', {
            fontSize: '28px', fill: '#ffffff', backgroundColor: '#444444', padding: {x:30, y:15}
        }).setOrigin(0.5).setInteractive();

        backBtn.on('pointerdown', () => {
            this.scene.start('MainScene');
        });
        backBtn.on('pointerover', () => backBtn.setStyle({ fill: '#ffd700' }));
        backBtn.on('pointerout', () => backBtn.setStyle({ fill: '#ffffff' }));

        this.drawTree();
    }

    drawTree() {
        const tree = store.get('perks.tree');
        const unlocked = store.get('perks.unlocked');
        
        let startY = 300;
        const tiers = ['tier1', 'tier2', 'tier3'];
        
        tiers.forEach((tier, tIndex) => {
            const perks = tree[tier];
            const spacing = 720 / (perks.length + 1);
            const cardWidth = Math.min(168, spacing - 12);
            
            perks.forEach((perk, pIndex) => {
                const x = spacing * (pIndex + 1);
                const y = startY + tIndex * 200;
                
                const isUnlocked = unlocked.includes(perk.id);
                const canUnlock = !isUnlocked && (!perk.requires || unlocked.includes(perk.requires));
                
                let color = 0x333333;
                if (isUnlocked) color = 0x006400;
                else if (canUnlock) color = 0x8b8b00;

                const card = this.add.rectangle(x, y, cardWidth, 112, color).setInteractive();
                card.setStrokeStyle(2, 0xaaaaaa);
                
                this.add.text(x, y - 30, perk.name, {
                    fontSize: '15px',
                    fill: '#ffffff',
                    fontStyle: 'bold',
                    align: 'center',
                    wordWrap: { width: cardWidth - 12, useAdvancedWrap: true }
                }).setOrigin(0.5);
                this.add.text(x, y + 8, perk.uiCopy || perk.description || perk.name, {
                    fontSize: '13px',
                    fill: '#dddddd',
                    align: 'center',
                    wordWrap: { width: cardWidth - 12, useAdvancedWrap: true }
                }).setOrigin(0.5);
                this.add.text(x, y + 38, isUnlocked ? '已解锁' : `${perk.cost} 骨文`, { fontSize: '13px', fill: '#aaaaaa' }).setOrigin(0.5);

                if (canUnlock) {
                    card.on('pointerover', () => card.setStrokeStyle(4, 0xffffff));
                    card.on('pointerout', () => card.setStrokeStyle(2, 0xaaaaaa));
                    card.on('pointerdown', () => {
                        if (store.spendResource('suanBoneScript', perk.cost)) {
                            unlocked.push(perk.id);
                            store.set('perks.unlocked', unlocked);
                            this.scene.restart();
                        } else {
                            UIHelper.showFloatText(this, this.cameras.main.centerX, this.cameras.main.centerY, "狻猊骨文不足！", "#ff0000");
                        }
                    });
                }
            });
        });
    }
}

export default PerkTreeScene;
