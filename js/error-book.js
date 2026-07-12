/**
 * 错题管理模块 - 记录、统计、练习错题
 */
const ErrorBook = (() => {

  /**
   * 将批改结果中的错题加入错题本
   * @param {Array} results - 批改结果数组
   */
  function recordErrors(results) {
    results.forEach(r => {
      if (!r.isCorrect) {
        Storage.addError({
          question: r.question,
          correctAnswer: r.correctAnswer,
          answerType: r.answerType,
          grade: r.grade,
          difficulty: r.difficulty,
        });
      }
    });
  }

  /**
   * 获取错题列表
   */
  function getErrors() {
    return Storage.getErrorBook();
  }

  /**
   * 获取错题统计
   */
  function getStats() {
    const book = getErrors();
    const total = book.length;
    const sortedByCount = [...book].sort((a, b) => b.errorCount - a.errorCount);
    const topErrors = sortedByCount.slice(0, 10);
    return { total, topErrors };
  }

  /**
   * 从错题本随机选题生成练习
   * @param {number} count - 题目数量
   */
  function generatePractice(count) {
    const book = getErrors();
    return Questions.generateFromErrorBook(book, count);
  }

  /**
   * 清空错题本
   */
  function clearAll() {
    Storage.clearErrorBook();
  }

  /**
   * 删除单道错题
   */
  function remove(questionText) {
    Storage.removeError(questionText);
  }

  /**
   * 渲染错题列表到DOM
   * @param {HTMLElement} container
   */
  function render(container) {
    const book = getErrors();
    if (book.length === 0) {
      container.innerHTML = '<div class="empty-state">错题本为空，继续保持！</div>';
      return;
    }

    const sorted = [...book].sort((a, b) => b.errorCount - a.errorCount);
    container.innerHTML = `
      <div class="error-list">
        ${sorted.map((e, i) => `
          <div class="error-item" data-index="${i}">
            <div class="error-question">${e.question}</div>
            <div class="error-info">
              <span class="error-answer">正确答案: ${e.correctAnswer}</span>
              <span class="error-count">错 ${e.errorCount} 次</span>
              <span class="error-time">${formatTime(e.lastErrorTime)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return { recordErrors, getErrors, getStats, generatePractice, clearAll, remove, render };
})();
