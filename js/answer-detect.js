/**
 * 答题区检测模块 - 根据题目布局计算坐标、区域裁剪
 * 图像预处理：高质量放大 + 对比度增强 + 轻度锐化（专为手写数字优化）
 */
const AnswerDetect = (() => {

  /**
   * 根据题目DOM元素计算每个数字格子的答题区坐标
   */
  function calcAnswerAreas(questionEls, container) {
    const practiceArea = container.closest('.practice-area') || container.parentElement;
    const containerRect = practiceArea.getBoundingClientRect();
    const areas = [];
    let globalIndex = 0;
    questionEls.forEach((el, questionIndex) => {
      const cells = el.querySelectorAll('.digit-cell');
      cells.forEach((cell, cellIndex) => {
        const rect = cell.getBoundingClientRect();
        areas.push({
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          w: rect.width,
          h: rect.height,
          index: globalIndex++,
          questionIndex,
          cellIndex,
        });
      });
    });
    return areas;
  }

  function getAreaIndex(x, y, areas) {
    for (const area of areas) {
      if (x >= area.x && x <= area.x + area.w &&
          y >= area.y && y <= area.y + area.h) {
        return area.index;
      }
    }
    return -1;
  }

  /**
   * 从canvas裁剪指定区域的图像用于OCR
   * 新流程：裁剪 → 高质量放大 → 对比度增强 → 轻度锐化
   * （不再使用破坏性的膨胀，保留手写笔画细节）
   */
  function cropArea(canvas, area) {
    const dpr = window.devicePixelRatio || 1;
    const pad = 3;
    const sx = Math.max(0, (area.x - pad) * dpr);
    const sy = Math.max(0, (area.y - pad) * dpr);
    const sw = (area.w + pad * 2) * dpr;
    const sh = (area.h + pad * 2) * dpr;

    // Step 1: 裁剪原始区域
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = Math.round(sw);
    rawCanvas.height = Math.round(sh);
    const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
    rawCtx.fillStyle = '#ffffff';
    rawCtx.fillRect(0, 0, rawCanvas.width, rawCanvas.height);
    rawCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, rawCanvas.width, rawCanvas.height);

    // Step 2: 高质量放大到目标尺寸（使用浏览器内置双线性插值）
    const targetH = 400;
    const scale = targetH / rawCanvas.height;
    const targetW = Math.max(Math.round(rawCanvas.width * scale), 150);

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetW;
    scaledCanvas.height = targetH;
    const scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
    scaledCtx.fillStyle = '#ffffff';
    scaledCtx.fillRect(0, 0, targetW, targetH);
    // imageSmoothingQuality 提供高质量缩放
    scaledCtx.imageSmoothingEnabled = true;
    scaledCtx.imageSmoothingQuality = 'high';
    scaledCtx.drawImage(rawCanvas, 0, 0, targetW, targetH);

    // Step 3: 高对比度处理 — 让笔画更清晰
    const imgData = scaledCtx.getImageData(0, 0, targetW, targetH);
    _enhanceContrast(imgData, targetW, targetH);

    // Step 4: 轻度锐化（增强笔画边缘，不破坏形状）
    _sharpen(imgData, targetW, targetH);

    scaledCtx.putImageData(imgData, 0, 0);
    return scaledCanvas;
  }

  /**
   * 高对比度增强：将灰度值推向两极（黑或白）
   * 笔画变黑，背景变白，中间灰色减少
   */
  function _enhanceContrast(imgData, w, h) {
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      // 先计算灰度
      let gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      // S曲线对比度增强
      gray = gray / 255;
      gray = 1 / (1 + Math.exp(-12 * (gray - 0.55)));  // sigmoid, 偏白
      gray = Math.round(gray * 255);
      // 硬阈值：进一步清理
      gray = gray < 160 ? 0 : 255;
      d[i] = d[i+1] = d[i+2] = gray;
    }
  }

  /**
   * 轻度锐化：3×3拉普拉斯核，增强笔画边缘
   * 比膨胀温和得多，不会把"9"的圆环糊掉
   */
  function _sharpen(imgData, w, h) {
    const src = new Uint8Array(imgData.data);
    const dst = imgData.data;
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4;
            val += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const idx = (y * w + x) * 4;
        val = Math.max(0, Math.min(255, val));
        dst[idx] = dst[idx+1] = dst[idx+2] = val;
      }
    }
  }

  function _makeBlankOutput() {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 200, 200);
    return c;
  }

  /**
   * 检查答题区是否有手写内容
   */
  function hasInkInArea(canvas, area) {
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.max(0, area.x * dpr);
    const sy = Math.max(0, area.y * dpr);
    const sw = area.w * dpr;
    const sh = area.h * dpr;
    try {
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const d = imgData.data;
      let darkPixels = 0;
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        if (gray < 100) darkPixels++;
      }
      return darkPixels > 10;
    } catch (e) {
      return false;
    }
  }

  return { calcAnswerAreas, getAreaIndex, cropArea, hasInkInArea };
})();
