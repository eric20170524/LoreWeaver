/**
 * 全局事件总线 (Event Bus)
 * 采用单例模式延迟初始化，避免在 index.html 引入时序导致的 Phaser 未定义问题。
 */

let instance = null;

const getEventBus = () => {
    if (!instance) {
        instance = new window.Phaser.Events.EventEmitter();
    }
    return instance;
};

// 导出一个代理对象，拦截 on/emit 并在被调用时再初始化 EventEmitter
export default {
    on: (...args) => getEventBus().on(...args),
    emit: (...args) => getEventBus().emit(...args),
    off: (...args) => getEventBus().off(...args)
};
