/* Original Canvas2D chrome constellation. No textures, network, or runtime dependencies. */
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function randomSource() {
  let seed = 471921;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function mesh(vertices, indices) {
  const faces = indices.map(indices => {
    let [a, b, c] = indices.map(index => vertices[index]);
    const u = b.map((n, i) => n - a[i]);
    const v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const middle = a.map((n, i) => (n + b[i] + c[i]) / 3);
    if (normal.reduce((sum, n, i) => sum + n * middle[i], 0) < 0) {
      indices = [indices[0], indices[2], indices[1]];
      for (let i = 0; i < 3; i++) normal[i] *= -1;
    }
    const length = Math.hypot(...normal) || 1;
    return { indices, normal: normal.map(n => n / length) };
  });
  return { vertices, faces };
}

const DIAMOND = mesh(
  [[1, 0, 0], [-1, 0, 0], [0, 1.55, 0], [0, -1.55, 0], [0, 0, 1], [0, 0, -1]],
  [[2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0], [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5]]
);
const STAR = (() => {
  const vertices = [[-.48, -.48, -.48], [.48, -.48, -.48], [.48, .48, -.48], [-.48, .48, -.48], [-.48, -.48, .48], [.48, -.48, .48], [.48, .48, .48], [-.48, .48, .48], [0, 0, -1.65], [0, 0, 1.65], [-1.65, 0, 0], [1.65, 0, 0], [0, -1.65, 0], [0, 1.65, 0]];
  const sides = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5], [0, 1, 5, 4], [3, 2, 6, 7]];
  return mesh(vertices, sides.flatMap((side, i) => side.map((vertex, j) => [vertex, side[(j + 1) % 4], i + 8])));
})();

function rotate(point, x, y, z) {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  const py = point[1] * cx - point[2] * sx;
  const pz = point[1] * sx + point[2] * cx;
  const px = point[0] * cy + pz * sy;
  const qz = -point[0] * sy + pz * cy;
  return [px * cz - py * sz, px * sz + py * cz, qz];
}

/**
 * A perspective orbit of mirrored polyhedra, designed for an orange contact chapter.
 * External pointer values are normalized to -1..1; progress is normalized to 0..1.
 */
