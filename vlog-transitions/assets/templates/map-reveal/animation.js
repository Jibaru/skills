// map-reveal — folded paper map unfolds full-screen, sticker pops on the
// location with a quick damped left-right wiggle, then a fast zoom + white
// flash to cut into the next clip.
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

  // Phase windows in seconds. Defaults are fractions of the total duration so
  // changing durationSeconds keeps the choreography; cfg.phases overrides any.
  const P = Object.assign(
    {
      unfold1: [0.04 * D, 0.30 * D], // right unit swings open (rotateY)
      unfold2: [0.30 * D, 0.50 * D], // bottom quarters swing down (rotateX)
      markers: [0.50 * D, 0.60 * D],
      pop:     [0.53 * D, 0.68 * D],
      wiggle:  [0.66 * D, 0.88 * D],
      zoom:    [0.80 * D, 1.00 * D],
      flash:   [0.92 * D, 1.00 * D],
    },
    cfg.phases || {}
  );

  const el = (id) => document.getElementById(id);
  const stage = el('stage');
  const camera = el('camera');
  const paper = el('paper-scene');
  const flat = el('flat');
  const flash = el('flash');

  // Primary location: where the sticker lands and where the final zoom dives.
  const primary = cfg.locations[0];
  const primaryPx = M.locPx(primary, W, H);

  let markers = [];
  let stickers = [];

  // Keep the camera inside the map so the desk never peeks in at the edges.
  const clampPose = (pose) => ({
    x: M.clamp(pose.x, W / (2 * pose.s), W - W / (2 * pose.s)),
    y: M.clamp(pose.y, H / (2 * pose.s), H - H / (2 * pose.s)),
    s: pose.s,
  });

  function setup() {
    // Each quarter crops the shared 1920x1080 map via its viewBox.
    const crops = { 'crop-tl': [0, 0], 'crop-tr': [960, 0], 'crop-bl': [0, 540], 'crop-br': [960, 540] };
    for (const [id, [x, y]] of Object.entries(crops)) {
      el(id).setAttribute('viewBox', `${x} ${y} 960 540`);
    }
    markers = M.buildMarkers(el('marker-layer'), cfg, W, H);
    stickers = M.buildStickers(el('sticker-layer'), cfg, W, H);
  }

  window.seek = function seek(t) {
    M.fitStage(stage, W, H);

    // --- Unfold ---
    // Fold directions are chosen so the paper BACK faces the viewer while
    // folded, and translateZ separates the stacked layers (it decays to 0 as
    // the paper opens, so the flat map has no parallax misalignment).
    const u1 = M.easeInOut(M.phase(t, P.unfold1[0], P.unfold1[1]));
    const u2 = M.easeInOut(M.phase(t, P.unfold2[0], P.unfold2[1]));
    const a1 = -180 * (1 - u1); // right unit: folded over the left -> 0
    const a2 = 180 * (1 - u2);  // bottom quarters: folded up in front -> 0
    el('right-unit').style.transform = `translateZ(${24 * (1 - u1)}px) rotateY(${a1}deg)`;
    el('q-bl').style.transform = `translateZ(${6 * (1 - u2)}px) rotateX(${a2}deg)`;
    el('q-br').style.transform = `translateZ(${6 * (1 - u2)}px) rotateX(${a2}deg)`;

    // Fold shading — flaps darken most edge-on, statics stay dim while covered.
    const s1 = Math.sin(Math.PI * Math.abs(a1) / 180) * 0.4;
    const s2 = Math.sin(Math.PI * Math.abs(a2) / 180) * 0.4;
    el('shade-tr').style.opacity = s1;
    el('shade-br').style.opacity = Math.max(s1, s2);
    el('shade-bl').style.opacity = s2;
    el('shade-tl').style.opacity = 0.25 * (1 - u1);
    // Back faces: a resting shade sells the stacked-paper look while folded,
    // plus the same edge-on darkening while the flap moves.
    el('bshade-tr').style.opacity = 0.12 * (1 - u1) + s1 * 0.6;
    el('bshade-bl').style.opacity = 0.18 * (1 - u2) + s2 * 0.6;
    el('bshade-br').style.opacity = 0.18 * (1 - u2) + s2 * 0.6;

    // Swap the quartered paper for the flat scene once fully open.
    const open = t >= P.unfold2[1];
    paper.style.display = open ? 'none' : 'block';
    flat.style.display = open ? 'block' : 'none';

    // --- Markers + stickers ---
    markers.forEach((m, i) => {
      const p = M.pop(M.phase(t, P.markers[0] + i * 0.04, P.markers[1] + i * 0.04));
      m.el.style.transform = `scale(${p})`;
    });
    const wig = M.wiggle(M.phase(t, P.wiggle[0], P.wiggle[1]), cfg.wiggle.degrees, cfg.wiggle.cycles);
    stickers.forEach((s) => {
      const p = M.pop(M.phase(t, P.pop[0] + s.index * 0.05, P.pop[1] + s.index * 0.05));
      s.el.style.transform = M.stickerTransform(p, wig, s.baseRot);
    });

    // --- Camera ---
    // Folded packet occupies the top-left 960x540 region; at scale 2 centered
    // on it, frame 0 is fully covered by paper back.
    const poseFold = { x: 480, y: 270, s: 2.05 };
    const poseOpen = { x: 960, y: 540, s: 1.0 };
    const posePush = {
      x: M.lerp(960, primaryPx.x, 0.3),
      y: M.lerp(540, primaryPx.y, 0.3),
      s: cfg.camera.pushIn,
    };
    const poseZoom = { x: primaryPx.x, y: primaryPx.y, s: cfg.camera.finalZoom };

    let pose;
    if (t < P.unfold2[1]) {
      pose = M.cameraLerp(poseFold, poseOpen, M.easeInOut(M.phase(t, P.unfold1[0], P.unfold2[1])));
    } else if (t < P.zoom[0]) {
      pose = M.cameraLerp(poseOpen, posePush, M.easeInOut(M.phase(t, P.unfold2[1], P.zoom[0])));
    } else {
      pose = M.cameraLerp(posePush, poseZoom, M.easeIn(M.phase(t, P.zoom[0], P.zoom[1])));
    }
    if (t >= P.unfold2[1]) {
      pose = clampPose(pose);
    }
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
