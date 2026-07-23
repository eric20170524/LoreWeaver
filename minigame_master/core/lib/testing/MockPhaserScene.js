/**
 * Lightweight Phaser-like scene for headless adapter smoke tests.
 * Not a full emulator — enough for create/update/retreat contracts.
 */

export function createMockPhaser(width = 720, height = 1280) {
    const MathUtil = {
        Between: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
        Clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        Distance: {
            Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1)
        }
    };

    class Body {
        constructor(gameObject) {
            this.gameObject = gameObject;
            this.velocity = { x: 0, y: 0 };
            this.enable = true;
            this.width = gameObject.radius ? gameObject.radius * 2 : 20;
            this.height = gameObject.radius ? gameObject.radius * 2 : 20;
        }
        setVelocity(x, y) {
            if (y === undefined) this.velocity.y = x;
            else {
                this.velocity.x = x;
                this.velocity.y = y;
            }
            return this;
        }
        setVelocityY(y) {
            this.velocity.y = y;
            return this;
        }
        setVelocityX(x) {
            this.velocity.x = x;
            return this;
        }
        setAllowGravity() {
            return this;
        }
        setCircle(r) {
            this.width = r * 2;
            this.height = r * 2;
            return this;
        }
        setCollideWorldBounds() {
            return this;
        }
        setImmovable() {
            return this;
        }
        setBounce() {
            return this;
        }
    }

    class GameObject {
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
            this.active = true;
            this.alpha = 1;
            this.scale = 1;
            this.visible = true;
            this.body = null;
            this._listeners = {};
            this._data = new Map();
            this.bg = this;
        }
        setStrokeStyle() {
            return this;
        }
        setOrigin() {
            return this;
        }
        setDepth() {
            return this;
        }
        setScrollFactor() {
            return this;
        }
        setInteractive() {
            return this;
        }
        disableInteractive() {
            return this;
        }
        setText(t) {
            this.text = t;
            return this;
        }
        setColor() {
            return this;
        }
        setTint() {
            return this;
        }
        setFillStyle() {
            return this;
        }
        setAlpha(a) {
            this.alpha = a;
            return this;
        }
        setVisible(v) {
            this.visible = v;
            return this;
        }
        setPosition(x, y) {
            this.x = x;
            this.y = y;
            return this;
        }
        setDisplaySize() {
            return this;
        }
        setSize() {
            return this;
        }
        setRadius(r) {
            this.radius = r;
            if (this.body) this.body.setCircle(r);
            return this;
        }
        setScale(s) {
            this.scale = s;
            return this;
        }
        setAngle() {
            return this;
        }
        setRotation() {
            return this;
        }
        setFontFamily() { return this; }
        setFontSize() { return this; }
        setFontStyle() { return this; }
        setWordWrapWidth() { return this; }
        setAlign() { return this; }
        setStroke() { return this; }
        setShadow() { return this; }
        setData(key, value) {
            this._data.set(key, value);
            return this;
        }
        getData(key) {
            return this._data.get(key);
        }
        destroy() {
            this.active = false;
        }
        on(ev, fn) {
            (this._listeners[ev] ||= []).push(fn);
            return this;
        }
        off() {
            return this;
        }
        once(ev, fn) {
            return this.on(ev, fn);
        }
    }

    class Circle extends GameObject {
        constructor(x, y, r) {
            super(x, y);
            this.radius = r || 10;
        }
        setRadius(r) {
            this.radius = r;
            return this;
        }
    }

    class Group {
        constructor() {
            this.children = [];
        }
        add(obj) {
            this.children.push(obj);
            return obj;
        }
        getChildren() {
            return this.children.filter((c) => c && c.active !== false);
        }
        clear(_remove, destroy) {
            if (destroy) this.children.forEach((c) => c.destroy?.());
            this.children = [];
        }
    }

    const timers = [];
    const physicsBodies = [];

    const scene = {
        scale: { width, height },
        cameras: {
            main: {
                shake() {},
                flash() {},
                fade() {},
                setBounds() { return this; },
                startFollow() { return this; },
                stopFollow() { return this; },
                setScroll() { return this; },
                setDeadzone() { return this; }
            }
        },
        input: {
            on(ev, fn) {
                (scene.input._l ||= {})[ev] = fn;
            },
            off() {},
            _l: {}
        },
        add: {
            circle(x, y, r) {
                return new Circle(x, y, r);
            },
            ellipse(x, y, w, h) {
                const e = new GameObject(x, y);
                e.width = w;
                e.height = h;
                return e;
            },
            text(x, y, str) {
                const t = new GameObject(x, y);
                t.text = str;
                return t;
            },
            graphics() {
                const g = new GameObject();
                const proxy = new Proxy(g, {
                    get(target, prop) {
                        if (prop in target) return target[prop];
                        if (prop === 'generateTexture') {
                            return (key) => {
                                scene.textures._keys.add(String(key));
                                return proxy;
                            };
                        }
                        return () => proxy;
                    }
                });
                return proxy;
            },
            container() {
                const c = new GameObject();
                c.add = () => c;
                c.list = [];
                return c;
            },
            zone(x, y, w, h) {
                const z = new GameObject(x, y);
                z.width = w;
                z.height = h;
                return z;
            },
            rectangle(x, y, w, h) {
                const r = new GameObject(x, y);
                r.width = w;
                r.height = h;
                return r;
            },
            image(x, y) {
                return new GameObject(x, y);
            },
            sprite(x, y) {
                return new GameObject(x, y);
            },
            particles() {
                return {
                    createEmitter: () => ({
                        start() {},
                        stop() {},
                        explode() {}
                    })
                };
            }
        },
        physics: {
            add: {
                existing(obj) {
                    obj.body = new Body(obj);
                    physicsBodies.push(obj);
                    return obj;
                },
                group() {
                    return new Group();
                },
                staticGroup() {
                    return new Group();
                },
                overlap() {
                    return null;
                },
                collider() {
                    return null;
                }
            },
            moveToObject(obj, target, speed = 0) {
                if (!obj?.body || !target) return obj;
                const dx = target.x - obj.x;
                const dy = target.y - obj.y;
                const distance = Math.hypot(dx, dy) || 1;
                obj.body.setVelocity((dx / distance) * speed, (dy / distance) * speed);
                return obj;
            },
            world: { setBounds() {} },
            pause() {},
            resume() {}
        },
        time: {
            now: 0,
            addEvent(cfg) {
                const ev = {
                    delay: cfg.delay || 1000,
                    callback: cfg.callback,
                    callbackScope: cfg.callbackScope,
                    loop: !!cfg.loop,
                    elapsed: 0,
                    removed: false,
                    destroy() {
                        this.removed = true;
                    },
                    remove() {
                        this.removed = true;
                    }
                };
                timers.push(ev);
                return ev;
            },
            delayedCall(delay, cb, args, scope) {
                return scene.time.addEvent({
                    delay,
                    loop: false,
                    callback: () => (scope ? cb.apply(scope, args || []) : cb(...(args || [])))
                });
            }
        },
        tweens: {
            add() {
                return { stop() {}, destroy() {} };
            }
        },
        make: {
            graphics(_cfg) {
                return scene.add.graphics();
            },
            sprite(cfg = {}) {
                return scene.add.sprite(cfg.x || 0, cfg.y || 0);
            }
        },
        textures: {
            _keys: new Set(),
            exists(key) {
                return scene.textures._keys.has(String(key));
            },
            addCanvas(key) {
                scene.textures._keys.add(String(key));
                return {};
            },
            remove(key) {
                scene.textures._keys.delete(String(key));
            }
        },
        anims: {
            create() {
                return {};
            },
            exists() {
                return false;
            }
        },
        sound: { play() {}, stopAll() {} },
        registry: {
            _m: new Map(),
            get(k) {
                return scene.registry._m.get(k);
            },
            set(k, v) {
                scene.registry._m.set(k, v);
            }
        },
        sys: { settings: { active: true } },
        scene: { key: 'MockSmoke' },
        children: { list: [] }
    };

    function tick(dtMs) {
        scene.time.now += dtMs;
        for (const ev of timers) {
            if (ev.removed) continue;
            ev.elapsed += dtMs;
            while (ev.elapsed >= ev.delay) {
                ev.elapsed -= ev.delay;
                try {
                    if (ev.callbackScope) ev.callback.call(ev.callbackScope);
                    else ev.callback();
                } catch (e) {
                    ev._error = String(e?.message || e);
                }
                if (!ev.loop) {
                    ev.removed = true;
                    break;
                }
            }
        }
        for (const obj of physicsBodies) {
            if (!obj.active || !obj.body) continue;
            obj.x += (obj.body.velocity.x * dtMs) / 1000;
            obj.y += (obj.body.velocity.y * dtMs) / 1000;
        }
    }

    return {
        Phaser: {
            Math: MathUtil,
            Display: { Color: { HexStringToColor: () => ({ color: 0x10b981 }) } }
        },
        scene,
        timers,
        physicsBodies,
        tick,
        entityCount() {
            return physicsBodies.filter((o) => o.active).length;
        }
    };
}

export default { createMockPhaser };
