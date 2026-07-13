export default class AchievementScene extends Phaser.Scene {
    constructor() {
        super({ key: 'AchievementScene' });
    }

    create() {
        const { width, height } = this.scale;

        // 背景
        const bg = this.add.graphics();
        bg.fillGradientStyle(0xffd700, 0xffa500, 0xff8c00, 0xff4500, 1);
        bg.fillRect(0, 0, width, height);

        // 标题
        const title = this.add.text(width / 2, 300, '🏆 终极成就！ 🏆', {
            fontSize: '80px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#c76a00',
            strokeThickness: 8,
            align: 'center'
        });
        title.setOrigin(0.5);

        // 副标题
        const subtitle = this.add.text(width / 2, 450, '恭喜你，完成了所有挑战！\n你已经成为真正的分类大师！', {
            fontSize: '36px',
            color: '#ffffff',
            align: 'center'
        });
        subtitle.setOrigin(0.5);
        
        // 返回首页按钮
        this.createButton(width / 2, 800, '返回首页', () => {
            this.cameras.main.fade(300);
            this.time.delayedCall(300, () => {
                this.scene.start('MenuScene');
            });
        });

        // 入场动画
        this.cameras.main.fadeIn(500);
        
        // 撒花效果
        this.createConfetti();
    }

    createButton(x, y, text, callback) {
        const button = this.add.container(x, y);

        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1);
        bg.fillRoundedRect(-200, -50, 400, 100, 50);
        bg.lineStyle(5, '#c76a00', 1);
        bg.strokeRoundedRect(-200, -50, 400, 100, 50);
        
        const label = this.add.text(0, 0, text, {
            fontSize: '48px',
            color: '#c76a00',
            fontStyle: 'bold'
        });
        label.setOrigin(0.5);

        button.add([bg, label]);
        button.setSize(400, 100);

        const zone = this.add.zone(x, y, 400, 100).setInteractive();

        zone.on('pointerdown', () => button.setScale(0.95));
        zone.on('pointerup', () => {
            button.setScale(1);
            callback();
        });
        zone.on('pointerover', () => this.tweens.add({ targets: button, scale: 1.05, duration: 100 }));
        zone.on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 100 }));

        return button;
    }
    
    createConfetti() {
        const colors = [0xffe400, 0xffa500, 0xff4500, 0xffffff];
        for (let i = 0; i < 200; i++) {
            const confetti = this.add.graphics();
            const color = Phaser.Utils.Array.GetRandom(colors);
            const size = Phaser.Math.Between(5, 15);
            
            confetti.fillStyle(color, 1);
            confetti.fillRect(0, 0, size, size);
            confetti.x = Phaser.Math.Between(0, this.scale.width);
            confetti.y = Phaser.Math.Between(-this.scale.height, 0);
            confetti.rotation = Phaser.Math.DEG_TO_RAD * Phaser.Math.Between(0, 360);

            this.tweens.add({
                targets: confetti,
                y: this.scale.height + size,
                rotation: confetti.rotation + Phaser.Math.Between(-3, 3),
                duration: Phaser.Math.Between(4000, 8000),
                ease: 'Linear',
                loop: -1,
                delay: i * 20
            });
        }
    }
}
