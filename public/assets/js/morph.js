/* Senu Labs: interactive 3D particle morph (no dependencies)
   Shapes: 0 = phone (Apps), 1 = sphere (VR Worlds), 2 = torus knot (3D Models) */
(() => {
  const canvas = document.getElementById("morph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const chips = [...document.querySelectorAll(".morph-chips .chip")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const N = window.innerWidth < 760 ? 1100 : 1900;
  const HOLD = 4800;   // ms each shape is held
  const MORPH = 1600;  // ms morph duration

  // ---------- shape generators (unit space, roughly radius 1) ----------
  const rand = (a, b) => a + Math.random() * (b - a);

  function sphere(n) {
    const pts = [], g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = g * i;
      pts.push([Math.cos(t) * r * 1.05, y * 1.05, Math.sin(t) * r * 1.05]);
    }
    return pts;
  }

  function phone(n) {
    const W = 0.6, H = 1.2, R = 0.14, D = 0.07, pts = [];
    // point on rounded-rect outline, param u in [0,1)
    const straightW = 2 * (W - R), straightH = 2 * (H - R), arc = (Math.PI / 2) * R;
    const per = 2 * straightW + 2 * straightH + 4 * arc;
    const outline = (u) => {
      let d = u * per;
      const segs = [
        [straightW, (t) => [-W + R + t, -H]],
        [arc, (t) => { const a = -Math.PI / 2 + t / R; return [W - R + Math.cos(a) * R, -H + R + Math.sin(a) * R]; }],
        [straightH, (t) => [W, -H + R + t]],
        [arc, (t) => { const a = t / R; return [W - R + Math.cos(a) * R, H - R + Math.sin(a) * R]; }],
        [straightW, (t) => [W - R - t, H]],
        [arc, (t) => { const a = Math.PI / 2 + t / R; return [-W + R + Math.cos(a) * R, H - R + Math.sin(a) * R]; }],
        [straightH, (t) => [-W, H - R - t]],
        [arc, (t) => { const a = Math.PI + t / R; return [-W + R + Math.cos(a) * R, -H + R + Math.sin(a) * R]; }],
      ];
      for (const [len, f] of segs) { if (d <= len) return f(d); d -= len; }
      return [-W + R, -H];
    };
    const nOutline = Math.floor(n * 0.42), nScreen = Math.floor(n * 0.38);
    for (let i = 0; i < nOutline; i++) {
      const [x, y] = outline(i / nOutline);
      pts.push([x, y, i % 2 ? D : -D]);
    }
    // screen: grid of "app icons" + a status bar
    const cols = 4, rows = 6, iw = 0.18, gap = (2 * W - 0.2 - cols * iw) / (cols - 1);
    for (let i = 0; i < nScreen; i++) {
      if (i % 9 === 0) { pts.push([rand(-W + 0.12, W - 0.12), -H + 0.13, D]); continue; }
      const c = i % cols, r = Math.floor(i / cols) % rows;
      const x0 = -W + 0.1 + c * (iw + gap), y0 = -H + 0.3 + r * 0.3;
      pts.push([x0 + rand(0, iw), y0 + rand(0, iw), D]);
    }
    while (pts.length < n) { // home indicator + sparse back
      pts.push(pts.length % 3 ? [rand(-W, W) * 0.9, rand(-H, H) * 0.95, -D] : [rand(-0.15, 0.15), H - 0.1, D]);
    }
    return pts;
  }

  function knot(n) {
    const pts = [], p = 2, q = 3;
    const curve = (t) => {
      const r = 0.55 + 0.25 * Math.cos(q * t);
      return [r * Math.cos(p * t), 0.25 * Math.sin(q * t) * 1.4, r * Math.sin(p * t)];
    };
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const c = curve(t), c2 = curve(t + 0.001);
      // tangent + an arbitrary normal frame for the tube
      let T = [c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]];
      const tl = Math.hypot(...T); T = T.map((v) => v / tl);
      let Nn = [T[1], -T[0], 0]; const nl = Math.hypot(...Nn) || 1; Nn = Nn.map((v) => v / nl);
      const B = [T[1] * Nn[2] - T[2] * Nn[1], T[2] * Nn[0] - T[0] * Nn[2], T[0] * Nn[1] - T[1] * Nn[0]];
      const a = (i * 2.399) % (Math.PI * 2), tr = 0.11;
      pts.push([0, 1, 2].map((k) => (c[k] + tr * (Math.cos(a) * Nn[k] + Math.sin(a) * B[k])) * 1.45));
    }
    return pts;
  }

  const shapes = [phone(N), sphere(N), knot(N)];
  // shuffle each shape so morphs swirl instead of sweeping in order
  shapes.forEach((s) => { for (let i = s.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [s[i], s[j]] = [s[j], s[i]]; } });

  const P = new Float32Array(N * 3);
  shapes[0].forEach((p, i) => P.set(p, i * 3));
  const delay = Float32Array.from({ length: N }, () => Math.random() * 0.35);
  const twinkle = Float32Array.from({ length: N }, () => Math.random() * Math.PI * 2);

  let from = 0, to = 0, morphStart = -1, lastSwitch = performance.now();

  function goTo(idx, manual) {
    if (idx === to && morphStart < 0) return;
    fromSnapshot = P.slice();
    from = to; to = idx; morphStart = performance.now(); lastSwitch = morphStart + (manual ? 3000 : 0);
    chips.forEach((c, i) => c.classList.toggle("active", i === idx));
  }
  let fromSnapshot = P.slice();
  chips.forEach((c, i) => c.addEventListener("click", () => goTo(i, true)));

  // ---------- interaction ----------
  let rotY = 0.4, rotX = -0.15, velY = 0.0035, tiltX = 0, tiltY = 0;
  let dragging = false, lastX = 0, lastY = 0, pointer = { x: 9, y: 9 };
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", () => (dragging = false));
  canvas.addEventListener("pointerleave", () => (pointer = { x: 9, y: 9 }));
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
    if (dragging) {
      velY = (e.clientX - lastX) * 0.004;
      rotX = Math.max(-1, Math.min(1, rotX + (e.clientY - lastY) * 0.004));
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  // ---------- render ----------
  let w = 0, h = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // pre-rendered glow sprite
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const sg = sprite.getContext("2d").createRadialGradient(16, 16, 0, 16, 16, 16);
  sg.addColorStop(0, "rgba(220,255,230,1)");
  sg.addColorStop(0.25, "rgba(57,255,136,.9)");
  sg.addColorStop(1, "rgba(34,197,94,0)");
  const sctx = sprite.getContext("2d"); sctx.fillStyle = sg; sctx.fillRect(0, 0, 32, 32);

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    // auto-advance
    if (morphStart < 0 && now - lastSwitch > HOLD && !dragging) goTo((to + 1) % shapes.length);

    // morph positions
    if (morphStart >= 0) {
      const k = (now - morphStart) / MORPH;
      const target = shapes[to];
      for (let i = 0; i < N; i++) {
        let t = Math.min(1, Math.max(0, (k - delay[i]) / (1 - 0.35)));
        t = ease(t);
        const lift = Math.sin(t * Math.PI) * 0.35; // particles burst outward mid-morph
        for (let a = 0; a < 3; a++) {
          const v = fromSnapshot[i * 3 + a] + (target[i][a] - fromSnapshot[i * 3 + a]) * t;
          P[i * 3 + a] = v * (1 + lift);
        }
      }
      if (k >= 1) { morphStart = -1; lastSwitch = now; }
    }

    if (!dragging) velY += (0.0035 - velY) * 0.03;
    rotY += velY;
    const hover = Math.abs(pointer.x) < 1.2;
    tiltX += ((hover ? pointer.y * 0.35 : 0) - tiltX) * 0.05;
    tiltY += ((hover ? pointer.x * 0.5 : 0) - tiltY) * 0.05;

    const cy = Math.cos(rotY + tiltY), sy = Math.sin(rotY + tiltY);
    const cx = Math.cos(rotX + tiltX), sx = Math.sin(rotX + tiltX);
    const scale = Math.min(w, h) * 0.36, fov = 3.2, ox = w / 2, oy = h / 2 - h * 0.03;
    const mx = pointer.x * w / 2 + ox, my = pointer.y * h / 2 + oy;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N; i++) {
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      let y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const persp = fov / (fov + z2);
      let px = ox + x1 * scale * persp, py = oy + y1 * scale * persp;
      // pointer repulsion
      const dx = px - mx, dy = py - my, d2 = dx * dx + dy * dy;
      if (d2 < 6400) { const f = (1 - d2 / 6400) * 18; const d = Math.sqrt(d2) || 1; px += (dx / d) * f; py += (dy / d) * f; }
      const depth = (1 - z2) / 2; // 0 back .. 1 front
      const tw = 0.75 + 0.25 * Math.sin(now * 0.003 + twinkle[i]);
      ctx.globalAlpha = Math.max(0.08, Math.min(1, (0.15 + depth * 0.85) * tw));
      const s = (1.6 + depth * 4.2) * persp;
      ctx.drawImage(sprite, px - s, py - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // run only when visible
  let raf = 0, visible = true;
  const loop = (t) => { frame(t); raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible && !reduce) raf = requestAnimationFrame(loop);
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && visible && !reduce) raf = requestAnimationFrame(loop);
  });

  if (reduce) {
    // static frame; chips still switch shapes instantly
    frame(performance.now());
    chips.forEach((c, i) => c.addEventListener("click", () => {
      shapes[i].forEach((p, j) => P.set(p, j * 3)); to = i; morphStart = -1; frame(performance.now());
    }));
  }
})();
