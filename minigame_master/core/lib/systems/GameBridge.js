/**
 * X Learn Lab 平台通信桥接
 */
export default class GameBridge {
    
    static sendMessage(type, payload) {
        // 确保在 iframe 中运行且父窗口存在
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, payload }, '*');
        }
    }

    static notifyLoaded() {
        console.log('[GameBridge] Game loaded');
        this.sendMessage('GAME_LOADED', null);
    }
    
    static calculateStars(score, rules) {
        // 默认规则（向下兼容）
        const defaultRules = [
            { min: 90, stars: 3 },
            { min: 70, stars: 2 },
            { min: 0,  stars: 1 }
        ];

        const activeRules = Array.isArray(rules) && rules.length
            ? rules
            : defaultRules;

        // 按 min 从高到低排序，防止传入顺序错误
        const sortedRules = [...activeRules].sort((a, b) => b.min - a.min);

        for (const rule of sortedRules) {
            if (score >= rule.min) {
                return rule.stars;
            }
        }

        return 0;
    }


    static notifyWin(score, starRules = null) {
        const stars = this.calculateStars(score, starRules);

        console.log(`[GameBridge] Win! Score: ${score}, Stars: ${stars}`);
        this.sendMessage('GAME_COMPLETE', {
            score,
            stars
        });
    }


    static notifyFail(score) {
        console.log(`[GameBridge] Fail! Score: ${score}`);
        this.sendMessage('GAME_OVER', { score: score });
    }

    static reportMistake(questionText, wrongAns, correctAns) {
        console.log('[GameBridge] Mistake:', questionText);
        this.sendMessage('GAME_MISTAKE', {
            question: questionText,
            userAnswer: wrongAns,
            correctAnswer: correctAns,
            subject: 'MATH'
        });
    }

    static reportError(message, code = 'RUNTIME_ERROR') {
        console.error('[GameBridge] Error:', message);
        this.sendMessage('GAME_ERROR', { message, code });
    }
}