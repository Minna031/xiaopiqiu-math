/**
 * 应用入口 - 界面切换、初始化、答题流程控制
 */
const App = (() => {
  let currentPage = 'home';
  let currentQuestions = [];
  let currentQuestionIndex = 0;
  let studentAnswers = [];
  let isPracticing = false;
  let isErrorBookPractice = false;

  // DOM引用
  const $ = id => document.getElementById(id);

  function init() {
    showPage('home');
    bindGlobalEvents();
    // 预加载OCR
    setTimeout(() => OCR.init(), 1000);
  }

  function bindGlobalEvents() {
    // 顶部按钮
    $('btn-error-book').addEventListener('click', () => showPage('error-book'));
    $('btn-parent').addEventListener('click', () => showPage('parent-login'));
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
        CanvasManager.clearCurrentArea(currentQuestionIndex);
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

    showPage('practice');

    // Canvas必须在页面可见后初始化，用rAF确保DOM已布局
    requestAnimationFrame(() => {
      CanvasManager.init($('drawing-canvas'));
      CanvasManager.clearAll();
      CanvasManager.setEraserMode(false);
      renderQuestions();

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

  function renderQuestions() {
    const container = $('questions-container');
    container.innerHTML = currentQuestions.map((q, i) => `
      <div class="question-item" data-index="${i}" id="question-${i}">
        <span class="question-number">${i + 1}.</span>
        <span class="question-text">${q.question}</span>
        <span class="answer-box" id="answer-box-${i}"></span>
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

  // ---- 提交与批改 ----
  async function submitPractice() {
    if (!isPracticing) return;
    stopPractice();

    // 显示加载状态
    $('btn-submit').disabled = true;
    $('btn-submit').textContent = '识别中...';

    const areas = CanvasManager.getAnswerAreas();
    const canvasEl = CanvasManager.canvas;

    // OCR识别每道题
    for (let i = 0; i < currentQuestions.length; i++) {
      // 更新进度
      $('btn-submit').textContent = `识别 ${i + 1}/${currentQuestions.length}...`;

      if (AnswerDetect.hasInkInArea(canvasEl, areas[i])) {
        const cropped = AnswerDetect.cropArea(canvasEl, areas[i]);
        const result = await OCR.recognize(cropped, currentQuestions[i].answerType);
        studentAnswers[i] = OCR.parseResult(result.text, currentQuestions[i].answerType) || '';
      }
    }

    // 显示 OCR 结果预览，允许用户手动修正
    showOCRReview();
  }

  /**
   * 显示 OCR 识别结果，允许用户手动修正
   */
  function showOCRReview() {
    showPage('results');
    const container = $('results-container');

    container.innerHTML = `
      <div class="ocr-review">
        <h3 style="text-align:center;padding:16px;color:var(--text);">识别结果确认</h3>
        <p style="text-align:center;color:var(--text-light);font-size:0.9em;padding:0 16px 12px;">
          点击答案可以手动修改识别错误的内容
        </p>
        <div class="ocr-review-list">
          ${currentQuestions.map((q, i) => `
            <div class="ocr-review-item">
              <span class="ocr-review-num">${i + 1}.</span>
              <span class="ocr-review-q">${q.question}</span>
              <input class="ocr-review-input" 
                     data-index="${i}" 
                     value="${studentAnswers[i] || ''}" 
                     placeholder="未识别"
                     inputmode="decimal">
            </div>
          `).join('')}
        </div>
        <div class="results-actions">
          <button class="btn-primary" id="btn-confirm-ocr">确认批改</button>
        </div>
      </div>
    `;

    // 绑定输入框修改事件
    container.querySelectorAll('.ocr-review-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        studentAnswers[idx] = e.target.value.trim();
      });
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index);
        studentAnswers[idx] = e.target.value.trim();
      });
    });

    $('btn-confirm-ocr').addEventListener('click', doGrading);
  }

  /**
   * 执行批改并显示结果
   */
  function doGrading() {
    const gradeResult = Grading.gradeAll(currentQuestions, studentAnswers);
    ErrorBook.recordErrors(gradeResult.results);

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
    if (tab === 'settings') {
      Parent.renderSettings($('parent-content'));
    } else {
      Parent.renderReport($('parent-content'));
    }
  }

  return { init, showPage, onEraserToggle };
})();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', App.init);
