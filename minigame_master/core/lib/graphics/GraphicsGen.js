class GraphicsGen {
    /**
     * 生成基础圆角矩形背景 (用于 UI 卡片、弹窗底板等)
     * 会将生成的纹理缓存，避免重复渲染
     * 
     * @param {Phaser.Scene} scene 
     * @param {string} key 缓存的 Texture Key
     * @param {number} width 
     * @param {number} height 
     * @param {number} radius 圆角大小
     * @param {number} color 填充颜色
     * @param {number} strokeColor 边框颜色 (可选)
     */
    static generateRoundedRect(scene, key, width, height, radius = 16, color = 0x333333, strokeColor = null) {
        if (scene.textures.exists(key)) return;

        const g = scene.add.graphics();
        g.fillStyle(color, 1);
        
        if (strokeColor !== null) {
            g.lineStyle(4, strokeColor, 1);
            g.fillRoundedRect(2, 2, width - 4, height - 4, radius);
            g.strokeRoundedRect(2, 2, width - 4, height - 4, radius);
        } else {
            g.fillRoundedRect(0, 0, width, height, radius);
        }

        g.generateTexture(key, width, height);
        g.destroy();
    }

    /**
     * 生成渐变色背景 (常用于天空、深海等氛围背景)
     * Phaser 的 Graphics 暂不支持原生的线性渐变填充，此方法通过逐行绘制线条模拟
     * 
     * @param {Phaser.Scene} scene 
     * @param {string} key 
     * @param {number} width 
     * @param {number} height 
     * @param {number} topColor 
     * @param {number} bottomColor 
     */
    static generateGradient(scene, key, width, height, topColor, bottomColor) {
        if (scene.textures.exists(key)) return;

        const g = scene.add.graphics();
        // 取颜色分量
        const tr = (topColor >> 16) & 255, tg = (topColor >> 8) & 255, tb = topColor & 255;
        const br = (bottomColor >> 16) & 255, bg = (bottomColor >> 8) & 255, bb = bottomColor & 255;

        // 为保证性能，步长为 4 像素
        const step = 4;
        for (let y = 0; y < height; y += step) {
            const ratio = y / height;
            const r = Math.round(tr + (br - tr) * ratio);
            const g_val = Math.round(tg + (bg - tg) * ratio);
            const b = Math.round(tb + (bb - tb) * ratio);
            const color = (r << 16) | (g_val << 8) | b;
            
            g.fillStyle(color, 1);
            g.fillRect(0, y, width, step);
        }

        g.generateTexture(key, width, height);
        g.destroy();
    }

    /**
     * 生成星星/光斑纹理 (用于特效爆发或氛围粒子)
     * 包含外层半透明光晕和内层实心圆
     * 
     * @param {Phaser.Scene} scene 
     * @param {string} key 
     * @param {number} radius 
     * @param {number} color 
     */
    static generateGlowParticle(scene, key, radius = 16, color = 0xffffff) {
        if (scene.textures.exists(key)) return;

        const size = radius * 2;
        const g = scene.add.graphics();
        
        // 外发光
        g.fillStyle(color, 0.3);
        g.fillCircle(radius, radius, radius);
        // 内核心
        g.fillStyle(0xffffff, 1);
        g.fillCircle(radius, radius, radius * 0.4);

        g.generateTexture(key, size, size);
        g.destroy();
    }

    /**
     * 绘制通用的多边形 (多用于绘制属性雷达图、特殊符文阵等)
     * 这个方法不生成贴图，而是直接在传入的 graphics 对象上绘制
     */
    static drawPolygon(graphics, x, y, radius, sides, color, angleOffset = 0) {
        graphics.fillStyle(color, 1);
        graphics.beginPath();
        
        for (let i = 0; i < sides; i++) {
            const angle = angleOffset + (Math.PI * 2 * i) / sides;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        
        graphics.closePath();
        graphics.fillPath();
    }
}

export default GraphicsGen;
