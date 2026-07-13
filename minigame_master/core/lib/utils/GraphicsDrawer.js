import Colors from './Colors.js';

export default class GraphicsDrawer {
    /**
     * 绘制随机星星背景
     * @param {Phaser.GameObjects.Graphics} graphics 
     * @param {number} width 区域宽度
     * @param {number} height 区域高度
     * @param {number} count 星星数量
     * @param {number} color 颜色
     * @param {number} alpha 透明度
     */
    static drawRandomStars(graphics, width, height, count = 50, color = 0xffffff, alpha = 0.5) {
        graphics.fillStyle(color, alpha);
        for(let i=0; i<count; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const r = Math.random() * 2 + 1; // 1 to 3
            graphics.fillCircle(x, y, r);
        }
    }

    /**
     * 绘制五角星
     */
    static drawStar(graphics, x, y, points, outerRadius, innerRadius, color, alpha = 1) {
        graphics.fillStyle(color, alpha);
        graphics.beginPath();
        
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            
            if (i === 0) {
                graphics.moveTo(px, py);
            } else {
                graphics.lineTo(px, py);
            }
        }
        
        graphics.closePath();
        graphics.fillPath();
    }
    
    /**
     * 绘制篮子
     */
    static drawBasket(graphics, x, y, width, height) {
        // 篮子主体
        // Ensure Colors.BASKET_BROWN exists, otherwise fallback
        const brown = Colors.BASKET_BROWN !== undefined ? Colors.BASKET_BROWN : 0x8B4513;
        const light = Colors.BASKET_LIGHT !== undefined ? Colors.BASKET_LIGHT : 0xCD853F;

        graphics.fillStyle(brown, 1);
        graphics.fillRect(x - width / 2, y, width, height);
        
        // 篮子边缘高光
        graphics.fillStyle(light, 0.6);
        graphics.fillRect(x - width / 2, y, width, height * 0.2);
        
        // 篮子纹理线条
        graphics.lineStyle(2, light, 0.4);
        for (let i = 0; i < 5; i++) {
            const lineX = x - width / 2 + (width / 5) * i;
            graphics.beginPath();
            graphics.moveTo(lineX, y);
            graphics.lineTo(lineX, y + height);
            graphics.strokePath();
        }
    }
    
    /**
     * 绘制罐子
     */
    static drawJar(graphics, x, y, width, height) {
        // 罐子主体
        graphics.fillStyle(0x87ceeb, 0.3);
        graphics.fillRoundedRect(x - width / 2, y, width, height, 10);
        
        // 罐子边框
        graphics.lineStyle(3, 0x4682b4, 0.8);
        graphics.strokeRoundedRect(x - width / 2, y, width, height, 10);
        
        // 罐子口
        graphics.fillStyle(0x4682b4, 0.6);
        graphics.fillRoundedRect(x - width / 2, y - 15, width, 15, 5);
    }
    
    /**
     * 绘制发光效果
     */
    static drawGlow(graphics, x, y, radius, color, alpha = 0.3) {
        for (let i = 3; i > 0; i--) {
            graphics.fillStyle(color, alpha / i);
            graphics.fillCircle(x, y, radius * (1 + i * 0.2));
        }
    }

    /**
     * 绘制圆角矩形按钮背景
     */
    static drawButtonBg(graphics, width, height, color = 0x333333) {
        graphics.fillStyle(color, 1);
        graphics.fillRoundedRect(-width/2, -height/2, width, height, 16);
        graphics.lineStyle(4, 0xFFFFFF, 1);
        graphics.strokeRoundedRect(-width/2, -height/2, width, height, 16);
        // 底部阴影效果
        graphics.fillStyle(0x000000, 0.2);
        graphics.fillRoundedRect(-width/2, height/2 - 5, width, 10, 8);
    }

    /**
     * 绘制岛屿图标
     */
    static drawIslandIcon(graphics, x, y, color) {
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x, y, 40);
        graphics.lineStyle(4, 0xFFFFFF, 0.8);
        graphics.strokeCircle(x, y, 40);
        
        // 简单的阴影
        graphics.fillStyle(0x000000, 0.2);
        graphics.fillEllipse(x, y + 35, 60, 15);
    }
}
