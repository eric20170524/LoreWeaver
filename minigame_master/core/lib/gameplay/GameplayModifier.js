export default class GameplayModifier {
    constructor(config = {}) {
        this.config = config;
        this.installed = false;
    }

    install(_context) {
        this.installed = true;
    }

    update(_context, _time, _delta) {}

    uninstall(_context) {
        this.installed = false;
    }

    getTestState() {
        return {
            modifier: this.constructor.name,
            installed: this.installed,
            config: this.config
        };
    }
}
