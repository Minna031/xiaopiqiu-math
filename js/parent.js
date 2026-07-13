/**
 * 家长控制模块 - 密码、设置、报告、数据导出
 */
const Parent = (() => {
  let isAuthenticated = false;

  // ---- 密码验证 ----
  function verify(inputPassword) {
    const stored = Storage.getPassword();
    isAuthenticated = (inputPassword === stored);
    return isAuthenticated;
  }

  function changePassword(oldPass, newPass) {
    if (Storage.getPassword() !== oldPass) return false;
    Storage.setPassword(newPass);
    return true;
  }

  function logout() {
    isAuthenticated = false;
  }

  function isAuth() {
    return isAuthenticated;
  }

  // ---- 渲染设置面板 ----
  function renderSettings(container) {
    const settings = Storage.getSettings();
    container.innerHTML = `
      <div class="parent-settings">
        <h3>练习设置</h3>
        <div class="setting-group">
          <label>年级</label>
          <div class="setting-options" id="setting-grade">
            ${[1,2,3,4,5,6].map(g => `
              <button class="opt-btn ${settings.grade === g ? 'active' : ''}" data-value="${g}">
                ${g}年级
              </button>
            `).join('')}
          </div>
        </div>
        <div class="setting-group">
          <label>难度</label>
          <div class="setting-options" id="setting-difficulty">
            ${[['easy','易'],['medium','中'],['hard','难'],['random','随机']].map(([v,l]) => `
              <button class="opt-btn ${settings.difficulty === v ? 'active' : ''}" data-value="${v}">
                ${l}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="setting-group">
          <label>题量</label>
          <div class="setting-options" id="setting-count">
            ${[5,10,15,20,30].map(n => `
              <button class="opt-btn ${settings.questionCount === n ? 'active' : ''}" data-value="${n}">
                ${n}题
              </button>
            `).join('')}
          </div>
        </div>
        <div class="setting-group">
          <label>限时</label>
          <div class="setting-options" id="setting-time">
            ${[3,5,8,10,15].map(n => `
              <button class="opt-btn ${settings.timeLimit === n ? 'active' : ''}" data-value="${n}">
                ${n}分钟
              </button>
            `).join('')}
          </div>
        </div>
        <div class="setting-group">
          <label>修改密码</label>
          <div class="password-change">
            <input type="password" id="old-password" placeholder="当前密码" maxlength="6">
            <input type="password" id="new-password" placeholder="新密码" maxlength="6">
            <button class="btn-small" id="change-password-btn">修改</button>
          </div>
        </div>
      </div>
    `;
    bindSettingsEvents(container);
  }

  function bindSettingsEvents(container) {
    // 年级选择
    container.querySelectorAll('#setting-grade .opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#setting-grade .opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Storage.saveSettings({ grade: parseInt(btn.dataset.value) });
      });
    });
    // 难度选择
    container.querySelectorAll('#setting-difficulty .opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#setting-difficulty .opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Storage.saveSettings({ difficulty: btn.dataset.value });
      });
    });
    // 题量
    container.querySelectorAll('#setting-count .opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#setting-count .opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Storage.saveSettings({ questionCount: parseInt(btn.dataset.value) });
      });
    });
    // 限时
    container.querySelectorAll('#setting-time .opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#setting-time .opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Storage.saveSettings({ timeLimit: parseInt(btn.dataset.value) });
      });
    });
    // 修改密码
    const changeBtn = container.querySelector('#change-password-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        const oldP = container.querySelector('#old-password').value;
        const newP = container.querySelector('#new-password').value;
        if (!newP || newP.length < 4) {
          alert('新密码至少4位');
          return;
        }
        if (changePassword(oldP, newP)) {
          alert('密码修改成功');
          container.querySelector('#old-password').value = '';
          container.querySelector('#new-password').value = '';
        } else {
          alert('当前密码错误');
        }
      });
    }
  }

  // ---- 渲染学习报告 ----
  function renderReport(container) {
    const history = Storage.getHistory();
    const errorStats = ErrorBook.getStats();

    const totalSessions = history.length;
    const totalQuestions = history.reduce((sum, h) => sum + (h.totalCount || 0), 0);
    const avgAccuracy = totalSessions > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.accuracy || 0), 0) / totalSessions)
      : 0;
    const avgTime = totalSessions > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.elapsed || 0), 0) / totalSessions)
      : 0;

    container.innerHTML = `
      <div class="parent-report">
        <h3>学习报告</h3>
        <div class="report-overview">
          <div class="stat-card">
            <div class="stat-value">${totalSessions}</div>
            <div class="stat-label">练习次数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${avgAccuracy}%</div>
            <div class="stat-label">平均正确率</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalQuestions}</div>
            <div class="stat-label">总答题数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Timer.formatTime(avgTime)}</div>
            <div class="stat-label">平均用时</div>
          </div>
        </div>

        <h4>最近5次练习</h4>
        <div class="recent-list">
          ${history.length === 0 ? '<div class="empty-state">暂无练习记录</div>' :
            history.slice(0, 5).map(h => `
              <div class="recent-item">
                <span class="recent-date">${new Date(h.timestamp).toLocaleDateString('zh-CN')}</span>
                <span class="recent-info">${h.grade}年级 · ${h.totalCount}题</span>
                <span class="recent-score ${h.accuracy >= 80 ? 'good' : h.accuracy >= 60 ? 'mid' : 'bad'}">
                  ${h.correctCount}/${h.totalCount} (${h.accuracy}%)
                </span>
                <span class="recent-time">用时 ${Timer.formatTime(h.elapsed || 0)}</span>
              </div>
            `).join('')
          }
        </div>

        <h4>高频错题 TOP 5</h4>
        <div class="top-errors">
          ${errorStats.topErrors.length === 0 ? '<div class="empty-state">暂无错题</div>' :
            errorStats.topErrors.slice(0, 5).map(e => `
              <div class="top-error-item">
                <span class="top-error-q">${e.question}</span>
                <span class="top-error-a">答案: ${e.correctAnswer}</span>
                <span class="top-error-c">错 ${e.errorCount} 次</span>
              </div>
            `).join('')
          }
        </div>

        <h4>进步曲线</h4>
        <div class="chart-container">
          <canvas id="progress-chart" width="600" height="200"></canvas>
        </div>

        <div class="report-actions">
          <button class="btn-action" id="export-csv-btn">导出 CSV</button>
        </div>
      </div>
    `;

    drawChart(history.slice(0, 20).reverse());
    bindReportEvents(container);
  }

  function drawChart(historySlice) {
    const canvasEl = document.getElementById('progress-chart');
    if (!canvasEl || historySlice.length === 0) return;
    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;
    const pad = { top: 30, right: 20, bottom: 30, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, W, H);

    // 坐标轴
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, H - pad.bottom);
    ctx.lineTo(W - pad.right, H - pad.bottom);
    ctx.stroke();

    // Y轴标签
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH * (1 - i / 4);
      ctx.fillText(`${i * 25}%`, pad.left - 8, y + 4);
      ctx.strokeStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }

    if (historySlice.length < 2) return;

    const step = plotW / (historySlice.length - 1);

    // 正确率折线
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    historySlice.forEach((h, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH * (1 - (h.accuracy || 0) / 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 数据点
    ctx.fillStyle = '#4CAF50';
    historySlice.forEach((h, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH * (1 - (h.accuracy || 0) / 100);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 图例
    ctx.fillStyle = '#4CAF50';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('● 正确率', pad.left, pad.top - 10);
  }

  function bindReportEvents(container) {
    const exportBtn = container.querySelector('#export-csv-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCSV);
    }
  }

  // ---- CSV导出 ----
  function exportCSV() {
    const history = Storage.getHistory();
    if (history.length === 0) {
      alert('暂无练习记录');
      return;
    }

    let csv = '\uFEFF日期,年级,难度,题量,正确数,正确率,用时(秒)\n';
    history.forEach(h => {
      const date = new Date(h.timestamp).toLocaleString('zh-CN');
      csv += `${date},${h.grade},${h.difficulty || ''},${h.totalCount},${h.correctCount},${h.accuracy}%,${h.elapsed || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `口算练习记录_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { verify, changePassword, logout, isAuth, renderSettings, renderReport, exportCSV };
})();
