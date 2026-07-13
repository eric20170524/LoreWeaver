// utils/AnimalFactory.js
import Colors from './Colors.js';

class AnimalFactory {
    constructor(scene, phaser) {
        this.scene = scene;
        this.Phaser = phaser;
    }

    createBalloon(x, y, scale = 1) {
        const container = this.scene.add.container(x, y);
        container.setScale(scale);

        const g = this.scene.add.graphics();
        
        // 绳子
        g.lineStyle(2, 0x8B4513);
        g.beginPath();
        g.moveTo(-15, -10); g.lineTo(-10, 30);
        g.moveTo(15, -10); g.lineTo(10, 30);
        g.strokePath();

        // 篮子
        g.fillStyle(Colors.BASKET || 0x8B4513);
        g.fillRoundedRect(-12, 30, 24, 20, 4);

        // 气球主体
        g.fillStyle(Colors.ACCENT || 0xFF6B6B);
        g.fillCircle(0, -20, 35);
        g.fillStyle(0xFFFFFF, 0.3); // 高光
        g.fillCircle(-10, -30, 8);

        container.add(g);
        
        // 简单交互区域
        container.setSize(70, 90);
        container.setInteractive(new this.Phaser.Geom.Rectangle(-35, -55, 70, 90), this.Phaser.Geom.Rectangle.Contains);
        
        return container;
    }

    createStar(value) {
        const container = this.scene.add.container(0, 0);
        
        const g = this.scene.add.graphics();
        g.fillStyle(Colors.STAR_YELLOW || 0xFFD700, 1);
        g.lineStyle(3, 0xFFA500, 1);
        
        // 画五角星
        const points = 5;
        const outer = 30;
        const inner = 15;
        g.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const r = i % 2 === 0 ? outer : inner;
            g.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        g.closePath();
        g.fillPath();
        g.strokePath();
        
        if (value !== undefined) {
            const text = this.scene.add.text(0, 0, value, {
                fontSize: '24px',
                fontFamily: 'Arial',
                color: '#333333',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            container.add([g, text]);
        } else {
            container.add(g);
        }
        
        container.setSize(60, 60);
        
        // 交互区域
        const zone = this.scene.add.zone(0, 0, 60, 60);
        container.add(zone);
        
        return container;
    }

    createAnimal(type, x, y) {
        const container = this.scene.add.container(x, y);

        switch (type) {
            case 'rabbit':
                this.drawRabbit(container);
                container.setData('hitArea', new this.Phaser.Geom.Rectangle(-25, -55, 50, 100));
                break;
            case 'bird':
                this.drawBird(container);
                container.setData('hitArea', new this.Phaser.Geom.Rectangle(-28, -38, 56, 68));
                break;
            case 'squirrel':
                this.drawSquirrel(container);
                container.setData('hitArea', new this.Phaser.Geom.Rectangle(-26, -55, 61, 89));
                break;
        }

        return container;
    }

    drawRabbit(container) {
        const g = this.scene.add.graphics();

        // 身体
        g.fillStyle(0xf5f5f5, 1);
        g.fillEllipse(0, 10, 35, 45);

        // 头
        g.fillCircle(0, -20, 25);

        // 耳朵
        g.fillEllipse(-12, -40, 8, 30);
        g.fillEllipse(12, -40, 8, 30);
        g.fillStyle(0xffb6c1, 1);
        g.fillEllipse(-12, -38, 5, 20);
        g.fillEllipse(12, -38, 5, 20);

        // 眼睛
        g.fillStyle(0x000000, 1);
        g.fillCircle(-8, -22, 3);
        g.fillCircle(8, -22, 3);

        // 鼻子
        g.fillStyle(0xff69b4, 1);
        g.fillCircle(0, -15, 4);

        // 脚
        g.fillStyle(0xf5f5f5, 1);
        g.fillEllipse(-15, 40, 12, 8);
        g.fillEllipse(15, 40, 12, 8);

        container.add(g);
    }

    drawBird(container) {
        const g = this.scene.add.graphics();

        // 身体
        g.fillStyle(0x4fc3f7, 1);
        g.fillEllipse(0, 0, 30, 35);

        // 头
        g.fillCircle(0, -20, 18);

        // 眼睛
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-6, -22, 5);
        g.fillCircle(6, -22, 5);
        g.fillStyle(0x000000, 1);
        g.fillCircle(-6, -22, 3);
        g.fillCircle(6, -22, 3);

        // 嘴巴
        g.fillStyle(0xff9800, 1);
        g.beginPath();
        g.moveTo(0, -15);
        g.lineTo(-8, -10);
        g.lineTo(8, -10);
        g.closePath();
        g.fillPath();

        // 翅膀
        g.fillStyle(0x29b6f6, 1);
        g.fillEllipse(-20, 0, 15, 25);
        g.fillEllipse(20, 0, 15, 25);

        // 尾巴
        g.beginPath();
        g.moveTo(0, 15);
        g.lineTo(-10, 30);
        g.lineTo(0, 25);
        g.lineTo(10, 30);
        g.closePath();
        g.fillPath();

        container.add(g);
    }

    drawSquirrel(container) {
        const g = this.scene.add.graphics();

        // 尾巴（背后）
        g.fillStyle(0xd84315, 1);
        const tailPath = new this.Phaser.Curves.Path(15, -10);
        tailPath.add(new this.Phaser.Curves.QuadraticBezier(tailPath.getEndPoint(), new this.Phaser.Math.Vector2(35, -30), new this.Phaser.Math.Vector2(25, -50)));
        tailPath.add(new this.Phaser.Curves.QuadraticBezier(tailPath.getEndPoint(), new this.Phaser.Math.Vector2(15, -55), new this.Phaser.Math.Vector2(10, -45)));
        tailPath.add(new this.Phaser.Curves.QuadraticBezier(tailPath.getEndPoint(), new this.Phaser.Math.Vector2(20, -25), new this.Phaser.Math.Vector2(10, -5)));
        tailPath.closePath();
        g.fillPath(tailPath);

        // 身体
        g.fillStyle(0xff6f00, 1);
        g.fillEllipse(0, 5, 28, 35);

        // 头
        g.fillCircle(0, -20, 20);

        // 耳朵
        g.beginPath();
        g.moveTo(-15, -35);
        g.lineTo(-12, -45);
        g.lineTo(-8, -35);
        g.closePath();
        g.fillPath();

        g.beginPath();
        g.moveTo(15, -35);
        g.lineTo(12, -45);
        g.lineTo(8, -35);
        g.closePath();
        g.fillPath();

        // 眼睛
        g.fillStyle(0x000000, 1);
        g.fillCircle(-7, -22, 4);
        g.fillCircle(7, -22, 4);

        // 鼻子
        g.fillStyle(0x5d4037, 1);
        g.fillCircle(0, -15, 3);

        // 肚子
        g.fillStyle(0xffcc80, 1);
        g.fillEllipse(0, 10, 18, 25);

        // 手
        g.fillStyle(0xff6f00, 1);
        g.fillCircle(-18, 0, 8);
        g.fillCircle(18, 0, 8);

        // 脚
        g.fillEllipse(-10, 30, 10, 8);
        g.fillEllipse(10, 30, 10, 8);

        container.add(g);
    }
}