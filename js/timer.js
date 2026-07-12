/**
 * 计时器模块 - 倒计时和正计时支持
 */
const Timer = (() => {
  let timerId = null;
  let remaining = 0;       // 秒
  let totalSeconds = 0;    // 总秒数
  let onTick = null;
  let onExpire = null;
  let mode = 'countdown';  // countdown 或 countup

  function formatTime(seconds) {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.abs(seconds) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function start(minutes, tickCb, expireCb) {
    stop();
    mode = 'countdown';
    totalSeconds = minutes * 60;
    remaining = totalSeconds;
    onTick = tickCb;
    onExpire = expireCb;
    if (onTick) onTick(formatTime(remaining), remaining);
    timerId = setInterval(() => {
      remaining--;
      if (onTick) onTick(formatTime(remaining), remaining);
      if (remaining <= 0) {
        stop();
        if (onExpire) onExpire();
      }
    }, 1000);
  }

  function startCountUp(tickCb) {
    stop();
    mode = 'countup';
    remaining = 0;
    totalSeconds = 0;
    onTick = tickCb;
    onExpire = null;
    if (onTick) onTick(formatTime(0), 0);
    timerId = setInterval(() => {
      remaining++;
      totalSeconds++;
      if (onTick) onTick(formatTime(remaining), remaining);
    }, 1000);
  }

  function stop() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function getElapsed() {
    if (mode === 'countdown') {
      return totalSeconds - remaining;
    }
    return remaining;
  }

  function getRemaining() {
    return remaining;
  }

  function isRunning() {
    return timerId !== null;
  }

  return { start, startCountUp, stop, getElapsed, getRemaining, isRunning, formatTime };
})();
