import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const mix = (a, b, t) => a + (b - a) * t;

class SculptureCurve extends THREE.Curve {
  constructor(mode) { super(); this.mode = mode; }
  getPoint(t, result = new THREE.Vector3()) {
    const u = t * TAU;
    if (this.mode === 'knot') {
      const r = 1.13 + .39 * Math.cos(3 * u);
      return result.set(r * Math.cos(2 * u), r * Math.sin(2 * u), .67 * Math.sin(3 * u));
    }
    if (this.mode === 'bloom') {
      const r = 1.13 + .45 * Math.cos(5 * u);
      return result.set(r * Math.cos(u), r * Math.sin(u), .48 * Math.sin(5 * u));
    }
    const r = 1.4 + .12 * Math.sin(3 * u);
    return result.set(r * Math.cos(u), r * Math.sin(u), .48 * Math.cos(3 * u));
  }
}

/** Local, self-contained hero sculpture. All public setters are safe in fallback mode. */
export class YiboSculpture {
  constructor(container, { reducedMotion = false, onReady = () => {} } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.onReady = onReady;
    this.mobile = window.matchMedia('(max-width: 700px)').matches;
    this.visible = true;
    this.destroyed = false;
    this.ready = false;
    this.mode = 'knot';
    this.progress = this.progressTarget = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.morph = [0, 0];
    this.morphTarget = [0, 0];
    this.energy = 0;
    this.time = 0;
    this.lastTime = 0;
    this.renderTime = 0;
    this.resources = new Set();
    this.tick = this.tick.bind(this);
    this.onVisibility = () => this.syncLoop();
    this.onLost = event => { event.preventDefault(); this.lost = true; this.showFallback(); this.syncLoop(); };
    this.onRestored = () => {
      this.lost = false;
      try {
        // A render target's pixels do not survive a GPU reset; rebuild the studio map.
        this.environment();
        this.hideFallback();
        this.resize();
        this.syncLoop();
      } catch {
        this.lost = true;
        this.showFallback();
      }
    };
    try {
      this.setup();
      this.resize();
      this.renderer.render(this.scene, this.camera);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      this.observer = new IntersectionObserver(entries => {
        this.intersecting = entries[0].isIntersecting;
        this.syncLoop();
      }, { rootMargin: '120px' });
      this.observer.observe(container);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.syncLoop();
      this.markReady();
    } catch (error) {
      console.warn('Sculpture switched to the static composition:', error.message);
      this.renderer?.dispose();
      this.renderer?.domElement.remove();
      this.failed = true;
      this.showFallback();
      this.markReady();
    }
  }

  own(resource) { this.resources.add(resource); return resource; }
  markReady() { if (!this.ready) { this.ready = true; this.onReady(); } }

  setup() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.35 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.26;
    const canvas = this.renderer.domElement;
    canvas.className = 'sculpture-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.container.append(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
    this.camera.position.set(0, 0, 8.7);
    this.scene.add(new THREE.AmbientLight(0x9bdcfa, .5));
    const key = new THREE.DirectionalLight(0xffffff, 5);
    key.position.set(-3, 4, 5);
    this.scene.add(key);
    const cyan = new THREE.PointLight(0x37cfff, 27, 13, 2);
    cyan.position.set(-3, .8, 2);
    this.scene.add(cyan);
    const orange = new THREE.PointLight(0xff6529, 17, 11, 2);
    orange.position.set(3, -1.2, .2);
    this.scene.add(orange);
    this.environment();

