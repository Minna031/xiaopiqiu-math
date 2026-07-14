/**
 * 应用入口 - 界面切换、初始化、答题流程控制
 */
const App = (() => {
  let currentPage = 'home';
  let currentQuestions = [];
  let currentQuestionIndex = 0;
  let studentAnswers = [];
  let studentCellDigits = [];  // 每题每格的数字 [[d0,d1,d2], ...]
  let ocrConfidences = [];
  let isPracticing = false;
  let isErrorBookPractice = false;
  let pickerQIdx = -1;
  let pickerCellIdx = -1;
  let _pendingRecognition = {};  // 临时存储识别结果，用于统计

  // DOM引用
  const $ = id => document.getElementById(id);

  function init() {
    showPage('home');
    bindGlobalEvents();
    initDigitPicker();
    updateAIStatus();
    // 预加载OCR
    setTimeout(() => OCR.init(), 500);
    // 定期检查 AI 状态
    setInterval(updateAIStatus, 2000);
  }

  function updateAIStatus() {
    const el = $('ai-status');
    if (!el) return;
    const calStatus = DigitRecognizer.isCalibrated() ? '🎯' : '✍️';
    const s = DigitRecognizer.getStatus();
    if (s === 'ready') {
      const cal = DigitRecognizer.isCalibrated();
      const sampleCount = DigitRecognizer.getCalibrationSampleCount();
      if (cal) {
        el.innerHTML = `${calStatus} AI 已就绪 · 已校准(${sampleCount}个样本)`;
      } else {
        el.innerHTML = '✅ AI 已就绪 · <a href="#" id="link-calibrate" style="color:#4A90D9;">建议校准</a>';
        // 动态绑定校准链接
        setTimeout(() => {
          const link = $('link-calibrate');
          if (link) link.onclick = (e) => { e.preventDefault(); Calibration.start(); };
        }, 100);
      }
      el.style.color = '#4CAF50';
    } else if (s === 'loading') {
      el.innerHTML = '⏳ AI 模型加载中...';
      el.style.color = '#FF9800';
    } else if (s === 'training') {
      el.innerHTML = '⏳ AI 模型训练中（首次约15秒）...';
      el.style.color = '#FF9800';
    } else if (s === 'failed') {
      el.innerHTML = '⚠️ AI 加载失败，将使用备用识别';
      el.style.color = '#F44336';
    } else {
      el.textContent = '';
    }
  }

  function bindGlobalEvents() {
    // 顶部按钮
    $('btn-error-book').addEventListener('click', () => showPage('error-book'));
    $('btn-parent').addEventListener('click', () => showPage('parent-login'));
    // 校准训练按钮
    const calBtn = $('btn-calibrate');
    if (calBtn) calBtn.addEventListener('click', () => Calibration.start());
    $('btn-home').addEventListener('click', () => {
      if (isPracticing) {
        if (!confirm('练习进行中，确定退出吗？')) return;
        stopPractice();
      }
      showPage('home');
    });

    // 底部工具栏
    $('btn-tool-pen').addEventListener('click', () => {
      CanvasManager.setEraserMode(false);
      $('btn-tool-pen').classList.add('active');
      $('btn-tool-eraser').classList.remove('active');
    });
    $('btn-tool-eraser').addEventListener('click', () => {
      CanvasManager.setEraserMode(true);
      $('btn-tool-eraser').classList.add('active');
      $('btn-tool-pen').classList.remove('active');
    });
    $('btn-undo').addEventListener('click', () => CanvasManager.undo());
    $('btn-clear').addEventListener('click', () => {
      if (currentQuestionIndex >= 0) {
        // 清除当前题目的所有格子
        const areas = CanvasManager.getAnswerAreas();
        areas.forEach(a => {
          if (a.questionIndex === currentQuestionIndex) {
            CanvasManager.clearCurrentArea(a.index);
            studentCellDigits[currentQuestionIndex][a.cellIndex] = '';
            _highlightCell(currentQuestionIndex, a.cellIndex, '');
          }
        });
      }
    });

    // 开始练习按钮
    $('btn-start').addEventListener('click', startPractice);

    // 提交按钮
    $('btn-submit').addEventListener('click', submitPractice);

    // 错题本操作
    $('btn-error-practice').addEventListener('click', startErrorBookPractice);
    $('btn-error-clear').addEventListener('click', () => {
      if (confirm('确定清空错题本吗？')) {
        ErrorBook.clearAll();
        renderErrorBook();
      }
    });
    $('btn-error-back').addEventListener('click', () => showPage('home'));

    // 家长模式
    $('btn-parent-verify').addEventListener('click', verifyParent);
    $('btn-parent-back').addEventListener('click', () => showPage('home'));
    $('btn-parent-logout').addEventListener('click', () => {
      Parent.logout();
      showPage('home');
    });
    $('btn-parent-tab-settings').addEventListener('click', () => showParentTab('settings'));
    $('btn-parent-tab-report').addEventListener('click', () => showParentTab('report'));
    $('btn-parent-tab-recognition').addEventListener('click', () => showParentTab('recognition'));
  }

  // ---- 界面切换 ----
  function showPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = $(`page-${page}`);
    if (target) target.classList.add('active');

    // 更新顶部导航可见性
    const showNav = ['practice'].includes(page);
    $('top-bar').classList.toggle('practice-mode', showNav);

    // 进入特定页面时的初始化
    if (page === 'error-book') renderErrorBook();
    if (page === 'parent-panel') renderParentPanel();

    // 底部工具栏只在练习页显示
    $('bottom-toolbar').classList.toggle('active', page === 'practice');
  }

  function onEraserToggle(isEraser) {
    $('btn-tool-eraser').classList.toggle('active', isEraser);
    $('btn-tool-pen').classList.toggle('active', !isEraser);
  }

  // ---- 练习流程 ----
  function startPractice() {
    isErrorBookPractice = false;
    const settings = Storage.getSettings();
    currentQuestions = Questions.generateSet(settings.grade, settings.difficulty, settings.questionCount);
    currentQuestions.forEach(q => { q.grade = settings.grade; q.difficulty = settings.difficulty; });
    beginPracticeSession(settings);
  }

  function startErrorBookPractice() {
    const book = ErrorBook.getErrors();
    if (book.length === 0) {
      alert('错题本为空，没有可以练习的题目');
      return;
    }
    isErrorBookPractice = true;
    const settings = Storage.getSettings();
    const count = Math.min(settings.questionCount, book.length);
    currentQuestions = ErrorBook.generatePractice(count);
    beginPracticeSession(settings);
  }

  function beginPracticeSession(settings) {
    isPracticing = true;
    currentQuestionIndex = 0;
    studentAnswers = new Array(currentQuestions.length).fill('');
    studentCellDigits = currentQuestions.map((q) => {
      const cellCount = _getCellCount(q);
      return new Array(cellCount).fill('');
    });

    showPage('practice');

    // Canvas必须在页面可见后初始化，用rAF确保DOM已布局
    requestAnimationFrame(() => {
      CanvasManager.init($('drawing-canvas'));
      CanvasManager.clearAll();
      CanvasManager.setEraserMode(false);
      renderQuestions();

      // 注册实时识别回调
      CanvasManager.setOnStrokeEnd(onCellStrokeEnd);
      CanvasManager.setOnRewriteStart(onCellRewriteStart);

      // 启动计时器
      Timer.start(settings.timeLimit,
        (display, remaining) => {
          $('timer-display').textContent = display;
          $('timer-display').classList.toggle('warning', remaining <= 30);
        },
        () => { submitPractice(); }
      );

      // 高亮第一题
      highlightQuestion(0);
    });
  }

  function stopPractice() {
    isPracticing = false;
    Timer.stop();
  }

  /**
   * 根据题目类型生成数字格子HTML
   */
  function _renderAnswerCells(q) {
    const type = q.answerType;
    if (type === 'fraction') {
      // 分子2格 + / + 分母2格
      return `<div class="answer-cells">
        <span class="digit-cell" data-cell="${0}"></span>
        <span class="digit-cell" data-cell="${1}"></span>
        <span class="cell-separator">/</span>
        <span class="digit-cell" data-cell="${2}"></span>
        <span class="digit-cell" data-cell="${3}"></span>
      </div>`;
    }
    if (type === 'remainder') {
      // 商2格 + ... + 余数2格
      return `<div class="answer-cells">
        <span class="digit-cell" data-cell="${0}"></span>
        <span class="digit-cell" data-cell="${1}"></span>
        <span class="cell-separator">…</span>
        <span class="digit-cell" data-cell="${2}"></span>
        <span class="digit-cell" data-cell="${3}"></span>
      </div>`;
    }
    if (type === 'decimal') {
      // 3格数字 + 小数点 + 1格
      return `<div class="answer-cells">
        <span class="digit-cell" data-cell="${0}"></span>
        <span class="digit-cell" data-cell="${1}"></span>
        <span class="cell-separator">.</span>
        <span class="digit-cell" data-cell="${2}"></span>
      </div>`;
    }
    // 整数：根据年级动态决定格子数
    const grade = q.grade || Storage.getSettings().grade;
    const cellCount = grade <= 2 ? 2 : grade <= 4 ? 3 : 3;
    let cells = '';
    for (let c = 0; c < cellCount; c++) {
      cells += `<span class="digit-cell" data-cell="${c}"></span>`;
    }
    return `<div class="answer-cells">${cells}</div>`;
  }

  /**
   * 将逐格OCR识别的数字组装成完整答案
   */
  function _assembleAnswer(digits, answerType) {
    const d = digits.map(s => (s || '').trim());
    if (answerType === 'fraction') {
      const num = (d[0] || '') + (d[1] || '');
      const den = (d[2] || '') + (d[3] || '');
      if (!num && !den) return '';
      return `${num || '0'}/${den || '0'}`;
    }
    if (answerType === 'remainder') {
      const q = (d[0] || '') + (d[1] || '');
      const r = (d[2] || '') + (d[3] || '');
      if (!q && !r) return '';
      return `${q || '0'}...${r || '0'}`;
    }
    if (answerType === 'decimal') {
      const intPart = (d[0] || '') + (d[1] || '');
      const decPart = d[2] || '';
      if (!intPart && !decPart) return '';
      return `${intPart || '0'}.${decPart || '0'}`;
    }
    // integer
    const result = d.join('');
    return result || '';
  }

  function renderQuestions() {
    const container = $('questions-container');
    container.innerHTML = currentQuestions.map((q, i) => `
      <div class="question-item" data-index="${i}" id="question-${i}">
        <span class="question-number">${i + 1}.</span>
        <span class="question-text">${q.question}</span>
        ${_renderAnswerCells(q)}
      </div>
    `).join('');

    // 等待 DOM 布局完成后计算答题区坐标并调整 canvas 大小
    setTimeout(() => {
      // 强制重新计算 canvas 尺寸以覆盖全部题目
      const parent = $('drawing-canvas').parentElement;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.scrollWidth;
      const h = Math.max(parent.scrollHeight, parent.clientHeight);
      const canvas = $('drawing-canvas');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);

      const questionEls = container.querySelectorAll('.question-item');
      const areas = AnswerDetect.calcAnswerAreas([...questionEls], container);
      CanvasManager.setAnswerAreas(areas);
    }, 150);
  }

  function highlightQuestion(index) {
    document.querySelectorAll('.question-item').forEach(el => el.classList.remove('active'));
    const el = $(`question-${index}`);
    if (el) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    currentQuestionIndex = index;
  }

  /**
   * 重写开始：用户开始书写已有印刷体数字的格子，清除该格子的识别结果
   */
  function onCellRewriteStart(areaIndex) {
    const areas = CanvasManager.getAnswerAreas();
    const area = areas.find(a => a.index === areaIndex);
    if (!area) return;
    // 清除识别结果
    studentCellDigits[area.questionIndex][area.cellIndex] = '';
    // 清除格子高亮样式
    _highlightCell(area.questionIndex, area.cellIndex, '');
  }

  /**
   * 实时识别：笔画结束后立即识别当前格子
   * 如果置信度高，将手写笔迹替换为印刷体数字
   */
  function onCellStrokeEnd(areaIndex) {
    if (!DigitRecognizer.isReady()) return;
    if (!isPracticing) return;

    const areas = CanvasManager.getAnswerAreas();
    const area = areas.find(a => a.index === areaIndex);
    if (!area) return;

    const qIdx = area.questionIndex;
    const cIdx = area.cellIndex;

    // 检查是否有笔迹
    if (!CanvasManager.hasStrokesInArea(areaIndex)) return;

    // 获取该区域的画布并识别
    const cellCanvas = CanvasManager.getAreaCanvas(areaIndex);
    if (!cellCanvas) return;

    const result = DigitRecognizer.predict(cellCanvas);

    // 记录识别统计（用于家长面板）
    if (result.digit !== null) {
      // 暂存预测结果，提交批改后可对比正确答案
      const engine = result.engine || (DigitRecognizer.isCalibrated() ? 'calibration' : 'mnist');
      _pendingRecognition[qIdx + '_' + cIdx] = {
        predicted: result.digit,
        confidence: result.confidence,
        engine: engine,
      };
    }

    if (result.digit !== null && result.confidence >= 50) {
      // 高置信度：存储数字并显示印刷体
      studentCellDigits[qIdx][cIdx] = result.digit;
      CanvasManager.drawPrintedDigit(areaIndex, result.digit);
      _highlightCell(qIdx, cIdx, 'recognized');
    } else if (result.digit !== null && result.confidence >= 30) {
      // 低置信度：存储数字但保留手写
      studentCellDigits[qIdx][cIdx] = result.digit;
      _highlightCell(qIdx, cIdx, 'uncertain');
    } else {
      // 无法识别
      studentCellDigits[qIdx][cIdx] = '';
      _highlightCell(qIdx, cIdx, '');
    }
  }

  /**
   * 更新格子的 DOM 样式
   */
  function _highlightCell(qIdx, cIdx, state) {
    const qEl = document.getElementById(`question-${qIdx}`);
    if (!qEl) return;
    const cells = qEl.querySelectorAll('.digit-cell');
    const cell = cells[cIdx];
    if (!cell) return;
    cell.classList.remove('recognized', 'uncertain');
    if (state) cell.classList.add(state);
  }

  // ---- 提交与批改 ----
  async function submitPractice() {
    if (!isPracticing) return;
    stopPractice();

    $('btn-submit').disabled = true;
    const nnReady = DigitRecognizer.isReady();
    $('btn-submit').textContent = nnReady ? '🧠 识别中...' : '识别中...';

    const areas = CanvasManager.getAnswerAreas();
    const canvasEl = CanvasManager.canvas;
    ocrConfidences = new Array(currentQuestions.length).fill(0);
    studentAnswers = new Array(currentQuestions.length).fill('');
    // studentCellDigits 已在 beginPracticeSession 中初始化，实时识别已填充部分格子

    // 逐题逐格识别
    for (let q = 0; q < currentQuestions.length; q++) {
      $('btn-submit').textContent = `识别 ${q + 1}/${currentQuestions.length}...`;
      const qCells = areas.filter(a => a.questionIndex === q);
      let totalConf = 0;
      let cellCount = 0;

      for (const cell of qCells) {
        // 如果实时识别已填充该格子，跳过 OCR
        if (studentCellDigits[q][cell.cellIndex] !== '') {
          totalConf += 80; // 实时识别的置信度设为80
          cellCount++;
          continue;
        }
        // 未识别的格子：用 Tesseract 回退
        if (AnswerDetect.hasInkInArea(canvasEl, cell)) {
          const cropped = AnswerDetect.cropArea(canvasEl, cell);
          const result = await OCR.recognize(cropped, 'integer');
          const digit = OCR.parseResult(result.text, 'integer') || '';
          studentCellDigits[q][cell.cellIndex] = digit;
          totalConf += result.confidence || 0;
          cellCount++;
        }
      }

      studentAnswers[q] = _assembleAnswer(studentCellDigits[q], currentQuestions[q].answerType);
      ocrConfidences[q] = cellCount > 0 ? totalConf / cellCount : 0;
    }

    showOCRReview();
  }

  /**
   * 获取题目的格子数
   */
  function _getCellCount(q) {
    const type = q.answerType;
    if (type === 'fraction' || type === 'remainder') return 4;
    if (type === 'decimal') return 3;
    const grade = q.grade || Storage.getSettings().grade;
    return grade <= 2 ? 2 : 3;
  }
  
  /**
   * 渲染OCR确认页的单题可点击格子
   */
  function _renderOCRCells(qIdx) {
    const q = currentQuestions[qIdx];
    const digits = studentCellDigits[qIdx];
    const type = q.answerType;
    const cellConfs = _cellConfidences(qIdx);
    let html = '';
  
    for (let c = 0; c < digits.length; c++) {
      const d = digits[c] || '';
      const isLow = cellConfs[c] < 60 && d !== '';
      const hasDigit = d !== '';
      html += `<span class="ocr-cell ${isLow ? 'low-conf' : ''} ${hasDigit ? 'has-digit' : ''}" data-q="${qIdx}" data-c="${c}">${d || '—'}</span>`;
  
      if (type === 'fraction' && c === 1) html += '<span class="ocr-cell-sep">/</span>';
      else if (type === 'remainder' && c === 1) html += '<span class="ocr-cell-sep">\u2026</span>';
      else if (type === 'decimal' && c === 1) html += '<span class="ocr-cell-sep">.</span>';
    }
    return html;
  }
  
  /**
   * 获取每题每个格子的置信度（简化版：使用题目平均置信度）
   */
  function _cellConfidences(qIdx) {
    const avg = ocrConfidences[qIdx] || 0;
    return studentCellDigits[qIdx].map(() => avg);
  }
  
  /**
   * OCR 识别结果确认页 —— 点击格子可选数字修正
   */
  function showOCRReview() {
    showPage('results');
    const container = $('results-container');
  
    container.innerHTML = `
      <div class="ocr-review">
        <h3 style="text-align:center;padding:16px;color:var(--text);">识别结果确认</h3>
        <p style="text-align:center;color:var(--text-light);font-size:0.9em;padding:0 16px 12px;">
          点击数字格可修正识别错误，确认后点击“确认批改”
        </p>
        <div class="ocr-review-list">
          ${currentQuestions.map((q, i) => {
            const ans = studentAnswers[i] || '';
            const conf = ocrConfidences[i] || 0;
            const isEmpty = !ans;
            return `
            <div class="ocr-review-item">
              <span class="ocr-review-num">${i + 1}.</span>
              <span class="ocr-review-q">${q.question}</span>
              <div class="ocr-cells-wrap" style="flex:1;">${_renderOCRCells(i)}</div>
              <button class="ocr-rewrite-btn" data-index="${i}" title="回到画布重写">重写</button>
            </div>`;
          }).join('')}
        </div>
        <div class="results-actions">
          <button class="btn-primary" id="btn-confirm-ocr">确认批改</button>
        </div>
      </div>
    `;
  
    // 点击格子打开数字选择器
    container.querySelectorAll('.ocr-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        pickerQIdx = parseInt(cell.dataset.q);
        pickerCellIdx = parseInt(cell.dataset.c);
        const qNum = pickerQIdx + 1;
        $('picker-label').textContent = `第 ${qNum} 题 - 选择数字`;
        $('digit-picker').classList.add('active');
      });
    });
  
    // 重写按钮：回到画布重写该题
    container.querySelectorAll('.ocr-rewrite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        rewriteQuestion(idx);
      });
    });

    $('btn-confirm-ocr').addEventListener('click', doGrading);
  }
  
  /**
   * 初始化数字选择器事件
   */
  function initDigitPicker() {
    const overlay = $('digit-picker');
  
    overlay.querySelectorAll('.digit-pick-btn[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (pickerQIdx < 0) return;
        const digit = btn.dataset.digit;
        studentCellDigits[pickerQIdx][pickerCellIdx] = digit;
        studentAnswers[pickerQIdx] = _assembleAnswer(
          studentCellDigits[pickerQIdx], currentQuestions[pickerQIdx].answerType
        );
        // 手动修正后设为高置信度
        ocrConfidences[pickerQIdx] = 80;
        overlay.classList.remove('active');
        pickerQIdx = -1;
        showOCRReview();
      });
    });
  
    $('picker-skip').addEventListener('click', () => {
      overlay.classList.remove('active');
      pickerQIdx = -1;
    });
  
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        pickerQIdx = -1;
      }
    });
  }

  /**
   * 回到练习页重写某一题（清除该题所有格子）
   */
  function rewriteQuestion(idx) {
    showPage('practice');
    // 清空该题的已识别数字
    studentCellDigits[idx] = new Array(_getCellCount(currentQuestions[idx])).fill('');

    requestAnimationFrame(() => {
      CanvasManager.init($('drawing-canvas'));
      // 清除该题所有格子
      const areas = CanvasManager.getAnswerAreas();
      areas.forEach(a => {
        if (a.questionIndex === idx) {
          CanvasManager.clearCurrentArea(a.index);
        }
      });
      renderQuestions();
      setTimeout(() => {
        CanvasManager.resize();
        const questionEls = $('questions-container').querySelectorAll('.question-item');
        const newAreas = AnswerDetect.calcAnswerAreas([...questionEls], $('questions-container'));
        CanvasManager.setAnswerAreas(newAreas);
        // 重新注册实时识别回调
        CanvasManager.setOnStrokeEnd(onCellStrokeEnd);
        highlightQuestion(idx);
        $('btn-submit').disabled = false;
        $('btn-submit').textContent = '重新提交';
        $('btn-submit').onclick = async () => {
          $('btn-submit').textContent = '识别中...';
          const areas2 = CanvasManager.getAnswerAreas();
          const canvasEl = CanvasManager.canvas;
          const qCells = areas2.filter(a => a.questionIndex === idx);
          const digits = studentCellDigits[idx];
          let totalConf = 0;
          let cellCount = 0;
          for (const cell of qCells) {
            if (digits[cell.cellIndex] !== '') {
              totalConf += 80;
              cellCount++;
              continue;
            }
            if (AnswerDetect.hasInkInArea(canvasEl, cell)) {
              const cropped = AnswerDetect.cropArea(canvasEl, cell);
              const result = await OCR.recognize(cropped, 'integer');
              digits[cell.cellIndex] = OCR.parseResult(result.text, 'integer') || '';
              totalConf += result.confidence || 0;
              cellCount++;
            }
          }
          studentAnswers[idx] = _assembleAnswer(digits, currentQuestions[idx].answerType);
          ocrConfidences[idx] = cellCount > 0 ? totalConf / cellCount : 0;
          showOCRReview();
        };
      }, 200);
    });
  }

  /**
   * 执行批改并显示结果
   */
  function doGrading() {
    // 从格子数字重新组装答案（确保用户修正后的结果被使用）
    for (let i = 0; i < currentQuestions.length; i++) {
      studentAnswers[i] = _assembleAnswer(studentCellDigits[i], currentQuestions[i].answerType);
    }
    const gradeResult = Grading.gradeAll(currentQuestions, studentAnswers);
    ErrorBook.recordErrors(gradeResult.results);

    // 记录识别统计
    _recordRecognitionStats(gradeResult);

    Storage.addHistory({
      grade: Storage.getSettings().grade,
      difficulty: Storage.getSettings().difficulty,
      totalCount: gradeResult.totalCount,
      correctCount: gradeResult.correctCount,
      accuracy: gradeResult.accuracy,
      elapsed: Timer.getElapsed(),
    });

    showResults(gradeResult);
    $('btn-submit').disabled = false;
    $('btn-submit').textContent = '提交';
  }

  /**
   * 记录识别统计：将每格的预测结果与正确答案对比
   */
  function _recordRecognitionStats(gradeResult) {
    for (let q = 0; q < currentQuestions.length; q++) {
      const result = gradeResult.results[q];
      const correctAnswer = String(result.correctAnswer);
      const studentDigits = studentCellDigits[q];

      for (let c = 0; c < studentDigits.length; c++) {
        const key = q + '_' + c;
        const pending = _pendingRecognition[key];
        if (!pending) continue;
        // 获取正确答案中对应位置的数字
        const correctDigit = correctAnswer.replace(/[^0-9]/g, '')[c] || '';
        if (correctDigit && pending.predicted) {
          Storage.addRecognitionResult(
            correctDigit, pending.predicted,
            pending.confidence, pending.engine
          );
        }
      }
    }
    _pendingRecognition = {};
  }

  function showResults(gradeResult) {
    showPage('results');
    const container = $('results-container');
    const { results, correctCount, totalCount, accuracy } = gradeResult;

    container.innerHTML = `
      <div class="results-summary">
        <div class="results-score ${accuracy >= 80 ? 'good' : accuracy >= 60 ? 'mid' : 'bad'}">
          <div class="score-big">${correctCount}/${totalCount}</div>
          <div class="score-label">正确率 ${accuracy}%</div>
        </div>
        <div class="results-time">用时: ${Timer.formatTime(Timer.getElapsed())}</div>
      </div>
      <div class="results-list">
        ${results.map((r, i) => `
          <div class="result-item ${r.isCorrect ? 'correct' : 'wrong'}">
            <span class="result-icon">${r.isCorrect ? '✓' : '✗'}</span>
            <span class="result-question">${r.question}</span>
            <span class="result-student">${r.studentAnswer}</span>
            ${!r.isCorrect ? `<span class="result-correct">正确: ${r.correctAnswer}</span>` : ''}
          </div>
        `).join('')}
      </div>
      <div class="results-actions">
        <button class="btn-primary" id="btn-back-home">返回首页</button>
        <button class="btn-secondary" id="btn-retry">再来一次</button>
      </div>
    `;

    $('btn-back-home').addEventListener('click', () => showPage('home'));
    $('btn-retry').addEventListener('click', () => {
      if (isErrorBookPractice) startErrorBookPractice();
      else startPractice();
    });
  }

  // ---- 错题本 ----
  function renderErrorBook() {
    ErrorBook.render($('error-book-list'));
    const stats = ErrorBook.getStats();
    $('error-book-count').textContent = stats.total;
  }

  // ---- 家长模式 ----
  function verifyParent() {
    const input = $('parent-password-input').value;
    if (Parent.verify(input)) {
      $('parent-password-input').value = '';
      showPage('parent-panel');
    } else {
      alert('密码错误');
    }
  }

  function renderParentPanel() {
    showParentTab('settings');
  }

  function showParentTab(tab) {
    $('btn-parent-tab-settings').classList.toggle('active', tab === 'settings');
    $('btn-parent-tab-report').classList.toggle('active', tab === 'report');
    $('btn-parent-tab-recognition').classList.toggle('active', tab === 'recognition');
    if (tab === 'settings') {
      Parent.renderSettings($('parent-content'));
    } else if (tab === 'report') {
      Parent.renderReport($('parent-content'));
    } else if (tab === 'recognition') {
      Parent.renderRecognition($('parent-content'));
    }
  }

  return { init, showPage, onEraserToggle };
})();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', App.init);
