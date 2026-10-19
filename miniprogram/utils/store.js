/* ================================================================
   语脉新生 · 本地存储与通用工具
   localStorage → wx.getStorageSync / wx.setStorageSync
   键名沿用原实现的 ymxs_ 前缀，便于与原 H5 版对照
   ================================================================ */
const PREFIX = 'ymxs_';

function get(k, d){
  try {
    const v = wx.getStorageSync(PREFIX + k);
    if (v === '' || v === null || v === undefined) return d;
    return JSON.parse(v);
  } catch (e){ return d; }
}
function set(k, v){
  try { wx.setStorageSync(PREFIX + k, JSON.stringify(v)); } catch (e){}
}
function del(k){
  try { wx.removeStorageSync(PREFIX + k); } catch (e){}
}

/* 连续使用天数：与原实现同一算法 */
function trackStreak(){
  const d = new Date();
  const today = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  let s = get('streak', { day: '', n: 0 });
  if (s.day !== today){
    const y = new Date(Date.now() - 86400000);
    const ymd = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate());
    s = { day: today, n: (s.day === ymd ? (s.n || 0) + 1 : 1) };
    set('streak', s);
  }
  return s.n || 1;
}

function pad2(n){ return n < 10 ? '0' + n : '' + n; }

function fmtDate(ts){
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fmtTime(ts){
  const d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function fmtDateTime(ts){
  return fmtDate(ts) + ' ' + fmtTime(ts);
}

function toast(msg){ wx.showToast({ title: msg, icon: 'none' }); }

module.exports = {
  get: get, set: set, del: del,
  trackStreak: trackStreak,
  fmtDate: fmtDate, fmtTime: fmtTime, fmtDateTime: fmtDateTime,
  pad2: pad2, toast: toast
};
