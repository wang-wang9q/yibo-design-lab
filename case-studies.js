const NS = 'http://www.w3.org/2000/svg';
let studyId = 0;
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svg = (content, label, viewBox = '0 0 480 360') => {
  const node = document.createElementNS(NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', label);
  node.innerHTML = content;
  return node;
};
// These parameters match the original hero's closed knot, without introducing a new mark.
function formPoints(count = 240) {
  return Array.from({ length: count }, (_, i) => {
    const u = i / count * Math.PI * 2;
    const r = 1.13 + .39 * Math.cos(3 * u);
    const x = r * Math.cos(2 * u), y = r * Math.sin(2 * u), z = .67 * Math.sin(3 * u);
    return [(x * .94 + z * .28) / 1.65, (y * .8 - z * .43) / 1.65];
  });
}
function formPath(cx, cy, size, attrs = '', count = 240) {
  const path = formPoints(count).map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * size).toFixed(2)} ${(cy - y * size).toFixed(2)}`).join(' ');
  return `<path d="${path}Z" ${attrs}/>`;
}
function typePoints(count = 400) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 240;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 176;
  ctx.font = `800 ${size}px Manrope, Arial, sans-serif`;
  size *= Math.min(1, 416 / ctx.measureText('YIBO').width);
  ctx.font = `800 ${size}px Manrope, Arial, sans-serif`;
  ctx.fillText('YIBO', 240, 122);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const samples = [];
  for (let y = 24; y < 224; y += 3) for (let x = 16; x < 464; x += 3) {
    if (pixels[(y * canvas.width + x) * 4 + 3] > 128) samples.push([(x - 240) / 220, (y - 122) / 220]);
  }
  return Array.from({ length: Math.min(count, samples.length) }, (_, i) => samples[Math.floor((i + .5) / Math.min(count, samples.length) * samples.length)]);
}
const grid = (step = 40, width = 480, height = 360) => {
  let lines = '';
  for (let x = 0; x <= width; x += step) lines += `<path d="M${x} 0V${height}"/>`;
  for (let y = 0; y <= height; y += step) lines += `<path d="M0 ${y}H${width}"/>`;
  return `<g fill="none" stroke="currentColor" opacity=".09" stroke-width="1">${lines}</g>`;
};
function board(number, title, caption, visual, className = '') {
  const section = el('section', `study-board ${className}`);
  const heading = el('div', 'study-board-head');
  heading.append(el('span', 'study-number', number), el('h3', 'study-title', title));
  section.append(heading, visual, el('p', 'study-caption', caption));
  return section;
}
function controls(label, options, onSelect) {
  const group = el('div', 'study-controls');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  options.forEach(([value, name], i) => {
    const button = el('button', i ? 'study-option' : 'study-option study-selected', name);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(!i));
    button.addEventListener('click', () => {
      [...group.children].forEach(item => {
        const selected = item === button;
        item.classList.toggle('study-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      onSelect(value);
    });
    group.append(button);
  });
  return group;
}
function formStudy() {
  const uid = ++studyId;
  const construction = el('div', 'study-visual study-construction');
  const paths = formPath(240, 176, 150, 'fill="none" stroke="currentColor" stroke-width="15" stroke-linejoin="round"');
  const centerline = formPath(240, 176, 150, 'fill="none" stroke="#f3efe6" stroke-opacity=".6" stroke-width="1" stroke-dasharray="3 5"');
  const nodes = formPoints(12).map(([x, y]) => `<circle cx="${240 + x * 150}" cy="${176 - y * 150}" r="3" fill="#fc673d"/>`).join('');
  construction.append(svg(`${grid()}${paths}${centerline}${nodes}<g fill="currentColor" font-size="10" font-family="monospace"><text x="24" y="31">CLOSED CURVE / NEGATIVE SPACE</text><text x="24" y="335">连续曲线 · 回绕交叠 · 流动的负空间</text></g>`, '闭合编结曲线的路径与负空间研究，橙点标记连续路径上的位置'));
  const lighting = el('div', 'study-visual study-lighting');
  lighting.dataset.light = 'cool';
  lighting.append(svg(`<defs><linearGradient id="study-metal-${uid}" gradientUnits="userSpaceOnUse" x1="80" y1="40" x2="360" y2="320"><stop offset="0" stop-color="#081634"/><stop offset=".24" stop-color="#afc5ff"/><stop offset=".38" stop-color="#fff"/><stop offset=".47" stop-color="#182046"/><stop offset=".67" stop-color="#a2b9ed"/><stop offset=".72" stop-color="#fff"/><stop offset=".86" stop-color="#151f45"/><stop offset="1" stop-color="#bfd2ff"/></linearGradient><radialGradient id="study-halo-${uid}"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><ellipse cx="256" cy="171" rx="195" ry="125" fill="url(#study-halo-${uid})"/>${formPath(240, 159, 148, 'fill="none" stroke="#071121" stroke-width="29" stroke-linejoin="round"')}${formPath(240, 159, 148, `fill="none" stroke="url(#study-metal-${uid})" stroke-width="24" stroke-linejoin="round"`)}<path d="M40 286H440" stroke="#ffffff50"/><circle class="study-light-source" cx="52" cy="287" r="8" fill="currentColor"/><g fill="#fff" font-size="10" font-family="monospace"><text x="24" y="29">ENVIRONMENT / REFLECTION</text><text x="25" y="330">用光照，显露曲线的不同层次。</text></g>`, '闭合镜面编结曲线的冷光与暖光视觉提案'));
  lighting.append(controls('切换镜面光照提案', [['cool', '钴蓝冷光'], ['warm', '橙色侧光']], value => { lighting.dataset.light = value; }));
  const applications = el('div', 'study-visual study-form-applications');
  const frames = [['01 / CONTOUR', '曲线海报', 'study-form-flat'], ['02 / REFLECT', '镜面物件', 'study-form-ribbon'], ['03 / SAMPLE', '点阵轮廓', 'study-form-field']];
  frames.forEach(([label, name, cls], index) => {
    const item = el('div', `study-form-application ${cls}`);
    const drawing = index < 2 ? formPath(100, 100, 76, `fill="none" stroke="currentColor" stroke-width="${index ? 13 : 8}" stroke-linejoin="round"`) : formPoints(125).map(([x, y]) => `<circle cx="${100 + x * 76}" cy="${100 - y * 76}" r="1.7" fill="currentColor"/>`).join('');
    item.append(el('span', 'study-small', label), svg(drawing, name, '0 0 200 200'), el('strong', 'study-application-name', name));
    applications.append(item);
  });
  return [board('01', '连续曲线，流动的留白。', '闭合路径不断回绕，交叠之间形成留白。这张研究板沿用首屏编结雕塑的曲线参数，观察曲线与负空间的关系。', construction), board('02', '用环境，雕刻镜面。', '钴蓝建立距离感，橙光引入温度。切换光照，比较同一个轮廓的两种情绪。', lighting), board('03', '从曲线到空间。', '将同一编结曲线置入海报、镜面物件与点阵，比较实体与留白、材质与轮廓的不同表达。', applications)];
}
function auraStudy() {
  const rhythm = el('div', 'study-visual study-rhythm');
  rhythm.dataset.rhythm = 'breathe';
  const bars = el('div', 'study-waveform');
  bars.setAttribute('aria-hidden', 'true');
  Array.from({ length: 33 }, (_, i) => {
    const bar = el('i');
    bar.style.setProperty('--study-bar', String(i));
    bar.style.setProperty('--study-height', `${12 + Math.sin(i * .71) ** 2 * 74}%`);
    bars.append(bar);
  });
  const tempo = el('div', 'study-tempo');
  tempo.append(el('span', 'study-small', 'MOTION SCORE / VISUAL ONLY'), el('strong', 'study-tempo-label', 'BREATHING'), el('span', 'study-rhythm-readout', '缓慢呼吸，展开产品。'));
  rhythm.append(tempo, bars, controls('切换视觉节奏提案', [['breathe', '呼吸'], ['pulse', '节拍'], ['release', '释放']], value => {
    rhythm.dataset.rhythm = value;
    const values = { breathe: ['BREATHING', '缓慢呼吸，展开产品。'], pulse: ['PULSING', '短促节拍，回应操作。'], release: ['RELEASING', '持续流动，进入声场。'] };
    tempo.querySelector('.study-tempo-label').textContent = values[value][0];
    tempo.querySelector('.study-rhythm-readout').textContent = values[value][1];
  }));
  const ui = el('div', 'study-visual study-aura-ui');
  const speaker = `<defs><pattern id="study-grille-${++studyId}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#18221a"/></pattern></defs><rect x="128" y="83" width="225" height="67" rx="31" fill="#d1d8c2" stroke="#172212" stroke-width="3"/><rect x="148" y="93" width="174" height="46" rx="22" fill="url(#study-grille-${studyId})"/><ellipse cx="336" cy="116" rx="14" ry="29" fill="#899773" stroke="#172212"/><circle cx="333" cy="116" r="6" fill="#172212"/>`;
  ui.append(svg(`<g font-family="sans-serif" fill="#172212"><text x="27" y="30" font-size="13" font-weight="800">AURA.</text><text x="378" y="30" font-size="8">EXPLORE ↗</text><text x="27" y="67" font-size="31" font-weight="800" letter-spacing="-2">SOUND. UNBOUND.</text><ellipse cx="249" cy="145" rx="181" ry="73" fill="none" stroke="#172212" stroke-opacity=".25"/>${speaker}<text x="27" y="220" font-size="10">THE SOUND YOU CAN FEEL.</text><path d="M27 238H453" stroke="#172212" stroke-opacity=".2"/><text x="27" y="264" font-size="9">选择一个声音的颜色</text><circle cx="39" cy="293" r="10" fill="#172212"/><circle cx="69" cy="293" r="10" fill="#f18d56"/><circle cx="99" cy="293" r="10" fill="#d5ed69" stroke="#172212"/><rect x="308" y="267" width="146" height="47" rx="24" fill="#172212"/><text x="328" y="296" font-size="11" fill="#d5ed69">进入声场实验 ↗</text><text x="27" y="343" font-size="8">01 PRODUCT → 02 DETAIL → 03 PLAY</text></g>`, 'AURA 产品网站首屏、颜色选择与声场入口的原创界面提案'));
  const soundspace = el('div', 'study-visual study-aura-space');
  soundspace.append(svg(`${grid()}<g fill="none" stroke="#d5ed69" stroke-width="1.2"><ellipse cx="240" cy="159" rx="80" ry="80"/><ellipse cx="240" cy="159" rx="118" ry="90" transform="rotate(-26 240 159)"/><ellipse cx="240" cy="159" rx="174" ry="76" transform="rotate(19 240 159)"/><circle cx="240" cy="159" r="45" opacity=".45"/></g><circle class="study-orbit-dot" cx="320" cy="159" r="5" fill="#d5ed69"/><text x="240" y="166" text-anchor="middle" fill="#d5ed69" font-size="17" font-family="sans-serif" font-weight="700">PLAY.</text><g fill="#d5ed69" font-size="10" font-family="monospace"><text x="24" y="29">FROM PRODUCT TO SOUNDSCAPE</text><text x="24" y="303">01 / 触碰，扰动。</text><text x="24" y="326">02 / 选择，改变。</text></g>`, '由产品展示转入可触碰声场的轨道构图提案'));
  return [board('01', '先设计节奏，再设计运动。', '呼吸用于浏览，节拍回应操作，释放进入实验。按钮切换视觉运动方式，不播放音频。', rhythm), board('02', '让信息跟着感官出现。', '这一张新界面提案，将产品、颜色选择与实验入口放在同一个浏览节奏里。', ui), board('03', '把观看，变成参与。', '轨道线是界面与声场之间的连接语言：从轮廓展开为空间，让触碰成为下一步。', soundspace)];
}
function afterStudy() {
  const palette = el('div', 'study-visual study-after-palette');
  const colors = [['#F2633F', 'EMBER', '余温'], ['#E9A18A', 'AFTERGLOW', '余像'], ['#F3EFE6', 'PAPER', '留白'], ['#302019', 'CHAR', '轮廓']];
  colors.forEach(([color, label, name]) => {
    const swatch = el('div', 'study-swatch');
    swatch.style.backgroundColor = color;
    swatch.style.color = label === 'CHAR' ? '#f3efe6' : '#302019';
    swatch.append(el('span', 'study-small', label), el('strong', 'study-swatch-name', name), el('span', 'study-swatch-code', color));
    palette.append(swatch);
  });
  const overlap = el('div', 'study-visual study-overlap');
  overlap.style.setProperty('--study-opacity', '.5');
  const sheets = el('div', 'study-sheets');
  sheets.setAttribute('aria-hidden', 'true');
  sheets.append(el('i'), el('i'), el('i'));
  const readout = el('div', 'study-material-readout', '50% / LAYERED COLOUR');
  overlap.append(el('span', 'study-small', 'TRANSPARENCY / A COMPOSITION STUDY'), sheets, readout);
  overlap.append(controls('比较色彩叠片透明度', [['.5', '50% 叠片'], ['.25', '25% 轻透'], ['.85', '85% 浓色']], value => {
    overlap.style.setProperty('--study-opacity', value);
    readout.textContent = `${Math.round(Number(value) * 100)}% / LAYERED COLOUR`;
  }));
  const editorial = el('div', 'study-visual study-editorial');
  editorial.append(svg(`<rect width="480" height="360" fill="#e3dccc"/><rect x="30" y="29" width="206" height="301" fill="#f3efe6"/><rect x="249" y="29" width="201" height="301" fill="#f2633f"/><g fill="#302019" font-family="sans-serif"><text x="44" y="48" font-size="7">A STUDY IN PERCEPTION</text><text x="43" y="89" font-size="35" font-weight="800" letter-spacing="-2">AFTER.</text><text x="43" y="116" font-size="9">看见之后，什么会被留下？</text><text x="45" y="309" font-size="7">IMAGE / MEMORY / MATERIAL</text><text x="267" y="51" font-size="8">AFTERIMAGE / STUDY 03</text><text x="269" y="313" font-size="9">停留的余像</text></g><g fill="#f2633f" opacity=".6"><path d="M83 150L185 137L159 263L57 276Z"/><path d="M106 130L207 160L183 277L82 247Z"/></g><g fill="none" stroke="#302019" stroke-width="2"><path d="M288 107L393 133L370 253L265 227Z"/><path d="M317 88L422 114L399 234L294 208Z"/></g><text x="290" y="285" fill="#f3efe6" font-family="sans-serif" font-size="43" font-weight="800" letter-spacing="-3">AFTER.</text>`, 'AFTER 两款原创编辑海报：暖白透明叠片与橙色线框构图'));
  return [board('01', '四种颜色，一种温度。', '余温与余像形成连续色阶；暖白容纳留白，深褐稳定轮廓。颜色也承担阅读层级。', palette), board('02', '透明度改变视觉重量。', '比较三种叠片参数，观察交叠区域如何加深。此处是色彩构图实验，用来建立材质方向。', overlap), board('03', '将材质语言，带到纸上。', '两款新海报提案分别放大“透”与“线”：保留同一色彩系统，改变视觉重心。', editorial)];
}
function typeStudy() {
  const samples = typePoints(440);
  const sample = el('div', 'study-visual study-type-sample');
  sample.append(svg(`${grid(24)}${samples.map(([x, y], i) => `<circle cx="${240 + x * 220}" cy="${172 + y * 220}" r="${i % 11 ? 1.8 : 2.6}" fill="${i % 11 ? '#d7fa76' : '#fff'}"/>`).join('')}<g fill="#d7fa76" font-family="monospace" font-size="10"><text x="24" y="29">YIBO → PIXELS → PARTICLES</text><text x="24" y="332">YIBO / 从字形，到可运动的点。</text></g>`, 'YIBO 四个字母从字体轮廓采样为点阵的原创示意'));
  const morph = el('div', 'study-visual study-type-morph');
  morph.dataset.state = 'glyph';
  const particleSvg = svg(`${grid(40)}${samples.map(([x, y], i) => {
    const angle = i * Math.PI * 2 / samples.length;
    const glyph = [240 + x * 210, 162 + y * 210];
    const orbit = [240 + Math.cos(angle) * (90 + i % 4 * 20), 160 + Math.sin(angle) * (62 + i % 4 * 16)];
    const flow = [35 + i / samples.length * 410, 160 + Math.sin(i / samples.length * Math.PI * 4) * 55 + (i % 5 - 2) * 13];
    return `<circle class="study-particle" cx="${glyph[0]}" cy="${glyph[1]}" r="1.8" fill="#d7fa76" data-glyph="${glyph.join(',')}" data-orbit="${orbit.join(',')}" data-flow="${flow.join(',')}"/>`;
  }).join('')}<g fill="#d7fa76" font-family="monospace" font-size="10"><text x="24" y="29">ONE SET OF POINTS / THREE STATES</text><text x="24" y="332">SHAPE → ORBIT → FLOW → SHAPE</text></g>`, '同一批点在 YIBO 字形、轨道与流线三种状态之间移动');
  morph.append(particleSvg, controls('比较点阵形变状态', [['glyph', '01 字形'], ['orbit', '02 轨道'], ['flow', '03 流线']], value => {
    morph.dataset.state = value;
    particleSvg.querySelectorAll('.study-particle').forEach(dot => {
      const [x, y] = dot.dataset[value].split(',');
      dot.style.setProperty('--study-particle-x', `${x}px`);
      dot.style.setProperty('--study-particle-y', `${y}px`);
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
    });
  }));
  const score = el('div', 'study-visual study-score');
  const frames = [['01', '识别', '先让名字被看见。', 'HOLD'], ['02', '解构', '松开字形的约束。', 'RELEASE'], ['03', '重组', '让观看者完成变化。', 'RETURN']];
  frames.forEach(([index, title, caption, word]) => {
    const frame = el('div', 'study-score-frame');
    frame.append(el('span', 'study-small', index), el('strong', 'study-score-title', title), el('p', 'study-score-copy', caption), el('span', 'study-score-word', word));
    score.append(frame);
  });
  return [board('01', '将名字变成可运动的材料。', '把 YIBO 的字形轮廓采样成点，让文字保留识别度，也获得自由运动的可能。', sample), board('02', '三个状态，一批点。', '切换形态，比较字形、轨道与流线的坐标布局。同一个点沿连续路径参与重组。', morph), board('03', '运动需要停顿。', '“识别 → 解构 → 重组”是一份动态编排提案。先给阅读留出时间，再让动作发生。', score)];
}

/** Create a self-contained concept study. Insert beside the case details. */
export function buildCaseStudy(key) {
  const builders = { form: formStudy, aura: auraStudy, after: afterStudy, type: typeStudy };
  const suite = el('section', `study-suite study-${key}`);
  suite.setAttribute('aria-label', '原创设计研究与应用提案');
  if (!builders[key]) return suite;
  const header = el('div', 'study-intro');
  header.append(el('span', 'study-eyebrow', 'DESIGN NOTES / CONCEPT EXPLORATIONS'), el('h3', 'study-intro-title', '让想法，接受细看。'), el('p', 'study-intro-copy', '以下是为本作品集新创作的设计研究与应用提案。'));
  suite.append(header, ...builders[key]());
  return suite;
}
