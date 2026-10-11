import { YiboSculpture } from './sculpture.js';
import { KineticField } from './kinetic.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let userReduced = null;
let reduced = media.matches;
let context;
let workTrigger;
let workIndex = 0;
let scrollRefresh;
let sculpture;
let field;
let entranceTimeline;

// Preserve the real heading text for assistive technology while animating its letters.
$$('[data-split]').forEach(row => {
  const text = row.textContent;
  row.setAttribute('aria-label', text);
  row.textContent = '';
  [...text].forEach(letter => {
    const span = document.createElement('span');
    span.className = 'char';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = letter;
    row.append(span);
  });
});

function goTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const offset = id === 'top' || id === 'work' ? 0 : 95;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'instant' : 'smooth' });
}

function selectButtons(selector, key, value) {
  $$(selector).forEach(button => {
    const selected = button.dataset[key] === value;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setWorkIndex(value) {
  workIndex = clamp(Math.round(value), 0, 3);
  const label = String(workIndex + 1).padStart(2, '0');
  if ($('#work-current').textContent !== label) $('#work-current').textContent = label;
  $('#work-prev').disabled = workIndex === 0;
  $('#work-next').disabled = workIndex === 3;
}

function showWork(index) {
  const next = clamp(index, 0, 3);
  if (!reduced && workTrigger) {
    window.scrollTo({ top: workTrigger.start + (workTrigger.end - workTrigger.start) * next / 3, behavior: 'smooth' });
  } else {
    const card = $$('.work-panel')[next];
    window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 100, behavior: 'instant' });
    setWorkIndex(next);
  }
}

function capturePosition() {
  if (workTrigger && window.scrollY >= workTrigger.start - 1 && window.scrollY <= workTrigger.end + 1) {
    return { element: $$('.work-panel')[workIndex], top: $$('.work-panel')[workIndex].getBoundingClientRect().top, work: workIndex };
  }
  const anchors = $$('.hero-stage, .work-panel, .about-statement, .about-object, .practice-list, .method, .lab-heading, .lab-canvas-wrap, .lab-controlbar, .closing, footer');
  const visible = anchors.filter(element => { const rect = element.getBoundingClientRect(); return rect.bottom > 95 && rect.top < window.innerHeight; });
  const element = visible.sort((a, b) => Math.abs(a.getBoundingClientRect().top - 100) - Math.abs(b.getBoundingClientRect().top - 100))[0];
  if (!element) return null;
  return { element, top: stableTop(element), work: element.classList.contains('work-panel') ? $$('.work-panel').indexOf(element) : null };
}

function stableTop(element) {
  const rect = element.getBoundingClientRect();
  // The lab's scroll reveal scales around its centre; use the layout edge as an anchor.
  return rect.top - (element.id === 'lab-stage' ? (element.offsetHeight - rect.height) / 2 : 0);
}

function buildMotion(preserve = true) {
  const position = window.scrollY;
  const view = preserve ? capturePosition() : null;
  context?.revert();
  workTrigger = null;
  document.documentElement.classList.toggle('light-motion', reduced);
  document.body.classList.toggle('light-motion', reduced);
  document.body.classList.toggle('compact-gallery', window.innerHeight < 720);
  sculpture?.setReducedMotion(reduced);
  sculpture?.setProgress(0);
  field?.setReducedMotion(reduced);
  if (reduced && gsap) { gsap.killTweensOf('.magnetic, .cursor'); gsap.set('.magnetic', { x: 0, y: 0 }); }
  const control = $('#motion-control');
  control.setAttribute('aria-pressed', String(reduced));
  control.setAttribute('aria-label', reduced ? '开启完整动态模式' : '开启轻动态模式');
  $('.motion-text').textContent = reduced ? 'LIGHT MOTION' : 'FULL MOTION';
  $('#lab-touch-label').textContent = reduced ? '选择形态 · 静态探索' : 'TOUCH TO DISRUPT';
  if (!gsap || !ScrollTrigger) return;
  context = gsap.context(() => {
    if (reduced) {
      gsap.set('.hero-title .char, .closing .char', { clearProps: 'all' });
      $$('.work-panel').forEach((panel, i) => ScrollTrigger.create({ trigger: panel, start: 'top 60%', end: 'bottom 60%', onEnter: () => setWorkIndex(i), onEnterBack: () => setWorkIndex(i) }));
      return;
    }
    const small = window.innerWidth <= 700;
    const hero = gsap.timeline({ scrollTrigger: {
      trigger: '.hero-story', start: 'top top', end: () => `+=${window.innerHeight * (small ? 1.25 : 1.65)}`,
      pin: window.innerHeight >= 720 ? '.hero-stage' : false, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: self => sculpture?.setProgress(self.progress)
    } });
    hero.to('.hero-title .char', { yPercent: (i) => -85 - i * 7, xPercent: (i) => (i % 2 ? 12 : -12), rotation: (i) => (i % 2 ? 9 : -9), opacity: 0, stagger: .015, ease: 'power2.in', duration: .38 }, 0)
      .to('.hero-stage', { '--hero-bg': '#244eff', '--hero-ink': '#f1f0e9', duration: .45, ease: 'none' }, .2)
      .to('.hero-sculpture', { xPercent: small ? 19 : 7, yPercent: small ? 18 : 7, scale: small ? .9 : 1.13, duration: .65, ease: 'power2.inOut' }, .18)
      .to('.portal-ring', { scale: 2.3, borderColor: '#ffffff30', duration: .7, ease: 'none' }, .15)
      .to('.hero-manifesto', { autoAlpha: 1, y: -12, duration: .3 }, .48)
      .from('.hero-manifesto p', { y: 45, duration: .32, ease: 'power2.out' }, .5)
      .to('.manifesto-mark', { rotation: 180, duration: .45, ease: 'none' }, .55)
      .to('.hero-lines', { opacity: 0, duration: .3 }, .2);

    const track = $('.work-track');
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + window.innerWidth * (small ? .12 : .1));
    if (window.innerHeight >= 720) {
      const rail = gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: {
      trigger: '.works', start: 'top top', end: () => `+=${distance() * (small ? 1.18 : 1)}`,
      pin: '.work-stage', scrub: .7, anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: self => { setWorkIndex(self.progress * 3); gsap.set('.work-meter i', { scaleX: .04 + self.progress * .96 }); }
    } });
      workTrigger = rail.scrollTrigger;
    } else {
      $$('.work-panel').forEach((panel, i) => {
        ScrollTrigger.create({ trigger: panel, start: 'top 60%', end: 'bottom 60%', onEnter: () => setWorkIndex(i), onEnterBack: () => setWorkIndex(i) });
        gsap.from(panel, { y: 35, opacity: .5, duration: .8, scrollTrigger: { trigger: panel, start: 'top 90%', once: true } });
      });
    }
    gsap.to('.about-fill', { '--fill': '100%', ease: 'none', scrollTrigger: { trigger: '.about-layout', start: 'top 80%', end: 'center 55%', scrub: true } });
    gsap.from('.about-statement p', { y: 25, opacity: 0, duration: 1, scrollTrigger: { trigger: '.about-statement p', start: 'top 90%', once: true } });
    gsap.to('.about-monogram', { yPercent: -12, rotation: 8, ease: 'none', scrollTrigger: { trigger: '.about-object', start: 'top bottom', end: 'bottom top', scrub: 1 } });
    gsap.to('.orbit-one', { rotationZ: 150, duration: 32, repeat: -1, ease: 'none' });
    gsap.to('.orbit-two', { rotationZ: -150, duration: 38, repeat: -1, ease: 'none' });
    gsap.to('.about-star', { rotation: 360, duration: 26, repeat: -1, ease: 'none' });
    gsap.from('.practice', { y: 30, opacity: 0, stagger: .1, duration: .65, scrollTrigger: { trigger: '.practice-list', start: 'top 88%', once: true } });
    gsap.to('.method-path', { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.method', start: 'top 80%', end: 'bottom 75%', scrub: 1 } });
    gsap.from('.method-steps>div', { y: 20, opacity: 0, stagger: .16, duration: .7, scrollTrigger: { trigger: '.method-steps', start: 'top 92%', once: true } });
    gsap.from('.lab-heading h2', { y: 45, opacity: 0, duration: .9, scrollTrigger: { trigger: '.lab-heading', start: 'top 85%', once: true } });
    gsap.from('.lab-canvas-wrap', { scale: .94, opacity: .2, duration: 1, scrollTrigger: { trigger: '.lab-canvas-wrap', start: 'top 90%', end: 'top 30%', scrub: 1 } });
    gsap.from('.closing .char', { yPercent: 90, opacity: 0, rotation: 6, duration: 1.05, stagger: .025, ease: 'power3.out', scrollTrigger: { trigger: '.closing h2', start: 'top 85%', once: true } });
    gsap.to('.closing-star', { rotation: 180, ease: 'none', scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'bottom top', scrub: 1 } });
  });
  context.add(() => {
    gsap.to('.page-progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: () => ScrollTrigger.maxScroll(window), scrub: true } });
    ['work', 'about', 'lab'].forEach(id => {
      ScrollTrigger.create({ trigger: `#${id}`, start: 'top 45%', end: 'bottom 45%', onToggle: self => $(`[data-nav="${id}"]`)?.classList.toggle('active', self.isActive) });
    });
  });
  ScrollTrigger.refresh();
  const restore = view && !reduced && workTrigger && view.work !== null ? workTrigger.start + (workTrigger.end - workTrigger.start) * view.work / 3
    : view ? stableTop(view.element) + window.scrollY - view.top : position;
  window.scrollTo({ top: clamp(restore, 0, document.documentElement.scrollHeight - window.innerHeight), behavior: 'instant' });
}

