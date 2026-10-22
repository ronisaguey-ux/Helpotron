/**
 * AvatarCropper — square crop + zoom + rotate before an avatar upload.
 *
 * Owner (2026-10-22): "when i uploaded a pfp it didnt give me an option to edit
 * the dimensions, crop, etc". The old path handed the raw File straight to
 * /api/uploads/avatar, so a 4000×3000 phone photo was stored as-is and only
 * whatever CSS sized it looked right.
 *
 * Everything happens in the browser on a canvas: no dependency, no server round
 * trip, and the uploaded bytes are already square (512×512 JPEG), so the stored
 * avatar is correct at every render size.
 *
 * Controls: drag to reposition, slider or ± to zoom, rotate in 90° steps,
 * Escape cancels, Enter confirms. Pointer events are used so touch works.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const VIEWPORT = 288;      // on-screen crop square, CSS px
const OUTPUT = 512;        // stored avatar edge, device px
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export default function AvatarCropper({ file, onCancel, onDone, busy = false }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const drag = useRef(null);
  const [url, setUrl] = useState('');

  // Object URL for the picked file, revoked on unmount.
  useEffect(() => {
    if (!file) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      imgRef.current = img;
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setReady(true);
    };
    img.onerror = () => { if (alive) setError('That file could not be read as an image.'); };
    img.src = url;
    return () => { alive = false; };
  }, [url]);

  // Geometry: the image must always cover the crop square at zoom 1.
  const baseScale = useMemo(() => {
    const img = imgRef.current;
    if (!img) return 1;
    const quarter = rotation % 180 !== 0;
    const w = quarter ? img.naturalHeight : img.naturalWidth;
    const h = quarter ? img.naturalWidth : img.naturalHeight;
    return Math.max(VIEWPORT / w, VIEWPORT / h);
  }, [ready, rotation]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = VIEWPORT * dpr;
    canvas.height = VIEWPORT * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    ctx.save();
    ctx.translate(VIEWPORT / 2 + offset.x, VIEWPORT / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * zoom, baseScale * zoom);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [baseScale, offset.x, offset.y, rotation, zoom, ready]);

  useEffect(() => { draw(); }, [draw]);

  const clampOffset = useCallback((next) => {
    const img = imgRef.current;
    if (!img) return next;
    const quarter = rotation % 180 !== 0;
    const w = (quarter ? img.naturalHeight : img.naturalWidth) * baseScale * zoom;
    const h = (quarter ? img.naturalWidth : img.naturalHeight) * baseScale * zoom;
    const maxX = Math.max(0, (w - VIEWPORT) / 2);
    const maxY = Math.max(0, (h - VIEWPORT) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, [baseScale, zoom, rotation]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOffset(clampOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    }));
  };
  const onPointerUp = () => { drag.current = null; };

  const exportBlob = () => {
    const img = imgRef.current;
    if (!img) return Promise.reject(new Error('image not ready'));
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // Replay the on-screen transform at export scale: the crop square is
    // VIEWPORT CSS px, so the same geometry maps 1:1 onto an OUTPUT canvas.
    const s = (OUTPUT / VIEWPORT);
    ctx.translate((OUTPUT / 2) + offset.x * s, (OUTPUT / 2) + offset.y * s);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * zoom * s, baseScale * zoom * s);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not encode image'))), 'image/jpeg', 0.92);
    });
  };

  const confirm = async () => {
    try {
      const blob = await exportBlob();
      onDone?.(blob);
    } catch (e) {
      setError(e?.message || 'Could not prepare that image.');
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
      if (e.key === 'Enter') { e.preventDefault(); if (!busy) confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Crop your profile picture">
      <div className="w-full max-w-[420px] rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-md text-lg text-on-surface">Crop your picture</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Drag to position, zoom to frame the square. Saved at 512×512.</p>
          </div>
          <button type="button" onClick={onCancel} className="h-9 w-9 -mr-1 -mt-1 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high flex items-center justify-center" aria-label="Cancel crop">✕</button>
        </div>

        <div className="mt-4 flex justify-center">
          <div
            className="relative overflow-hidden rounded-2xl border border-outline-variant/40 bg-black touch-none cursor-grab active:cursor-grabbing"
            style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: '100%' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: '100%' }} aria-label="Crop preview" role="img" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/15" />
            <div className="pointer-events-none absolute inset-8 rounded-full border border-white/15" />
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-error" role="alert">{error}</p> : null}

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3">
            <span className="w-10 font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setOffset((o) => clampOffset(o));
              }}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
            <span className="w-10 text-right font-mono text-[11px] text-on-surface-variant">{zoom.toFixed(1)}×</span>
          </label>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.15).toFixed(2)))} className="h-8 w-8 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface" aria-label="Zoom out">−</button>
              <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.15).toFixed(2)))} className="h-8 w-8 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface" aria-label="Zoom in">+</button>
              <button
                type="button"
                onClick={() => { setRotation((r) => (r + 90) % 360); setOffset({ x: 0, y: 0 }); }}
                className="h-8 px-3 rounded-lg border border-outline-variant/30 text-[11px] font-label-caps uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
              >
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); }}
                className="h-8 px-3 rounded-lg border border-outline-variant/30 text-[11px] font-label-caps uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-xl border border-outline-variant/30 text-sm text-on-surface-variant hover:text-on-surface">Cancel</button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || busy}
            className="h-10 px-4 rounded-xl bg-primary-container text-on-primary-container text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Uploading…' : 'Use this picture'}
          </button>
        </div>
      </div>
    </div>
  );
}
