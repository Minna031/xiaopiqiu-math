/**
 * 本地存储模块 - 封装 localStorage 的读写操作
 */
const Storage = (() => {
  const KEYS = {
    SETTINGS: 'kousuan_settings',
    ERROR_BOOK: 'kousuan_error_book',
    HISTORY: 'kousuan_history',
    PASSWORD: 'kousuan_password',
    CALIBRATION: 'kousuan_calibration',
    RECOGNITION_STATS: 'kousuan_recognition_stats',
  };

  const DEFAULT_SETTINGS = {
    grade: 1,
    difficulty: 'medium',  // easy, medium, hard, random
    questionCount: 10,
    timeLimit: 5,          // minutes
  };

  function _get(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.warn('Storage read error:', key, e);
      return fallback;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write error:', key, e);
      return false;
    }
  }

  // ---- 练习设置 ----
  function getSettings() {
    return _get(KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
  }

  function saveSettings(settings) {
    const current = getSettings();
    return _set(KEYS.SETTINGS, { ...current, ...settings });
  }

  // ---- 错题本 ----
  function getErrorBook() {
    return _get(KEYS.ERROR_BOOK, []);
  }

  function saveErrorBook(errors) {
    return _set(KEYS.ERROR_BOOK, errors);
  }

  function addError(question) {
    const book = getErrorBook();
    const existing = book.find(e => e.question === question.question);
    if (existing) {
      existing.errorCount += 1;
      existing.lastErrorTime = new Date().toISOString();
      existing.correctAnswer = question.correctAnswer;
    } else {
      book.push({
        ...question,
        errorCount: 1,
        lastErrorTime: new Date().toISOString(),
      });
    }
    return saveErrorBook(book);
  }

  function removeError(questionText) {
    const book = getErrorBook().filter(e => e.question !== questionText);
    return saveErrorBook(book);
  }

  function clearErrorBook() {
    return saveErrorBook([]);
  }

  // ---- 练习历史 ----
  function getHistory() {
    return _get(KEYS.HISTORY, []);
  }

  function addHistory(record) {
    const history = getHistory();
    history.unshift({
      ...record,
      timestamp: new Date().toISOString(),
    });
    // 最多保留 200 条记录
    if (history.length > 200) history.length = 200;
    return saveHistory(history);
  }

  function saveHistory(history) {
    return _set(KEYS.HISTORY, history);
  }

  // ---- 家长密码 ----
  function getPassword() {
    return _get(KEYS.PASSWORD, '1234');
  }

  function setPassword(newPassword) {
    return _set(KEYS.PASSWORD, newPassword);
  }

  // ---- 校准数据 ----
  function getCalibration() {
    return _get(KEYS.CALIBRATION, null);
  }

  function saveCalibration(data) {
    return _set(KEYS.CALIBRATION, data);
  }

  function clearCalibration() {
    localStorage.removeItem(KEYS.CALIBRATION);
  }

  // ---- 识别统计 ----
  function getRecognitionStats() {
    return _get(KEYS.RECOGNITION_STATS, {
      total: 0, correct: 0,
      digitStats: {},  // { "0": { total: 0, correct: 0 }, ... }
      recentResults: [],  // 最近 50 条
    });
  }

  function addRecognitionResult(digit, predicted, confidence, engine) {
    const stats = getRecognitionStats();
    stats.total++;
    const isCorrect = digit === predicted;
    if (isCorrect) stats.correct++;
    // 按数字统计
    if (!stats.digitStats[digit]) stats.digitStats[digit] = { total: 0, correct: 0 };
    stats.digitStats[digit].total++;
    if (isCorrect) stats.digitStats[digit].correct++;
    // 最近记录
    stats.recentResults.push({ digit, predicted, confidence, engine, correct: isCorrect, time: Date.now() });
    if (stats.recentResults.length > 50) stats.recentResults.shift();
    return _set(KEYS.RECOGNITION_STATS, stats);
  }

  function clearRecognitionStats() {
    localStorage.removeItem(KEYS.RECOGNITION_STATS);
  }

  // ---- 数据导出 ----
  function exportAllData() {
    return {
      settings: getSettings(),
      errorBook: getErrorBook(),
      history: getHistory(),
      calibration: getCalibration(),
      recognitionStats: getRecognitionStats(),
    };
  }

  function clearAllData() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  return {
    getSettings,
    saveSettings,
    getErrorBook,
    saveErrorBook,
    addError,
    removeError,
    clearErrorBook,
    getHistory,
    addHistory,
    saveHistory,
    getPassword,
    setPassword,
    getCalibration,
    saveCalibration,
    clearCalibration,
    getRecognitionStats,
    addRecognitionResult,
    clearRecognitionStats,
    exportAllData,
    clearAllData,
  };
})();
