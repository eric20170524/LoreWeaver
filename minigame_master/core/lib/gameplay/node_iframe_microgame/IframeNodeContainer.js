import { createNodeResult, normalizeLegacyReward, NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'node_iframe_microgame', payloadEncoding: 'base64_json',
    messageTypes: ['NODE_RESULT', 'NODE_CLOSE', 'NODE_EXIT'], fullscreen: true,
    srcTemplate: './nodes/node{nodeId}.html', timeoutMs: 0
});
function encodePayload(payload, encoding = 'base64_json') {
    const json = JSON.stringify(payload || {});
    if (encoding === 'plain_json') return encodeURIComponent(json);
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
    return Buffer.from(json, 'utf-8').toString('base64');
}

/** DOM container shared by GameRunner and standalone HTML node hosts. */
export default class IframeNodeContainer {
    constructor(context = {}) {
        this.context = context;
        this.config = { ...DEFAULT_CONFIG, ...(context.config || {}) };
        this.payload = null; this.status = 'idle'; this.result = null;
        this.iframe = null; this.listener = null; this.timeoutTimer = null;
        this.parentEl = null; this.settled = false;
        this.ready = false; this.pauseSupported = false; this.pendingResult = null;
        this.timeoutRemaining = 0; this.timeoutStarted = 0; this.expectedOrigin = null;
        this.parentPosition = null; this.canvasDisplays = [];
    }
    init(payload = {}) {
        this.unmount();
        this.payload = payload; this.status = 'initialized'; this.settled = false;
        this.result = null; this.ready = false; this.pauseSupported = false; this.pendingResult = null;
        return this;
    }
    mount(parentEl, options = {}) {
        if (!parentEl) throw new Error('IframeNodeContainer.mount requires a parent HTMLElement.');
        if (this.status !== 'initialized') throw new Error('Initialize the iframe node before mounting it.');
        this.parentEl = parentEl;
        const nodeId = this.payload?.nodeId ?? this.payload?.nodeIndex ?? options.nodeId ?? '1';
        const knobs = this.payload?.nodeConfig?.gameplay?.knobs || this.payload?.nodeConfig?.knobs || {};
        const encoding = knobs.payloadEncoding || this.config.payloadEncoding;
        const fullscreen = knobs.fullscreen ?? this.config.fullscreen;
        const configuredTypes = knobs.messageTypes ?? this.config.messageTypes;
        const messageTypes = Array.isArray(configuredTypes) ? configuredTypes : DEFAULT_CONFIG.messageTypes;
        const srcTemplate = options.srcTemplate || knobs.srcTemplate || this.config.srcTemplate;
        let src;
        try {
            const url = new URL(options.src || srcTemplate.replace('{nodeId}', String(nodeId)).replace('{id}', String(nodeId)), document.baseURI || window.location.href);
            const value = encoding === 'plain_json' ? JSON.stringify(this.payload) : encodePayload(this.payload);
            url.searchParams.set(encoding === 'plain_json' ? 'payload' : 'data', value);
            // Chromium may serialize a file URL origin as file:// while its
            // MessageEvent origin is opaque ("null"). Keep the window check.
            src = url.href; this.expectedOrigin = url.protocol === 'file:' ? 'null' : url.origin;
        } catch (error) {
            this.settle(createNodeResult({ success: false, reason: 'payload_parse_error', telemetry: { payloadParseError: true, message: String(error) } }));
            return null;
        }
        const iframe = document.createElement('iframe');
        iframe.src = src; iframe.setAttribute('title', `node_iframe_${nodeId}`);
        Object.assign(iframe.style, { position: fullscreen ? 'absolute' : 'relative', top: '0px', left: '0px', width: '100%', height: '100%', border: 'none', zIndex: '100', background: '#020617' });
        // Both overlay and in-flow modes occupy the existing game surface.
        this.parentPosition = parentEl.style.position;
        if (!this.parentPosition || this.parentPosition === 'static') parentEl.style.position = 'relative';
        this.canvasDisplays = [...parentEl.querySelectorAll('canvas')].map(canvas => [canvas, canvas.style.display]);
        this.canvasDisplays.forEach(([canvas]) => { canvas.style.display = 'none'; });
        this.iframe = iframe; this.status = 'running';
        this.listener = ev => {
            if (this.settled || this.status === 'destroyed' || this.iframe !== iframe || ev.source !== iframe.contentWindow || ev.origin !== this.expectedOrigin || !ev.data || typeof ev.data !== 'object') return;
            const { type } = ev.data;
            if (type === 'NODE_READY') { this.ready = true; this.pauseSupported = ev.data.supportsPause === true; this.publishTestState(); return; }
            if (!messageTypes.includes(type)) return;
            let result;
            if (type === 'NODE_RESULT') {
                const reward = ev.data.reward || ev.data.result;
                if (!reward || typeof reward !== 'object' || Array.isArray(reward)) return;
                if (ev.data.result && typeof ev.data.result.success === 'boolean') result = createNodeResult(ev.data.result);
                else {
                    const success = reward.success !== false && ev.data.success !== false;
                    result = normalizeLegacyReward(reward, success, reward.reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED));
                }
            } else if (type === 'NODE_CLOSE' || type === 'NODE_EXIT') result = createNodeResult({ success: false, reason: NODE_RESULT_REASONS.RETREATED, telemetry: { closedBy: type } });
            if (!result) return;
            if (this.status === 'paused') this.pendingResult ||= result;
            else this.settle(result);
        };
        window.addEventListener('message', this.listener);
        parentEl.appendChild(iframe);
        const timeoutMs = Number(options.timeoutMs ?? knobs.timeoutMs ?? this.config.timeoutMs);
        this.timeoutRemaining = Number.isFinite(timeoutMs) ? Math.max(0, Math.min(300000, timeoutMs)) : 0;
        this.armTimeout(); this.publishTestState();
        this.context.onMount?.(iframe, this);
        return iframe;
    }
    armTimeout() {
        if (this.timeoutRemaining <= 0) return;
        this.timeoutStarted = Date.now();
        this.timeoutTimer = setTimeout(() => this.settle(createNodeResult({ success: false, reason: NODE_RESULT_REASONS.TIMER_EXPIRED, telemetry: { messageTimeout: true } })), this.timeoutRemaining);
    }
    postControl(type) {
        this.iframe?.contentWindow?.postMessage({ type, nodeId: this.payload?.nodeId }, this.expectedOrigin === 'null' ? '*' : this.expectedOrigin);
    }
    pause() {
        if (this.status !== 'running' || !this.pauseSupported) return false;
        this.status = 'paused';
        if (this.timeoutTimer) { clearTimeout(this.timeoutTimer); this.timeoutTimer = null; this.timeoutRemaining = Math.max(1, this.timeoutRemaining - (Date.now() - this.timeoutStarted)); }
        if (this.iframe) this.iframe.style.pointerEvents = 'none';
        this.postControl('NODE_PAUSE'); this.publishTestState();
        return true;
    }
    resume() {
        if (this.status !== 'paused') return false;
        this.status = 'running';
        if (this.iframe) this.iframe.style.pointerEvents = '';
        this.postControl('NODE_RESUME');
        if (this.pendingResult) { const result = this.pendingResult; this.pendingResult = null; return this.settle(result); }
        this.armTimeout(); this.publishTestState();
        return true;
    }
    settle(result) {
        if (this.settled || this.status === 'destroyed') return this.result;
        this.settled = true; this.result = createNodeResult(result); this.status = 'ended';
        this.unmount(); this.publishTestState();
        this.context.onEnd?.(this.result, this);
        return this.result;
    }
    unmount() {
        if (this.timeoutTimer) { clearTimeout(this.timeoutTimer); this.timeoutTimer = null; }
        if (this.listener) { window.removeEventListener('message', this.listener); this.listener = null; }
        if (this.iframe?.parentElement) this.iframe.parentElement.removeChild(this.iframe);
        this.iframe = null;
        this.canvasDisplays.forEach(([canvas, display]) => { canvas.style.display = display; });
        this.canvasDisplays = [];
        if (this.parentEl && this.parentPosition !== null && this.parentEl.style.position === 'relative') this.parentEl.style.position = this.parentPosition;
        this.parentEl = null; this.parentPosition = null;
    }
    retreat() { return this.settle(createNodeResult({ success: false, reason: NODE_RESULT_REASONS.RETREATED })); }
    destroy() { this.settled = true; this.pendingResult = null; this.unmount(); this.status = 'destroyed'; }
    getTestState() {
        return { adapter: 'IframeNodeContainer', status: this.status, nodeId: this.payload?.nodeId ?? null, score: 0, ready: this.ready, pauseSupported: this.pauseSupported, iframeMounted: Boolean(this.iframe), lastResult: this.result };
    }
    publishTestState() { this.context.testHooks?.update({ adapterId: this.config.id, ...this.getTestState() }); }
}
export { DEFAULT_CONFIG as IFRAME_NODE_CONTAINER_DEFAULT_CONFIG, encodePayload };
