import WebAudioSynth from '../audio/WebAudioSynth.js';

class ButtonBuilder {
    /**
     * 创建一个标准化的交互按钮，自带果汁感动效（缩放）和音效
     * 严格遵循 7_RULES_AND_BUGS.md：为 Container 正确设置物理尺寸与交互区
     * 
     * @param {Phaser.Scene} scene 
     * @param {number} x 
     * @param {number} y 
     * @param {string} text 
     * @param {function} onClick Callback
     * @param {object} config 样式与行为配置
     * @returns {Phaser.GameObjects.Container} 返回生成的按钮容器
     */
    static create(scene, x, y, text, onClick, config = {}) {
        const {
            width = 200,
            height = 80,
            color = 0x4CAF50,
            textColor = '#ffffff',
            fontSize = '32px',
            radius = 16,
            enabled = true
        } = config;

        const container = scene.add.container(x, y);

        // 1. 绘制背景 (Graphics)
        const bg = scene.add.graphics();
        bg.fillStyle(enabled ? color : 0x888888, 1);
        // 为了让 Container 的中心点在 (x,y)，绘制时偏移 -width/2, -height/2
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
        container.add(bg);

        // 2. 添加文本
        const textObj = scene.add.text(0, 0, text, {
            fontSize: fontSize,
            fontFamily: 'Arial Black',
            color: textColor,
            align: 'center'
        });
        textObj.setOrigin(0.5);
        container.add(textObj);

        if (!enabled) {
            container.setAlpha(0.7);
            return container;
        }

        // 3. 核心坑点：为 Container 设置确切尺寸和交互区 (防穿透与精确判定)
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        // 4. 绑定交互与果汁感 (Juice)
        container.on('pointerdown', () => {
            WebAudioSynth.playClick();
            scene.tweens.add({
                targets: container,
                scaleX: 0.9,
                scaleY: 0.9,
                duration: 50,
                ease: 'Linear'
            });
        });

        const resetScale = () => {
            scene.tweens.add({
                targets: container,
                scaleX: 1.0,
                scaleY: 1.0,
                duration: 100,
                ease: 'Back.easeOut'
            });
        };

        container.on('pointerup', () => {
            resetScale();
            if (onClick) onClick();
        });

        container.on('pointerout', resetScale);

        return container;
    }
}

export default ButtonBuilder;
