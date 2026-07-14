/**
 * 校准模块 - 手写数字校准流程
 * 引导用户书写 0-9 各 5 遍，采集笔画数据用于 KNN 个性化识别
 */
const Calibration = (() => {
  const SAMPLES_PER_DIGIT = 5;
  const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  let currentDigit = 0;
  let sampleCount = 0;
  let isActive = false;
  let onCompleteCb = null;

  // 校准画布的简单绘图状态
  let calCanvas = null;
  let calCtx = null;
  let calStrokes = [];
  let isDrawing = false;
  let currentStroke = null;
  let autoCollectTimer = null;

  const $ = id => document.getElementById(id);

  function start(onComplete) {
    onCompleteCb = onComplete;
    currentDigit = 0;
    sampleCount = 0;
    isActive = true;

    if (typeof App !== 'undefined') App.showPage('calibration');

    requestAnimationFrame(() => {
      calCanvas = $('cal-canvas');
      if (!calCanvas) return;
      calCtx = calCanvas.getContext('2d');
      _setupCalCanvas();
      _bindCalEvents();
      _updateCalUI();
    });
  }

  function _setupCalCanvas() {
    const container = $('cal-write-area');
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    calCanvas.width = w * dpr;
    calCanvas.height = h * dpr;
    calCanvas.style.width = w + 'px';
    calCanvas.style.height = h + 'px';
    calCtx.setTransform(1, 0, 0, 1, 0, 0);
    calCtx.scale(dpr, dpr);
    _clearCalCanvas();
  }

  function _clearCalCanvas() {
    if (!calCtx) return;
    const dpr = window.devicePixelRatio || 1;
    calCtx.clearRect(0, 0, calCanvas.width / dpr, calCanvas.height / dpr);
    calStrokes = [];
  }

  function _bindCalEvents() {
    // 移除旧事件（防止重复绑定）
    calCanvas.onpointerdown = _calPointerDown;
    calCanvas.onpointermove = _calPointerMove;
    calCanvas.onpointerup = _calPointerUp;
    calCanvas.onpointerleave = _calPointerUp;

    // iOS touch 兜底
    calCanvas.ontouchstart = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      _calPointerDown({ clientX: t.clientX, clientY: t.clientY, pressure: t.force || 0.5, pointerId: 0, preventDefault: () => {} });
    };
    calCanvas.ontouchmove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      _calPointerMove({ clientX: t.clientX, clientY: t.clientY, pressure: t.force || 0.5, preventDefault: () => {} });
    };
    calCanvas.ontouchend = (e) => {
      _calPointerUp({ preventDefault: () => {} });
    };

    // 按钮
    const skipBtn = $('cal-skip-btn');
    if (skipBtn) skipBtn.onclick = _skipDigit;
    const clearBtn = $('cal-clear-btn');
    if (clearBtn) clearBtn.onclick = () => { _clearCalCanvas(); };
  }

  function _getCalPos(e) {
    const rect = calCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function _calPointerDown(e) {
    if (!isActive || isDrawing) return;
    e.preventDefault();
    if (autoCollectTimer) { clearTimeout(autoCollectTimer); autoCollectTimer = null; }
    isDrawing = true;
    const pos = _getCalPos(e);
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    currentStroke = { points: [{ x: pos.x, y: pos.y, pressure }] };
    calCanvas.setPointerCapture(e.pointerId);
  }

  function _calPointerMove(e) {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();
    const pos = _getCalPos(e);
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    currentStroke.points.push({ x: pos.x, y: pos.y, pressure });

    const pts = currentStroke.points;
    if (pts.length < 2) return;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    calCtx.save();
    calCtx.strokeStyle = '#1a1a2e';
    calCtx.lineCap = 'round';
    calCtx.lineJoin = 'round';
    calCtx.lineWidth = 3 * (0.5 + pressure * 1.5);
    calCtx.beginPath();
    calCtx.moveTo(p1.x, p1.y);
    calCtx.lineTo(p2.x, p2.y);
    calCtx.stroke();
    calCtx.restore();
  }

  function _calPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke && currentStroke.points.length > 1) {
      calStrokes.push(currentStroke);
    }
    currentStroke = null;

    // 自动采集：停笔 0.8 秒后收集样本
    if (calStrokes.length > 0) {
      autoCollectTimer = setTimeout(() => _collectSample(), 800);
    }
  }

  function _collectSample() {
    autoCollectTimer = null;
    if (!isActive) return;
    if (calStrokes.length === 0) return;

    // 使用当前画布作为样本
    const success = DigitRecognizer.addCalibrationSample(calCanvas, currentDigit);

    if (success) {
      sampleCount++;
      _showFeedback(true);
      _updateProgress();

      if (sampleCount >= SAMPLES_PER_DIGIT) {
        // 该数字采集完成，进入下一个
        currentDigit++;
        sampleCount = 0;
        if (currentDigit >= DIGITS.length) {
          _finishCalibration();
          return;
        }
        setTimeout(() => {
          _clearCalCanvas();
          _updateCalUI();
        }, 600);
      } else {
        setTimeout(() => {
          _clearCalCanvas();
        }, 400);
      }
    } else {
      _showFeedback(false);
      _clearCalCanvas();
    }
  }

  function _showFeedback(success) {
    const el = $('cal-feedback');
    if (!el) return;
    if (success) {
      el.textContent = `✓ 已记录 (${sampleCount}/${SAMPLES_PER_DIGIT})`;
      el.style.color = '#4CAF50';
    } else {
      el.textContent = '未检测到笔迹，请重试';
      el.style.color = '#F44336';
    }
    setTimeout(() => { if (el) el.textContent = ''; }, 1500);
  }

  function _updateProgress() {
    const progressEl = $('cal-progress-text');
    if (progressEl) {
      const total = currentDigit * SAMPLES_PER_DIGIT + sampleCount;
      const max = DIGITS.length * SAMPLES_PER_DIGIT;
      progressEl.textContent = `${total}/${max}`;
    }
    // 更新进度条
    const bar = $('cal-progress-bar');
    if (bar) {
      const total = currentDigit * SAMPLES_PER_DIGIT + sampleCount;
      const max = DIGITS.length * SAMPLES_PER_DIGIT;
      bar.style.width = `${(total / max) * 100}%`;
    }
    // 更新采样点
    _updateDots();
  }

  function _updateDots() {
    const dots = $('cal-sample-dots');
    if (!dots) return;
    dots.innerHTML = '';
    for (let i = 0; i < SAMPLES_PER_DIGIT; i++) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot' + (i < sampleCount ? ' filled' : '');
      dots.appendChild(dot);
    }
  }

  function _updateCalUI() {
    const digit = DIGITS[currentDigit];
    const targetEl = $('cal-target-digit');
    const instructEl = $('cal-instruction');
    if (targetEl) targetEl.textContent = String(digit);
    if (instructEl) instructEl.textContent = `请在右侧书写区域写 ${SAMPLES_PER_DIGIT} 遍 "${digit}"`;
    _updateProgress();
    _updateDots();
  }

  function _skipDigit() {
    currentDigit++;
    sampleCount = 0;
    if (currentDigit >= DIGITS.length) {
      _finishCalibration();
      return;
    }
    _clearCalCanvas();
    _updateCalUI();
  }

  function _finishCalibration() {
    isActive = false;
    const success = DigitRecognizer.finishCalibration();
    const msgEl = $('cal-message');
    if (msgEl) {
      msgEl.textContent = success
        ? `✅ 校准完成！已记录 ${DigitRecognizer.getCalibrationSampleCount()} 个书写样本`
        : '⚠️ 样本不足，请重新校准';
    }
    const doneBtn = $('cal-done-btn');
    if (doneBtn) {
      doneBtn.style.display = 'block';
      doneBtn.onclick = () => {
        if (onCompleteCb) onCompleteCb(success);
        if (typeof App !== 'undefined') App.showPage('home');
      };
    }
  }

  function cancel() {
    isActive = false;
    if (autoCollectTimer) { clearTimeout(autoCollectTimer); autoCollectTimer = null; }
    calCanvas = null;
    calCtx = null;
  }

  function getCalibrationInfo() {
    if (typeof Storage === 'undefined') return null;
    return Storage.getCalibration();
  }

  return { start, cancel, getCalibrationInfo };
})();
