/**
 * 画布管理模块 - 全屏手写、压感、橡皮擦、撤销、答题区限制
 */
const CanvasManager = (() => {
  let canvas = null;
  let ctx = null;
  let isDrawing = false;
  let isEraserMode = false;
  let strokes = [];       // 所有笔画历史 [{points, color, width, isEraser}]
  let currentStroke = null;
  let longPressTimer = null;
  let wasEraserBeforeLongPress = false;
  let answerAreas = [];   // [{x, y, w, h, index}] 答题区坐标
  let currentAreaIndex = -1;
  let boundDocMove = null;   // document级事件引用
  let boundDocUp = null;
  let useTouchFallback = false;  // iOS触摸兜底
  const MAX_UNDO = 50;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    resize();
    bindEvents();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    // 临时重置 canvas 尺寸，避免影响 scrollHeight 计算
    canvas.style.width = '0px';
    canvas.style.height = '0px';
    // 使用 scrollHeight 覆盖整个可滚动区域
    const w = parent.scrollWidth;
    const h = Math.max(parent.scrollHeight, parent.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    redraw();
  }

  function bindEvents() {
    // iOS Safari 上 PointerEvent 可能不稳定，用 touch 兜底
    useTouchFallback = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // document 级追踪，不依赖 setPointerCapture
    boundDocMove = onPointerMove;
    boundDocUp = onPointerUp;
    document.addEventListener('pointermove', boundDocMove);
    document.addEventListener('pointerup', boundDocUp);

    if (useTouchFallback) {
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
      document.addEventListener('touchcancel', onTouchEnd);
    }

    // 禁用长按菜单
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // 禁止触摸滚动
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    // canvas 是 position:absolute 在滚动容器内，rect.top 已包含滚动偏移
    // 所以 e.clientY - rect.top 直接就是滚动内容坐标
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function isInAnswerArea(x, y) {
    for (const area of answerAreas) {
      if (x >= area.x && x <= area.x + area.w &&
          y >= area.y && y <= area.y + area.h) {
        return area.index;
      }
    }
    return -1;
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (isDrawing) return; // 防止双重触发（iOS touch+pointer同时触发）
    const pos = getPos(e);

    // 长按检测（0.5秒切换橡皮擦）
    longPressTimer = setTimeout(() => {
      if (!isDrawing) return;
      wasEraserBeforeLongPress = isEraserMode;
      setEraserMode(!isEraserMode);
      if (typeof App !== 'undefined' && App.onEraserToggle) {
        App.onEraserToggle(isEraserMode);
      }
    }, 500);

    // 检查是否在答题区内
    const areaIdx = isInAnswerArea(pos.x, pos.y);
    if (areaIdx === -1) return; // 不在答题区，不响应

    currentAreaIndex = areaIdx;
    isDrawing = true;

    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    const baseWidth = isEraserMode ? 20 : 3;
    const width = baseWidth * (0.5 + pressure * 1.5);

    currentStroke = {
      points: [{ x: pos.x, y: pos.y, pressure }],
      color: isEraserMode ? '#ffffff' : '#1a1a2e',
      width,
      isEraser: isEraserMode,
      areaIndex: areaIdx,
    };

    canvas.setPointerCapture(e.pointerId);
  }

  /**
   * iOS 触摸兜底：当 PointerEvent 不可用时，用 TouchEvent 代替
   */
  function onTouchStart(e) {
    e.preventDefault();
    if (isDrawing) return;
    const touch = e.touches[0];
    const fake = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      pressure: touch.force || 0.5,
      pointerId: touch.identifier,
      preventDefault: () => {},
    };
    onPointerDown(fake);
  }

  function onTouchMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const fake = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      pressure: touch.force || 0.5,
      preventDefault: () => {},
    };
    onPointerMove(fake);
  }

  function onTouchEnd(e) {
    if (!isDrawing) return;
    onPointerUp({ preventDefault: () => {} });
  }

  function onPointerMove(e) {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();

    // 取消长按计时器（移动后）
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const pos = getPos(e);
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    currentStroke.points.push({ x: pos.x, y: pos.y, pressure });

    // 实时绘制
    const pts = currentStroke.points;
    if (pts.length < 2) return;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    ctx.save();
    if (currentStroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = currentStroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseWidth = currentStroke.isEraser ? 20 : 3;
    ctx.lineWidth = baseWidth * (0.5 + pressure * 1.5);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  function onPointerUp(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke && currentStroke.points.length > 0) {
      strokes.push(currentStroke);
      if (strokes.length > MAX_UNDO * 3) {
        strokes = strokes.slice(-MAX_UNDO * 3);
      }
      currentStroke = null;
    }
  }

  function redraw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const stroke of strokes) {
      drawStroke(stroke);
    }
  }

  function drawStroke(stroke) {
    if (!stroke || stroke.points.length < 1) return;
    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = stroke.points;
    if (pts.length === 1) {
      // 单点
      const p = pts[0];
      const w = (stroke.isEraser ? 20 : 3) * (0.5 + p.pressure * 1.5);
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        const baseWidth = stroke.isEraser ? 20 : 3;
        ctx.lineWidth = baseWidth * (0.5 + p2.pressure * 1.5);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function undo() {
    if (strokes.length === 0) return;
    strokes.pop();
    redraw();
  }

  function clearCurrentArea(areaIndex) {
    strokes = strokes.filter(s => s.areaIndex !== areaIndex);
    redraw();
  }

  function clearAll() {
    strokes = [];
    if (canvas) redraw();
  }

  function setEraserMode(val) {
    isEraserMode = val;
    if (canvas) canvas.style.cursor = isEraserMode ? 'cell' : 'crosshair';
  }

  function getEraserMode() {
    return isEraserMode;
  }

  function setAnswerAreas(areas) {
    answerAreas = areas;
  }

  function getAnswerAreas() {
    return answerAreas;
  }

  function getAreaImage(areaIndex) {
    const area = answerAreas.find(a => a.index === areaIndex);
    if (!area) return null;
    const dpr = window.devicePixelRatio || 1;
    // 创建临时canvas截取该区域
    const tmpCanvas = document.createElement('canvas');
    const padding = 5;
    const w = (area.w + padding * 2) * dpr;
    const h = (area.h + padding * 2) * dpr;
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, w, h);
    tmpCtx.drawImage(
      canvas,
      (area.x - padding) * dpr, (area.y - padding) * dpr, w, h,
      0, 0, w, h
    );
    return tmpCanvas.toDataURL('image/png');
  }

  function hasStrokesInArea(areaIndex) {
    return strokes.some(s => s.areaIndex === areaIndex);
  }

  return {
    init, resize, undo, clearCurrentArea, clearAll,
    setEraserMode, getEraserMode,
    setAnswerAreas, getAnswerAreas,
    getAreaImage, hasStrokesInArea,
    get canvas() { return canvas; }
  };
})();
