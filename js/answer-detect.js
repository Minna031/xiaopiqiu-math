/**
 * 答题区检测模块 - 根据题目布局计算坐标、区域裁剪
 * 图像预处理：Otsu阈值 + 自动裁剪 + 笔画膨胀 + 去噪 + 高倍放大
 */
const AnswerDetect = (() => {

  /**
   * 根据题目DOM元素计算每个数字格子的答题区坐标
   * 返回扁平数组，每项代表一个数字格子
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
        return area.index;  // 返回扁平全局索引
      }
    }
    return -1;
  }

  /**
   * 从canvas裁剪指定区域的图像用于OCR
   * 流程：裁剪 → Otsu二值化 → 自动找笔画边界 → 裁剪+留白 → 膨胀加粗 → 放大 → 去噪
   */
  function cropArea(canvas, area) {
    const dpr = window.devicePixelRatio || 1;

    // Step 1: 从原始canvas裁剪答题区
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

    // Step 2: Otsu二值化 + 找笔画边界
    const imgData = rawCtx.getImageData(0, 0, sw, sh);
    const pixels = _toBinary(imgData, sw, sh);

    let minX = sw, minY = sh, maxX = 0, maxY = 0;
    let hasInk = false;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (pixels[y * sw + x] === 0) { // black = ink
          hasInk = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasInk) {
      return _makeBlankOutput();
    }

    // Step 3: 裁剪到笔画区域 + 充足留白(40%)
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const pad = Math.max(Math.round(Math.max(contentW, contentH) * 0.45), 30);
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(sw - cropX, contentW + pad * 2);
    const cropH = Math.min(sh - cropY, contentH + pad * 2);

    // 提取裁剪区域的二值数据
    const cropPixels = new Uint8Array(cropW * cropH);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcX = cropX + x;
        const srcY = cropY + y;
        if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh) {
          cropPixels[y * cropW + x] = pixels[srcY * sw + srcX];
        } else {
          cropPixels[y * cropW + x] = 255;
        }
      }
    }

    // Step 4: 形态学膨胀（加粗笔画）— 关键改进
    const dilated = _dilate(cropPixels, cropW, cropH, 3);

    // Step 5: 去除孤立噪点
    const cleaned = _removeNoise(dilated, cropW, cropH);

    // Step 6: 放大到Tesseract友好尺寸（高度300px）
    return _scaleUp(cleaned, cropW, cropH);
  }

  /**
   * Otsu自适应阈值二值化
   * 返回 Uint8Array，0=黑(笔画)，255=白(背景)
   */
  function _toBinary(imgData, w, h) {
    const d = imgData.data;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
      hist[gray]++;
    }
    const total = w * h;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t; }
    }
    const result = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const idx = i * 4;
      const gray = d[idx] * 0.299 + d[idx+1] * 0.587 + d[idx+2] * 0.114;
      result[i] = gray < threshold ? 0 : 255;
    }
    return result;
  }

  /**
   * 形态学膨胀：将黑色像素扩展到周围N像素，加粗笔画
   */
  function _dilate(pixels, w, h, radius) {
    const out = new Uint8Array(w * h).fill(255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (pixels[y * w + x] === 0) {
          // 将周围的像素都设为黑色
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              // 使用圆形核而非方形核
              if (dx * dx + dy * dy <= radius * radius) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  out[ny * w + nx] = 0;
                }
              }
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * 去除孤立噪点：如果黑色像素的8邻域中黑色像素少于2个，则认为是噪点
   */
  function _removeNoise(pixels, w, h) {
    const out = new Uint8Array(pixels);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (pixels[y * w + x] === 0) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (pixels[(y + dy) * w + (x + dx)] === 0) neighbors++;
            }
          }
          if (neighbors < 2) out[y * w + x] = 255; // 消除孤立点
        }
      }
    }
    return out;
  }

  /**
   * 将二值像素数据放大到Tesseract友好尺寸
   */
  function _scaleUp(pixels, srcW, srcH) {
    const targetH = 300; // 增大目标高度
    const scale = targetH / srcH;
    const outW = Math.max(Math.round(srcW * scale), 100);
    const outH = targetH;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');

    // 先写入二值像素数据
    const imgData = ctx.createImageData(outW, outH);
    const d = imgData.data;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        // 最近邻采样（保持锐利边缘）
        const srcX = Math.min(Math.floor(x / scale), srcW - 1);
        const srcY = Math.min(Math.floor(y / scale), srcH - 1);
        const val = pixels[srcY * srcW + srcX];
        const idx = (y * outW + x) * 4;
        d[idx] = val; d[idx+1] = val; d[idx+2] = val; d[idx+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
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