    this.group = new THREE.Group();
    this.group.rotation.set(.3, -.3, -.18);
    this.scene.add(this.group);
    const segments = this.mobile ? 168 : 264;
    const radial = this.mobile ? 16 : 24;
    const geometry = this.own(new THREE.TubeGeometry(new SculptureCurve('knot'), segments, .275, radial, true));
    const flower = new THREE.TubeGeometry(new SculptureCurve('bloom'), segments, .275, radial, true);
    const orbit = new THREE.TubeGeometry(new SculptureCurve('orbit'), segments, .275, radial, true);
    geometry.morphAttributes.position = [flower.attributes.position.clone(), orbit.attributes.position.clone()];
    geometry.morphAttributes.normal = [flower.attributes.normal.clone(), orbit.attributes.normal.clone()];
    flower.dispose(); orbit.dispose();
    const metal = this.own(new THREE.MeshPhysicalMaterial({
      color: 0xd8eaff, metalness: 1, roughness: .16,
      clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 2.15,
      iridescence: .35, iridescenceIOR: 1.34, iridescenceThicknessRange: [80, 330]
    }));
    this.metal = metal;
    this.sculpture = new THREE.Mesh(geometry, metal);
    this.sculpture.updateMorphTargets();
    this.group.add(this.sculpture);