export class PrismField {
  constructor(canvas, { reducedMotion = false } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PrismField needs a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('Canvas2D is unavailable.');
    this.mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const cores = typeof navigator === 'object' ? navigator.hardwareConcurrency : 0;
    const saveData = typeof navigator === 'object' && navigator.connection?.saveData;
    this.lowPower = this.mobile || !!saveData || (cores > 0 && cores <= 4);
    this.frameInterval = 1000 / (this.lowPower ? 30 : 60);
    this.reduced = !!reducedMotion;
    this.destroyed = false;
    this.pageHidden = false;
    this.progress = this.progressTarget = 0;
    this.pointer = [0, 0];
    this.pointerTarget = [0, 0];
    this.energy = 0;
    this.time = 0;
    this.lastFrame = 0;
    this.raf = 0;
    this.fragments = [];
    this.shockwaves = [];
    this.width = this.height = 0;
    this.random = randomSource();
    const bounds = canvas.getBoundingClientRect();
    this.intersecting = bounds.bottom >= -80 && bounds.top <= (window.innerHeight || 1000) + 80;
    this.crystals = Array.from({ length: this.lowPower ? 30 : 46 }, (_, i) => {
      const random = this.random;
      const outer = i % 5 !== 0;
      return {
        angle: i / (this.lowPower ? 30 : 46) * TAU + (random() - .5) * .19,
        radius: outer ? 2.30 + random() * .56 : 1.51 + random() * .23,
        height: (random() - .5) * .28,
        size: .073 + random() * .079 + (i % 11 === 0 ? .055 : 0),
        mesh: i % 3 === 0 ? STAR : DIAMOND,
        spin: [random() * TAU, random() * TAU, random() * TAU],
        speed: (outer ? 1 : -.75) * (.65 + random() * .45),
        black: i % 5 === 1,
        seed: random() * TAU
      };
    });
    this.tick = this.tick.bind(this);
    this.onVisibility = () => this.syncLoop();
    this.onPageHide = () => { this.pageHidden = true; this.syncLoop(); };
    this.onPageShow = () => { this.pageHidden = false; this.lastFrame = 0; this.syncLoop(); };
    this.onPulse = () => this.pulse();
    this.onResize = () => this.resize();
    canvas.addEventListener('pointerdown', this.onPulse, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(canvas);
    } else window.addEventListener('resize', this.onResize, { passive: true });
    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.intersecting = entries[0].isIntersecting;
        this.syncLoop();
      }, { rootMargin: '80px' });
      this.intersectionObserver.observe(canvas);
    }
    this.resize();
    this.syncLoop();
  }

  active() {
    return !this.destroyed && !this.pageHidden && !document.hidden && this.intersecting && this.width > 0 && this.height > 0;
  }

  resize() {
    if (this.destroyed) return;
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(0, Math.round(bounds.width));
    const height = Math.max(0, Math.round(bounds.height));
    if (!width || !height) { this.width = this.height = 0; this.syncLoop(); return; }
    this.width = width;
    this.height = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.syncLoop();
  }

  syncLoop() {
    if (!this.active() || this.reduced) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.lastFrame = 0;
      if (this.active()) this.render();
      return;
    }
    if (!this.raf) { this.lastFrame = 0; this.render(); this.raf = requestAnimationFrame(this.tick); }
  }

  tick(timestamp) {
    this.raf = 0;
    if (!this.active() || this.reduced) return;
    if (!this.lastFrame) this.lastFrame = timestamp - this.frameInterval;
    const elapsed = timestamp - this.lastFrame;
    if (elapsed + .35 >= this.frameInterval) {
      const dt = Math.min(elapsed / 1000, .065);
      this.lastFrame = timestamp;
      this.time += dt;
      const smoothing = 1 - Math.exp(-dt * 5.8);
      this.progress = lerp(this.progress, this.progressTarget, smoothing);
      this.pointer[0] = lerp(this.pointer[0], this.pointerTarget[0], smoothing);
      this.pointer[1] = lerp(this.pointer[1], this.pointerTarget[1], smoothing);
      this.energy *= Math.exp(-dt * 2.8);
      for (const fragment of this.fragments) {
        fragment.life -= dt;
        for (let i = 0; i < 3; i++) fragment.position[i] += fragment.velocity[i] * dt;
        fragment.velocity[1] += dt * .45;
        fragment.angle += dt * fragment.spin;
      }
      this.fragments = this.fragments.filter(fragment => fragment.life > 0);
      for (const wave of this.shockwaves) wave.age += dt;
      this.shockwaves = this.shockwaves.filter(wave => wave.age < 1.3);
      this.render();
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  setProgress(value) {
    if (this.destroyed || !Number.isFinite(value)) return;
    this.progressTarget = clamp(value);
    // Reduced motion keeps one composition, including while scrolling.
    if (this.reduced) return;
    this.syncLoop();
  }

  setPointer(x, y) {
    if (this.destroyed || this.reduced) return;
    this.pointerTarget[0] = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
    this.pointerTarget[1] = Number.isFinite(y) ? clamp(y, -1, 1) : 0;
  }

  pulse() {
    if (this.destroyed || this.reduced || !this.active()) return;
    this.energy = Math.min(1.5, this.energy + 1);
    const random = this.random;
    const origin = [this.pointer[0] * 1.4, -this.pointer[1] * .9, .35];
    this.shockwaves.push({ origin: [...origin], age: 0 });
    this.shockwaves = this.shockwaves.slice(-3);
    for (let i = 0; i < (this.lowPower ? 20 : 34); i++) {
      const azimuth = random() * TAU;
      const elevation = (random() - .5) * 1.7;
      const speed = 1.4 + random() * 2.4;
      this.fragments.push({
        position: [...origin], velocity: [Math.cos(azimuth) * speed, Math.sin(azimuth) * speed * .7, Math.sin(elevation) * speed],
        life: 1.35 + random() * .25, maxLife: 1.6, size: .028 + random() * .045,
        angle: random() * TAU, spin: (random() - .5) * 8, black: i % 3 === 0
      });
    }
    this.fragments = this.fragments.slice(-(this.lowPower ? 60 : 102));
    this.syncLoop();
  }

  setReducedMotion(value) {
    if (this.destroyed || this.reduced === !!value) return;
    this.reduced = !!value;
    if (this.reduced) {
      this.pointer = [0, 0];
      this.pointerTarget = [0, 0];
      this.energy = 0;
      this.fragments = [];
      this.shockwaves = [];
    }
    this.syncLoop();
  }

  project(point) {
    const distance = this.camera - point[2];
    if (distance < .65) return null;
    const perspective = this.camera / distance;
    return [this.centerX + point[0] * this.unit * perspective, this.centerY + point[1] * this.unit * perspective, perspective];
  }

  ring(radius, secondary = false) {
    const ctx = this.ctx;
    const steps = this.lowPower ? 84 : 112;
    const points = Array.from({ length: steps + 1 }, (_, i) => {
      const angle = i / steps * TAU;
      const point = rotate([Math.cos(angle) * radius, Math.sin(angle) * radius, 0], this.pitch + (secondary ? .13 : 0), this.yaw, this.roll);
      return { point, screen: this.project(point) };
    });
    ctx.lineWidth = secondary ? .75 : 1.2;
    for (let i = 0; i < steps; i++) {
      const a = points[i], b = points[i + 1];
      if (!a.screen || !b.screen) continue;
      const front = a.point[2] > 0;
      const alpha = secondary ? .10 : (front ? .34 : .15);
      ctx.strokeStyle = `rgba(23,20,20,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.screen[0], a.screen[1]);
      ctx.lineTo(b.screen[0], b.screen[1]);
      ctx.stroke();
      if (!secondary && i % 7 === 0) {
        const outer = rotate([Math.cos(i / steps * TAU) * (radius + .085), Math.sin(i / steps * TAU) * (radius + .085), 0], this.pitch, this.yaw, this.roll);
        const tip = this.project(outer);
        if (!tip) continue;
        ctx.beginPath(); ctx.moveTo(a.screen[0], a.screen[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      }
    }
  }

  drawCrystal(crystal) {
    const ctx = this.ctx;
    const { position, rotation, size, geometry, black } = crystal;
    const worldVertices = geometry.vertices.map(vertex => {
      const rotated = rotate(vertex, ...rotation);
      return rotated.map((n, i) => n * size + position[i]);
    });
    const vertices = worldVertices.map(vertex => this.project(vertex));
    const centerScreen = this.project(position);
    if (!centerScreen) return;
    const reflectionSize = size * this.unit * centerScreen[2];
    const chrome = ctx.createLinearGradient(centerScreen[0] - reflectionSize * 1.65, centerScreen[1] - reflectionSize, centerScreen[0] + reflectionSize * 1.65, centerScreen[1] + reflectionSize);
    for (const [offset, color] of [[0, '#090b0e'], [.18, '#151a20'], [.30, '#fafbf6'], [.36, '#ffffff'], [.43, '#717d88'], [.52, '#101519'], [.58, '#222a31'], [.73, '#f5f8f7'], [.79, '#ffffff'], [.88, '#78858e'], [1, '#101419']]) chrome.addColorStop(offset, color);
    const faces = geometry.faces.map(face => {
      const normal = rotate(face.normal, ...rotation);
      const center = face.indices.map(i => worldVertices[i]).reduce((a, b) => a.map((n, i) => n + b[i] / 3), [0, 0, 0]);
      const view = [-center[0], -center[1], this.camera - center[2]];
      return { ...face, normal, center, facing: normal.reduce((sum, n, i) => sum + n * view[i], 0) };
    }).filter(face => face.facing > 0).sort((a, b) => a.center[2] - b.center[2]);
    for (const face of faces) {
      const points = face.indices.map(index => vertices[index]);
      if (points.some(point => !point)) continue;
      const [nx, ny, nz] = face.normal;
      const light = clamp(-nx * .43 - ny * .67 + nz * .58);
      const reflection = Math.pow(clamp(1 - Math.abs(ny * .82 + nx * .36 - .12)), 17);
      const darkStripe = Math.pow(clamp(1 - Math.abs(ny - nz * .22 + .19)), 12);
      const brightness = black
        ? clamp(10 + light * 23 + reflection * 138, 9, 195)
        : clamp(38 + light * 98 + reflection * 139 - darkStripe * 84, 15, 252);
      const b = Math.round(brightness);
      ctx.fillStyle = `rgb(${b},${Math.min(255, b + 2)},${Math.min(255, b + 5)})`;
      ctx.strokeStyle = reflection > .42 ? 'rgba(255,255,255,.60)' : 'rgba(17,16,18,.22)';
      ctx.lineWidth = .48;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      ctx.lineTo(points[1][0], points[1][1]);
      ctx.lineTo(points[2][0], points[2][1]);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = chrome;
      ctx.globalAlpha = black ? .07 + reflection * .83 : .45 + light * .43;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }

  render() {
    if (!this.active()) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const p = this.reduced ? .34 : this.progress;
    const t = this.reduced ? 0 : this.time;
    this.centerX = this.width * .5 + this.pointer[0] * this.width * .025;
    this.centerY = this.height * .52 + this.pointer[1] * this.height * .018;
    this.unit = Math.min(this.width * (this.mobile ? .235 : .194), this.height * .43) * lerp(.93, 1.16, p);
    this.camera = lerp(8.2, 6.1, p);
    this.pitch = 1.04 + this.pointer[1] * .17;
    this.yaw = -.14 + this.pointer[0] * .23;
    this.roll = lerp(-.27, .16, p);
    this.ring(2.52 + this.energy * .10);
    this.ring(2.81, true);
    const crystals = this.crystals.map(item => {
      const angle = item.angle + t * .10 * item.speed + p * .42;
      const radius = item.radius + this.energy * .20;
      const orbit = [Math.cos(angle) * radius, Math.sin(angle) * radius, item.height + Math.sin(t * .34 + item.seed) * (this.reduced ? 0 : .055)];
      const position = rotate(orbit, this.pitch, this.yaw, this.roll);
      position[2] += p * .48;
      return {
        position, size: item.size * (1 + this.energy * .14), geometry: item.mesh, black: item.black,
        rotation: [item.spin[0] + t * .24 * item.speed, item.spin[1] + t * .29 + this.energy * .35, item.spin[2] + t * .15]
      };
    }).sort((a, b) => a.position[2] - b.position[2]);
    for (const crystal of crystals) this.drawCrystal(crystal);
    for (const wave of this.shockwaves) {
      const center = this.project(wave.origin);
      if (!center) continue;
      const alpha = (1 - wave.age / 1.3) ** 2;
      ctx.strokeStyle = `rgba(255,250,239,${alpha * .65})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(center[0], center[1], Math.max(1, wave.age * this.unit * 2.8), Math.max(1, wave.age * this.unit * 1.35), this.roll, 0, TAU); ctx.stroke();
    }
    for (const fragment of this.fragments) {
      const screen = this.project(fragment.position);
      if (!screen) continue;
      ctx.globalAlpha = clamp(fragment.life / .65);
      ctx.fillStyle = fragment.black ? '#211c1e' : '#f9f5eb';
      const size = fragment.size * this.unit * screen[2];
      const angle = fragment.angle;
      ctx.beginPath();
      ctx.moveTo(screen[0] + Math.cos(angle) * size * 1.7, screen[1] + Math.sin(angle) * size * 1.7);
      ctx.lineTo(screen[0] + Math.cos(angle + 2.5) * size, screen[1] + Math.sin(angle + 2.5) * size);
      ctx.lineTo(screen[0] + Math.cos(angle + 4) * size * .8, screen[1] + Math.sin(angle + 4) * size * .8);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Four polished compass fittings give the orbit the feel of a physical instrument.
    for (let i = 0; i < 4; i++) {
      const angle = i * TAU / 4 + t * .028;
      const world = rotate([Math.cos(angle) * 2.81, Math.sin(angle) * 2.81, 0], this.pitch + .13, this.yaw, this.roll);
      const point = this.project(world);
      if (!point) continue;
      const size = 3.5 * point[2];
      ctx.fillStyle = '#e8e4df'; ctx.strokeStyle = 'rgba(32,24,23,.7)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(point[0], point[1] - size); ctx.lineTo(point[0] + size, point[1]); ctx.lineTo(point[0], point[1] + size); ctx.lineTo(point[0] - size, point[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPulse);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('resize', this.onResize);
    this.fragments = [];
    this.shockwaves = [];
    this.crystals = [];
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

export default PrismField;
