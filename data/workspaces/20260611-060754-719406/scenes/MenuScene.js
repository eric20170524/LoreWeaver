// scenes/MenuScene.js
// 菜单场景 - 转换为 ES Modules

import AudioManager from '../utils/AudioManager.js';
import UIHelper from '../utils/UIHelper.js';
import store from '../js/store.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const width = 720;
        const height = 1280;

        // 初始化音频
        AudioManager.init();

        // 标题
        this.add.text(width / 2, height / 3, '星渊试炼·荒域觉醒', {
            fontSize: '48px',
            fill: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 开始按钮
        const startBtn = this.add.text(width / 2, height / 2 + 50, '进入荒域', {
            fontSize: '32px',
            fill: '#ffffff',
            backgroundColor: '#8b0000',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        startBtn.on('pointerdown', () => {
            AudioManager.playClick();
            this.scene.start('MainScene');
        });

        startBtn.on('pointerover', () => {
            startBtn.setStyle({ fill: '#ffd700' });
        });

        startBtn.on('pointerout', () => {
            startBtn.setStyle({ fill: '#ffffff' });
        });
        
        // 玩法说明按钮
        const helpBtn = this.add.text(width / 2, height / 2 + 150, '玩法说明', {
            fontSize: '24px',
            fill: '#ffffff',
            backgroundColor: '#444444',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        helpBtn.on('pointerdown', () => {
            AudioManager.playClick();
            this.showHelpModal(width, height);
        });

        helpBtn.on('pointerover', () => {
            helpBtn.setStyle({ fill: '#ffd700' });
        });

        helpBtn.on('pointerout', () => {
            helpBtn.setStyle({ fill: '#ffffff' });
        });
        
        // 重置存档按钮 (测试用)
        const resetBtn = this.add.text(width / 2, height / 2 + 250, '重置轮回', {
            fontSize: '20px',
            fill: '#aaaaaa'
        }).setOrigin(0.5).setInteractive();
        
        UIHelper.bindButtonBounce(resetBtn, () => {
            UIHelper.showConfirmModal(
                this, 
                "重置轮回", 
                "确定要重置所有进度吗？\n当前存档会保留版本化备份。", 
                () => {
                    store.reset();
                    UIHelper.showFloatText(this, width / 2, height / 2, "进度已重置", "#00ff00");
                }
            );
        });
    }

    showHelpModal(width, height) {
        // 使用至尊金边框和荒域深褐背景，微调高度至 860 以确保空间充裕
        const modalBg = this.add.rectangle(width/2, height/2, 620, 860, 0x0c0905, 0.95).setDepth(100);
        modalBg.setStrokeStyle(4, 0xffd700);
        
        const title = this.add.text(width/2, height/2 - 380, '【 玩法说明 】', { fontSize: '32px', fill: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(101);
        
        const helpText = `
【 核心玩法 】
1. 挂机打坐：主界面挂机自动积累【气血精华】。
2. 开启洞天：消耗精华开启洞天，获得丰厚基础属性。
3. 突破境界：十洞天开满后进行突破，解锁更高难关卡。
4. 历练割草：进入荒域关卡，体验限时极简化肉鸽割草。
5. 参悟骨文：击败Boss夺取【雷吼骨文】与【纯血】，于技能树解锁强效被动。

【 战斗操作 】
• 移动：按住并拖拽/滑动屏幕任意位置，指引星骁走位。
• 宝术：角色自动索敌并施展已觉醒的雷吼金纹、裂雷指。
• 升级：拾取凶兽精魄（经验球），升级时可参悟升级宝术。
• 胜利：在限时内坚韧生存，并击败降临的终极关卡Boss！

【 境界与挑战 】
• 搬血境 ➔ 荒域历练 (Boss: 吞天雀虚影)
• 洞天境 ➔ 千崖秘径 (Boss: 千崖兽王)
• 化灵境 ➔ 镜魄试炼场 (Boss: 玄曜虚影)
• 铭纹境 ➔ 天潮巢 (Boss: 潮汐尊影)
• 列阵境 ➔ 双星决战 (Boss: 玄曜)
        `;
        
        // 缩减字号至 16px，lineSpacing 为 6，以获得完美的垂直排版，防溢出和重叠
        const content = this.add.text(width/2, height/2 - 10, helpText.trim(), { 
            fontSize: '16px', 
            fill: '#e5d9c8', 
            align: 'left',
            wordWrap: { width: 540, useAdvancedWrap: true },
            lineSpacing: 6
        }).setOrigin(0.5).setDepth(101);
        
        const closeBtn = this.add.text(width/2, height/2 + 370, '关闭', { 
            fontSize: '24px', 
            fill: '#0f0b07', 
            backgroundColor: '#ffd700', 
            padding: { x: 40, y: 10 },
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive().setDepth(101);
        
        closeBtn.on('pointerdown', () => {
            AudioManager.playClick();
            modalBg.destroy();
            title.destroy();
            content.destroy();
            closeBtn.destroy();
        });
    }
}

export default MenuScene;
