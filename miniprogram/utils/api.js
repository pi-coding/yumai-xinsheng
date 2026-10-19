/* ================================================================
   语脉新生 · 小程序端接口层
   ------------------------------------------------------------------
   与 Web 前端 / server 共用同一套后端（默认 http://localhost:8081）。
   职责：
     · wx.request 的 Promise 封装，统一解包 ApiResult{code,msg,data}
     · 携带 Bearer Token；遇到 401 自动用 refreshToken 续一次并重放原请求
     · 网络不可达时置「离线」标记（20 秒内不再重试，避免每页都卡 6 秒）
   约定：后端未登录/无权限返回 HTTP 200 + body{code:401}，所以判定一律看 body.code。
   ================================================================ */
const store = require('./store.js');
const config = require('./config.js');
const K = config.K;

/* ---------------- 令牌 ---------------- */
function token(){ return store.get(K.token, ''); }
function refreshToken(){ return store.get(K.refresh, ''); }
function user(){ return store.get(K.user, null); }
function loggedIn(){ return !!token(); }

function saveSession(data){
  if (!data) return;
  if (data.token) store.set(K.token, data.token);
  if (data.refreshToken) store.set(K.refresh, data.refreshToken);
  if (data.user) store.set(K.user, data.user);
}
function clearSession(){
  store.del(K.token); store.del(K.refresh); store.del(K.user);
}

/* ---------------- 在线状态 ---------------- */
const OFFLINE_COOLDOWN = 20000;
let offlineUntil = 0;

function markOffline(){ offlineUntil = Date.now() + OFFLINE_COOLDOWN; }
function markedOffline(){ return Date.now() < offlineUntil; }

/* 主动探测：/api/health 不需要登录，用来点亮首页的「已连接」状态 */
function probe(){
  return new Promise(function(resolve){
    wx.request({
      url: config.base() + '/api/health',
      method: 'GET',
      timeout: 2500,
      success: function(res){
        const ok = res.statusCode === 200 && res.data && res.data.code === 0;
        if (ok) offlineUntil = 0;
        resolve(ok);
      },
      fail: function(){ markOffline(); resolve(false); }
    });
  });
}

/* ---------------- 基础请求 ---------------- */
function raw(method, path, data, opt){
  opt = opt || {};
  return new Promise(function(resolve, reject){
    wx.request({
      url: config.base() + path,
      method: method,
      data: data || {},
      timeout: opt.timeout || config.TIMEOUT,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token() ? 'Bearer ' + token() : ''
      },
      success: function(res){
        const body = res.data;
        if (!body || typeof body !== 'object'){
          reject({ code: -1, msg: '响应格式异常（HTTP ' + res.statusCode + '）' });
          return;
        }
        if (body.code === 0){ resolve(body.data); return; }
        if (body.code === 401 && !opt._retried){ reject({ code: 401, msg: body.msg || '请先登录', needLogin: true }); return; }
        reject({ code: body.code, msg: body.msg || '请求失败' });
      },
      fail: function(e){
        markOffline();
        reject({ code: -1, offline: true, msg: (e && e.errMsg) || '网络不可用' });
      }
    });
  });
}

/* 401 时续期并重放一次 */
function withRefresh(method, path, data, opt){
  return raw(method, path, data, opt).catch(function(err){
    if (!err || err.code !== 401 || !refreshToken() || (opt && opt._retried)) throw err;
    return refreshAccess().then(function(){
      return raw(method, path, data, Object.assign({}, opt, { _retried: true }));
    });
  });
}

function refreshAccess(){
  return raw('POST', '/api/auth/refresh', { refreshToken: refreshToken() })
    .then(function(d){ store.set(K.token, d.token); return d; })
    .catch(function(err){ clearSession(); throw err; });
}

function get(path, params){
  const qs = params ? '?' + Object.keys(params)
    .filter(function(k){ return params[k] !== '' && params[k] !== null && params[k] !== undefined; })
    .map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&') : '';
  return withRefresh('GET', path + qs, null);
}
function post(path, data){ return withRefresh('POST', path, data || {}); }

/* ---------------- 账号 ---------------- */
function login(username, password){
  return raw('POST', '/api/auth/login', { username: username, password: password })
    .then(function(d){ saveSession(d); return d.user; });
}
function register(username, password, nickname){
  return raw('POST', '/api/auth/register', { username: username, password: password, nickname: nickname })
    .then(function(d){ saveSession(d); return d.user; });
}
function logout(){
  const done = function(){ clearSession(); };
  return raw('POST', '/api/auth/logout', {}).then(done).catch(done);
}
function me(){ return get('/api/auth/me'); }

module.exports = {
  token: token, loggedIn: loggedIn, user: user,
  probe: probe, markedOffline: markedOffline, markOffline: markOffline,
  get: get, post: post,
  login: login, register: register, logout: logout, me: me,
  clearSession: clearSession
};
