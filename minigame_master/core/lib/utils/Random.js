// utils/Random.js

export default class RandomUtil {
    /**
     * 生成范围内的随机整数 [min, max]
     */
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * 生成范围内的随机浮点数 [min, max)
     */
    static randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    /**
     * 从数组中随机选择一个元素
     */
    static choice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    /**
     * 打乱数组
     */
    static shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    
    /**
     * 按概率返回true/false
     */
    static chance(probability) {
        return Math.random() < probability;
    }
}