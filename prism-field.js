/* Local chrome constellation: real studio reflections, with the original Canvas2D fallback. */
import * as THREE from './vendor/three.module.js';
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
class CanvasPrismField {
  constructor(canvas, { reducedMotion = false } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PrismField needs a canvas.');
    this.canvas = canvas;
    this.backend = 'canvas2d';
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


/** Cut small bevels around the existing polyhedra instead of changing their silhouettes. */
function beveledGeometry(source, bevel = .075) {
  const vertices = source.vertices.map(point => new THREE.Vector3(...point));
  const panels = source.faces.map(face => {
    const center = face.indices.reduce((value, index) => value.add(vertices[index]), new THREE.Vector3()).multiplyScalar(1 / 3);
    const points = face.indices.map(index => vertices[index].clone().lerp(center, bevel));
    return { indices: face.indices, points, normal: new THREE.Vector3(...face.normal) };
  });
  const positions = [], normals = [];
  const pointNormals = new Map();
  const addTriangle = (a, b, c, shading = null) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const middle = a.clone().add(b).add(c);
    if (normal.dot(middle) < 0) {
      [b, c] = [c, b]; if (shading) [shading[1], shading[2]] = [shading[2], shading[1]];
      normal.negate();
    }
    normal.normalize();
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (const n of shading || [normal, normal, normal]) normals.push(n.x, n.y, n.z);
  };
  const edges = new Map();
  const corners = vertices.map(() => []);
  for (const panel of panels) {
    addTriangle(...panel.points, [panel.normal, panel.normal, panel.normal]);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, a = panel.indices[i], b = panel.indices[j];
      corners[a].push(panel.points[i]);
      pointNormals.set(panel.points[i], panel.normal);
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      const part = { a, b, start: panel.points[i], end: panel.points[j], normal: panel.normal };
      const previous = edges.get(key);
      if (previous) {
        const start = previous.a === a ? previous.start : previous.end;
        const end = previous.a === a ? previous.end : previous.start;
        addTriangle(part.start, part.end, end, [panel.normal, panel.normal, previous.normal]);
        addTriangle(part.start, end, start, [panel.normal, previous.normal, previous.normal]);
      } else edges.set(key, part);
    }
  }
  corners.forEach((points, index) => {
    const axis = vertices[index].clone().normalize();
    const tangent = new THREE.Vector3(Math.abs(axis.y) > .8 ? 1 : 0, Math.abs(axis.y) > .8 ? 0 : 1, 0).cross(axis).normalize();
    const bitangent = axis.clone().cross(tangent).normalize();
    const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
    points.sort((a, b) => {
      const aa = a.clone().sub(center), bb = b.clone().sub(center);
      return Math.atan2(aa.dot(bitangent), aa.dot(tangent)) - Math.atan2(bb.dot(bitangent), bb.dot(tangent));
    });
    for (let i = 0; i < points.length; i++) addTriangle(center, points[i], points[(i + 1) % points.length], [axis, pointNormals.get(points[i]), pointNormals.get(points[(i + 1) % points.length])]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Same public API as the original field. The GPU scene is created only near the viewport.
 * Studio lighting is drawn locally: no external images, HDR files, postprocessing or shadows.
 */
export class PrismField {
  constructor(canvas, { reducedMotion = false } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PrismField needs a canvas.');
    this.canvas = canvas;
    this.backend = 'pending';
    this.mobile = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 0;
    this.lowPower = this.mobile || !!navigator.connection?.saveData || (cores > 0 && cores <= 4);
    this.frameInterval = 1000 / (this.lowPower ? 30 : 60);
    this.reduced = !!reducedMotion;
    this.destroyed = false; this.pageHidden = false;
    this.progress = this.progressTarget = 0;
    this.pointer = [0, 0]; this.pointerTarget = [0, 0];
    this.energy = 0; this.time = 0; this.lastFrame = 0; this.raf = 0;
    this.width = this.height = 0;
    this.resources = new Set();
    this.fragments = []; this.shockwaves = [];
    this.random = randomSource();
    this.crystals = [];
    this.tick = this.tick.bind(this);
    this.onResize = () => this.resize();
    this.onVisibility = () => this.syncLoop();
    this.onPageHide = () => { this.pageHidden = true; this.syncLoop(); };
    this.onPageShow = () => { this.pageHidden = false; this.lastFrame = 0; this.syncLoop(); };
    this.onPulse = () => this.pulse();
    this.onContextLost = event => { event.preventDefault(); if (!this.destroyed) this.useFallback(); };
    const bounds = canvas.getBoundingClientRect();
    this.intersecting = bounds.bottom >= -200 && bounds.top <= innerHeight + 200;
    canvas.addEventListener('pointerdown', this.onPulse, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.onResize); this.resizeObserver.observe(canvas);
    } else window.addEventListener('resize', this.onResize, { passive: true });
    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.intersecting = entries[0].isIntersecting; this.syncLoop();
      }, { rootMargin: '200px' });
      this.intersectionObserver.observe(canvas);
    }
    this.resize();
  }

