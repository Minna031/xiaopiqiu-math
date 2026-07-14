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
  let onStrokeEndCb = null;  // 笔画结束回调
  let onRewriteStartCb = null; // 重写开始回调（用户开始书写已有印刷体的格子）
  let printedDigits = {};      // 已识别的印刷体数字 { areaIndex: digit }
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

    // 如果该区域已有印刷体数字，清除它（用户要重写）
    if (printedDigits[areaIdx] !== undefined) {
      delete printedDigits[areaIdx];
      if (onRewriteStartCb) onRewriteStartCb(areaIdx);
      redraw();
    }

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
      const finishedStroke = currentStroke;
      currentStroke = null;
      // 笔画结束回调，用于实时识别
      if (onStrokeEndCb && finishedStroke.areaIndex >= 0) {
        const areaIdx = finishedStroke.areaIndex;
        setTimeout(() => onStrokeEndCb(areaIdx), 50);
      }
    }
  }

  function redraw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const stroke of strokes) {
      drawStroke(stroke);
    }
    // 重绘所有已识别的印刷体数字
    for (const [idxStr, digit] of Object.entries(printedDigits)) {
      _renderPrintedDigit(parseInt(idxStr), digit);
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
    delete printedDigits[areaIndex];  // 清除该区域的印刷体记录
    redraw();
  }

  function clearAll() {
    strokes = [];
    printedDigits = {};
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

  /**
   * 获取指定区域的原始 canvas（用于实时识别）
   */
  function getAreaCanvas(areaIndex) {
    const area = answerAreas.find(a => a.index === areaIndex);
    if (!area) return null;
    const dpr = window.devicePixelRatio || 1;
    const pad = 3;
    const sx = Math.max(0, (area.x - pad) * dpr);
    const sy = Math.max(0, (area.y - pad) * dpr);
    const sw = (area.w + pad * 2) * dpr;
    const sh = (area.h + pad * 2) * dpr;
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(sw);
    tmp.height = Math.round(sh);
    const tCtx = tmp.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, tmp.width, tmp.height);
    tCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    return tmp;
  }

  /**
   * 在指定区域绘制印刷体数字（替换手写笔迹）
   * 全局只保留一个印刷体数字，之前的印刷体恢复为手写笔迹
   */
  function drawPrintedDigit(areaIndex, digit) {
    const area = answerAreas.find(a => a.index === areaIndex);
    if (!area || digit == null) return;
    // 清除当前区域的手写笔画（将被印刷体替代）
    strokes = strokes.filter(s => s.areaIndex !== areaIndex);
    // 记录该区域的印刷体数字（保留所有已识别的）
    printedDigits[areaIndex] = digit;
    // 重绘整个画布（所有印刷体数字都会保留）
    redraw();
  }

  /**
   * 实际渲染印刷体数字到 canvas（由 redraw 调用）
   */
  function _renderPrintedDigit(areaIndex, digit) {
    const area = answerAreas.find(a => a.index === areaIndex);
    if (!area || digit == null) return;
    ctx.save();
    ctx.fillStyle = '#1565C0';
    ctx.font = `bold ${Math.round(area.h * 0.65)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(digit), area.x + area.w / 2, area.y + area.h / 2);
    ctx.restore();
  }

  function setOnStrokeEnd(callback) {
    onStrokeEndCb = callback;
  }

  function setOnRewriteStart(callback) {
    onRewriteStartCb = callback;
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

  /**
   * 获取指定区域的笔画坐标数据（用于校准采集）
   * 返回格式: [{ points: [{x,y,pressure}], ... }, ...]
   */
  function getStrokesInArea(areaIndex) {
    return strokes
      .filter(s => s.areaIndex === areaIndex && !s.isEraser)
      .map(s => ({
        points: s.points.map(p => ({ x: p.x, y: p.y, pressure: p.pressure })),
      }));
  }

  /**
   * 获取指定区域的边界框（笔画坐标范围）
   */
  function getAreaBounds(areaIndex) {
    const area = answerAreas.find(a => a.index === areaIndex);
    if (!area) return null;
    return { x: area.x, y: area.y, w: area.w, h: area.h };
  }

  return {
    init, resize, undo, clearCurrentArea, clearAll,
    setEraserMode, getEraserMode,
    setAnswerAreas, getAnswerAreas,
    getAreaCanvas, drawPrintedDigit, setOnStrokeEnd, setOnRewriteStart,
    getAreaImage, hasStrokesInArea, getStrokesInArea, getAreaBounds,
    get canvas() { return canvas; }
  };
})();
