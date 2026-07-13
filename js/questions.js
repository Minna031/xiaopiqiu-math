/**
 * 题目生成模块 - 按年级 + 难度（易/中/难）随机生成题目
 * 每次调用动态生成，不重复固定套题
 */
const Questions = (() => {

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  // 化简分数
  function simplifyFraction(num, den) {
    if (den === 0) return { num: 0, den: 1 };
    const g = gcd(Math.abs(num), Math.abs(den));
    let n = num / g, d = den / g;
    if (d < 0) { n = -n; d = -d; }
    return { num: n, den: d };
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
  }

  function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
  }

  // 将分数格式化为显示字符串
  function fractionStr(num, den) {
    const s = simplifyFraction(num, den);
    if (s.den === 1) return `${s.num}`;
    return `${s.num}/${s.den}`;
  }

  // ==================== 一年级 ====================
  function grade1(difficulty) {
    let a, b, op, answer, question;
    if (difficulty === 'easy') {
      // 10以内加法、不进位
      a = randInt(0, 9); b = randInt(0, 9 - a);
      op = '+'; answer = a + b;
      question = `${a} + ${b} =`;
    } else if (difficulty === 'medium') {
      // 15以内加减混合
      op = pick(['+', '−']);
      if (op === '+') {
        a = randInt(0, 10); b = randInt(0, 15 - a);
        answer = a + b;
      } else {
        a = randInt(2, 15); b = randInt(0, a);
        answer = a - b;
      }
      question = `${a} ${op} ${b} =`;
    } else {
      // 20以内加减混合、含连续运算
      if (Math.random() < 0.6) {
        op = pick(['+', '−']);
        if (op === '+') {
          a = randInt(0, 12); b = randInt(0, 20 - a);
          answer = a + b;
        } else {
          a = randInt(2, 20); b = randInt(0, a);
          answer = a - b;
        }
        question = `${a} ${op} ${b} =`;
      } else {
        // 连续运算 a + b - c 或 a - b + c
        a = randInt(5, 20);
        b = randInt(1, 10);
        const c = randInt(1, 10);
        const op1 = pick(['+', '−']);
        const op2 = pick(['+', '−']);
        let val = a;
        val = op1 === '+' ? val + b : val - b;
        val = op2 === '+' ? val + c : val - c;
        answer = val;
        question = `${a} ${op1} ${b} ${op2} ${c} =`;
      }
    }
    return { question, correctAnswer: String(answer), answerType: 'integer' };
  }

  // ==================== 二年级 ====================
  function grade2(difficulty) {
    let a, b, op, answer, question;
    if (difficulty === 'easy') {
      // 50以内不进位加法、不退位减法
      op = pick(['+', '−']);
      if (op === '+') {
        a = randInt(10, 40); b = randInt(1, 9);
        // 确保不进位
        if ((a % 10) + b > 9) b = 9 - (a % 10);
        answer = a + b;
      } else {
        a = randInt(10, 50); b = randInt(1, a % 10 || 1);
        answer = a - b;
      }
      question = `${a} ${op} ${b} =`;
    } else if (difficulty === 'medium') {
      // 100以内进位加法、退位减法
      op = pick(['+', '−']);
      if (op === '+') {
        a = randInt(10, 80); b = randInt(10, 99 - a);
        answer = a + b;
      } else {
        a = randInt(20, 100); b = randInt(10, a);
        answer = a - b;
      }
      question = `${a} ${op} ${b} =`;
    } else {
      // 100以内加减混合、连续运算
      if (Math.random() < 0.5) {
        op = pick(['+', '−']);
        if (op === '+') {
          a = randInt(10, 80); b = randInt(10, 99 - a);
          answer = a + b;
        } else {
          a = randInt(20, 100); b = randInt(10, a);
          answer = a - b;
        }
        question = `${a} ${op} ${b} =`;
      } else {
        // 连续运算
        a = randInt(20, 60);
        b = randInt(5, 30);
        const c = randInt(5, 30);
        const op1 = pick(['+', '−']);
        const op2 = pick(['+', '−']);
        let val = a;
        val = op1 === '+' ? val + b : val - b;
        val = op2 === '+' ? val + c : val - c;
        if (val < 0 || val > 100) {
          // 重算
          return grade2(difficulty);
        }
        answer = val;
        question = `${a} ${op1} ${b} ${op2} ${c} =`;
      }
    }
    return { question, correctAnswer: String(answer), answerType: 'integer' };
  }

  // ==================== 三年级 ====================
  function grade3(difficulty) {
    let a, b, answer, question;
    if (difficulty === 'easy') {
      // 2-5的乘法表
      a = randInt(2, 5); b = randInt(2, 9);
      answer = a * b;
      question = `${a} × ${b} =`;
    } else if (difficulty === 'medium') {
      // 6-9的乘法表 或 单一除法
      if (Math.random() < 0.5) {
        a = randInt(6, 9); b = randInt(2, 9);
        answer = a * b;
        question = `${a} × ${b} =`;
      } else {
        b = randInt(2, 9);
        const quotient = randInt(2, 9);
        a = b * quotient;
        answer = quotient;
        question = `${a} ÷ ${b} =`;
      }
    } else {
      // 乘除混合、含余数除法
      if (Math.random() < 0.5) {
        a = randInt(2, 9); b = randInt(2, 9);
        answer = a * b;
        question = `${a} × ${b} =`;
      } else {
        // 含余数除法：显示为 "a ÷ b = 商 ... 余数"
        b = randInt(2, 9);
        const quotient = randInt(2, 9);
        const remainder = randInt(1, b - 1);
        a = b * quotient + remainder;
        answer = `${quotient}...${remainder}`;
        question = `${a} ÷ ${b} =`;
        return { question, correctAnswer: answer, answerType: 'remainder' };
      }
    }
    return { question, correctAnswer: String(answer), answerType: 'integer' };
  }

  // ==================== 四年级 ====================
  function grade4(difficulty) {
    let question, answer;
    if (difficulty === 'easy') {
      // 两数加减乘除混合（无括号）
      const a = randInt(2, 20);
      const b = randInt(2, 20);
      const ops = ['+', '−', '×', '÷'];
      const op = pick(ops);
      if (op === '+') { answer = a + b; question = `${a} + ${b} =`; }
      else if (op === '−') { const x = Math.max(a, b), y = Math.min(a, b); answer = x - y; question = `${x} − ${y} =`; }
      else if (op === '×') { answer = a * b; question = `${a} × ${b} =`; }
      else { answer = a; question = `${a * b} ÷ ${b} =`; }
    } else if (difficulty === 'medium') {
      // 含一组括号
      const a = randInt(2, 15);
      const b = randInt(2, 15);
      const c = randInt(2, 9);
      const templates = [
        { q: `(${a} + ${b}) × ${c}`, a: (a + b) * c },
        { q: `(${a} − ${Math.min(a-1,b)}) × ${c}`, a: (a - Math.min(a-1,b)) * c },
        { q: `${c} × (${a} + ${b})`, a: c * (a + b) },
        { q: `${a * c} ÷ (${b} + ${randInt(1,5)})`, a: null },
      ];
      const tpl = pick(templates.filter(t => t.a !== null && t.a > 0));
      if (tpl) {
        question = tpl.q; answer = tpl.a;
      } else {
        question = `(${a} + ${b}) × ${c}`;
        answer = (a + b) * c;
      }
    } else {
      // 含嵌套括号、多步运算
      const a = randInt(2, 12);
      const b = randInt(2, 12);
      const c = randInt(2, 8);
      const d = randInt(2, 8);
      const templates = [
        { q: `(${a} + ${b}) × (${c} + ${d})`, a: (a + b) * (c + d) },
        { q: `(${a} × ${b}) − (${c} × ${d})`, a: (a * b) - (c * d) },
        { q: `${a} × (${b} + ${c}) − ${d}`, a: a * (b + c) - d },
        { q: `(${a} + ${b}) × ${c} − ${d}`, a: (a + b) * c - d },
      ];
      const tpl = pick(templates.filter(t => t.a >= 0));
      if (tpl) {
        question = tpl.q; answer = tpl.a;
      } else {
        question = `(${a} + ${b}) × ${c}`;
        answer = (a + b) * c;
      }
    }
    return { question, correctAnswer: String(answer), answerType: 'integer' };
  }

  // ==================== 五年级 ====================
  function grade5(difficulty) {
    let question, answer;
    if (difficulty === 'easy') {
      // 一位小数加减法
      const a = randInt(1, 90) / 10;
      const b = randInt(1, 90) / 10;
      const op = pick(['+', '−']);
      if (op === '+') {
        answer = Math.round((a + b) * 10) / 10;
        question = `${a.toFixed(1)} + ${b.toFixed(1)} =`;
      } else {
        const x = Math.max(a, b), y = Math.min(a, b);
        answer = Math.round((x - y) * 10) / 10;
        question = `${x.toFixed(1)} − ${y.toFixed(1)} =`;
      }
    } else if (difficulty === 'medium') {
      // 小数乘除法
      if (Math.random() < 0.5) {
        const a = randInt(1, 20) / 10;
        const b = randInt(2, 9);
        answer = Math.round(a * b * 10) / 10;
        question = `${a.toFixed(1)} × ${b} =`;
      } else {
        const b = randInt(2, 9);
        const quotient = randInt(1, 20) / 10;
        const a = Math.round(b * quotient * 10) / 10;
        answer = Math.round(quotient * 10) / 10;
        question = `${a.toFixed(1)} ÷ ${b} =`;
      }
    } else {
      // 小数四则混合
      const a = randInt(1, 50) / 10;
      const b = randInt(1, 50) / 10;
      const c = randInt(2, 9);
      const templates = [
        { q: `${a.toFixed(1)} + ${b.toFixed(1)} × ${c}`, a: Math.round((a + b * c) * 10) / 10 },
        { q: `(${a.toFixed(1)} + ${b.toFixed(1)}) × ${c}`, a: Math.round((a + b) * c * 10) / 10 },
        { q: `${(a * c).toFixed(1)} ÷ ${c} + ${b.toFixed(1)}`, a: Math.round((a + b) * 10) / 10 },
      ];
      const tpl = pick(templates);
      question = tpl.q;
      answer = tpl.a;
    }
    return { question, correctAnswer: String(answer), answerType: 'decimal' };
  }

  // ==================== 六年级 ====================
  function grade6(difficulty) {
    let question, answer;
    if (difficulty === 'easy') {
      // 同分母分数加减
      const den = pick([2, 3, 4, 5, 6, 8, 10]);
      const a = randInt(1, den - 1);
      const b = randInt(1, den - 1);
      const op = pick(['+', '−']);
      if (op === '+') {
        if (a + b > den) return grade6(difficulty); // 重算
        answer = fractionStr(a + b, den);
        question = `${a}/${den} + ${b}/${den} =`;
      } else {
        const x = Math.max(a, b), y = Math.min(a, b);
        answer = fractionStr(x - y, den);
        question = `${x}/${den} − ${y}/${den} =`;
      }
    } else if (difficulty === 'medium') {
      // 异分母分数加减、分数乘法
      if (Math.random() < 0.6) {
        const den1 = pick([2, 3, 4, 5, 6]);
        const den2 = pick([2, 3, 4, 5, 6].filter(d => d !== den1));
        const num1 = randInt(1, den1 - 1);
        const num2 = randInt(1, den2 - 1);
        const commonDen = lcm(den1, den2);
        const newNum = num1 * (commonDen / den1) + num2 * (commonDen / den2);
        answer = fractionStr(newNum, commonDen);
        question = `${num1}/${den1} + ${num2}/${den2} =`;
      } else {
        // 分数乘法
        const den1 = pick([2, 3, 4, 5, 6]);
        const den2 = pick([2, 3, 4, 5, 6]);
        const num1 = randInt(1, den1 - 1);
        const num2 = randInt(1, den2 - 1);
        answer = fractionStr(num1 * num2, den1 * den2);
        question = `${num1}/${den1} × ${num2}/${den2} =`;
      }
    } else {
      // 分数四则混合、含带分数
      const den1 = pick([2, 3, 4, 5, 6]);
      const den2 = pick([2, 3, 4, 5, 6]);
      const num1 = randInt(1, den1 - 1);
      const num2 = randInt(1, den2 - 1);
      const op = pick(['+', '−', '×', '÷']);
      if (op === '+') {
        const commonDen = lcm(den1, den2);
        const newNum = num1 * (commonDen / den1) + num2 * (commonDen / den2);
        answer = fractionStr(newNum, commonDen);
        question = `${num1}/${den1} + ${num2}/${den2} =`;
      } else if (op === '−') {
        // 保证被减数大于减数
        const commonDen = lcm(den1, den2);
        const n1 = num1 * (commonDen / den1);
        const n2 = num2 * (commonDen / den2);
        if (n1 < n2) {
          answer = fractionStr(n2 - n1, commonDen);
          question = `${num2}/${den2} − ${num1}/${den1} =`;
        } else {
          answer = fractionStr(n1 - n2, commonDen);
          question = `${num1}/${den1} − ${num2}/${den2} =`;
        }
      } else if (op === '×') {
        answer = fractionStr(num1 * num2, den1 * den2);
        question = `${num1}/${den1} × ${num2}/${den2} =`;
      } else {
        // 除法：a/b ÷ c/d = a/b × d/c
        answer = fractionStr(num1 * den2, den1 * num2);
        question = `${num1}/${den1} ÷ ${num2}/${den2} =`;
      }
    }
    return { question, correctAnswer: answer, answerType: 'fraction' };
  }

  // ==================== 生成器入口 ====================
  function generateOne(grade, difficulty) {
    if (difficulty === 'random') {
      difficulty = pick(['easy', 'medium', 'hard']);
    }
    const generators = {
      1: grade1, 2: grade2, 3: grade3,
      4: grade4, 5: grade5, 6: grade6,
    };
    const gen = generators[grade] || grade1;
    return gen(difficulty);
  }

  function generateSet(grade, difficulty, count) {
    const questions = [];
    const seen = new Set();
    let attempts = 0;
    while (questions.length < count && attempts < count * 10) {
      const q = generateOne(grade, difficulty);
      if (!seen.has(q.question)) {
        seen.add(q.question);
        questions.push(q);
      }
      attempts++;
    }
    return questions;
  }

  function generateFromErrorBook(errorBook, count) {
    if (!errorBook || errorBook.length === 0) return [];
    const shuffled = [...errorBook].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    return selected.map(e => ({
      question: e.question,
      correctAnswer: e.correctAnswer,
      answerType: e.answerType || 'integer',
    }));
  }

  return {
    generateOne,
    generateSet,
    generateFromErrorBook,
  };
})();