function pointerFor(event, target) {
  const rect = target.getBoundingClientRect();
  return [clamp((event.clientX - rect.left) / rect.width, 0, 1) * 2 - 1, clamp((event.clientY - rect.top) / rect.height, 0, 1) * 2 - 1];
}

function attachInteractions() {
  const heroStage = $('.hero-stage');
  heroStage.addEventListener('pointermove', event => sculpture?.setPointer(...pointerFor(event, heroStage)), { passive: true });
  heroStage.addEventListener('pointerleave', () => sculpture?.setPointer(0, 0));
  $$('[data-sculpture]').forEach(button => button.addEventListener('click', () => {
    selectButtons('[data-sculpture]', 'sculpture', button.dataset.sculpture);
    sculpture?.setMode(button.dataset.sculpture);
  }));
  $('#work-prev').addEventListener('click', () => showWork(workIndex - 1));
  $('#work-next').addEventListener('click', () => showWork(workIndex + 1));
  $$('.work-panel').forEach((card, index) => card.addEventListener('focusin', () => {
    if (index !== workIndex && !reduced) showWork(index);
  }));
  $$('a[href^="#"]').forEach(anchor => anchor.addEventListener('click', event => {
    const id = anchor.getAttribute('href').slice(1);
    if (!document.getElementById(id)) return;
    event.preventDefault();
    goTo(id);
    history.replaceState(null, '', `#${id}`);
    if (anchor.classList.contains('skip-link')) $('#main').focus({ preventScroll: true });
  }));
  $('#main').setAttribute('tabindex', '-1');
  $('#motion-control').addEventListener('click', () => { userReduced = !reduced; reduced = userReduced; entranceTimeline?.progress(1); buildMotion(); });
  media.addEventListener('change', () => { if (userReduced === null) { reduced = media.matches; buildMotion(); } });

  const modes = {
    type: ['01 / TYPOGRAPHIC FIELD', '让名字，自由发生。'],
    orbit: ['02 / ORBITAL ATTRACTION', '每一次靠近，都会改变引力。'],
    flow: ['03 / FLOWING POSSIBILITIES', '跟随流动，找到新的方向。']
  };
  function changeMode(mode) {
    selectButtons('[data-mode]', 'mode', mode);
    field?.setMode(mode);
    $('#lab-mode-label').textContent = modes[mode][0];
    $('#lab-status').textContent = modes[mode][1];
  }
  $$('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.mode)));
  $$('[data-palette]').forEach(button => button.addEventListener('click', () => {
    selectButtons('[data-palette]', 'palette', button.dataset.palette);
    field?.setColor(button.dataset.palette);
  }));
  $('#lab-strength').addEventListener('input', event => {
    $('#strength-value').value = event.target.value;
    field?.setStrength(Number(event.target.value) / 100);
  });
  $('#lab-reset').addEventListener('click', () => {
    changeMode('type');
    selectButtons('[data-palette]', 'palette', '#9fb7ff');
    field?.setColor('#9fb7ff');
    field?.setStrength(.55);
    field?.setPointer(0, 0);
    $('#lab-strength').value = '55';
    $('#strength-value').value = '55';
    field?.pulse();
    $('#lab-status').textContent = '回到起点，再试一次。';
  });
  const stage = $('#lab-stage');
  let down;
  stage.addEventListener('pointermove', event => field?.setPointer(...pointerFor(event, stage)), { passive: true });
  stage.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; field?.setPointer(...pointerFor(event, stage)); });
  stage.addEventListener('pointerup', event => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 18) {
      field?.pulse();
      $('#lab-status').textContent = reduced ? '静态模式下，也可以切换形态与颜色。' : '一圈涟漪，正在扩散。';
    }
    down = null;
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('pointerleave', () => { down = null; field?.setPointer(1, 1); });
  stage.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); field?.setPointer(0, 0); field?.pulse(); $('#lab-status').textContent = reduced ? '静态模式下，也可以切换形态与颜色。' : '一圈涟漪，正在扩散。'; }
  });
  const cursor = $('.cursor');
  if (finePointer.matches && gsap) {
    const x = gsap.quickTo(cursor, 'x', { duration: .22, ease: 'power3.out' });
    const y = gsap.quickTo(cursor, 'y', { duration: .22, ease: 'power3.out' });
    window.addEventListener('pointermove', event => { if (reduced || event.pointerType === 'touch') return; x(event.clientX); y(event.clientY); cursor.style.opacity = '1'; }, { passive: true });
    document.addEventListener('pointerleave', () => { cursor.style.opacity = '0'; });
    $$('.work-visual').forEach(visual => {
      visual.addEventListener('pointerenter', () => cursor.classList.add('active'));
      visual.addEventListener('pointerleave', () => cursor.classList.remove('active'));
    });
    $$('.magnetic').forEach(button => {
      button.addEventListener('pointermove', event => {
        if (reduced) return;
        const rect = button.getBoundingClientRect();
        gsap.to(button, { x: (event.clientX - rect.left - rect.width / 2) * .11, y: (event.clientY - rect.top - rect.height / 2) * .15, duration: .3, overwrite: 'auto' });
      });
      button.addEventListener('pointerleave', () => gsap.to(button, { x: 0, y: 0, duration: reduced ? 0 : .6, ease: 'elastic.out(1, .4)', overwrite: 'auto' }));
    });
  }
}

