/* ================================================================
   语脉新生 · 小程序端运行配置
   ------------------------------------------------------------------
   后端默认跑在本机 8081（server）。真机调试时把 base 换成局域网 IP，
   并在微信公众平台把该域名加入 request 合法域名；开发者工具里 urlCheck 已关，可直接用 localhost。
   ================================================================ */
const store = require('./store.js');

const DEFAULT_BASE = 'http://localhost:8081';

/* 本地兜底超时：接口连不上就尽快回退，不让用户干等 */
const TIMEOUT = 6000;

function base(){
  const custom = store.get('serverBase', '');
  const b = (custom || DEFAULT_BASE).replace(/\/+$/, '');
  return b;
}

function setBase(url){
  const v = String(url || '').trim().replace(/\/+$/, '');
  if (v) store.set('serverBase', v);
  else store.del('serverBase');
}

/* 存储键集中在此，避免各页面散落字符串 */
const K = {
  token: 'token',
  refresh: 'refresh',
  user: 'user',
  favBooks: 'favBooks',
  works: 'works',
  history: 'history'
};

module.exports = { DEFAULT_BASE: DEFAULT_BASE, TIMEOUT: TIMEOUT, base: base, setBase: setBase, K: K };
