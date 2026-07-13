export const SCENE_LIFECYCLE_STATES = Object.freeze({
    BOOT: 'boot',
    RUNNING: 'running',
    PAUSED: 'paused',
    ENDING: 'ending',
    ENDED: 'ended',
    DESTROYED: 'destroyed'
});

export default class SceneLifecycle {
    constructor(scene = null) {
        this.scene = scene;
        this.state = SCENE_LIFECYCLE_STATES.BOOT;
        this.cleanups = [];
        this.transitionLocked = false;
    }

    setState(nextState) {
        this.state = nextState;
        return this.state;
    }

    start() {
        return this.setState(SCENE_LIFECYCLE_STATES.RUNNING);
    }

    pause() {
        if (this.state === SCENE_LIFECYCLE_STATES.RUNNING) {
            return this.setState(SCENE_LIFECYCLE_STATES.PAUSED);
        }
        return this.state;
    }

    resume() {
        if (this.state === SCENE_LIFECYCLE_STATES.PAUSED) {
            return this.setState(SCENE_LIFECYCLE_STATES.RUNNING);
        }
        return this.state;
    }

    beginEnd() {
        this.transitionLocked = true;
        return this.setState(SCENE_LIFECYCLE_STATES.ENDING);
    }

    finishEnd() {
        this.transitionLocked = false;
        return this.setState(SCENE_LIFECYCLE_STATES.ENDED);
    }

    addCleanup(cleanup) {
        if (typeof cleanup === 'function') {
            this.cleanups.push(cleanup);
        }
        return cleanup;
    }

    trackTimer(timerEvent) {
        this.addCleanup(() => {
            if (timerEvent && typeof timerEvent.remove === 'function') {
                timerEvent.remove(false);
            }
        });
        return timerEvent;
    }

    trackListener(target, eventName, handler) {
        if (target && typeof target.on === 'function') {
            target.on(eventName, handler);
            this.addCleanup(() => {
                if (typeof target.off === 'function') {
                    target.off(eventName, handler);
                }
            });
        }
        return handler;
    }

    trackDomListener(target, eventName, handler, options = undefined) {
        if (target && typeof target.addEventListener === 'function') {
            target.addEventListener(eventName, handler, options);
            this.addCleanup(() => target.removeEventListener(eventName, handler, options));
        }
        return handler;
    }

    cleanup() {
        while (this.cleanups.length) {
            const cleanup = this.cleanups.pop();
            try {
                cleanup();
            } catch (error) {
                console.error('[SceneLifecycle] cleanup failed:', error);
            }
        }
    }

    destroy() {
        this.cleanup();
        this.transitionLocked = false;
        this.scene = null;
        return this.setState(SCENE_LIFECYCLE_STATES.DESTROYED);
    }

    canTransition() {
        return !this.transitionLocked && this.state !== SCENE_LIFECYCLE_STATES.DESTROYED;
    }
}