const projects = {
  form: {
    title: '光的形状 / FORM.', image: 'assets/cover-form.png', alt: '镜面金属丝带的形态研究', code: 'OBJECT 001 / FORM STUDY', category: 'VISUAL SYSTEM · 3D ART DIRECTION',
    summary: '从一条没有起点的曲线出发，让镜面反射、负空间与钴蓝色一起构成视觉语言。它是一场关于“想法如何拥有形状”的独立研究。',
    details: [['01 / THE QUESTION', '把抽象的感觉，变成一个物件。', '如果一个想法可以被看见，它应该柔软还是锋利？这个研究选择连续曲面，让力量与轻盈同时出现。'], ['02 / THE EXPERIMENT', '用光，重新定义轮廓。', '镜面材质映入环境的色彩，随角度变化不断显露新的线条。蓝色提供空间感，橙色成为短暂却鲜明的视觉节拍。'], ['03 / THE EXPERIENCE', '一个持续变化的视觉符号。', '将静态视觉延伸为本网站首屏的动态雕塑：编结、绽放与轨道，回应同一个关于流动与形态的问题。']],
    action: ['回到动态雕塑', 'top']
  },
  aura: {
    title: '声音的下一维 / AURA.', image: 'assets/aura-speaker.png', alt: 'AURA 概念音箱设计', code: 'OBJECT 002 / SOUND UNBOUND', category: 'DIGITAL EXPERIENCE · MOTION DESIGN',
    summary: '一个以便携音箱为起点的完整产品概念网站。让视觉的呼吸、声场的波动与产品的细节形成同一个节奏。',
    details: [['01 / THE QUESTION', '让声音，有可感知的空间。', '从音箱的轮廓到每一次滚动，把产品介绍转化为可以参与的声音探索。产品名称、视觉与网站体验均为独立概念创作。'], ['02 / THE EXPERIMENT', '在节奏中，逐层展开产品。', '动态波形、轨道线与大幅产品视觉共同描述音场；颜色选择、声场实验和章节转换，让信息在操作中逐渐出现。'], ['03 / THE EXPERIENCE', '两种节奏，同一个声音想象。', '标准版以清晰的产品叙事为主，Motion Lab 则进一步扩展空间动效与互动。两个独立网站均可直接打开体验。']],
    links: [['体验 AURA Motion Lab ↗', 'https://wang-wang9q.github.io/aura-motion-lab/'], ['浏览 AURA 标准版 ↗', 'https://wang-wang9q.github.io/aura-sound-unbound/']]
  },
  after: {
    title: '停留的余像 / AFTER.', image: 'assets/cover-after.png', alt: '橙红色玻璃雕塑的材质研究', code: 'OBJECT 003 / AFTERIMAGE', category: 'MATERIAL EXPLORATION · EDITORIAL VISUAL',
    summary: '研究那些在目光移开之后，仍然停留的颜色与轮廓。以暖白空间与橙红玻璃为起点，探索视觉记忆的温度。',
    details: [['01 / THE QUESTION', '看见之后，什么会被留下？', '选择半透明的玻璃作为视觉母题，让形体同时拥有明确的轮廓与不确定的内部。'], ['02 / THE EXPERIMENT', '把折射，变成构图的一部分。', '层叠的玻璃结构让颜色相互叠加。大面积留白与细小的阴影一起，控制物件在空间中的重量。'], ['03 / THE DIRECTION', '一组关于感知的视觉提案。', '这张概念封面以 AI 辅助生成，用来探索材质、灯光与艺术方向。它提供的是一种编辑视觉的可能，而非已制作的实体作品。']],
    action: ['继续看互动实验', 'lab']
  },
  type: {
    title: '文字的引力 / TYPE.', image: 'assets/cover-type.svg', alt: 'YIBO 字形实验海报', code: 'OBJECT 004 / WORDS HAVE GRAVITY', category: 'KINETIC TYPOGRAPHY · CREATIVE CODING',
    summary: '名字从字形变成粒子，从粒子变成一个可以被干预的空间。文字仍然承载意义，也可以成为自由流动的视觉材料。',
    details: [['01 / THE QUESTION', '如果文字拥有引力。', '将 YIBO 的轮廓采样成点，保留最基本的识别性，再让每一个点独立参与运动。'], ['02 / THE EXPERIMENT', '三种状态，连续发生。', '字形、轨道与流线之间平滑变换。指针推开粒子，点击释放涟漪，颜色与引力强度可以随时改变。'], ['03 / YOUR TURN', '把最后一步，交给观看的人。', '下方的实验台就是这件作品本身。用鼠标、触屏或键盘进入它，每一次操作都会形成不同的瞬间。']],
    action: ['进入文字引力实验', 'lab']
  }
};

