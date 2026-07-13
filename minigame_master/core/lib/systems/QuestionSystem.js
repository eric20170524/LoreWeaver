export default class QuestionSystem {
    constructor() {
        this.questions = this.generateQuestions();
        this.currentQuestionIndex = 0;
    }

    generateQuestions() {
        // Placeholder for questions. In a real game, this might fetch from an API or config.
        return [];
    }

    getCurrentQuestion() {
        if (this.currentQuestionIndex >= this.questions.length) {
            return null;
        }
        return this.questions[this.currentQuestionIndex];
    }

    nextQuestion() {
        this.currentQuestionIndex++;
        return this.getCurrentQuestion();
    }

    getProgress() {
        if (this.questions.length === 0) return { current: 0, total: 0, percentage: 0 };
        return {
            current: this.currentQuestionIndex,
            total: this.questions.length,
            percentage: Math.floor((this.currentQuestionIndex / this.questions.length) * 100)
        };
    }

    reset() {
        this.currentQuestionIndex = 0;
    }
}
