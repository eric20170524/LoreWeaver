export default class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
    }

    createSuccessParticles(x, y) {
        const colors = [0x4CAF50, 0x8BC34A, 0xCDDC39, 0xFFEB3B];
        
        for (let i = 0; i < 20; i++) {
            const particle = this.scene.add.graphics();
            const color = Phaser.Utils.Array.GetRandom(colors);
            const size = Phaser.Math.Between(5, 15);
            
            particle.fillStyle(color, 1);
            particle.fillCircle(0, 0, size);
            particle.setPosition(x, y);

            const angle = Phaser.Math.Between(0, 360);
            const speed = Phaser.Math.Between(100, 300);
            const vx = Math.cos(angle * Math.PI / 180) * speed;
            const vy = Math.sin(angle * Math.PI / 180) * speed;

            this.scene.tweens.add({
                targets: particle,
                x: x + vx * 0.5,
                y: y + vy * 0.5,
                alpha: 0,
                duration: 800,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }

    createCelebrationParticles(x, y) {
        const colors = [0xFFD700, 0xFFA500, 0xFF6B35, 0xFF1744];
        
        for (let i = 0; i < 50; i++) {
            const particle = this.scene.add.graphics();
            const color = Phaser.Utils.Array.GetRandom(colors);
            const size = Phaser.Math.Between(8, 20);
            
            particle.fillStyle(color, 1);
            particle.fillCircle(0, 0, size);
            particle.setPosition(x, y);

            const angle = Phaser.Math.Between(0, 360);
            const speed = Phaser.Math.Between(150, 400);
            const vx = Math.cos(angle * Math.PI / 180) * speed;
            const vy = Math.sin(angle * Math.PI / 180) * speed - 200;

            this.scene.tweens.add({
                targets: particle,
                x: x + vx * 0.8,
                y: y + vy * 0.8,
                alpha: 0,
                scaleX: 0.5,
                scaleY: 0.5,
                duration: 1500,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }
}