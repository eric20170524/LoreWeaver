import { createNodeResult, normalizeLegacyReward, NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'node_iframe_microgame',
    payloadEncoding: 'base64_json',
    messageTypes: ['NODE_RESULT', 'NODE_CLOSE', 'NODE_EXIT'],
    fullscreen: true,
    srcTemplate: './nodes/node{nodeId}.html',
    timeoutMs: 0
});

function encodePayload(payload, encoding = 'base64_json') {
    const json = JSON.stringify(payload || {});
    if (encoding === 'plain_json') {
        return encodeURIComponent(json);
    }
    if (typeof btoa === 'function') {
        return btoa(unescape(encodeURIComponent(json)));
    }
    // Node / non-browser fallback
    return Buffer.from(json, 'utf-8').toString('base64');
}

/**
 * DOM-level iframe node container implementing the node_iframe_microgame card.
 * Not a Phaser GameplayAdapter — mounts an iframe and resolves NodeResult via postMessage.
 */
export default class IframeNodeContainer {
    constructor(context = {}) {
        this.context = context;
        this.config = { ...DEFAULT_CONFIG, ...(context.config || {}) };
        this.payload = null;
        this.status = 'idle';
        this.result = null;
        this.iframe = null;
        this.listener = null;
        this.timeoutTimer = null;
        this.parentEl = null;
        this.settled = false;
    }

    init(payload = {}) {
        this.payload = payload;
        this.status = 'initialized';
        this.settled = false;
        this.result = null;
        return this;
    }

    /**
     * @param {HTMLElement} parentEl
     * @param {object} options
     */
    mount(parentEl, options = {}) {
        if (!parentEl) {
            throw new Error('IframeNodeContainer.mount requires a parent HTMLElement.');
        }
        this.parentEl = parentEl;
        this.status = 'running';

        const nodeId = this.payload?.nodeId || this.payload?.nodeIndex || options.nodeId || '1';
        const knobs = this.payload?.nodeConfig?.gameplay?.knobs || this.payload?.nodeConfig?.knobs || {};
        const encoding = knobs.payloadEncoding || this.config.payloadEncoding || 'base64_json';
        const fullscreen = knobs.fullscreen !== undefined ? knobs.fullscreen : this.config.fullscreen;
        const messageTypes = knobs.messageTypes || this.config.messageTypes;
        const srcTemplate = options.srcTemplate || knobs.srcTemplate || this.config.srcTemplate;
        const baseSrc = options.src
            || srcTemplate.replace('{nodeId}', String(nodeId)).replace('{id}', String(nodeId));

        const encoded = encodePayload(this.payload, encoding);
        const sep = baseSrc.includes('?') ? '&' : '?';
        const paramName = encoding === 'plain_json' ? 'payload' : 'data';
        const src = `${baseSrc}${sep}${paramName}=${encoded}`;

        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.setAttribute('title', `node_iframe_${nodeId}`);
        iframe.style.position = fullscreen ? 'absolute' : 'relative';
        iframe.style.top = '0px';
        iframe.style.left = '0px';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.zIndex = '100';
        iframe.style.background = '#020617';

        parentEl.appendChild(iframe);
        this.iframe = iframe;

        this.listener = (ev) => {
            if (!ev?.data || typeof ev.data !== 'object') return;
            const type = ev.data.type;
            if (!messageTypes.includes(type)) return;

            if (type === 'NODE_RESULT') {
                const reward = ev.data.reward || ev.data.result || {};
                const success = reward.success !== false && ev.data.success !== false;
                const reason = reward.reason
                    || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED);
                // Prefer normalized NodeResult if child already sent one
                if (ev.data.result && typeof ev.data.result.success === 'boolean') {
                    this.settle(ev.data.result);
                } else {
                    this.settle(normalizeLegacyReward(reward, success, reason));
                }
            } else if (type === 'NODE_CLOSE' || type === 'NODE_EXIT') {
                this.settle(createNodeResult({
                    success: false,
                    reason: NODE_RESULT_REASONS.RETREATED,
                    telemetry: { closedBy: type }
                }));
            }
        };
        window.addEventListener('message', this.listener);

        const timeoutMs = Number(options.timeoutMs ?? knobs.timeoutMs ?? this.config.timeoutMs ?? 0);
        if (timeoutMs > 0) {
            this.timeoutTimer = setTimeout(() => {
                this.settle(createNodeResult({
                    success: false,
                    reason: NODE_RESULT_REASONS.TIMER_EXPIRED,
                    telemetry: { messageTimeout: true }
                }));
            }, timeoutMs);
        }

        this.context.testHooks?.update({
            adapterId: this.config.id,
            nodeId,
            status: this.status,
            iframeMounted: true,
            src
        });

        this.context.onMount?.(iframe, this);
        return iframe;
    }

    settle(result) {
        if (this.settled) return this.result;
        this.settled = true;
        this.result = createNodeResult(result);
        this.status = 'ended';
        this.unmount();
        this.context.testHooks?.update({
            adapterId: this.config.id,
            status: this.status,
            iframeMounted: false,
            lastResult: this.result
        });
        this.context.onEnd?.(this.result, this);
        return this.result;
    }

    unmount() {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        if (this.listener) {
            window.removeEventListener('message', this.listener);
            this.listener = null;
        }
        if (this.iframe?.parentElement) {
            this.iframe.parentElement.removeChild(this.iframe);
        }
        this.iframe = null;
    }

    retreat() {
        return this.settle(createNodeResult({
            success: false,
            reason: NODE_RESULT_REASONS.RETREATED
        }));
    }

    destroy() {
        this.unmount();
        this.status = 'destroyed';
    }

    getTestState() {
        return {
            adapter: 'IframeNodeContainer',
            status: this.status,
            nodeId: this.payload?.nodeId || null,
            iframeMounted: Boolean(this.iframe),
            lastResult: this.result
        };
    }
}

export { DEFAULT_CONFIG as IFRAME_NODE_CONTAINER_DEFAULT_CONFIG, encodePayload };
