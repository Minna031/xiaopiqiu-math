/**
 * 答题区检测模块 - 根据题目布局计算坐标、区域裁剪
 */
const AnswerDetect = (() => {

  /**
   * 根据题目DOM元素计算每道题的答题区坐标
   * @param {Array} questionEls - 题目DOM元素列表
   * @param {HTMLElement} container - 题目区域容器
   * @returns {Array} [{x, y, w, h, index}]
   */
  function calcAnswerAreas(questionEls, container) {
    // 使用 canvas 的父容器作为坐标参考系
    const practiceArea = container.closest('.practice-area') || container.parentElement;
    const containerRect = practiceArea.getBoundingClientRect();
    // 注意：不添加 scrollTop。因为 boxRect.top - containerRect.top
    // 在 scrollTop=0 时已经等于滚动内容坐标（即 canvas 内部坐标）
    const areas = [];
    questionEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const answerBox = el.querySelector('.answer-box');
      if (answerBox) {
        const boxRect = answerBox.getBoundingClientRect();
        areas.push({
          x: boxRect.left - containerRect.left,
          y: boxRect.top - containerRect.top,
          w: boxRect.width,
          h: boxRect.height,
          index,
        });
      } else {
        areas.push({
          x: rect.right - containerRect.left - 100,
          y: rect.top - containerRect.top,
          w: 100,
          h: rect.height,
          index,
        });
      }
    });
    return areas;
  }

  /**
   * 判断坐标属于哪道题的答题区
   * @param {number} x
   * @param {number} y
   * @param {Array} areas
   * @returns {number} 题目索引，-1表示不在任何答题区
   */
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
   * 从 canvas 裁剪指定区域的图像用于 OCR
   * 包括自动裁剪到笔画区域 + 充足留白 + 放大
   * @param {HTMLCanvasElement} canvas
   * @param {Object} area - {x, y, w, h}
   * @returns {HTMLCanvasElement} 裁剪后的 canvas
   */
  function cropArea(canvas, area) {
    const dpr = window.devicePixelRatio || 1;
  
    // Step 1: 从原始 canvas 裁剪答题区（包含少量 padding）
    const outerPad = 4;
    const sx = Math.max(0, (area.x - outerPad) * dpr);
    const sy = Math.max(0, (area.y - outerPad) * dpr);
    const sw = (area.w + outerPad * 2) * dpr;
    const sh = (area.h + outerPad * 2) * dpr;
  
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = sw;
    rawCanvas.height = sh;
    const rawCtx = rawCanvas.getContext('2d');
    rawCtx.fillStyle = '#ffffff';
    rawCtx.fillRect(0, 0, sw, sh);
    rawCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  
    // Step 2: 二值化并找到笔画边界
    const ctx2 = rawCtx;
    const imgData = ctx2.getImageData(0, 0, sw, sh);
    const d = imgData.data;
  
    // Otsu 自适应阈值
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
      hist[gray]++;
    }
    const total = sw * sh;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t; }
    }
  
    // 应用二值化，找笔画边界
    let minX = sw, minY = sh, maxX = 0, maxY = 0;
    let hasInk = false;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const gray = d[idx] * 0.299 + d[idx+1] * 0.587 + d[idx+2] * 0.114;
        const isDark = gray < threshold;
        if (isDark) {
          hasInk = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  
    // 如果没有找到笔画，返回整个区域
    if (!hasInk) {
      return _buildOutput(rawCanvas, sw, sh);
    }
  
    // Step 3: 裁剪到笔画区域 + 充足留白
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const pad = Math.max(Math.round(Math.max(contentW, contentH) * 0.35), 20);
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(sw - cropX, contentW + pad * 2);
    const cropH = Math.min(sh - cropY, contentH + pad * 2);
  
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, cropW, cropH);
    cropCtx.drawImage(rawCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  
    return _buildOutput(cropCanvas, cropW, cropH);
  }
  
  /**
   * 构建最终输出 canvas：二值化 + 放大到 Tesseract 友好尺寸
   */
  function _buildOutput(srcCanvas, srcW, srcH) {
    // 放大到目标宽度（Tesseract 对 300px+ 宽度的图像效果较好）
    const targetH = 200;
    const scale = targetH / srcH;
    const outW = Math.round(srcW * scale);
    const outH = targetH;
  
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
  
    // 最终二值化
    const imgData = outCtx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    // Otsu 阈值
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
      hist[gray]++;
    }
    const total = outW * outH;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t; }
    }
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      const bw = gray < threshold ? 0 : 255;
      d[i] = bw; d[i+1] = bw; d[i+2] = bw;
    }
    outCtx.putImageData(imgData, 0, 0);
    return outCanvas;
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
