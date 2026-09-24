// map-travel — quick unfold, a dashed route draws itself across the map, the
// sticker slides along it (bobbing, slight lean), wiggles on arrival, then a
// fast zoom + white flash to cut into the next clip.
//
// Contract with the renderer:
//   window.DURATION  — total length in seconds
//   window.seek(t)   — deterministically show the scene at time t
//   window.READY     — true once fonts/images are loaded (renderer waits on it)
(function () {
  'use strict';
  const M = window.MOTION;
  const cfg = window.TRANSITION_CONFIG;
  const W = 1920, H = 1080;
  const D = cfg.durationSeconds;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Phase windows in seconds (fractions of D; cfg.phases overrides any).
  const P = Object.assign(
    {
      unfold1: [0.02 * D, 0.08 * D], // compressed unfold keeps the family signature
      unfold2: [0.08 * D, 0.13 * D],
      markers: [0.13 * D, 0.20 * D],
      popA:    [0.15 * D, 0.22 * D], // origin stickers pop
      draw:    [0.22 * D, 0.54 * D], // route draws ahead of the traveler
      travel:  [0.46 * D, 0.80 * D],
      popB:    [0.80 * D, 0.88 * D], // destination stickers pop on arrival
      wiggle:  [0.80 * D, 0.92 * D],
      zoom:    [0.86 * D, 1.00 * D],
      flash:   [0.94 * D, 1.00 * D],
    },
    cfg.phases || {}
  );

  const el = (id) => document.getElementById(id);
  const stage = el('stage');
  const camera = el('camera');
  const paper = el('paper-scene');
  const flat = el('flat');
  const flash = el('flash');

  const byId = Object.fromEntries(cfg.locations.map((l) => [l.id, l]));
  const from = byId[cfg.route.from];
  const to = byId[cfg.route.to];
  const fromPx = M.locPx(from, W, H);
  const toPx = M.locPx(to, W, H);

  let markers = [];
  let stickers = [];
  let routePath = null;   // visible dashed route
  let revealPath = null;  // solid path inside the mask that "draws" it
  let routeLen = 0;

  function setup() {
    const crops = { 'crop-tl': [0, 0], 'crop-tr': [960, 0], 'crop-bl': [0, 540], 'crop-br': [960, 540] };
    for (const [id, [x, y]] of Object.entries(crops)) {
      el(id).setAttribute('viewBox', `${x} ${y} 960 540`);
    }

    // Route: a dashed path revealed by an animated solid path inside a mask.
    const d = M.routePathD(fromPx.x, fromPx.y, toPx.x, toPx.y, cfg.route.curvature ?? 0.18);
    const layer = el('route-layer');
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', 'route-mask');
    revealPath = document.createElementNS(SVG_NS, 'path');
    revealPath.setAttribute('d', d);
    revealPath.setAttribute('fill', 'none');
    revealPath.setAttribute('stroke', '#fff');
    revealPath.setAttribute('stroke-width', (cfg.route.width ?? 10) * 3);
    revealPath.setAttribute('stroke-linecap', 'round');
    mask.appendChild(revealPath);
    layer.appendChild(mask);

    routePath = document.createElementNS(SVG_NS, 'path');
    routePath.setAttribute('d', d);
    routePath.setAttribute('fill', 'none');
    routePath.setAttribute('stroke', cfg.style.route);
    routePath.setAttribute('stroke-width', cfg.route.width ?? 10);
    routePath.setAttribute('stroke-linecap', 'round');
    routePath.setAttribute('stroke-dasharray', (cfg.route.dash ?? [30, 22]).join(' '));
    routePath.setAttribute('mask', 'url(#route-mask)');
    layer.appendChild(routePath);

    routeLen = revealPath.getTotalLength();
    revealPath.setAttribute('stroke-dasharray', `${routeLen} ${routeLen}`);

    markers = M.buildMarkers(el('marker-layer'), cfg, W, H);
    stickers = M.buildStickers(el('sticker-layer'), cfg, W, H);

    // Travel starts with the paper open; the folded phases are brief.
    flat.style.display = 'none';
  }

  // Point on the route at progress p in [0,1].
  const routePoint = (p) => revealPath.getPointAtLength(M.clamp(p, 0, 1) * routeLen);

  const clampPose = (pose) => ({
    x: M.clamp(pose.x, W / (2 * pose.s), W - W / (2 * pose.s)),
    y: M.clamp(pose.y, H / (2 * pose.s), H - H / (2 * pose.s)),
    s: pose.s,
  });

  window.seek = function seek(t) {
    M.fitStage(stage, W, H);

    // --- Unfold (same machinery as map-reveal, compressed) ---
    // Fold directions/z-lift: see map-reveal/animation.js for the reasoning.
    const u1 = M.easeInOut(M.phase(t, P.unfold1[0], P.unfold1[1]));
    const u2 = M.easeInOut(M.phase(t, P.unfold2[0], P.unfold2[1]));
    el('right-unit').style.transform = `translateZ(${24 * (1 - u1)}px) rotateY(${-180 * (1 - u1)}deg)`;
    el('q-bl').style.transform = `translateZ(${6 * (1 - u2)}px) rotateX(${180 * (1 - u2)}deg)`;
    el('q-br').style.transform = `translateZ(${6 * (1 - u2)}px) rotateX(${180 * (1 - u2)}deg)`;
    const s1 = Math.sin(Math.PI * (1 - u1)) * 0.4;
    const s2 = Math.sin(Math.PI * (1 - u2)) * 0.4;
    el('shade-tr').style.opacity = s1;
    el('shade-br').style.opacity = Math.max(s1, s2);
    el('shade-bl').style.opacity = s2;
    el('shade-tl').style.opacity = 0.25 * (1 - u1);
    el('bshade-tr').style.opacity = 0.12 * (1 - u1) + s1 * 0.6;
    el('bshade-bl').style.opacity = 0.18 * (1 - u2) + s2 * 0.6;
    el('bshade-br').style.opacity = 0.18 * (1 - u2) + s2 * 0.6;
    const open = t >= P.unfold2[1];
    paper.style.display = open ? 'none' : 'block';
    flat.style.display = open ? 'block' : 'none';

    // --- Route draw ---
    const drawP = M.easeInOut(M.phase(t, P.draw[0], P.draw[1]));
    revealPath.setAttribute('stroke-dashoffset', routeLen * (1 - drawP));

    // --- Markers ---
    markers.forEach((m, i) => {
      const p = M.pop(M.phase(t, P.markers[0] + i * 0.06, P.markers[1] + i * 0.06));
      m.el.style.transform = `scale(${p})`;
    });

    // --- Stickers ---
    const travelP = M.easeInOut(M.phase(t, P.travel[0], P.travel[1]));
    const pt = routePoint(travelP);
    const ahead = routePoint(Math.min(travelP + 0.02, 1));
    const leanDeg = M.clamp((Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI * 0.12, -10, 10);
    const bob = Math.sin(travelP * Math.PI * (cfg.travel?.bobs ?? 5)) * (cfg.travel?.bobPx ?? 9) * (travelP > 0 && travelP < 1 ? 1 : 0);
    const wig = M.wiggle(M.phase(t, P.wiggle[0], P.wiggle[1]), cfg.wiggle.degrees, cfg.wiggle.cycles);

    stickers.forEach((s) => {
      if (s.loc.id === cfg.route.from) {
        // Origin stickers pop, then ride the route.
        const p = M.pop(M.phase(t, P.popA[0] + s.index * 0.05, P.popA[1] + s.index * 0.05));
        const dx = pt.x - fromPx.x;
        const dy = pt.y - fromPx.y + bob;
        s.el.style.transform = M.stickerTransform(p, wig + leanDeg * (travelP > 0 && travelP < 1 ? 1 : 0), s.baseRot, dx, dy);
      } else if (s.loc.id === cfg.route.to) {
        const p = M.pop(M.phase(t, P.popB[0] + s.index * 0.05, P.popB[1] + s.index * 0.05));
        s.el.style.transform = M.stickerTransform(p, wig, s.baseRot);
      } else {
        const p = M.pop(M.phase(t, P.markers[0], P.markers[1]));
        s.el.style.transform = M.stickerTransform(p, 0, s.baseRot);
      }
    });

    // --- Camera ---
    const poseFold = { x: 480, y: 270, s: 2.05 };
    const poseOpen = { x: 960, y: 540, s: 1.0 };
    const mid = { x: (fromPx.x + toPx.x) / 2, y: (fromPx.y + toPx.y) / 2 };
    const poseDrift = { x: M.lerp(960, mid.x, 0.5), y: M.lerp(540, mid.y, 0.5), s: cfg.camera.pushIn };
    const follow = { x: pt.x, y: pt.y, s: cfg.camera.followZoom };
    const poseZoom = { x: toPx.x, y: toPx.y, s: cfg.camera.finalZoom };

    let pose;
    if (t < P.unfold2[1]) {
      pose = M.cameraLerp(poseFold, poseOpen, M.easeInOut(M.phase(t, P.unfold1[0], P.unfold2[1])));
    } else if (t < P.travel[0]) {
      pose = M.cameraLerp(poseOpen, poseDrift, M.easeInOut(M.phase(t, P.unfold2[1], P.travel[0])));
    } else if (t < P.zoom[0]) {
      // Blend from the drift pose into tracking the traveler, then track.
      const b = M.easeInOut(M.phase(t, P.travel[0], P.travel[0] + 0.25 * (P.travel[1] - P.travel[0])));
      pose = M.cameraLerp(poseDrift, follow, b);
    } else {
      const hold = { x: toPx.x, y: toPx.y, s: cfg.camera.followZoom };
      pose = M.cameraLerp(hold, poseZoom, M.easeIn(M.phase(t, P.zoom[0], P.zoom[1])));
    }
    pose = clampPose(pose);
    camera.style.transform = M.cameraTransform(pose.x, pose.y, pose.s, W, H);

    // --- Flash out ---
    flash.style.opacity = M.easeIn(M.phase(t, P.flash[0], P.flash[1]));
  };

  window.DURATION = D;
  window.READY = false;

  setup();
  window.seek(0);
  M.installDevScrubber(D);
  Promise.all([
    document.fonts.ready,
    ...stickers.map((s) => (s.el.complete ? Promise.resolve() : new Promise((r) => { s.el.onload = r; s.el.onerror = r; }))),
  ]).then(() => {
    window.seek(0);
    window.READY = true;
  });
})();
