/**
 * 手写数字识别模块 - 纯 JavaScript MLP 神经网络
 * 使用 MNIST 数据集在浏览器端训练，专门识别手写数字 0-9
 * 无需外部库，无需 API key，权重缓存在 localStorage
 */
const DigitRecognizer = (() => {
  // ===== 网络参数 =====
  const INPUT = 784;   // 28×28 MNIST
  const HIDDEN = 64;
  const OUTPUT = 10;
  const LR = 0.08;
  const BATCH = 64;
  const EPOCHS = 3;
  const STORAGE_KEY = 'digit-nn-v4';

  let w1, b1, w2, b2;
  let ready = false;
  let status = 'idle'; // idle | loading | training | ready | failed

  // ===== 校准数据 (KNN) =====
  let calibrationSamples = [];  // [{data: Float32Array(784), label: 0-9}]
  let calibrated = false;

  // ===== 权重初始化 (Kaiming He) =====
  function _initWeights() {
    const s1 = Math.sqrt(2 / INPUT);
    const s2 = Math.sqrt(2 / HIDDEN);
    w1 = Float32Array.from({ length: INPUT * HIDDEN }, () => (Math.random() * 2 - 1) * s1);
    b1 = new Float32Array(HIDDEN);
    w2 = Float32Array.from({ length: HIDDEN * OUTPUT }, () => (Math.random() * 2 - 1) * s2);
    b2 = new Float32Array(OUTPUT);
  }

  // ===== 前向传播 =====
  function _forward(x) {
    const h = new Float32Array(HIDDEN);
    for (let j = 0; j < HIDDEN; j++) {
      let s = b1[j];
      for (let i = 0; i < INPUT; i++) s += x[i] * w1[i * HIDDEN + j];
      h[j] = s > 0 ? s : 0; // ReLU
    }
    const o = new Float32Array(OUTPUT);
    let maxV = -Infinity;
    for (let j = 0; j < OUTPUT; j++) {
      let s = b2[j];
      for (let i = 0; i < HIDDEN; i++) s += h[i] * w2[i * OUTPUT + j];
      o[j] = s;
      if (s > maxV) maxV = s;
    }
    // Softmax (数值稳定)
    let sum = 0;
    for (let j = 0; j < OUTPUT; j++) { o[j] = Math.exp(o[j] - maxV); sum += o[j]; }
    for (let j = 0; j < OUTPUT; j++) o[j] /= sum;
    return { h, o };
  }

  // ===== 训练一个 batch =====
  function _trainBatch(data, labels, start, size) {
    const gW1 = new Float32Array(INPUT * HIDDEN);
    const gB1 = new Float32Array(HIDDEN);
    const gW2 = new Float32Array(HIDDEN * OUTPUT);
    const gB2 = new Float32Array(OUTPUT);

    for (let b = 0; b < size; b++) {
      const idx = start + b;
      const x = data.subarray(idx * INPUT, (idx + 1) * INPUT);
      const { h, o } = _forward(x);
      const label = labels[idx];

      // 输出层梯度 (softmax + cross-entropy)
      const dO = new Float32Array(OUTPUT);
      for (let j = 0; j < OUTPUT; j++) dO[j] = o[j] - (j === label ? 1 : 0);

      // W2, B2 梯度
      for (let i = 0; i < HIDDEN; i++)
        for (let j = 0; j < OUTPUT; j++)
          gW2[i * OUTPUT + j] += h[i] * dO[j];
      for (let j = 0; j < OUTPUT; j++) gB2[j] += dO[j];

      // 隐藏层梯度 (ReLU 导数)
      const dH = new Float32Array(HIDDEN);
      for (let i = 0; i < HIDDEN; i++) {
        let s = 0;
        for (let j = 0; j < OUTPUT; j++) s += dO[j] * w2[i * OUTPUT + j];
        dH[i] = h[i] > 0 ? s : 0;
      }

      // W1, B1 梯度
      for (let i = 0; i < INPUT; i++)
        for (let j = 0; j < HIDDEN; j++)
          gW1[i * HIDDEN + j] += x[i] * dH[j];
      for (let j = 0; j < HIDDEN; j++) gB1[j] += dH[j];
    }

    const scale = LR / size;
    for (let i = 0; i < gW1.length; i++) w1[i] -= scale * gW1[i];
    for (let i = 0; i < gB1.length; i++) b1[i] -= scale * gB1[i];
    for (let i = 0; i < gW2.length; i++) w2[i] -= scale * gW2[i];
    for (let i = 0; i < gB2.length; i++) b2[i] -= scale * gB2[i];
  }

  // ===== 完整训练流程 =====
  async function _train(data, labels, testData, testLabels, onProgress) {
    _initWeights();
    const n = data.length / INPUT;
    const indices = Array.from({ length: n }, (_, i) => i);

    // 诊断: 训练前测试准确率
    const accBefore = _calcAccuracy(testData, testLabels);
    console.log(`[DigitNN] Before training: ${(accBefore * 100).toFixed(1)}%`);

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      // Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const sd = new Float32Array(data.length);
      const sl = new Uint8Array(labels.length);
      for (let i = 0; i < n; i++) {
        sd.set(data.subarray(indices[i] * INPUT, (indices[i] + 1) * INPUT), i * INPUT);
        sl[i] = labels[indices[i]];
      }

      // 诊断: 检查第一批数据的损失
      if (epoch === 0) {
        let lossSum = 0;
        for (let i = 0; i < Math.min(100, n); i++) {
          const { o } = _forward(sd.subarray(i * INPUT, (i + 1) * INPUT));
          lossSum -= Math.log(Math.max(o[sl[i]], 1e-10));
        }
        console.log(`[DigitNN] Initial loss: ${(lossSum / 100).toFixed(4)}`);
      }

      for (let s = 0; s < n; s += BATCH) {
        const bs = Math.min(BATCH, n - s);
        _trainBatch(sd, sl, s, bs);
        // 诊断: 50个batch后检查损失
        if (epoch === 0 && s === BATCH * 50) {
          let lossSum = 0;
          for (let i = 0; i < 64; i++) {
            const { o } = _forward(sd.subarray(i * INPUT, (i + 1) * INPUT));
            lossSum -= Math.log(Math.max(o[sl[i]], 1e-10));
          }
          console.log(`[DigitNN] Loss after 50 batches: ${(lossSum / 64).toFixed(4)}`);
        }
        if (s % (BATCH * 10) === 0) {
          if (onProgress) onProgress(epoch, s, n);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const acc = _calcAccuracy(testData, testLabels);
      console.log(`[DigitNN] Epoch ${epoch + 1}/${EPOCHS}, accuracy: ${(acc * 100).toFixed(1)}%`);
      if (onProgress) onProgress(epoch + 1, n, n);
    }
  }

  function _calcAccuracy(data, labels) {
    const n = labels.length;
    let correct = 0;
    for (let i = 0; i < n; i++) {
      const { o } = _forward(data.subarray(i * INPUT, (i + 1) * INPUT));
      let maxIdx = 0;
      for (let j = 1; j < OUTPUT; j++) if (o[j] > o[maxIdx]) maxIdx = j;
      if (maxIdx === labels[i]) correct++;
    }
    return correct / n;
  }

  // ===== MNIST 数据加载 =====
  async function _loadMNIST() {
    // 优先尝试 IDX 格式（标准 MNIST，最可靠）
    try {
      console.log('[DigitNN] Trying IDX format...');
      return await _loadIDX();
    } catch (e) {
      console.warn('[DigitNN] IDX failed:', e.message);
    }
    // 回退到 Sprite 格式
    try {
      console.log('[DigitNN] Trying sprite format...');
      return await _loadSprite();
    } catch (e) {
      console.warn('[DigitNN] Sprite failed:', e.message);
    }
    throw new Error('所有 MNIST 数据源均加载失败');
  }

  // 策略1: IDX 二进制文件 + gzip 解压
  async function _loadIDX() {
    const urls = {
      trainImg: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-images-idx3-ubyte.gz',
      trainLbl: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-labels-idx1-ubyte.gz',
      testImg: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-images-idx3-ubyte.gz',
      testLbl: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-labels-idx1-ubyte.gz',
    };

    async function decompressGz(url) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Fetch ${resp.status}: ${url}`);
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('gzip');
        const stream = resp.body.pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      // 回退: 尝试直接读取（可能服务端已解压）
      const buf = await resp.arrayBuffer();
      const arr = new Uint8Array(buf);
      // 检查是否是 gzip 魔数 (1f 8b)
      if (arr[0] === 0x1f && arr[1] === 0x8b) {
        throw new Error('gzip data but DecompressionStream unavailable');
      }
      return arr; // 已经是解压后的数据
    }

    function parseImages(buf) {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const magic = dv.getUint32(0);
      const count = dv.getUint32(4);
      const rows = dv.getUint32(8);
      const cols = dv.getUint32(12);
      console.log(`[DigitNN] IDX images: magic=${magic}, count=${count}, ${rows}x${cols}`);
      const data = new Float32Array(count * rows * cols);
      const offset = 16;
      for (let i = 0; i < data.length; i++) {
        data[i] = buf[offset + i] / 255;
      }
      return data;
    }

    function parseLabels(buf) {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const magic = dv.getUint32(0);
      const count = dv.getUint32(4);
      console.log(`[DigitNN] IDX labels: magic=${magic}, count=${count}`);
      return new Uint8Array(buf.buffer, buf.byteOffset + 8, count);
    }

    const [ti, tl, tsi, tsl] = await Promise.all([
      decompressGz(urls.trainImg), decompressGz(urls.trainLbl),
      decompressGz(urls.testImg), decompressGz(urls.testLbl),
    ]);

    const trainData = parseImages(ti);
    const trainLabels = parseLabels(tl);
    const testData = parseImages(tsi);
    const testLabels = parseLabels(tsl);

    console.log(`[DigitNN] IDX loaded: train=${trainLabels.length}, test=${testLabels.length}`);
    console.log(`[DigitNN] Sample: label[0]=${trainLabels[0]}, pixels[350..360]=[${Array.from(trainData.subarray(350, 360)).map(v => v.toFixed(2)).join(',')}]`);
    return { trainData, trainLabels, testData, testLabels };
  }

  // 策略2: Sprite image (PNG) — 备用
  async function _loadSprite() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png';
    });

    const spriteW = img.width, spriteH = img.height;
    console.log(`[DigitNN] Sprite: ${spriteW}×${spriteH}`);

    const labelBuf = await fetch('https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8').then(r => r.arrayBuffer());
    const labelArr = new Uint8Array(labelBuf);

    const CHUNK = 1000;
    let chunkCache = null;
    const TRAIN = 50000, TEST = 10000;

    function extractImg(i) {
      const cs = Math.floor(i / CHUNK) * CHUNK;
      if (!chunkCache || chunkCache.start !== cs) {
        const c = document.createElement('canvas');
        c.width = spriteW;
        c.height = Math.min(CHUNK, spriteH - cs);
        c.getContext('2d').drawImage(img, 0, cs, spriteW, c.height, 0, 0, spriteW, c.height);
        chunkCache = { start: cs, data: c.getContext('2d').getImageData(0, 0, spriteW, c.height).data };
      }
      const localRow = i - cs;
      const pixels = new Float32Array(INPUT);
      const off = localRow * spriteW * 4;
      for (let p = 0; p < INPUT; p++) pixels[p] = chunkCache.data[off + p * 4] / 255;
      return pixels;
    }

    const trainData = new Float32Array(TRAIN * INPUT);
    const trainLabels = new Uint8Array(TRAIN);
    for (let i = 0; i < TRAIN; i++) {
      trainData.set(extractImg(i), i * INPUT);
      for (let j = 0; j < OUTPUT; j++) {
        if (labelArr[i * OUTPUT + j] === 1) { trainLabels[i] = j; break; }
      }
    }

    const testData = new Float32Array(TEST * INPUT);
    const testLabels = new Uint8Array(TEST);
    for (let i = 0; i < TEST; i++) {
      const gi = TRAIN + i;
      testData.set(extractImg(gi), i * INPUT);
      for (let j = 0; j < OUTPUT; j++) {
        if (labelArr[gi * OUTPUT + j] === 1) { testLabels[i] = j; break; }
      }
    }
    return { trainData, trainLabels, testData, testLabels };
  }

  // ===== 图像预处理（画布 → 28×28 MNIST 格式）=====
  function _getBounds(imgData) {
    const { data: d, width: w, height: h } = imgData;
    let t = h, l = w, b = 0, r = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gray = (d[(y * w + x) * 4] + d[(y * w + x) * 4 + 1] + d[(y * w + x) * 4 + 2]) / 3;
        if (gray < 200) {
          t = Math.min(t, y); l = Math.min(l, x);
          b = Math.max(b, y); r = Math.max(r, x);
        }
      }
    }
    if (t > b || l > r) return null;
    const pad = Math.max(2, Math.round(Math.max(b - t, r - l) * 0.08));
    return {
      top: Math.max(0, t - pad),
      left: Math.max(0, l - pad),
      bottom: Math.min(h - 1, b + pad),
      right: Math.min(w - 1, r + pad),
    };
  }

  function _resizeSmooth(canvas, tw, th) {
    // 渐进缩小以保持质量
    let src = canvas;
    while (src.width > tw * 3 || src.height > th * 3) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(src.width / 2);
      c.height = Math.ceil(src.height / 2);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, c.width, c.height);
      src = c;
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const oCtx = out.getContext('2d');
    oCtx.imageSmoothingEnabled = true;
    oCtx.imageSmoothingQuality = 'high';
    oCtx.drawImage(src, 0, 0, tw, th);
    return out;
  }

  function _preprocess(canvasEl) {
    const ctx = canvasEl.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const bounds = _getBounds(imgData);
    if (!bounds) return null;

    // 裁剪到内容区域
    const cw = bounds.right - bounds.left + 1;
    const ch = bounds.bottom - bounds.top + 1;
    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    crop.getContext('2d').drawImage(canvasEl, bounds.left, bounds.top, cw, ch, 0, 0, cw, ch);

    // 保持比例缩放到 20×20 以内
    const maxDim = 20;
    const scale = Math.min(maxDim / cw, maxDim / ch);
    const nw = Math.max(1, Math.round(cw * scale));
    const nh = Math.max(1, Math.round(ch * scale));
    const resized = _resizeSmooth(crop, nw, nh);

    // 灰度化：笔画=高值, 背景=0 (匹配MNIST格式)
    const rCtx = resized.getContext('2d');
    const rData = rCtx.getImageData(0, 0, nw, nh);
    const gray = new Float32Array(nw * nh);
    for (let i = 0; i < rData.data.length; i += 4) {
      // g 为 [0,1] 范围，0=黑(笔画)，1=白(背景)
      const g = (rData.data[i] * 0.299 + rData.data[i + 1] * 0.587 + rData.data[i + 2] * 0.114) / 255;
      // 反转为 MNIST 格式：笔画=1, 背景=0
      // 用平滑曲线而非硬阈值，保留反走样信息
      gray[i / 4] = Math.max(0, (0.7 - g) / 0.7);
    }

    // 放入 28×28 中心 (MNIST标准)
    const result = new Float32Array(784);
    const ox = Math.floor((28 - nw) / 2);
    const oy = Math.floor((28 - nh) / 2);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const ty = oy + y, tx = ox + x;
        if (ty >= 0 && ty < 28 && tx >= 0 && tx < 28) {
          result[ty * 28 + tx] = gray[y * nw + x];
        }
      }
    }
    return result;
  }

  // ===== KNN 校准预测 =====
  function _predictKNN(input) {
    if (calibrationSamples.length === 0) return null;
  
    const K = Math.min(7, calibrationSamples.length);
    const distances = [];
  
    for (let i = 0; i < calibrationSamples.length; i++) {
      const s = calibrationSamples[i];
      let dist = 0;
      for (let j = 0; j < 784; j++) {
        const diff = input[j] - s.data[j];
        dist += diff * diff;
      }
      distances.push({ dist: Math.sqrt(dist), label: s.label });
    }
  
    distances.sort((a, b) => a.dist - b.dist);
  
    // 距离加权投票
    const votes = new Array(10).fill(0);
    for (let k = 0; k < K; k++) {
      const w = 1 / (distances[k].dist + 0.01);
      votes[distances[k].label] += w;
    }
  
    let maxIdx = 0;
    let secondIdx = 0;
    let totalVotes = 0;
    for (let i = 0; i < 10; i++) {
      totalVotes += votes[i];
      if (votes[i] > votes[maxIdx]) { secondIdx = maxIdx; maxIdx = i; }
      else if (votes[i] > votes[secondIdx] && i !== maxIdx) secondIdx = i;
    }
  
    const rawConf = totalVotes > 0 ? (votes[maxIdx] / totalVotes) : 0;
    // 区分度：第一名投票占比越大越可信
    const margin = totalVotes > 0 ? (votes[maxIdx] - votes[secondIdx]) / totalVotes : 0;
    // 置信度 = 基础分 + 区分度加权，不加固定补贴
    const confidence = Math.min(99, Math.round((rawConf * 60 + margin * 40) * 100 / 100));
  
    return {
      digit: String(maxIdx),
      confidence,
      rawConf: Math.round(rawConf * 100),
      scores: votes.map(v => totalVotes > 0 ? v / totalVotes : 0),
    };
  }
  
  // ===== 预测（校准 + MNIST 融合决策）=====
  function predict(canvasEl) {
    const input = _preprocess(canvasEl);
    if (!input) return { digit: null, confidence: 0, scores: null };
  
    let knnResult = null;
    let mnistResult = null;
  
    // KNN 校准预测
    if (calibrated && calibrationSamples.length > 0) {
      knnResult = _predictKNN(input);
    }
  
    // MNIST 神经网络预测
    if (ready) {
      const { o } = _forward(input);
      let maxIdx = 0;
      for (let i = 1; i < OUTPUT; i++) if (o[i] > o[maxIdx]) maxIdx = i;
      mnistResult = {
        digit: String(maxIdx),
        confidence: Math.round(o[maxIdx] * 100),
        scores: Array.from(o),
      };
    }
  
    // 融合决策
    if (knnResult && mnistResult) {
      if (knnResult.digit === mnistResult.digit) {
        // 双引擎一致：提升置信度
        const fused = Math.min(99, Math.round((knnResult.confidence + mnistResult.confidence) / 2 + 10));
        return { digit: knnResult.digit, confidence: fused, scores: knnResult.scores, engine: 'knn+mnist' };
      }
      // 双引擎不一致：取置信度更高的
      if (knnResult.confidence >= mnistResult.confidence + 10) {
        return { ...knnResult, engine: 'calibration' };
      }
      if (mnistResult.confidence >= knnResult.confidence + 10) {
        return { ...mnistResult, engine: 'mnist' };
      }
      // 很接近但不一致：降低置信度，保留手写
      const lower = knnResult.confidence > mnistResult.confidence ? knnResult : mnistResult;
      return { ...lower, confidence: Math.round(lower.confidence * 0.7), engine: lower === knnResult ? 'calibration' : 'mnist' };
    }
  
    if (knnResult) return { ...knnResult, engine: 'calibration' };
    if (mnistResult) return { ...mnistResult, engine: 'mnist' };
    return { digit: null, confidence: 0, scores: null };
  }

  // ===== 校准样本管理 =====
  function addCalibrationSample(canvasEl, label) {
    const input = _preprocess(canvasEl);
    if (!input) return false;
    calibrationSamples.push({ data: new Float32Array(input), label });
    return true;
  }

  function finishCalibration() {
    if (calibrationSamples.length < 10) return false;
    calibrated = true;
    // 保存到 localStorage
    try {
      const serializable = calibrationSamples.map(s => ({
        data: Array.from(s.data),
        label: s.label,
      }));
      localStorage.setItem('kousuan_cal_samples', JSON.stringify(serializable));
      // 同时记录到 Storage 模块（元数据）
      const counts = new Array(10).fill(0);
      calibrationSamples.forEach(s => counts[s.label]++);
      if (typeof Storage !== 'undefined') {
        Storage.saveCalibration({
          sampleCount: calibrationSamples.length,
          digitCounts: counts,
          date: new Date().toISOString(),
        });
      }
      console.log(`[DigitNN] Calibration saved: ${calibrationSamples.length} samples`);
    } catch (e) {
      console.warn('[DigitNN] Failed to save calibration:', e);
    }
    return true;
  }

  function _loadCalibration() {
    try {
      const raw = localStorage.getItem('kousuan_cal_samples');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length < 10) return false;
      calibrationSamples = parsed.map(s => ({
        data: new Float32Array(s.data),
        label: s.label,
      }));
      calibrated = true;
      console.log(`[DigitNN] Calibration loaded: ${calibrationSamples.length} samples`);
      return true;
    } catch (e) {
      console.warn('[DigitNN] Failed to load calibration:', e);
      return false;
    }
  }

  function clearCalibration() {
    calibrationSamples = [];
    calibrated = false;
    localStorage.removeItem('kousuan_cal_samples');
    if (typeof Storage !== 'undefined') Storage.clearCalibration();
  }

  function isCalibrated() { return calibrated; }
  function getCalibrationSampleCount() { return calibrationSamples.length; }

  // ===== 持久化 =====
  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        w1: Array.from(w1), b1: Array.from(b1),
        w2: Array.from(w2), b2: Array.from(b2),
      }));
      console.log('[DigitNN] Weights saved to localStorage');
    } catch (e) {
      console.warn('[DigitNN] Save failed:', e.message);
    }
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      w1 = new Float32Array(d.w1);
      b1 = new Float32Array(d.b1);
      w2 = new Float32Array(d.w2);
      b2 = new Float32Array(d.b2);
      if (w1.length !== INPUT * HIDDEN) throw new Error('Size mismatch');
      console.log('[DigitNN] Weights loaded from localStorage');
      return true;
    } catch (e) {
      console.warn('[DigitNN] Load failed:', e.message);
      return false;
    }
  }

  function _clearCache() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ===== 公共接口 =====
  async function init(onProgress) {
    // 加载校准数据
    _loadCalibration();

    if (ready) return true;

    // 尝试加载缓存权重
    if (_load()) {
      ready = true;
      status = 'ready';
      return true;
    }

    // 需要训练
    try {
      status = 'loading';
      const mnist = await _loadMNIST();

      status = 'training';
      await _train(
        mnist.trainData, mnist.trainLabels,
        mnist.testData, mnist.testLabels,
        onProgress
      );

      _save();
      ready = true;
      status = 'ready';
      return true;
    } catch (e) {
      console.error('[DigitNN] Init failed:', e);
      status = 'failed';
      return false;
    }
  }

  function isReady() { return ready; }
  function getStatus() { return status; }
  function clearModel() { _clearCache(); ready = false; status = 'idle'; }

  return {
    init, predict, isReady, getStatus, clearModel,
    addCalibrationSample, finishCalibration, clearCalibration,
    isCalibrated, getCalibrationSampleCount,
  };
})();
