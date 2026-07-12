/**
 * 手写识别模块 - 封装 Tesseract.js
 * 优化：多次识别投票、按答案类型设置白名单、置信度筛选
 */
const OCR = (() => {
  let workers = {};  // 按白名单缓存 worker
  let isReady = false;

  const WHITELISTS = {
    integer:   '0123456789-',
    decimal:   '0123456789.-',
    fraction:  '0123456789/',
    remainder: '0123456789',
  };

  async function _getWorker(whitelist) {
    const key = whitelist || 'default';
    if (workers[key]) return workers[key];
    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {}
      });
      await worker.setParameters({
        tessedit_char_whitelist: whitelist || '0123456789',
        tessedit_pageseg_mode: '7',
        preserve_interword_spaces: '0',
      });
      workers[key] = worker;
      return worker;
    } catch (e) {
      console.error('OCR worker create error:', e);
      return null;
    }
  }

  async function init() {
    if (isReady) return;
    await _getWorker('0123456789-./');
    isReady = true;
  }

  /**
   * 多次识别并投票选出最佳结果
   * @param {HTMLCanvasElement} canvasEl - 已预处理的canvas
   * @param {string} answerType - integer/decimal/fraction/remainder
   * @returns {{ text: string, confidence: number }}
   */
  async function recognize(canvasEl, answerType) {
    const whitelist = WHITELISTS[answerType] || '0123456789';
    const worker = await _getWorker(whitelist);
    if (!worker) return { text: '', confidence: 0 };

    const results = [];
    const psmModes = ['7', '8', '10'];

    for (const psm of psmModes) {
      try {
        await worker.setParameters({
          tessedit_char_whitelist: whitelist,
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: '0',
        });
        const { data } = await worker.recognize(canvasEl);
        const text = data.text.trim();
        if (text) {
          results.push({ text, confidence: data.confidence || 0, psm });
        }
      } catch (e) { /* skip */ }
    }

    if (results.length === 0) return { text: '', confidence: 0 };

    // 投票：同结果多次优先，同等票数选置信度高
    const voteMap = {};
    results.forEach(r => {
      const key = r.text.replace(/\s+/g, '');
      if (!voteMap[key]) voteMap[key] = { text: key, votes: 0, totalConf: 0 };
      voteMap[key].votes++;
      voteMap[key].totalConf += r.confidence;
    });

    const sorted = Object.values(voteMap).sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (b.totalConf / b.votes) - (a.totalConf / a.votes);
    });

    const best = sorted[0];
    return { text: best.text, confidence: Math.round(best.totalConf / best.votes) };
  }

  /**
   * 解析识别结果
   */
  function parseResult(rawText, answerType) {
    if (!rawText) return null;
    let text = rawText.replace(/\s+/g, '').trim();

    if (answerType === 'integer' || answerType === 'remainder') {
      text = text.replace(/[Oo]/g, '0')
                 .replace(/[Il]/g, '1')
                 .replace(/[Ss]/g, '5')
                 .replace(/B/g, '8')
                 .replace(/Z/g, '2');
    }

    if (answerType === 'integer') {
      const match = text.match(/-?\d+/);
      return match ? match[0] : null;
    }

    if (answerType === 'decimal') {
      let cleaned = text.replace(/[^0-9.\-]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
      const match = cleaned.match(/-?\d+\.?\d*/);
      if (match) return String(parseFloat(match[0]));
      const intMatch = cleaned.match(/-?\d+/);
      return intMatch ? String(parseFloat(intMatch[0])) : null;
    }

    if (answerType === 'fraction') {
      let cleaned = text.replace(/[^0-9\/\-]/g, '');
      const match = cleaned.match(/(-?\d+)\/(-?\d+)/);
      if (match) return `${match[1]}/${match[2]}`;
      const intMatch = cleaned.match(/-?\d+/);
      return intMatch ? intMatch[0] : null;
    }

    if (answerType === 'remainder') {
      let cleaned = text.replace(/[^0-9]/g, '');
      if (cleaned.length >= 2) {
        for (let splitAt = 1; splitAt < cleaned.length; splitAt++) {
          const q = cleaned.substring(0, splitAt);
          const r = cleaned.substring(splitAt);
          if (q && r) return `${parseInt(q)}...${parseInt(r)}`;
        }
      }
      return cleaned || null;
    }

    return text || null;
  }

  function getReady() { return isReady; }

  return { init, recognize, parseResult, getReady };
})();
