/* Original, transparent 2D generative poster: a restless network finds its geometry. */
const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = value => value * value * (3 - 2 * value);
const BLACK = '#111510';
const ORANGE = '#ff512a';

function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function starPoint(t, result) {
  const steps = 16;
  const position = t * steps;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = (index / steps) * TAU - Math.PI / 2;
  const b = ((index + 1) / steps) * TAU - Math.PI / 2;
  const r1 = index % 2 ? .36 : 1;
  const r2 = index % 2 ? 1 : .36;
  result.x = lerp(Math.cos(a) * r1, Math.cos(b) * r2, fraction);
  result.y = lerp(Math.sin(a) * r1, Math.sin(b) * r2, fraction);
  return result;
}

export class MindScene {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.reducedMotion = !!reducedMotion;
    this.mobile = window.matchMedia('(max-width: 700px)').matches;
    this.progress = this.targetProgress = 0;
    this.pointer = { x: 0, y: 0 };
    this.targetPointer = { x: 0, y: 0 };
    this.energy = 0;
    this.waves = [];
    this.time = 0;
    this.lastTime = 0;
    this.renderTime = 0;
    this.visible = true;
    this.destroyed = false;
    this.frame = 0;
    this.tick = this.tick.bind(this);
    this.visibilityHandler = () => this.syncLoop();
    if (!this.context) return;
    this.build();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      this.syncLoop();
    }, { rootMargin: '120px' });
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.resize();
    this.syncLoop();
  }

  build() {
    const random = randomGenerator(198905);
    const layers = this.mobile ? 4 : 6;
    const perLayer = 32;
    this.nodes = [];
    this.bands = [];
    const target = { x: 0, y: 0 };
    const addNode = (x, y, band, index) => {
      this.nodes.push({
        targetX: x, targetY: y, chaosX: random(), chaosY: random(),
        phase: random() * TAU, phase2: random() * TAU,
        speed: .12 + random() * .24, size: .7 + random() * 1.25,
        accent: index % 31 === 0, band, index,
        x: 0, y: 0
      });
    };
    for (let band = 0; band < layers; band++) {
      const start = this.nodes.length;
      const r = .22 + band / (layers - 1) * .78;
      for (let index = 0; index < perLayer; index++) {
        starPoint(index / perLayer, target);
        addNode(target.x * r, target.y * r, band, index + band * perLayer);
      }
      this.bands.push({ start, count: perLayer, orbit: false });
    }
    for (let orbit = 0; orbit < 2; orbit++) {
      const start = this.nodes.length;
      const count = 24;
      const angle = orbit ? -.49 : .49;
      const c = Math.cos(angle); const s = Math.sin(angle);
      for (let index = 0; index < count; index++) {
        const a = index / count * TAU;
        const x = Math.cos(a) * 1.3;
        const y = Math.sin(a) * .58;
        addNode(x * c - y * s, x * s + y * c, layers + orbit, index + start);
      }
      this.bands.push({ start, count, orbit: true });
    }
    this.starLayers = layers;
    this.perLayer = perLayer;
  }

  resize() {
    if (!this.context || this.destroyed) return;
    // Layout is read on resize only, never during a frame.
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.centerX = this.width * (this.mobile ? .5 : .73);
    this.centerY = this.height * (this.mobile ? .61 : .52);
    this.radius = Math.min(this.width, this.height) * (this.mobile ? .30 : .29);
    this.render();
  }

  setProgress(value) {
    this.targetProgress = clamp(Number(value) || 0);
    if (this.reducedMotion) { this.progress = this.targetProgress; this.render(); }
  }

  setPointer(x, y) {
    this.targetPointer.x = clamp(Number(x) || 0, -1, 1);
    this.targetPointer.y = clamp(Number(y) || 0, -1, 1);
    if (this.reducedMotion) this.render();
  }

  pulse() {
    if (this.reducedMotion || this.destroyed || !this.context) return;
    this.energy = 1;
    this.waves.push({
      x: this.width * (.5 + this.targetPointer.x * .5),
      y: this.height * (.5 + this.targetPointer.y * .5),
      age: 0
    });
    if (this.waves.length > 4) this.waves.shift();
  }

  setReducedMotion(value) {
    this.reducedMotion = !!value;
    if (this.reducedMotion) {
      this.progress = this.targetProgress;
      this.energy = 0;
      this.waves = [];
      this.pointer.x = this.pointer.y = 0;
    }
    this.syncLoop();
    this.render();
  }

  syncLoop() {
    if (!this.context || this.destroyed) return;
    const shouldRun = this.visible && !document.hidden && !this.reducedMotion;
    if (shouldRun && !this.running) {
      this.running = true;
      this.lastTime = 0;
      this.frame = requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.running = false;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  tick(timestamp) {
    if (!this.running || this.destroyed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (this.mobile && timestamp - this.renderTime < 30) return;
    const dt = this.lastTime ? Math.min(.06, (timestamp - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = timestamp;
    this.renderTime = timestamp;
    this.time += dt;
    const speed = 1 - Math.exp(-dt * 5.8);
    this.progress = lerp(this.progress, this.targetProgress, speed);
    this.pointer.x = lerp(this.pointer.x, this.targetPointer.x, 1 - Math.exp(-dt * 4));
    this.pointer.y = lerp(this.pointer.y, this.targetPointer.y, 1 - Math.exp(-dt * 4));
    this.energy *= Math.exp(-dt * 2.8);
    for (const wave of this.waves) wave.age += dt;
    this.waves = this.waves.filter(wave => wave.age < 1.7);
    this.render();
  }

  render() {
    const ctx = this.context;
    if (!ctx || !this.width || this.destroyed) return;
    const w = this.width; const h = this.height;
    ctx.clearRect(0, 0, w, h);
    const order = smooth(clamp(this.progress));
    const chaos = 1 - order;
    const time = this.reducedMotion ? 0 : this.time;
    const rotation = -.08 + time * .028 * order + this.pointer.x * .085;
    const cosine = Math.cos(rotation); const sine = Math.sin(rotation);
    const cx = this.centerX + this.pointer.x * 14;
    const cy = this.centerY + this.pointer.y * 12;
    const radius = this.radius * (1 + this.energy * .045);
    const pointerX = w * (.5 + this.pointer.x * .5);
    const pointerY = h * (.5 + this.pointer.y * .5);
    const influenceRadius = Math.min(w, h) * .29;

    for (const node of this.nodes) {
      const breath = 1 + Math.sin(time * .6 + node.band * .35) * .012 * order;
      const targetX = cx + (node.targetX * cosine - node.targetY * sine) * radius * breath;
      const targetY = cy + (node.targetX * sine + node.targetY * cosine) * radius * breath;
      const chaosX = w * (.09 + node.chaosX * .82) + Math.sin(time * node.speed + node.phase) * w * .07;
      const chaosY = h * (.1 + node.chaosY * .8) + Math.cos(time * node.speed * .9 + node.phase2) * h * .075;
      let x = lerp(chaosX, targetX, order);
      let y = lerp(chaosY, targetY, order);
      if (!this.reducedMotion) {
        const dx = x - pointerX; const dy = y - pointerY;
        const distance = Math.hypot(dx, dy) || 1;
        const influence = Math.max(0, 1 - distance / influenceRadius);
        const force = influence * influence * 17 * (.28 + chaos);
        x += dx / distance * force;
        y += dy / distance * force;
        for (const wave of this.waves) {
          const wx = x - wave.x; const wy = y - wave.y;
          const d = Math.hypot(wx, wy) || 1;
          const waveRadius = wave.age * Math.max(w, h) * .54;
          const amplitude = Math.exp(-Math.pow((d - waveRadius) / 46, 2)) * (1 - wave.age / 1.7) * 26;
          x += wx / d * amplitude;
          y += wy / d * amplitude;
        }
      }
      node.x = x; node.y = y;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const band of this.bands) {
      ctx.beginPath();
      for (let i = 0; i <= band.count; i++) {
        const node = this.nodes[band.start + i % band.count];
        if (i === 0) ctx.moveTo(node.x, node.y); else ctx.lineTo(node.x, node.y);
      }
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = band.orbit ? .7 : band.start === 0 ? 1.3 : .75;
      ctx.globalAlpha = band.orbit ? .18 + order * .29 : .14 + order * .55;
      ctx.stroke();
    }

    // Rays appear only when the system begins to establish a shared structure.
    if (order > .2) {
      ctx.beginPath();
      const outerStart = (this.starLayers - 1) * this.perLayer;
      for (let i = 0; i < this.perLayer; i += 2) {
        const inner = this.nodes[i];
        const outer = this.nodes[outerStart + i];
        ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y);
      }
      ctx.globalAlpha = (order - .2) * .47;
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = .6;
      ctx.stroke();
    }

    // Sparse short cross-links preserve the sense of an evolving analytical diagram.
    ctx.beginPath();
    for (let i = 0; i < this.nodes.length; i += 9) {
      const a = this.nodes[i]; const b = this.nodes[(i + 23) % this.nodes.length];
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.globalAlpha = chaos * .12;
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = .5;
    ctx.stroke();

    for (const node of this.nodes) {
      ctx.beginPath();
      const r = node.accent ? 2.3 + this.energy * 1.8 : node.size * (.78 + order * .34);
      ctx.arc(node.x, node.y, r, 0, TAU);
      ctx.fillStyle = node.accent ? ORANGE : BLACK;
      ctx.globalAlpha = node.accent ? .95 : .28 + order * .48;
      ctx.fill();
      if (node.accent && order > .55) {
        ctx.beginPath(); ctx.arc(node.x, node.y, 6, 0, TAU);
        ctx.lineWidth = .6;
        ctx.strokeStyle = ORANGE;
        ctx.globalAlpha = (order - .55) * .65;
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    const mark = Math.min(w, h) * .021;
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - mark, cy); ctx.lineTo(cx + mark, cy);
    ctx.moveTo(cx, cy - mark); ctx.lineTo(cx, cy + mark);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, mark * 1.55, 0, TAU);
    ctx.strokeStyle = ORANGE;
    ctx.globalAlpha = .24 + order * .62;
    ctx.stroke();

    for (const wave of this.waves) {
      const radius = wave.age * Math.max(w, h) * .54;
      if (radius < 1) continue;
      ctx.beginPath(); ctx.arc(wave.x, wave.y, radius, 0, TAU);
      ctx.strokeStyle = ORANGE;
      ctx.globalAlpha = Math.max(0, .5 * (1 - wave.age / 1.7));
      ctx.lineWidth = .7;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver?.disconnect();
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.context?.clearRect(0, 0, this.width, this.height);
    this.nodes = [];
    this.bands = [];
    this.waves = [];
  }
}
