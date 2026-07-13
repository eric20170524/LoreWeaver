class InteractionHelper {
    /**
     * 为物体添加具有“长按”识别的交互
     * 适用于：长按展示详细信息、连续升级等
     * 
     * @param {Phaser.Scene} scene 
     * @param {Phaser.GameObjects.GameObject} gameObject 
     * @param {function} onShortClick 
     * @param {function} onLongPress 
     * @param {number} longPressDuration 长按触发时间(ms)
     */
    static addLongPress(scene, gameObject, onShortClick, onLongPress, longPressDuration = 500) {
        if (!gameObject.input) {
            gameObject.setInteractive();
        }

        let pressTimer = null;
        let isLongPress = false;

        gameObject.on('pointerdown', () => {
            isLongPress = false;
            pressTimer = scene.time.delayedCall(longPressDuration, () => {
                isLongPress = true;
                if (onLongPress) onLongPress();
            });
        });

        gameObject.on('pointerup', () => {
            if (pressTimer) {
                pressTimer.remove();
                pressTimer = null;
            }
            if (!isLongPress && onShortClick) {
                onShortClick();
            }
        });

        gameObject.on('pointerout', () => {
            if (pressTimer) {
                pressTimer.remove();
                pressTimer = null;
            }
        });
    }

    /**
     * 为物体绑定防抖点击 (Debounced Click)
     * 防止玩家狂点导致的性能问题或重复提交
     * 
     * @param {Phaser.GameObjects.GameObject} gameObject 
     * @param {function} onClick 
     * @param {number} delay 防抖冷却时间(ms)
     */
    static addDebouncedClick(gameObject, onClick, delay = 300) {
        if (!gameObject.input) {
            gameObject.setInteractive();
        }

        let lastClickTime = 0;

        gameObject.on('pointerdown', (pointer) => {
            const now = Date.now();
            if (now - lastClickTime >= delay) {
                lastClickTime = now;
                if (onClick) onClick(pointer);
            }
        });
    }

    /**
     * 升级版拖拽 (支持拖拽时置顶，松开时吸附/回弹)
     * 
     * @param {Phaser.Scene} scene 
     * @param {Phaser.GameObjects.GameObject} gameObject 
     * @param {object} config
     *   - snapTargets: [{x, y, radius, onSnap: function}] 可吸附的靶点数组
     *   - onDragStart: function
     *   - onDragEnd: function
     */
    static setupAdvancedDrag(scene, gameObject, config = {}) {
        const { snapTargets = [], onDragStart, onDragEnd } = config;
        
        scene.input.setDraggable(gameObject.setInteractive());

        let startX = 0;
        let startY = 0;
        let originalDepth = 0;

        gameObject.on('dragstart', (pointer, dragX, dragY) => {
            startX = gameObject.x;
            startY = gameObject.y;
            originalDepth = gameObject.depth;
            gameObject.setDepth(100); // 拖拽时置顶
            
            // 简单的拖拽提起动效
            scene.tweens.add({
                targets: gameObject,
                scale: 1.1,
                duration: 100
            });

            if (onDragStart) onDragStart();
        });

        gameObject.on('drag', (pointer, dragX, dragY) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
        });

        gameObject.on('dragend', (pointer, dragX, dragY) => {
            gameObject.setDepth(originalDepth); // 恢复层级
            
            // 检查吸附
            let snapped = false;
            for (let target of snapTargets) {
                const dist = Phaser.Math.Distance.Between(gameObject.x, gameObject.y, target.x, target.y);
                if (dist <= (target.radius || 50)) {
                    snapped = true;
                    // 吸附动效
                    scene.tweens.add({
                        targets: gameObject,
                        x: target.x,
                        y: target.y,
                        scale: 1.0,
                        duration: 150,
                        ease: 'Back.easeOut',
                        onComplete: () => {
                            if (target.onSnap) target.onSnap(gameObject);
                        }
                    });
                    break;
                }
            }

            // 如果没有吸附，弹回原位
            if (!snapped) {
                scene.tweens.add({
                    targets: gameObject,
                    x: startX,
                    y: startY,
                    scale: 1.0,
                    duration: 300,
                    ease: 'Back.easeOut'
                });
            }

            if (onDragEnd) onDragEnd(snapped);
        });
    }
}

export default InteractionHelper;
