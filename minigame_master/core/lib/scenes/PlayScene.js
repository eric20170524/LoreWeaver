import VoiceManager from '../systems/VoiceManager.js';
import InteractionHelper from '../utils/InteractionHelper.js';
import GraphicsDrawer from '../utils/GraphicsDrawer.js';
import ParticleSystem from '../systems/ParticleSystem.js';

export default class PlayScene extends Phaser.Scene {
    constructor() {
        super('PlayScene');
    }

    create() {
        const { width, height } = this.scale;
        
        const starsGraphics = this.add.graphics();
        GraphicsDrawer.drawRandomStars(starsGraphics, width, height);
        this.particleSystem = new ParticleSystem(this);

        this.add.text(width / 2, 50, 'Generic Play Scene', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);

        // Demo Object
        const demoObj = this.add.circle(width / 2, height / 2, 40, 0x00ff00);
        
        InteractionHelper.setupDraggable(this, demoObj, 
            () => {
                VoiceManager.playDrag();
            },
            () => {
                VoiceManager.playCorrect();
                this.particleSystem.createSuccessParticles(demoObj.x, demoObj.y);
            }
        );

        this.add.text(width / 2, height * 0.8, 'Drag the circle!', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
    }
}