function showDialog(dialog) {
  dialog.showModal();
  document.body.classList.add('dialog-open');
  sculpture?.setVisible(false);
  field?.setReducedMotion(true);
}

function closeDialog(dialog) {
  dialog.close();
}

function setupDialogs() {
  const dialog = $('#case-dialog');
  $('#work-current').setAttribute('aria-live', 'polite');
  $$('[data-case]').forEach(button => button.addEventListener('click', () => {
    const project = projects[button.dataset.case];
    $('#case-title').textContent = project.title;
    $('#case-category').textContent = project.category;
    $('#case-summary').textContent = project.summary;
    $('#case-code').textContent = project.code;
    $('#case-image').src = project.image;
    $('#case-image').alt = project.alt;
    $('.case-cover').classList.toggle('is-aura', button.dataset.case === 'aura');
    $('#case-details').replaceChildren();
    project.details.forEach(([number, title, description]) => {
      const block = document.createElement('div');
      const label = document.createElement('span');
      const heading = document.createElement('h3');
      const copy = document.createElement('p');
      label.textContent = number; heading.textContent = title; copy.textContent = description;
      block.append(label, heading, copy); $('#case-details').append(block);
    });
    $('#case-actions').replaceChildren();
    if (project.links) project.links.forEach(([label, href]) => {
      const link = document.createElement('a'); link.textContent = label; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('#case-actions').append(link);
    });
    if (project.action) {
      const action = document.createElement('button'); action.textContent = `${project.action[0]} ↗`; action.addEventListener('click', () => { closeDialog(dialog); goTo(project.action[1]); }); $('#case-actions').append(action);
    }
    showDialog(dialog);
    dialog.scrollTop = 0;
  }));
  $$('[data-case]').forEach(button => button.setAttribute('aria-label', `展开${projects[button.dataset.case].title}案例`));
  $$('[data-contact]').forEach(button => button.addEventListener('click', () => showDialog($('#contact-dialog'))));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(document.getElementById(button.dataset.close))));
  $$('dialog').forEach(item => {
    item.addEventListener('click', event => {
      if (event.target !== item) return;
      const rect = item.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(item);
    });
    item.addEventListener('close', () => {
      document.body.classList.remove('dialog-open'); sculpture?.setVisible(true); field?.setReducedMotion(reduced);
    });
  });
  const form = $('#brief-form');
  const text = () => `合作简报\n\n称呼：${$('#brief-name').value.trim() || '未填写'}\n设计方向：${$('#brief-direction').value}\n\n想法：\n${$('#brief-idea').value.trim()}\n\n— 由王一博概念作品集整理；此简报未自动发送。`;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const brief = text();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(brief);
      $('#brief-status').textContent = '简报已复制，可以粘贴后分享。';
    } catch {
      const buffer = document.createElement('textarea'); buffer.value = brief; buffer.style.cssText = 'position:fixed;opacity:0;left:0;top:0;'; form.append(buffer); buffer.select();
      const copied = document.execCommand('copy'); buffer.remove();
      $('#brief-status').textContent = copied ? '简报已复制，可以粘贴后分享。' : '浏览器暂不支持复制，请使用“保存为文件”。';
    }
  });
  $('#download-brief').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const url = URL.createObjectURL(new Blob(['\uFEFF', text()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '王一博-合作简报.txt'; form.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#brief-status').textContent = '简报文件已生成，可自行保存和分享。';
  });
}

