/**
 * 自动批改模块 - 答案比对与评分
 */
const Grading = (() => {

  /**
   * 比较学生答案与正确答案
   * @param {string} studentAnswer - 学生手写识别后的答案
   * @param {string} correctAnswer - 正确答案
   * @param {string} answerType - integer/decimal/fraction/remainder
   * @returns {boolean} 是否正确
   */
  function compare(studentAnswer, correctAnswer, answerType) {
    if (!studentAnswer || !correctAnswer) return false;

    const s = String(studentAnswer).trim();
    const c = String(correctAnswer).trim();

    if (answerType === 'integer') {
      return parseInt(s, 10) === parseInt(c, 10);
    }

    if (answerType === 'decimal') {
      const sv = parseFloat(s);
      const cv = parseFloat(c);
      if (isNaN(sv) || isNaN(cv)) return false;
      return Math.abs(sv - cv) <= 0.1;
    }

    if (answerType === 'fraction') {
      // 先尝试直接比较字符串
      if (s === c) return true;
      // 计算分数值比较
      const sv = parseFraction(s);
      const cv = parseFraction(c);
      if (sv === null || cv === null) return s === c;
      return Math.abs(sv - cv) < 0.01;
    }

    if (answerType === 'remainder') {
      // 格式 "商...余数"
      const sParts = s.split(/\.\.\.|\s+/).map(Number);
      const cParts = c.split(/\.\.\.|\s+/).map(Number);
      if (sParts.length >= 2 && cParts.length >= 2) {
        return sParts[0] === cParts[0] && sParts[1] === cParts[1];
      }
      return s === c;
    }

    return s === c;
  }

  function parseFraction(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 1) {
      const v = parseFloat(parts[0]);
      return isNaN(v) ? null : v;
    }
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (isNaN(num) || isNaN(den) || den === 0) return null;
      return num / den;
    }
    return null;
  }

  /**
   * 批改整套练习
   * @param {Array} questions - 题目列表
   * @param {Array} studentAnswers - 学生答案列表（对应题目索引）
   * @returns {Object} { results: [{question, studentAnswer, correctAnswer, isCorrect}], correctCount, totalCount }
   */
  function gradeAll(questions, studentAnswers) {
    const results = questions.map((q, i) => {
      const studentAns = studentAnswers[i] || '';
      const isCorrect = compare(studentAns, q.correctAnswer, q.answerType);
      return {
        question: q.question,
        studentAnswer: studentAns || '（未作答）',
        correctAnswer: q.correctAnswer,
        isCorrect,
        answerType: q.answerType,
        grade: q.grade,
        difficulty: q.difficulty,
      };
    });

    const correctCount = results.filter(r => r.isCorrect).length;
    return {
      results,
      correctCount,
      totalCount: questions.length,
      accuracy: Math.round((correctCount / questions.length) * 100),
    };
  }

  return { compare, gradeAll, parseFraction };
})();
