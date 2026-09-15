/**
 * ActionStreamPlayer — the extension's stable, generic executor for a
 * server-driven typing stream.
 *
 * WHY THIS EXISTS
 * The owner wants launch-to-doc + humanization logic out of the extension so a
 * tweak is a server deploy, not a Chrome Web Store review. MV3 forbids
 * remotely-hosted CODE but allows DATA. So the server emits an ordered list of
 * primitive actions (data); this class plays them back with shipped code and
 * holds no policy of its own. It knows a fixed vocabulary and nothing else.
 *
 * The player is deliberately dumb:
 *   - it does not compute delays (pacing is `wait` ops in the data),
 *   - it does not decide typos/corrections/pauses (those are `type`/`backspace`/
 *     `wait` sequences in the data),
 *   - it does not guess: an op outside the vocabulary is an error, not a prompt
 *     to improvise.
 *
 * It is separated from the sink so it can be unit-tested in isolation (the sink
 * is the one thing that needs chrome.* / the live DOM).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ActionStreamPlayer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STREAM_VERSION = 1;

  // The fixed vocabulary. op -> required param names. An op NOT in this table
  // is rejected. This must only ever grow, never change meaning, so a released
  // executor keeps running streams from any server version.
  const OPS = {
    focus: [],
    type: ['ch'],
    key: ['key', 'code', 'keyCode'],
    backspace: [],
    wait: ['ms'],
    mouse: ['x', 'y'],
    click: ['x', 'y'],
    label: ['name'],
  };

  class ActionStreamPlayer {
    /**
     * @param {object} sink — the browser-facing hands. See the Sink contract.
     * @param {object} [opts]
     * @param {number} [opts.streamVersion] — refuse a stream we don't understand.
     */
    constructor(sink, opts) {
      this.sink = sink;
      this.streamVersion = (opts && opts.streamVersion) || STREAM_VERSION;
    }

    /** Validate a stream before playing. Returns {ok, error}. */
    static validate(stream) {
      if (!stream || !Array.isArray(stream.actions)) {
        return { ok: false, error: 'stream.actions must be an array' };
      }
      if (stream.stream_version !== undefined && stream.stream_version > STREAM_VERSION) {
        return { ok: false, error: `stream_version ${stream.stream_version} is newer than this executor (${STREAM_VERSION})` };
      }
      for (let i = 0; i < stream.actions.length; i++) {
        const a = stream.actions[i];
        if (!a || typeof a !== 'object' || typeof a.op !== 'string') {
          return { ok: false, error: `action[${i}] is not an action object` };
        }
        const required = OPS[a.op];
        if (!required) {
          return { ok: false, error: `action[${i}] has unknown op ${JSON.stringify(a.op)}` };
        }
        for (const p of required) {
          if (!(p in a)) {
            return { ok: false, error: `action[${i}] (${a.op}) missing param ${JSON.stringify(p)}` };
          }
        }
        if (a.op === 'type' && (typeof a.ch !== 'string' || a.ch.length !== 1)) {
          return { ok: false, error: `action[${i}] type ch must be a single char` };
        }
        if (a.op === 'wait' && (typeof a.ms !== 'number' || a.ms < 0)) {
          return { ok: false, error: `action[${i}] wait ms must be a non-negative number` };
        }
      }
      return { ok: true };
    }

    /** Play the stream. Resolves {ok, actionCount} on success or throws on the
     * first bad op / sink error with `.opIndex` set. */
    async run(stream) {
      const v = ActionStreamPlayer.validate(stream);
      if (!v.ok) {
        const err = new Error(v.error);
        err.opIndex = -1;
        throw err;
      }

      const actions = stream.actions;
      const total = actions.length;
      await this.sink.beforeRun(stream);

      for (let i = 0; i < total; i++) {
        // Cancel wins, pause waits — checked between ops so a pause lands on an
        // op boundary, never mid-keystroke.
        while (this.sink.isPaused && this.sink.isPaused() && !(this.sink.isCancelled && this.sink.isCancelled())) {
          await this.sink.sleep(200);
        }
        if (this.sink.isCancelled && this.sink.isCancelled()) {
          return { ok: false, cancelled: true, opIndex: i, actionCount: i };
        }

        const a = actions[i];
        try {
          await this._dispatch(a);
        } catch (e) {
          if (!e.opIndex) e.opIndex = i;
          throw e;
        }
        if (this.sink.onProgress) {
          await this.sink.onProgress(i + 1, total);
        }
      }

      await this.sink.afterRun({ ok: true, actionCount: total });
      return { ok: true, actionCount: total };
    }

    async _dispatch(a) {
      switch (a.op) {
        case 'focus':
          await this.sink.focusEditor();
          return;
        case 'type':
          await this.sink.typeChar(a.ch, a);
          return;
        case 'key':
          await this.sink.namedKey(a.key, a.code, a.keyCode);
          return;
        case 'backspace':
          await this.sink.backspace();
          return;
        case 'wait':
          await this.sink.sleep(a.ms);
          return;
        case 'mouse':
          await this.sink.mouseMove(a.x, a.y);
          return;
        case 'click':
          await this.sink.mouseClick(a.x, a.y);
          return;
        case 'label':
          if (this.sink.onLabel) await this.sink.onLabel(a.name);
          return;
        default:
          throw new Error(`unhandled op ${a.op}`);
      }
    }
  }

  ActionStreamPlayer.STREAM_VERSION = STREAM_VERSION;
  ActionStreamPlayer.OPS = OPS;
  return ActionStreamPlayer;
});
