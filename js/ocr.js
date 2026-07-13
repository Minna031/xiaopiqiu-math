/**
 * 手写识别模块 - 双引擎：神经网络(MNIST) + Tesseract(回退)
 * 优先使用 DigitRecognizer（专门识别手写数字，准确率 >95%）
 * Tesseract 作为后备方案
 */
const OCR = (() => {
  let worker = null;
  let isReady = false;

  async function init() {
    // 初始化神经网络识别器（在后台训练/加载）
    DigitRecognizer.init((epoch, current, total) => {
      const pct = Math.round((epoch * total + current) / (3 * total) * 100);
      console.log(`[OCR] 神经网络训练中: ${pct}%`);
    }).then(ok => {
      if (ok) console.log('[OCR] 手写识别引擎就绪 (Neural Network)');
      else console.warn('[OCR] 神经网络初始化失败，将使用 Tesseract');
    }).catch(e => {
      console.warn('[OCR] Neural network init error:', e);
    });

    // 同时初始化 Tesseract 作为后备
    try {
      worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '10',
        preserve_interword_spaces: '0',
      });
      isReady = true;
    } catch (e) {
      console.error('OCR worker create error:', e);
    }
  }

  /**
   * 识别单个数字格子中的手写数字
   * 优先使用神经网络，回退到 Tesseract
   * @param {HTMLCanvasElement} canvasEl - 已预处理的canvas
   * @param {string} answerType - 答案类型（保留兼容性）
   * @returns {{ text: string, confidence: number, engine: string }}
   */
  async function recognize(canvasEl, answerType) {
    // 优先：神经网络识别
    if (DigitRecognizer.isReady()) {
      const nnResult = DigitRecognizer.predict(canvasEl);
      if (nnResult.digit !== null) {
        return {
          text: nnResult.digit,
          confidence: nnResult.confidence,
          engine: 'nn',
        };
      }
    }

    // 回退：Tesseract
    if (worker) {
      try {
        const results = [];
        for (const psm of ['10', '8']) {
          await worker.setParameters({
            tessedit_char_whitelist: '0123456789',
            tessedit_pageseg_mode: psm,
          });
          const { data } = await worker.recognize(canvasEl);
          const text = data.text.trim().replace(/\s+/g, '');
          if (text) {
            results.push({ text, confidence: data.confidence || 0, engine: 'tesseract' });
          }
        }
        if (results.length > 0) {
          results.sort((a, b) => b.confidence - a.confidence);
          return results[0];
        }
      } catch (e) {
        console.error('OCR recognize error:', e);
      }
    }

    return { text: '', confidence: 0, engine: 'none' };
  }

  /**
   * 解析单数字识别结果
   */
  function parseResult(rawText, answerType) {
    if (!rawText) return null;
    let text = rawText.replace(/\s+/g, '').trim();

    // 常见误识别修正（仅用于 Tesseract 回退）
    text = text.replace(/[Oo]/g, '0')
               .replace(/[Il|]/g, '1')
               .replace(/[Ss]/g, '5')
               .replace(/B/g, '8')
               .replace(/Z/g, '2')
               .replace(/G/g, '6')
               .replace(/q/g, '9')
               .replace(/b/g, '6');

    const match = text.match(/\d/);
    return match ? match[0] : null;
  }

  function getReady() { return isReady || DigitRecognizer.isReady(); }

  return { init, recognize, parseResult, getReady };
})();
