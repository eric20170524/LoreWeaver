// scenes/LevelUpScene.js
// 升级三选一技能选择场景 - 转换为 ES Modules

export class LevelUpScene extends Phaser.Scene {
    constructor() {
        super('LevelUpScene');
    }

    create(data) {
        // 强制置顶，防止被并行的 Node UI 场景遮挡
        this.scene.bringToTop();

        this.parentScene = data.parent;
        const choices = data.choices || [];

        // 自动选择技能（测试环境下自动选择以防卡死测试）
        const isTestEnv = typeof window !== 'undefined' && 
                          (window.navigator.userAgent.includes('Headless') || 
                           window.navigator.webdriver ||
                           window.StoreTesting);
        if (isTestEnv && choices && choices.length > 0) {
            this.time.delayedCall(500, () => {
                if (this.scene.isActive('LevelUpScene')) {
                    const skill = choices[0];
                    this.scene.resume(this.parentScene.scene.key);
                    this.parentScene.onSkillSelected(skill);
                    this.scene.stop();
                }
            });
        }

        const width = 720;
        const height = 1280;

        // 半透明背景
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);

        this.add.text(width / 2, height / 4, '境界提升！选择一项已悟宝术', {
            fontSize: '36px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        if (choices.length === 0) {
            const continueBtn = this.add.text(width / 2, height / 2, '暂无可选宝术，继续历练', {
                fontSize: '26px',
                fill: '#ffffff',
                backgroundColor: '#444444',
                padding: { x: 20, y: 12 }
            }).setOrigin(0.5).setInteractive();

            continueBtn.on('pointerdown', () => {
                this.scene.resume(this.parentScene.scene.key);
                this.parentScene.onSkillSelected(null);
                this.scene.stop();
            });
            return;
        }

        const cardWidth = 200;
        const cardHeight = 280;
        const spacing = 20;
        
        // 分两行显示以防溢出 (如果是多于3个)，但在本游戏中通常是选3个，所以一行居中
        const totalWidth = choices.length * cardWidth + (choices.length - 1) * spacing;
        const startX = (width - totalWidth) / 2 + cardWidth / 2;

        choices.forEach((skill, index) => {
            const x = startX + index * (cardWidth + spacing);
            const y = height / 2;
            const activeSkill = this.parentScene.activeSkills?.find(item => item.id === skill.id);
            const actionText = activeSkill ? `升级到 Lv.${activeSkill.level + 1}` : '新悟宝术';

            const card = this.add.rectangle(x, y, cardWidth, cardHeight, 0x333333).setInteractive();
            card.setStrokeStyle(2, 0xaaaaaa);

            this.add.text(x, y - 106, actionText, {
                fontSize: '20px',
                fill: activeSkill ? '#80ffea' : '#ffd700',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add.text(x, y - 64, skill.icon, { fontSize: '56px' }).setOrigin(0.5);
            this.add.text(x, y, skill.name, {
                fontSize: '24px',
                fill: '#ffffff',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 24, useAdvancedWrap: true },
                align: 'center'
            }).setOrigin(0.5);
            this.add.text(x, y + 42, skill.description, { 
                fontSize: '18px', 
                fill: '#aaaaaa', 
                wordWrap: { width: cardWidth - 24, useAdvancedWrap: true }, 
                align: 'center' 
            }).setOrigin(0.5);

            // 悬停效果
            card.on('pointerover', () => {
                card.setStrokeStyle(4, 0xffd700);
                card.fillColor = 0x444444;
            });
            card.on('pointerout', () => {
                card.setStrokeStyle(2, 0xaaaaaa);
                card.fillColor = 0x333333;
            });
            
            // 点击选择
            card.on('pointerdown', () => {
                this.scene.resume(this.parentScene.scene.key);
                this.parentScene.onSkillSelected(skill);
                this.scene.stop();
            });
        });
    }
}

export default LevelUpScene;
