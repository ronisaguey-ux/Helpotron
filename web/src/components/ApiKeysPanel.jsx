import React, { useEffect, useState } from 'react';
import { Key, Copy, Check, Trash2, Loader2, AlertCircle, Plus, ShieldCheck } from 'lucide-react';
import api from '../api.js';

/**
 * ApiKeysPanel — Settings → API Keys.
 *
 * The browser extension no longer asks for a login. The user generates a key
 * here, copies it once, and pastes it into the extension; the key can be limited
 * (spend cap, rate cap) and revoked at any time without touching the account
 * password.
 *
 * The plaintext is shown ONCE, on creation, and is not stored anywhere —
 * only a hash is kept. This panel therefore says so plainly rather than
 * pretending the key can be looked up again later.
 */
export default function ApiKeysPanel() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState('');   // shown once, then gone forever
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState('');
  const [limit, setLimit] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const load = async () => {
    try {
      const res = await api.listApiKeys();
      setKeys(res?.keys || []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load your keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await api.createApiKey({
        label: label.trim() || 'Extension',
        usage_limit_tokens: limit ? Number(limit) : null,
      });
      setFreshKey(res.key);
      setLabel('');
      setLimit('');
      setCopied(false);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not create a key.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    setRemovingId(id);
    try {
      const res = await api.deleteApiKey(id);
      setKeys(res?.keys || []);
    } catch (e) {
      setError(e?.message || 'Could not delete that key.');
    } finally {
      setRemovingId(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      setError('Copy failed — select the key and copy it manually.');
    }
  };

  const fmtTokens = (n) => {
    if (n == null) return 'No limit';
    return `${Number(n).toLocaleString()} tokens`;
  };

  return (
    <section
      id="section-apikeys"
      className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5"
    >
      <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
        <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
          <Key className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-title-md text-title-md font-semibold text-on-surface">
            API Keys
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
              Connect the browser extension without sharing your password. Limit or delete
              any key at any time.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-unit-3 rounded-xl bg-error/10 border border-error/25">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <span className="font-code-sm text-[11px] text-on-surface-variant">{error}</span>
        </div>
      )}

      {/* The one-time reveal. Deliberately loud: this is the only moment the key
          exists in readable form. */}
      {freshKey && (
        <div className="flex flex-col gap-2 p-unit-4 rounded-2xl bg-primary-container/15 border border-primary/30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="font-body-sm text-xs font-semibold text-on-surface">
              Copy this key now — it will not be shown again
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[11px] px-3 py-2 rounded-lg bg-surface-container-high text-on-surface break-all">
              {freshKey}
            </code>
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 rounded-lg bg-primary text-on-primary font-label-caps text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span className="font-code-sm text-[11px] text-outline">
            Paste it into the Helpotron extension's settings. Only a hash is stored here, so it
            cannot be recovered later — if you lose it, revoke it and make a new one.
          </span>
        </div>
      )}

      {/* Create */}
      <div className="flex flex-col gap-3 p-unit-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/15">
        <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">
          New key
        </span>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <span className="font-code-sm text-[11px] text-outline">Name</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My laptop"
              maxLength={100}
              className="h-9 px-3 rounded-lg bg-surface-container-high border border-outline-variant/25 font-body-sm text-xs text-on-surface"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="font-code-sm text-[11px] text-outline">Spend limit (optional)</span>
            <input
              type="number"
              min="0"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 5000 tokens"
              className="h-9 px-3 rounded-lg bg-surface-container-high border border-outline-variant/25 font-body-sm text-xs text-on-surface"
            />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="h-9 px-4 rounded-lg bg-primary text-on-primary font-label-caps text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate key
          </button>
        </div>
        <span className="font-code-sm text-[11px] text-outline">
          A spend limit caps how much this key can use. Leave it blank for no limit.
        </span>
      </div>

      {/* Existing keys */}
      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-body-sm text-xs">Loading…</span>
        </div>
      ) : keys.length === 0 ? (
        <span className="font-body-sm text-xs text-on-surface-variant">
          No keys yet. Generate one above to connect the extension.
        </span>
      ) : (
        <div className="flex flex-col gap-2">
            {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 p-unit-3 rounded-xl border bg-surface-container-low/60 border-outline-variant/15">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body-sm text-xs font-semibold text-on-surface truncate">
                        {k.label || 'Untitled key'}
                      </span>
                      {/* Legacy rows only: keys revoked before 2026-09-18 were soft-flagged.
                          The action is a real delete now, but an old revoked key must still
                          look dead rather than indistinguishable from a working one. */}
                      {k.revoked && (
                        <span className="font-code-sm text-[10px] px-1.5 py-0.5 rounded bg-error/15 text-error">
                          revoked
                        </span>
                      )}
                    </div>
                  <span className="font-mono text-[11px] text-outline truncate">
                    {k.prefix}…
                  </span>
                  <span className="font-code-sm text-[10px] text-outline">
                    {fmtTokens(k.usage_limit_tokens)} · used{' '}
                    {Number(k.usage_used_tokens || 0).toLocaleString()}
                    {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · never used'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(k.id)}
                  disabled={removingId === k.id}
                  title="Delete this key permanently"
                  className="h-8 px-3 rounded-lg border border-error/30 text-error font-label-caps text-[11px] flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-error/10 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {removingId === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
              </div>
          ))}
        </div>
      )}
    </section>
  );
}
