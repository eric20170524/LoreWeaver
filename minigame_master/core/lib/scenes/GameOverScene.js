import GraphicsDrawer from '../utils/GraphicsDrawer.js';

export default class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    create() {
        const { width, height } = this.scale;
        
        const starsGraphics = this.add.graphics();
        GraphicsDrawer.drawRandomStars(starsGraphics, width, height);

        this.add.text(width/2, height*0.3, 'Game Over', {
            fontSize: '64px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Restart Button
        const btn = this.add.text(width/2, height*0.7, 'Restart', {
            fontSize: '40px',
            color: '#FFD700',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        btn.on('pointerdown', () => {
            this.scene.start('MenuScene');
        });
    }
}
