/* Original point-cloud sculpture. No runtime or texture dependencies. */
const TAU = Math.PI * 2;
const MODES = ['type', 'orbit', 'flow'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const ease = n => n * n * (3 - 2 * n);
const vertexSource = `
precision highp float;
attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aSeed;
uniform float uMorph;
uniform float uTime;
uniform float uStrength;
uniform vec3 uWeights;
uniform mat3 uRotation;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uScale;
uniform float uDpr;
uniform float uMaxPointSize;
uniform vec4 uPulses[4];
uniform vec3 uColor;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float m = uMorph*uMorph*(3.0-2.0*uMorph);
  vec3 p = mix(aFrom,aTo,m);
  float strength = 0.2+uStrength*0.8;
  float phase = aSeed*6.2831853;
  p *= 1.0+uWeights.y*sin(uTime*0.75+phase)*0.022*strength;
  p.z += uWeights.x*sin(phase+uTime*0.7)*0.024*strength;
  float swirl = (sin(uTime*0.32)*0.85+sin(uTime*0.17)*0.6)*uWeights.z;
  p.yz = mat2(cos(swirl),-sin(swirl),sin(swirl),cos(swirl))*p.yz;
  p.y += uWeights.z*sin(p.x*2.4+uTime*0.9)*0.055*strength;
  vec3 view = uRotation*p;
  float perspective = 7.2/(7.2-view.z);
  vec2 screen = view.xy*perspective/vec2(uScale*uAspect,uScale);
  vec2 aspectFix = vec2(uAspect,1.0);
  vec2 delta = (screen-vec2(uPointer.x,-uPointer.y))*aspectFix;
  float d = length(delta);
  float influence = max(0.0,1.0-d/0.46);
  vec2 direction = delta/max(d,0.002);
  screen += direction*influence*influence*uStrength*0.21/aspectFix;
  float waveGlow = 0.0;
  for(int i=0;i<4;i++){
    vec4 pulse = uPulses[i];
    if(pulse.z>=0.0 && pulse.z<2.7){
      vec2 waveDelta = (screen-pulse.xy)*aspectFix;
      float distanceToCenter = length(waveDelta);
      float ring = exp(-pow((distanceToCenter-pulse.z*0.82)*13.0,2.0));
      float fade = pow(max(0.0,1.0-pulse.z/2.7),1.8);
      float wave = ring*fade*pulse.w;
      screen += waveDelta/max(distanceToCenter,0.002)*wave*0.12/aspectFix;
      waveGlow += wave;
    }
  }
  float front = clamp((view.z+2.4)/4.8,0.0,1.0);
  gl_Position = vec4(screen,0.0,1.0);
  gl_PointSize = min(uMaxPointSize,(3.3+aSeed*1.7+front*2.0+waveGlow*3.0)*uDpr*perspective);
  vColor = mix(uColor,vec3(0.92,0.96,1.0),aSeed*aSeed*0.25);
  vAlpha = (0.27+front*0.52+aSeed*0.16)*(1.0+waveGlow*0.7);
}`;
const fragmentSource = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord-vec2(0.5));
  if(d>0.5) discard;
  float core = exp(-d*d*76.0);
  float halo = pow(max(0.0,1.0-d*2.0),2.4)*0.24;
  float light = min(1.0,(core+halo)*vAlpha);
  gl_FragColor = vec4(vColor*light,light);
}`;

function rgb(hex) {
  const value = String(hex).trim().replace(/^#/, '');
  const full = /^[\da-f]{3}$/i.test(value) ? value.split('').map(x => x + x).join('') : value;
  if (!/^[\da-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
}
function randomGenerator() {
  let seed = 198701;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export class KineticField {
  constructor(canvas, { reducedMotion = false } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('KineticField needs a canvas.');
    this.canvas = canvas;
    this.mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
    this.count = this.mobile ? 2500 : 5000;
    this.reduced = !!reducedMotion;
    this.destroyed = false;
    this.visible = true;
    this.lost = false;
    this.mode = 'type';
    this.time = 0;
    this.last = 0;
    this.frame = 0;
    this.morph = 1;
    this.strength = this.strengthTarget = 0.55;
    this.pointer = [3, 3];
    this.pointerTarget = [3, 3];
    this.color = [0.9, 0.93, 1];
    this.colorTarget = [...this.color];
    this.weightsFrom = [1, 0, 0];
    this.weightsTo = [1, 0, 0];
    this.weights = [1, 0, 0];
    this.rotation = new Float32Array(9);
    this.pulseUniform = new Float32Array(16);
    this.pulses = [];
    this.width = this.height = 1;
    this.aspect = 1;
    this.scale = 3.15;
    this.buffers = [];
    this.originalBackground = canvas.style.backgroundImage;
    this._buildCoordinates();
    this.from = new Float32Array(this.coordinates.type);
    this.to = new Float32Array(this.coordinates.type);
    this.tick = this._tick.bind(this);
    this.onVisibility = () => this._syncLoop();
    this.onPageHide = () => this._stop();
    this.onPageShow = () => { this._resize(); this._syncLoop(); };
    this.onPointerLeave = () => { this.pointerTarget[0] = this.pointerTarget[1] = 3; };
    this.onContextLost = event => { event.preventDefault(); this.lost = true; this._stop(); };
    this.onContextRestored = () => {
      if (this.destroyed) return;
      this.lost = false;
      this.buffers = [];
      this.program = null;
      try { this._initGL(); } catch (_) { this._initFallback(); }
      this._resize();
      this._syncLoop();
    };
    try { this._initGL(); } catch (_) { this._initFallback(); }
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.onResize = () => this._resize();
    window.addEventListener('resize', this.onResize, { passive: true });
    this.intersectionObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      this.visible = entries[0]?.isIntersecting ?? true;
      this._syncLoop();
    }, { rootMargin: '120px' }) : null;
    this.intersectionObserver?.observe(canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    this._resize();
    this._syncLoop();
  }

  _buildCoordinates() {
    const random = randomGenerator();
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1024;
    sampleCanvas.height = 360;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const samples = [];
    if (ctx) try {
      ctx.font = '900 285px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('YIBO', 512, 192, 960);
      const pixels = ctx.getImageData(0, 0, 1024, 360).data;
      for (let y = 36; y < 330; y += 3) for (let x = 30; x < 995; x += 3) {
        if (pixels[(y * 1024 + x) * 4 + 3] > 150) samples.push([x, y]);
      }
    } catch (_) { samples.length = 0; }
    // A readable fixed glyph grid also works in privacy modes that deny font sampling.
    if (!samples.length) {
      const glyphs = ['10001/10001/01010/00100/00100/00100/00100', '11111/00100/00100/00100/00100/00100/11111', '11110/10001/10001/11110/10001/10001/11110', '01110/10001/10001/10001/10001/10001/01110'];
      glyphs.forEach((glyph, letter) => glyph.split('/').forEach((row, y) => [...row].forEach((bit, x) => {
        if (bit === '1') for (let dy = 0; dy < 28; dy += 3) for (let dx = 0; dx < 28; dx += 3) samples.push([185 + letter * 180 + x * 30 + dx, 66 + y * 30 + dy]);
      })));
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sample of samples) {
      minX = Math.min(minX, sample[0]); maxX = Math.max(maxX, sample[0]);
      minY = Math.min(minY, sample[1]); maxY = Math.max(maxY, sample[1]);
    }
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const glyphScale = 6.3 / Math.max(1, maxX - minX);
    const type = new Float32Array(this.count * 3);
    const orbit = new Float32Array(this.count * 3);
    const flow = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      const source = samples[Math.floor(random() * samples.length)];
      type[j] = (source[0] + (random() - 0.5) * 2.5 - centerX) * glyphScale;
      type[j + 1] = (centerY - source[1] + (random() - 0.5) * 2.5) * glyphScale;
      type[j + 2] = (random() - 0.5) * 0.34;
      if (i % 5 === 0) {
        const ring = Math.floor(i / 5) % 3;
        const a = i * goldenAngle;
        const r = 2.17;
        const tilt = ring * Math.PI / 3 + 0.28;
        orbit[j] = Math.cos(a) * r;
        orbit[j + 1] = Math.sin(a) * r * Math.cos(tilt);
        orbit[j + 2] = Math.sin(a) * r * Math.sin(tilt);
      } else {
        const y = 1 - 2 * (i + 0.5) / this.count;
        const radius = Math.sqrt(1 - y * y);
        const a = i * goldenAngle;
        const r = 1.9 + random() * 0.08;
        orbit[j] = Math.cos(a) * radius * r;
        orbit[j + 1] = y * r;
        orbit[j + 2] = Math.sin(a) * radius * r;
      }
      const strand = i % 7;
      const along = Math.floor(i / 7) / Math.ceil(this.count / 7);
      const x = (along - 0.5) * 6.15;
      const a = along * TAU * 2.2 + strand * TAU / 7;
      const r = 0.67 + (strand % 3) * 0.17;
      flow[j] = x;
      flow[j + 1] = Math.sin(a) * r + (random() - 0.5) * 0.075;
      flow[j + 2] = Math.cos(a) * r + (random() - 0.5) * 0.075;
      this.seeds[i] = random();
    }
    this.coordinates = { type, orbit, flow };
  }

  _compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.gl.deleteShader(shader);
      throw new Error('Point shader unavailable.');
    }
    return shader;
  }

  _initGL() {
    const gl = this.gl || this.canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL unavailable.');
    this.gl = gl;
    const vertex = this._compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = this._compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error('Point program unavailable.');
    }
    this.program = program;
    gl.useProgram(program);
    this.uniforms = {};
    ['Morph', 'Time', 'Strength', 'Weights', 'Rotation', 'Pointer', 'Aspect', 'Scale', 'Dpr', 'MaxPointSize', 'Color'].forEach(name => this.uniforms[name] = gl.getUniformLocation(program, 'u' + name));
    this.uniforms.Pulses = gl.getUniformLocation(program, 'uPulses[0]');
    this.fromBuffer = this._buffer('aFrom', this.from, 3, gl.DYNAMIC_DRAW);
    this.toBuffer = this._buffer('aTo', this.to, 3, gl.DYNAMIC_DRAW);
    this._buffer('aSeed', this.seeds, 1, gl.STATIC_DRAW);
    this.maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    this.fallback = false;
    this.canvas.dataset.renderer = 'webgl';
    this.canvas.style.backgroundImage = this.originalBackground;
  }

  _buffer(attribute, data, size, usage) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    const location = gl.getAttribLocation(this.program, attribute);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    this.buffers.push(buffer);
    return buffer;
  }

  _initFallback() {
    this.fallback = true;
    this.canvas.dataset.renderer = '2d';
    this.fallbackContext = this.canvas.getContext('2d');
    if (!this.fallbackContext) {
      this.fallbackCanvas = document.createElement('canvas');
      this.fallbackContext = this.fallbackCanvas.getContext('2d');
    }
    this._stop();
  }

  _resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    const height = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.8);
    this.width = width;
    this.height = height;
    this.aspect = width / height;
    this.scale = Math.max(2.65, 3.65 / this.aspect);
    this.dpr = dpr;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      if (this.fallbackCanvas) { this.fallbackCanvas.width = pixelWidth; this.fallbackCanvas.height = pixelHeight; }
    }
    if (this.gl && !this.lost && !this.fallback) this.gl.viewport(0, 0, pixelWidth, pixelHeight);
    this.draw();
  }

  _rotation() {
    const t = this.reduced || this.fallback ? 0 : this.time;
    const x = this.weights[0] * -0.06 + this.weights[1] * 0.12 + this.weights[2] * -0.22;
    const y = this.weights[0] * Math.sin(t * 0.24) * 0.08 + this.weights[1] * (Math.sin(t * 0.16) * 0.85 + Math.sin(t * 0.09) * 0.4) + this.weights[2] * 0.14;
    const z = this.weights[2] * -0.16;
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    // Column-major Rz * Ry * Rx.
    this.rotation.set([cz * cy, sz * cy, -sy, cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx]);
  }

  draw() {
    if (this.destroyed || this.lost) return;
    const m = ease(this.morph);
    for (let i = 0; i < 3; i++) this.weights[i] = this.weightsFrom[i] + (this.weightsTo[i] - this.weightsFrom[i]) * m;
    this._rotation();
    if (this.fallback) { this._drawFallback(); return; }
    const gl = this.gl;
    if (!gl || !this.program) return;
    const u = this.uniforms;
    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.Morph, this.morph);
    gl.uniform1f(u.Time, this.reduced ? 0 : this.time);
    gl.uniform1f(u.Strength, this.reduced ? 0 : this.strength);
    gl.uniform3fv(u.Weights, this.weights);
    gl.uniformMatrix3fv(u.Rotation, false, this.rotation);
    gl.uniform2fv(u.Pointer, this.reduced ? [3, 3] : this.pointer);
    gl.uniform1f(u.Aspect, this.aspect);
    gl.uniform1f(u.Scale, this.scale);
    gl.uniform1f(u.Dpr, this.dpr);
    gl.uniform1f(u.MaxPointSize, this.maxPointSize);
    gl.uniform3fv(u.Color, this.color);
    for (let i = 0; i < 4; i++) {
      const pulse = this.pulses[i];
      const j = i * 4;
      this.pulseUniform[j] = pulse?.x ?? 0;
      this.pulseUniform[j + 1] = pulse?.y ?? 0;
      this.pulseUniform[j + 2] = pulse ? this.time - pulse.time : -1;
      this.pulseUniform[j + 3] = pulse?.strength ?? 0;
    }
    gl.uniform4fv(u.Pulses, this.pulseUniform);
    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  _drawFallback() {
    const ctx = this.fallbackContext;
    if (!ctx) return;
    const target = this.fallbackCanvas || this.canvas;
    ctx.clearRect(0, 0, target.width, target.height);
    const color = this.color.map(v => Math.round(v * 255));
    ctx.fillStyle = `rgb(${color.join(',')})`;
    const coords = this.coordinates[this.mode], r = this.rotation;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3, x = coords[j], y = coords[j + 1], z = coords[j + 2];
      const vx = r[0] * x + r[3] * y + r[6] * z;
      const vy = r[1] * x + r[4] * y + r[7] * z;
      const vz = r[2] * x + r[5] * y + r[8] * z;
      const p = 7.2 / (7.2 - vz);
      const px = (vx * p / (this.scale * this.aspect) * 0.5 + 0.5) * target.width;
      const py = (0.5 - vy * p / this.scale * 0.5) * target.height;
      const radius = (0.65 + this.seeds[i] * 0.45) * this.dpr * p;
      ctx.globalAlpha = 0.35 + clamp((vz + 2.4) / 4.8, 0, 1) * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.fallbackCanvas) {
      this.canvas.style.backgroundImage = `url(${this.fallbackCanvas.toDataURL()})`;
      this.canvas.style.backgroundSize = '100% 100%';
    }
  }

  _tick(now) {
    this.frame = 0;
    if (this.destroyed || this.reduced || this.fallback || this.lost || !this.visible || document.hidden) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
    this.last = now;
    this.time += dt;
    this.morph = Math.min(1, this.morph + dt / 1.45);
    const smoothing = 1 - Math.exp(-dt * 7);
    this.strength += (this.strengthTarget - this.strength) * smoothing;
    for (let i = 0; i < 2; i++) this.pointer[i] += (this.pointerTarget[i] - this.pointer[i]) * smoothing;
    for (let i = 0; i < 3; i++) this.color[i] += (this.colorTarget[i] - this.color[i]) * smoothing;
    this.pulses = this.pulses.filter(pulse => this.time - pulse.time < 2.7);
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  }

  _stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
  }

  _syncLoop() {
    this._stop();
    if (this.destroyed || this.lost || !this.visible || document.hidden) return;
    this.draw();
    if (!this.reduced && !this.fallback) this.frame = requestAnimationFrame(this.tick);
  }

  setMode(mode) {
    if (this.destroyed || !MODES.includes(mode) || mode === this.mode) return;
    const m = ease(this.morph);
    for (let i = 0; i < this.from.length; i++) this.from[i] += (this.to[i] - this.from[i]) * m;
    for (let i = 0; i < 3; i++) this.weightsFrom[i] += (this.weightsTo[i] - this.weightsFrom[i]) * m;
    this.mode = mode;
    this.to.set(this.coordinates[mode]);
    this.weightsTo = MODES.map(name => name === mode ? 1 : 0);
    this.morph = this.reduced || this.fallback ? 1 : 0;
    if (this.gl && !this.fallback && !this.lost) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fromBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.from);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.toBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.to);
    }
    this._syncLoop();
  }

  setPointer(x, y) {
    if (this.destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pointerTarget[0] = clamp(x, -1, 1);
    this.pointerTarget[1] = clamp(y, -1, 1);
  }

  setStrength(value) {
    if (this.destroyed || !Number.isFinite(value)) return;
    this.strengthTarget = clamp(value, 0, 1);
    if (this.reduced || this.fallback) { this.strength = this.strengthTarget; this.draw(); }
  }

  setColor(hex) {
    const color = rgb(hex);
    if (this.destroyed || !color) return;
    this.colorTarget = color;
    if (this.reduced || this.fallback) { this.color = [...color]; this.draw(); }
  }

  pulse() {
    if (this.destroyed || this.reduced || this.fallback) return;
    this.pulses.push({ x: this.pointerTarget[0] > 1 ? 0 : this.pointerTarget[0], y: this.pointerTarget[1] > 1 ? 0 : -this.pointerTarget[1], time: this.time, strength: 0.4 + this.strengthTarget * 0.8 });
    if (this.pulses.length > 4) this.pulses.shift();
    this._syncLoop();
  }

  setReducedMotion(value) {
    if (this.destroyed) return;
    this.reduced = !!value;
    if (this.reduced) {
      this.morph = 1;
      this.pulses = [];
      this.strength = this.strengthTarget;
      this.color = [...this.colorTarget];
      this.pointer = [3, 3];
    }
    this._syncLoop();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._stop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.gl && !this.lost) {
      this.buffers.forEach(buffer => this.gl.deleteBuffer(buffer));
      if (this.program) this.gl.deleteProgram(this.program);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    this.canvas.style.backgroundImage = this.originalBackground;
    this.buffers = [];
    this.pulses = [];
  }
}