function start() {
  document.body.classList.add('js');
  gsap?.registerPlugin(ScrollTrigger);
  try { sculpture = new YiboSculpture($('#hero-sculpture'), { reducedMotion: reduced }); } catch (error) { console.warn('Sculpture unavailable', error); }
  try { field = new KineticField($('#kinetic-canvas'), { reducedMotion: reduced }); } catch (error) { console.warn('Particle field unavailable', error); }
  field?.setStrength(.55);
  attachInteractions();
  setupDialogs();
  buildMotion(false);
  const entrance = $('.entrance');
  const dismiss = () => { entrance.style.display = 'none'; };
  // A finite entrance; the content always becomes available even if animation fails.
  setTimeout(dismiss, 2600);
  if (gsap && !reduced) {
    entranceTimeline = gsap.timeline({ onComplete: dismiss });
    entranceTimeline.from('.entrance-grid>span', { y: 45, opacity: 0, duration: .6, stagger: .1, ease: 'power3.out' })
      .from('.entrance-grid i', { scaleX: 0, duration: .4 }, .1)
      .to(entrance, { yPercent: -105, duration: .85, ease: 'power3.inOut' }, .7)
      .from('.hero-title', { y: 60, autoAlpha: 0, duration: .75, ease: 'power3.out' }, .85);
  } else dismiss();
  let lastWidth = window.innerWidth;
  let lastCompact = window.innerHeight < 720;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) < 30 && lastCompact === (window.innerHeight < 720)) return;
    lastWidth = window.innerWidth;
    lastCompact = window.innerHeight < 720;
    clearTimeout(scrollRefresh);
    scrollRefresh = setTimeout(() => { entranceTimeline?.progress(1); buildMotion(); }, 220);
  });
  document.fonts.ready.then(() => ScrollTrigger?.refresh());
  window.addEventListener('load', () => ScrollTrigger?.refresh(), { once: true });
  if (location.hash && location.hash !== '#top') setTimeout(() => goTo(location.hash.slice(1)), 1800);
  window.addEventListener('pagehide', event => { if (!event.persisted) { context?.revert(); sculpture?.destroy(); field?.destroy(); } });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
