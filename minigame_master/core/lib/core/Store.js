/**
 * 轻量级状态管理与持久化 (Local Storage wrapper)
 * 完全符合 4_STATE_STORAGE.md 理念，用于主线与节点之间的数据同步
 */
class Store {
    static _memoryState = {};
    static _saveKey = 'phaser_game_save_data';

    /**
     * 初始化 Store，将 localStorage 中的数据与 defaultState 合并
     */
    static init(saveKey, defaultState = {}) {
        this._saveKey = saveKey;
        const savedStr = localStorage.getItem(this._saveKey);
        
        if (savedStr) {
            try {
                const parsed = JSON.parse(savedStr);
                // 浅层合并，确保新增的字段能够被加入
                this._memoryState = { ...defaultState, ...parsed };
            } catch (e) {
                console.error("Store Load Error:", e);
                this._memoryState = { ...defaultState };
            }
        } else {
            this._memoryState = { ...defaultState };
        }
        
        // 自动注入上次存档时间
        this._memoryState.lastSaveTime = Date.now();
        this.save();
    }

    /**
     * 获取全部状态
     */
    static getState() {
        return this._memoryState;
    }

    /**
     * 获取指定字段
     */
    static get(key, defaultValue = null) {
        return this._memoryState[key] !== undefined ? this._memoryState[key] : defaultValue;
    }

    /**
     * 更新字段并自动持久化
     */
    static set(key, value) {
        this._memoryState[key] = value;
        this.save();
    }

    /**
     * 写入 localStorage
     */
    static save() {
        this._memoryState.lastSaveTime = Date.now();
        localStorage.setItem(this._saveKey, JSON.stringify(this._memoryState));
    }

    /**
     * 抹除存档
     */
    static clear() {
        this._memoryState = {};
        localStorage.removeItem(this._saveKey);
    }
}

export default Store;