    const coreGeo = this.own(new THREE.IcosahedronGeometry(.285, this.mobile ? 2 : 3));
    const coreMat = this.own(new THREE.MeshPhysicalMaterial({ color: 0x83dfff, metalness: .55, roughness: .12, emissive: 0x007bc4, emissiveIntensity: .5, clearcoat: 1 }));
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.core);

    this.orbits = new THREE.Group();
    this.scene.add(this.orbits);
    this.rings = [];
    const ringData = [
      [2.05, .011, 0xff783a, .82, [.45, .42, -.2]],
      [2.18, .006, 0x70ddff, .52, [1.05, -.25, .62]],
      [2.36, .004, 0x98b9ff, .23, [.05, .45, .15]]
    ];
    for (const [r, thickness, color, opacity, rotation] of ringData) {
      const ring = new THREE.Mesh(
        this.own(new THREE.TorusGeometry(r, thickness, 6, this.mobile ? 140 : 220)),
        this.own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
      );
      ring.rotation.set(...rotation);
      this.rings.push(ring);
      this.orbits.add(ring);
    }

    this.satellites = [];
    const satelliteGeometry = this.own(new THREE.SphereGeometry(.045, 12, 8));
    for (let i = 0; i < 7; i++) {
      const sphere = new THREE.Mesh(satelliteGeometry, this.own(new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7c45 : 0x92eaff })));
      this.satellites.push(sphere);
      this.orbits.add(sphere);
    }
    this.particles();
    this.pulseMesh = new THREE.Mesh(
      this.own(new THREE.SphereGeometry(1, 24, 16)),
      this.own(new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        uniforms: { energy: { value: 0 }, tint: { value: new THREE.Color(0x46cfff) } },
        vertexShader: 'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
        fragmentShader: 'uniform float energy;uniform vec3 tint;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),4.);gl_FragColor=vec4(tint,f*energy*.38);}'
      }))
    );
    this.pulseMesh.visible = false;
    this.scene.add(this.pulseMesh);
    this.update(0);
  }

  environment() {
    // Original procedural studio panels produce crisp reflections without a remote HDR file.
    if (this.environmentTarget) {
      this.environmentTarget.dispose();
      this.resources.delete(this.environmentTarget);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#335673'); bg.addColorStop(.45, '#080d18'); bg.addColorStop(1, '#1c354d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#e5f5ff'; ctx.fillRect(145, 70, 62, 280);
    ctx.fillStyle = '#d7e6ff'; ctx.fillRect(660, 95, 115, 205);
    ctx.fillStyle = '#5bbce5'; ctx.fillRect(290, 120, 34, 310);
    ctx.fillStyle = '#ffb786'; ctx.fillRect(886, 150, 25, 225);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 16, 1024, 36);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = this.own(pmrem.fromEquirectangular(texture));
    this.scene.environment = this.environmentTarget.texture;
    texture.dispose(); pmrem.dispose();
  }

  particles() {
    const count = this.mobile ? 230 : 570;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * TAU;
      const z = Math.random() * 2 - 1;
      const r = 2.5 + Math.random() * 2.3;
      const radial = Math.sqrt(1 - z * z);
      positions[i * 3] = Math.cos(u) * radial * r;
      positions[i * 3 + 1] = Math.sin(u) * radial * r;
      positions[i * 3 + 2] = z * r;
      phases[i] = Math.random() * TAU;
      sizes[i] = Math.random() > .96 ? 3.8 : .7 + Math.random() * 1.8;
    }
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const material = this.own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, pulse: { value: 0 }, pixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: `attribute float phase;attribute float size;uniform float time;uniform float pulse;uniform float pixelRatio;varying float alpha;varying float hue;void main(){vec3 p=position*(1.+pulse*.09);p.y+=sin(time*.3+phase)*.08;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(10.,size*pixelRatio*(6./-mv.z));alpha=.16+.48*pow(.5+.5*sin(time*.7+phase),3.);hue=phase;}`,
      fragmentShader: `varying float alpha;varying float hue;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=smoothstep(.5,.12,d);vec3 color=mix(vec3(.38,.72,1.),vec3(1.,.54,.3),step(5.6,hue));gl_FragColor=vec4(color,alpha*a);}`
    }));
    this.dust = new THREE.Points(geometry, material);
    this.scene.add(this.dust);
  }

  resize() {
    if (!this.renderer || this.destroyed || this.failed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    // A narrow portrait stage needs a more distant camera to retain the whole knot.
    this.baseCameraZ = Math.max(8.7, 2.65 / (Math.tan(17 * Math.PI / 180) * this.camera.aspect));
    this.camera.position.z = this.baseCameraZ + this.progress * 1.8;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (!this.looping && !this.lost) this.renderer.render(this.scene, this.camera);
  }

  setProgress(value) { this.progressTarget = clamp(Number(value) || 0); this.invalidate(); }
  setMode(mode) {
    if (!['knot', 'bloom', 'orbit'].includes(mode)) return;
    this.mode = mode;
    this.morphTarget = mode === 'bloom' ? [1, 0] : mode === 'orbit' ? [0, 1] : [0, 0];
    this.pulse();
    this.invalidate();
  }
  setPointer(x, y) { this.pointerTarget.set(clamp(Number(x) || 0, -1, 1), clamp(Number(y) || 0, -1, 1)); this.invalidate(); }
  pulse() { if (!this.reducedMotion) this.energy = 1; this.invalidate(); }
  setReducedMotion(value) { this.reducedMotion = !!value; this.syncLoop(); this.invalidate(); }
  setVisible(value) { this.visible = !!value; this.syncLoop(); }

  invalidate() {
    if (this.failed || this.lost || this.destroyed || !this.renderer) return;
    if (this.reducedMotion && this.visible && !document.hidden) {
      this.progress = this.progressTarget;
      this.morph = [...this.morphTarget];
      this.pointer.set(0, 0);
      this.energy = 0;
      this.update(0);
      this.renderer.render(this.scene, this.camera);
    }
  }

  syncLoop() {
    if (this.destroyed || this.failed) return;
    const shouldRun = !this.reducedMotion && this.visible && this.intersecting !== false && !document.hidden && !this.lost;
    if (shouldRun && !this.looping) {
      this.looping = true;
      this.lastTime = 0;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.looping = false;
      cancelAnimationFrame(this.raf);
      this.invalidate();
    }
  }

  tick(timestamp) {
    if (!this.looping || this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.mobile && timestamp - this.renderTime < 30) return;
    const dt = this.lastTime ? Math.min(.05, (timestamp - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = timestamp;
    this.renderTime = timestamp;
    this.time += dt;
    const smooth = 1 - Math.exp(-dt * 5);
    this.progress = mix(this.progress, this.progressTarget, smooth);
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 3));
    this.morph[0] = mix(this.morph[0], this.morphTarget[0], smooth);
    this.morph[1] = mix(this.morph[1], this.morphTarget[1], smooth);
    this.energy *= Math.exp(-dt * 2.1);
    this.update(this.time);
    this.renderer.render(this.scene, this.camera);
  }

  update(time) {
    if (!this.group) return;
    this.sculpture.morphTargetInfluences[0] = this.morph[0];
    this.sculpture.morphTargetInfluences[1] = this.morph[1];
    this.group.rotation.x = .32 + Math.sin(time * .19) * .16 + this.pointer.y * .2 + this.progress * .65;
    this.group.rotation.y = -.3 + time * .12 + this.pointer.x * .32;
    this.group.rotation.z = -.18 + Math.sin(time * .13) * .15 - this.progress * .5;
    this.group.position.y = Math.sin(time * .6) * .055;
    this.group.scale.setScalar(1 + this.energy * .075 - this.progress * .07);
    this.core.rotation.set(time * .3, time * .45, time * .12);
    this.core.scale.setScalar(1 + Math.sin(time * 1.4) * .08 + this.energy * .45);
    this.orbits.rotation.y = Math.sin(time * .15) * .16 + this.pointer.x * .16;
    this.orbits.rotation.z = time * .065 - this.progress * .25;
    this.rings[0].rotation.y = .42 + time * .11;
    this.rings[1].rotation.x = 1.05 + Math.sin(time * .23) * .18;
    this.rings[2].rotation.y = .45 - time * .075;
    for (let i = 0; i < this.satellites.length; i++) {
      const a = time * (.22 + i * .014) + i * .93;
      const r = i % 2 ? 2.18 : 2.05;
      this.satellites[i].position.set(Math.cos(a) * r, Math.sin(a) * r * .68, Math.sin(a) * r * .56);
    }
    this.dust.rotation.y = time * .027;
    this.dust.rotation.z = -time * .015;
    this.dust.material.uniforms.time.value = time;
    this.dust.material.uniforms.pulse.value = this.energy;
    this.pulseMesh.visible = this.energy > .02;
    this.pulseMesh.scale.setScalar(1.55 + (1 - this.energy) * 1.45);
    this.pulseMesh.material.uniforms.energy.value = this.energy;
    this.camera.position.x = this.pointer.x * .12;
    this.camera.position.y = -this.pointer.y * .1;
    this.camera.position.z = (this.baseCameraZ || 8.7) + this.progress * 1.8;
    this.camera.lookAt(0, 0, 0);
  }

  showFallback() {
    if (this.renderer) this.renderer.domElement.style.visibility = 'hidden';
    if (this.fallback) { this.fallback.hidden = false; this.fallback.style.display = 'grid'; return; }
    const fallback = document.createElement('div');
    fallback.className = 'sculpture-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    Object.assign(fallback.style, { position: 'absolute', inset: '8%', display: 'grid', placeItems: 'center', pointerEvents: 'none', perspective: '900px' });
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('span');
      Object.assign(ring.style, {
        position: 'absolute', width: `${65 + i * 5}%`, aspectRatio: '1', borderRadius: '50%',
        border: `${i === 0 ? 36 : 2}px solid ${i === 0 ? '#a6d9ed' : i === 1 ? '#fa8851' : '#469bc0'}`,
        boxShadow: i === 0 ? 'inset 8px 8px 16px #ffffff, inset -12px -8px 20px #233e61, 0 0 50px #64caff22' : '0 0 24px #75d9ff33',
        transform: `rotateX(${20 + i * 24}deg) rotateY(${28 - i * 30}deg) rotateZ(${i * 52}deg)`
      });
      fallback.append(ring);
    }
    this.container.append(fallback);
    this.fallback = fallback;
  }
  hideFallback() { if (this.fallback) { this.fallback.hidden = true; this.fallback.style.display = 'none'; } if (this.renderer) this.renderer.domElement.style.visibility = ''; }

  destroy() {
    this.destroyed = true;
    this.looping = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored);
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    for (const resource of this.resources) resource.dispose?.();
    this.resources.clear();
    this.fallback?.remove();
  }
}