  own(resource) { this.resources.add(resource); return resource; }
  active() {
    return !this.destroyed && !this.pageHidden && !document.hidden && this.intersecting && this.width > 0 && this.height > 0;
  }

  initialize() {
    if (this.backend !== 'pending' || !this.active()) return;
    this.backend = 'initializing';
    try {
      this.setup(); this.backend = 'webgl'; this.progress = this.progressTarget;
      this.resize(); this.render();
    } catch (error) {
      console.warn('Chrome field switched to Canvas2D:', error.message);
      this.useFallback();
    }
  }

  setup() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: !this.lowPower, powerPreference: this.lowPower ? 'low-power' : 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.lowPower ? 1.25 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(33, 1, .1, 45);
    this.camera.position.z = 9.2;
    const key = new THREE.DirectionalLight(0xf6faff, 4.5); key.position.set(-3, 4, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 3.2); rim.position.set(4, 1, -3); this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0xd0dbe0, .16));
    this.environment();
    this.cluster = new THREE.Group(); this.scene.add(this.cluster);
    this.orbitRotation = new THREE.Euler(1.04, -.14, -.23);
    const silver = this.own(new THREE.MeshPhysicalMaterial({
      color: 0xe5edf1, metalness: 1, roughness: .135, envMapIntensity: 1.75,
      clearcoat: 1, clearcoatRoughness: .07
    }));
    const obsidian = this.own(new THREE.MeshPhysicalMaterial({
      color: 0x171b20, metalness: 1, roughness: .145, envMapIntensity: 3.1,
      clearcoat: 1, clearcoatRoughness: .075
    }));
    this.silver = silver; this.obsidian = obsidian;
    const diamond = this.own(beveledGeometry(DIAMOND, .12));
    const star = this.own(beveledGeometry(STAR, .085));
    const count = this.lowPower ? 14 : 22;
    this.crystals = Array.from({ length: count }, (_, i) => {
      const random = this.random;
      const black = i % 5 === 1;
      const item = {
        angle: i / count * TAU + (random() - .5) * .15,
        radius: i % 6 === 0 ? 1.4 + random() * .36 : 2.02 + random() * .65,
        height: (random() - .5) * .66,
        size: .115 + random() * .085 + (i % 7 === 0 ? .12 : 0),
        spin: [random() * TAU, random() * TAU, random() * TAU],
        speed: (i % 6 === 0 ? -.65 : 1) * (.5 + random() * .5),
        seed: random() * TAU,
        mesh: new THREE.Mesh(i % 3 === 0 ? star : diamond, black ? obsidian : silver)
      };
      this.cluster.add(item.mesh); return item;
    });
    this.orbits = new THREE.Group(); this.cluster.add(this.orbits);
    const ringMaterial = this.own(new THREE.MeshBasicMaterial({ color: 0x3a2924, transparent: true, opacity: .21, depthWrite: false }));
    const outerMaterial = this.own(new THREE.MeshBasicMaterial({ color: 0x3a2924, transparent: true, opacity: .10, depthWrite: false }));
    const segments = this.lowPower ? 104 : 168;
    this.rings = [
      new THREE.Mesh(this.own(new THREE.TorusGeometry(2.58, .0048, 5, segments)), ringMaterial),
      new THREE.Mesh(this.own(new THREE.TorusGeometry(2.83, .0034, 5, segments)), outerMaterial)
    ];
    this.rings[1].rotation.x = .13;
    this.rings.forEach(ring => this.orbits.add(ring));
    const marks = [];
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU;
      marks.push(Math.cos(a) * 2.58, Math.sin(a) * 2.58, 0, Math.cos(a) * 2.65, Math.sin(a) * 2.65, 0);
    }
    const marksGeometry = this.own(new THREE.BufferGeometry());
    marksGeometry.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
    this.orbits.add(new THREE.LineSegments(marksGeometry, this.own(new THREE.LineBasicMaterial({ color: 0x3a2924, transparent: true, opacity: .20, depthWrite: false }))));
    const fittingGeometry = this.own(new THREE.OctahedronGeometry(.035, 0));
    this.fittings = Array.from({ length: 4 }, (_, i) => {
      const fitting = new THREE.Mesh(fittingGeometry, silver); this.orbits.add(fitting); fitting.userData.angle = i / 4 * TAU; return fitting;
    });
    const fragmentGeometry = this.own(new THREE.TetrahedronGeometry(1, 0));
    this.fragmentPool = Array.from({ length: this.lowPower ? 16 : 26 }, (_, i) => {
      const fragment = new THREE.Mesh(fragmentGeometry, i % 3 === 0 ? obsidian : silver);
      fragment.visible = false; this.cluster.add(fragment); return fragment;
    });
    this.wave = new THREE.Mesh(
      this.own(new THREE.RingGeometry(.985, 1.005, this.lowPower ? 48 : 80)),
      this.own(new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    );
    this.wave.rotation.copy(this.orbitRotation); this.wave.visible = false; this.cluster.add(this.wave);
    this.workPoint = new THREE.Vector3();
  }

  environment() {
    // Broad white softboxes, a dark horizon and slim warm cards form an original studio reflection.
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const background = ctx.createLinearGradient(0, 0, 0, 512);
    background.addColorStop(0, '#e6edf0'); background.addColorStop(.26, '#8d9fae');
    background.addColorStop(.44, '#273441'); background.addColorStop(.51, '#080a0e');
    background.addColorStop(.63, '#e5ded5'); background.addColorStop(.84, '#a79788'); background.addColorStop(1, '#20272d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 512);
    for (const [x, width, height] of [[65, 220, 290], [560, 300, 270]]) {
      const panel = ctx.createLinearGradient(x, 0, x + width, 0);
      panel.addColorStop(0, '#28313b'); panel.addColorStop(.15, '#9caebc'); panel.addColorStop(.28, '#ffffff');
      panel.addColorStop(.58, '#ffffff'); panel.addColorStop(.77, '#bac9d1'); panel.addColorStop(1, '#303b48');
      ctx.fillStyle = panel; ctx.fillRect(x, 60, width, height);
    }
    ctx.fillStyle = '#dcebf3'; ctx.fillRect(320, 104, 37, 275);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 18, 1024, 35);
    ctx.fillStyle = '#eec4a9'; ctx.fillRect(914, 175, 29, 255);
    ctx.fillStyle = '#0c1016'; ctx.fillRect(0, 300, 1024, 27);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
    const generator = new THREE.PMREMGenerator(this.renderer);
    try {
      this.environmentTarget = this.own(generator.fromEquirectangular(texture)); this.scene.environment = this.environmentTarget.texture;
    } finally { texture.dispose(); generator.dispose(); }
  }

  resize() {
    if (this.destroyed) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(0, Math.round(bounds.width)); this.height = Math.max(0, Math.round(bounds.height));
    if (this.fallback) { this.fallback.resize(); return; }
    if (this.backend === 'webgl' && this.width && this.height) {
      this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
    }
    this.syncLoop();
  }

  syncLoop() {
    if (this.destroyed) return;
    if (this.fallback) { this.fallback.syncLoop(); return; }
    if (this.active() && this.backend === 'pending') this.initialize();
    if (this.fallback) return;
    if (!this.active() || this.reduced || this.backend !== 'webgl') {
      if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.lastFrame = 0;
      if (this.active() && this.backend === 'webgl') this.render();
      return;
    }
    if (!this.raf) { this.lastFrame = 0; this.render(); this.raf = requestAnimationFrame(this.tick); }
  }

  tick(timestamp) {
    this.raf = 0;
    if (!this.active() || this.reduced || this.backend !== 'webgl') return;
    if (!this.lastFrame) this.lastFrame = timestamp - this.frameInterval;
    const elapsed = timestamp - this.lastFrame;
    if (elapsed + .35 >= this.frameInterval) {
      const dt = Math.min(elapsed / 1000, .065); this.lastFrame = timestamp; this.time += dt;
      const smoothing = 1 - Math.exp(-dt * 5.8);
      this.progress = lerp(this.progress, this.progressTarget, smoothing);
      this.pointer[0] = lerp(this.pointer[0], this.pointerTarget[0], smoothing);
      this.pointer[1] = lerp(this.pointer[1], this.pointerTarget[1], smoothing);
      this.energy *= Math.exp(-dt * 2.7);
      for (const fragment of this.fragments) {
        fragment.life -= dt; fragment.velocity.y -= dt * .22;
        fragment.mesh.position.addScaledVector(fragment.velocity, dt);
        fragment.mesh.rotation.x += dt * fragment.spin; fragment.mesh.rotation.y += dt * fragment.spin * .72;
        const scale = fragment.size * clamp(fragment.life / .48); fragment.mesh.scale.setScalar(scale);
        if (fragment.life <= 0) fragment.mesh.visible = false;
      }
      this.fragments = this.fragments.filter(fragment => fragment.life > 0);
      for (const wave of this.shockwaves) wave.age += dt;
      this.shockwaves = this.shockwaves.filter(wave => wave.age < 1.35);
      this.render();
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  setProgress(value) {
    if (this.destroyed || !Number.isFinite(value)) return;
    this.progressTarget = clamp(value);
    if (this.fallback) { this.fallback.setProgress(value); return; }
    if (!this.reduced) this.syncLoop();
  }
  setPointer(x, y) {
    if (this.destroyed || this.reduced) return;
    this.pointerTarget[0] = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
    this.pointerTarget[1] = Number.isFinite(y) ? clamp(y, -1, 1) : 0;
    this.fallback?.setPointer(x, y);
  }
  pulse() {
    if (this.destroyed || this.reduced || !this.active()) return;
    if (this.backend === 'pending') this.initialize();
    if (this.fallback) { this.fallback.pulse(); return; }
    if (this.backend !== 'webgl') return;
    this.energy = Math.min(1.5, this.energy + 1);
    const origin = new THREE.Vector3(this.pointer[0] * .9, -this.pointer[1] * .6, .32);
    this.shockwaves = [{ origin: origin.clone(), age: 0 }];
    this.fragments = this.fragmentPool.map((mesh, i) => {
      const random = this.random; const azimuth = random() * TAU, elevation = (random() - .5) * 1.8;
      const speed = 1.2 + random() * 2.1, size = .028 + random() * .045;
      mesh.visible = true; mesh.position.copy(origin); mesh.scale.setScalar(size); mesh.rotation.set(random() * TAU, random() * TAU, random() * TAU);
      return { mesh, velocity: new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation) * speed, Math.sin(azimuth) * speed * .65, Math.sin(elevation) * speed), life: 1.45 + random() * .3, spin: (random() - .5) * 7, size };
    });
    this.syncLoop();
  }
  setReducedMotion(value) {
    if (this.destroyed || this.reduced === !!value) return;
    this.reduced = !!value;
    if (this.reduced) {
      this.pointer = [0, 0]; this.pointerTarget = [0, 0]; this.energy = 0;
      this.fragments = []; this.shockwaves = []; this.fragmentPool?.forEach(mesh => { mesh.visible = false; });
    }
    if (this.fallback) this.fallback.setReducedMotion(value); else this.syncLoop();
  }

  render() {
    if (this.backend !== 'webgl' || !this.active()) return;
    const p = this.reduced ? .34 : this.progress, t = this.reduced ? 0 : this.time;
    this.camera.position.z = lerp(9.2, 8.4, p);
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    const viewWidth = viewHeight * this.camera.aspect;
    const unitPixels = Math.min(this.width * (this.mobile ? .218 : .105), this.height * (this.mobile ? .22 : .31));
    this.cluster.scale.setScalar(unitPixels / (this.height / viewHeight));
    this.cluster.position.set(viewWidth * (this.mobile ? 0 : .255) + this.pointer[0] * .06, viewHeight * (this.mobile ? -.13 : .015) - this.pointer[1] * .045, 0);
    this.orbitRotation.set(1.04 + this.pointer[1] * .09, -.14 + this.pointer[0] * .11, -.23 + p * .10);
    this.orbits.rotation.copy(this.orbitRotation);
    this.rings[0].scale.setScalar(1 + this.energy * .035);
    for (const item of this.crystals) {
      const angle = item.angle + t * .082 * item.speed + p * .32;
      const radius = item.radius + this.energy * .24;
      this.workPoint.set(Math.cos(angle) * radius, Math.sin(angle) * radius, item.height + Math.sin(t * .26 + item.seed) * .075);
      this.workPoint.applyEuler(this.orbitRotation);
      item.mesh.position.copy(this.workPoint);
      item.mesh.rotation.set(item.spin[0] + t * .19 * item.speed, item.spin[1] + t * .23 + this.energy * .30, item.spin[2] + t * .13);
      item.mesh.scale.setScalar(item.size * (1 + this.energy * .09));
    }
    this.fittings.forEach(fitting => {
      const a = fitting.userData.angle + t * .024; fitting.position.set(Math.cos(a) * 2.83, Math.sin(a) * 2.83, 0);
      fitting.rotation.z = t * .2;
    });
    const wave = this.shockwaves[0];
    this.wave.visible = !!wave;
    if (wave) {
      this.wave.position.copy(wave.origin); this.wave.rotation.copy(this.orbitRotation); this.wave.scale.setScalar(Math.max(.01, wave.age * 2.75));
      this.wave.material.opacity = .62 * (1 - wave.age / 1.35) ** 2;
    }
    this.renderer.render(this.scene, this.camera);
  }

  disposeGPU() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    for (const resource of this.resources) resource.dispose?.(); this.resources.clear();
    this.renderer?.dispose();
    try { this.renderer?.forceContextLoss(); } catch {}
    this.renderer = null; this.scene = null;
  }
  useFallback() {
    if (this.destroyed || this.fallback) return;
    this.disposeGPU();
    // A canvas cannot switch from an established GPU context to Canvas2D; preserve its DOM identity.
    const previous = this.canvas, canvas = previous.cloneNode(false);
    previous.removeEventListener('pointerdown', this.onPulse);
    this.resizeObserver?.unobserve(previous); this.intersectionObserver?.unobserve(previous);
    previous.replaceWith(canvas); this.canvas = canvas;
    this.resizeObserver?.observe(canvas); this.intersectionObserver?.observe(canvas);
    this.backend = 'canvas2d';
    this.fallback = new CanvasPrismField(canvas, { reducedMotion: this.reduced });
    this.fallback.setProgress(this.progressTarget); this.fallback.setPointer(...this.pointerTarget);
    this.crystals = this.fallback.crystals;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPulse);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide); window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('resize', this.onResize);
    this.fallback?.destroy(); this.disposeGPU();
    this.fragments = []; this.shockwaves = []; this.crystals = []; this.fragmentPool = [];
  }
}

export default PrismField;
