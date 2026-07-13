import VoiceManager from '../systems/VoiceManager.js';
import GraphicsDrawer from '../utils/GraphicsDrawer.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const { width, height } = this.scale;

        // Generic Background
        const starsGraphics = this.add.graphics();
        GraphicsDrawer.drawRandomStars(starsGraphics, width, height);

        // Title (Generic)
        this.add.text(width / 2, height * 0.3, 'Game Title', {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#FFD700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Start Button
        this.createButton(width / 2, height * 0.6, 'Start Game', () => {
             VoiceManager.init(); // Initialize audio context
             VoiceManager.playClick();
             this.scene.start('PlayScene');
        });
    }

    createButton(x, y, text, callback) {
        const btnContainer = this.add.container(x, y);
        
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0xff0055, 1);
        btnBg.fillRoundedRect(-100, -30, 200, 60, 15);
        btnContainer.add(btnBg);

        const btnText = this.add.text(0, 0, text, {
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        btnContainer.add(btnText);

        btnBg.setInteractive(new Phaser.Geom.Rectangle(-100, -30, 200, 60), Phaser.Geom.Rectangle.Contains);
        
        btnBg.on('pointerdown', () => {
            this.tweens.add({
                targets: btnContainer,
                scale: 0.9,
                duration: 100,
                yoyo: true,
                onComplete: callback
            });
        });
    }
}