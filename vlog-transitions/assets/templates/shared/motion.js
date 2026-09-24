// motion.js — deterministic animation helpers shared by every vlog-transitions template.
// Everything here is a pure function of its inputs. Never read clocks, never use
// Math.random(), never rely on requestAnimationFrame timing: the renderer drives
// time exclusively through window.seek(t).
(function () {
  'use strict';
  const M = {};

  M.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  M.lerp = (a, b, t) => a + (b - a) * t;

  // Progress of t through the window [a, b], clamped to [0, 1].
  M.phase = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : M.clamp((t - a) / (b - a), 0, 1));

  M.easeIn = (t) => t * t * t;
  M.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  M.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Overshooting ease for sticker pops (peaks ~1.1 before settling at 1).
  M.easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  // Damped oscillation in degrees. p in [0,1]; 0 at both ends.
  // Used for the quick left-right sticker wiggle.
  M.wiggle = (p, degrees, cycles) => {
    if (p <= 0 || p >= 1) return 0;
    return Math.sin(p * Math.PI * 2 * cycles) * Math.exp(-4 * p) * degrees;
  };

  // Scale for a pop-in: 0 before, overshoots, settles at 1.
  M.pop = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : M.easeOutBack(p));

  // --- Camera -------------------------------------------------------------
  // The camera targets a point (px, py) in stage coordinates and a zoom s.
  // With transform-origin 0 0 on the camera element, this transform puts
  // (px, py) at the center of a stageW x stageH viewport at scale s.
  M.cameraTransform = (px, py, s, stageW, stageH) => {
    const tx = stageW / 2 - s * px;
    const ty = stageH / 2 - s * py;
    return `translate(${tx}px, ${ty}px) scale(${s})`;
  };

  // Interpolate between two camera poses {x, y, s} with an eased t.
  M.cameraLerp = (a, b, t) => ({
    x: M.lerp(a.x, b.x, t),
    y: M.lerp(a.y, b.y, t),
    s: M.lerp(a.s, b.s, t),
  });

  // --- Stage fitting ------------------------------------------------------
  // Templates are authored in a fixed 1920x1080 coordinate system. fitStage
  // scales the #stage element so it fills the current viewport, whatever the
  // capture/render resolution is (720p preview, 4K final).
  M.fitStage = (stageEl, stageW, stageH) => {
    const k = Math.min(window.innerWidth / stageW, window.innerHeight / stageH);
    stageEl.style.transformOrigin = '0 0';
    stageEl.style.transform =
      `translate(${(window.innerWidth - stageW * k) / 2}px, ` +
      `${(window.innerHeight - stageH * k) / 2}px) scale(${k})`;
  };

  // --- Route geometry -----------------------------------------------------
  // Quadratic path between two points with sideways curvature (fraction of
  // the segment length; positive bows left of the travel direction).
  M.routePathD = (x1, y1, x2, y2, curvature) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * len * curvature;
    const cy = my + (dx / len) * len * curvature;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  // --- Dev scrubber -------------------------------------------------------
  // Open template.html#dev in a browser to get a time slider wired to seek().
  M.installDevScrubber = (duration) => {
    if (window.location.hash !== '#dev') return;
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;padding:10px;background:rgba(0,0,0,.7);z-index:99;display:flex;gap:10px;align-items:center;font:14px monospace;color:#fff';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(duration);
    range.step = '0.001';
    range.value = '0';
    range.style.flex = '1';
    const label = document.createElement('span');
    label.textContent = '0.000s';
    range.addEventListener('input', () => {
      const t = parseFloat(range.value);
      window.seek(t);
      label.textContent = t.toFixed(3) + 's';
    });
    bar.appendChild(range);
    bar.appendChild(label);
    document.body.appendChild(bar);
  };

  // --- Scene builders (shared by map templates) ---------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  M.locPx = (loc, stageW, stageH) => ({ x: (loc.x / 100) * stageW, y: (loc.y / 100) * stageH });

  // Ring + dot marker and a handwritten label for each location.
  // Returns per-location <g> elements so seek() can pop them in.
  M.buildMarkers = (layer, cfg, stageW, stageH) => {
    const style = cfg.style;
    return cfg.locations.map((loc) => {
      const p = M.locPx(loc, stageW, stageH);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'marker-g');

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y); ring.setAttribute('r', 20);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', style.route);
      ring.setAttribute('stroke-width', 6);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 7);
      dot.setAttribute('fill', style.route);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', p.x + (loc.labelDx ?? 0));
      text.setAttribute('y', p.y + (loc.labelDy ?? 62));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', style.fontFamily);
      text.setAttribute('font-size', loc.labelSize ?? 46);
      text.setAttribute('fill', style.ink);
      text.setAttribute('stroke', style.paper);
      text.setAttribute('stroke-width', 7);
      text.setAttribute('paint-order', 'stroke');
      text.textContent = loc.label ?? loc.id;

      g.appendChild(ring); g.appendChild(dot); g.appendChild(text);
      layer.appendChild(g);
      return { loc, p, el: g };
    });
  };

  // Sticker <img> elements per location. Hidden (scale 0) until popped.
  M.buildStickers = (layer, cfg, stageW, stageH) => {
    const out = [];
    cfg.locations.forEach((loc) => {
      (loc.stickers ?? []).forEach((st, i) => {
        const p = M.locPx(loc, stageW, stageH);
        const img = document.createElement('img');
        img.src = st.src;
        img.className = 'sticker';
        const w = (st.width ?? 300) * (st.scale ?? 1);
        img.style.width = w + 'px';
        img.style.left = p.x + (st.offsetX ?? 0) + 'px';
        img.style.top = p.y + (st.offsetY ?? 0) + 'px';
        layer.appendChild(img);
        out.push({ loc, st, el: img, index: i, baseRot: st.rotate ?? 0 });
      });
    });
    return out;
  };

  // Standard sticker transform: anchored a bit above its point, popping and wiggling.
  M.stickerTransform = (popScale, wiggleDeg, baseRot, dx = 0, dy = 0) =>
    `translate(calc(-50% + ${dx}px), calc(-88% + ${dy}px)) rotate(${baseRot + wiggleDeg}deg) scale(${popScale})`;

  window.MOTION = M;
})();
