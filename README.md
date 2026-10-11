# 王一博 / Design in Motion

一个以「王一博」为署名的个人概念作品集。保留第二版的字体、配色、镜面编结和章节结构，进一步打磨动态节奏、材质和案例内容。项目内容为独立设计练习，不代表真实客户合作、个人履历或商业交付。

公开地址：[yibo-design-lab](https://wang-wang9q.github.io/yibo-design-lab/)。此前的 [AURA 炫技版](https://wang-wang9q.github.io/aura-motion-lab/) 和 [AURA 原版](https://wang-wang9q.github.io/aura-sound-unbound/) 保留各自网址，独立展示。

## 场景与交互

- 首屏：实时镜面 3D 雕塑、环形文字、三种雕塑形态，以及随滚动发生的蓝色空间和荧光绿字幕。主体先落位，再显示宣言，为阅读留出停顿。
- 作品展厅：FORM 的钴蓝金属、AURA 的荧光绿音场、AFTER 的橙色玻璃、TYPE 的紫色字形。四个案例各含三张原创研究板，展示曲线、灯光、声音节奏、透明度、字体粒子与应用提案；长页面保留可见的关闭按钮。
- 关于：荧光绿思维空间，线网随滚动从混沌收拢为几何结构；点击可扰动，继续滚动展开设计方向和方法。
- 实验：紫色粒子控制室，字形、引力和流线三种模式，可切换颜色、调节强度、释放脉冲，并进入带键盘焦点管理的沉浸模式。
- 结尾：保留橙色镜面晶体轨道，以带倒角的实时 3D 晶体、原创摄影棚反射和空间遮挡提升质感；指针改变空间视角，点击触发碎片爆发。合作简报可以复制或下载，不会自动发送。

桌面采用三段固定滚动场景，手机保留各章节的视觉与触屏交互；较矮屏幕自动改为纵向作品。轻动态模式与系统减少动态偏好均受支持，离开视口的绘制会暂停。结尾临近视口时才初始化，手机降低绘制分辨率与帧率；WebGL 不可用时恢复 Canvas2D 晶体场景。

## 本地预览

这是静态网站，图片、字体和依赖均保存在项目内，无需联网或构建。安装 Python 后，在本目录打开终端运行：

```sh
python -m http.server 4173
```

在浏览器打开 `http://127.0.0.1:4173/`。请通过本地服务预览，以便浏览器正常加载 JavaScript 模块。

## 素材与依赖

- Three.js：MIT 许可证，保留在 `vendor/THREE-LICENSE.txt`。
- GSAP / ScrollTrigger：遵循 [GSAP Standard License](https://gsap.com/community/standard-license/)，依赖文件保留原始许可证声明。
- Manrope 字体：SIL Open Font License，保留在 `assets/Manrope-OFL.txt`。
- `cover-form.png` 与 `cover-after.png` 为 AI 原创封面，分别表现镜面铬丝带与橙红玻璃雕塑；AURA 产品图沿用此前项目生成的原创素材。页面 SVG、思维线网、晶体场景与交互由本项目制作。

## 灵感参考

[Resn](https://resn.co.nz/)、[Lusion](https://lusion.co/)、[Active Theory](https://activetheory.net/) 与 [Locomotive](https://locomotive.ca/en) 的官方作品展示为场景切换、动态节奏和视觉叙事提供参考；本站未使用其项目图片、文字或源代码。
