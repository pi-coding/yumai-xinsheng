/* ================================================================
   语脉新生 · 数据仓库层（服务端优先 + 本地兜底）
   ------------------------------------------------------------------
   页面只跟这一层打交道，不直接碰 wx.request，也不直接读 utils/data.js。
   每个方法都返回 Promise<{ data, source }>：
     source = 'server'  → 数据来自后端（server，同一套 API 与 Web 前端）
     source = 'local'   → 后端没起来 / 断网，回退到小程序内置数据
   页面据 source 在界面上如实标注「离线数据」，不把本地兜底当在线结果汇报。
   ================================================================ */
const api = require('./api.js');
const store = require('./store.js');
const config = require('./config.js');
const engine = require('./engine.js');
const rel = require('./bookrelate.js');
const verdict = require('./verdict.js');

const OFFLINE = { code: -1, offline: true, msg: '后端未连接' };

/* 把「服务端成功 → server；失败 → 本地」这套流程收敛成一个函数。
   fallback 允许返回 Promise（改编的多级兜底就靠它）。 */
function tryServer(fn, fallback){
  return fn()
    .then(function(data){ return { data: data, source: 'server' }; })
    .catch(function(err){
      // 401 不兜底：那是「没登录」，不是「没网络」，页面要引导去登录
      if (err && err.code === 401) throw err;
      return Promise.resolve()
        .then(function(){ return fallback(); })
        .then(function(data){ return { data: data, source: 'local', error: err || OFFLINE }; });
    });
}

/* ---------------- 书库 ---------------- */
function localBooks(kw, bu, size){
  const k = String(kw || '').trim().toLowerCase();
  const b = bu && bu !== '全部' ? bu : '';
  const rows = engine.BOOKS.filter(function(x){
    const okBu = !b || x.bu === b;
    const okKw = !k || [x.name, x.author, x.era, x.intro, x.bu].join(' ').toLowerCase().indexOf(k) >= 0;
    return okBu && okKw;
  });
  return rows.slice(0, size || 60).map(function(x){
    return { name: x.name, bu: x.bu, era: x.era, author: x.author, intro: x.intro, quoteCount: 0 };
  });
}

function books(opt){
  opt = opt || {};
  const kw = opt.kw || '';
  const bu = opt.bu && opt.bu !== '全部' ? opt.bu : '';
  const size = opt.size || 60;
  return tryServer(
    function(){ return api.get('/api/books', { kw: kw, bu: bu, page: 1, size: size }); },
    function(){ return { list: localBooks(kw, bu, size), total: localBooks(kw, bu, size).length, poolSize: engine.BOOKS.length }; }
  ).then(function(r){
    // 服务端与本地都归一到同一形状，页面不用分支
    const d = r.data || {};
    const list = d.list || [];
    return {
      source: r.source,
      data: {
        list: list.map(function(x){
          return {
            name: x.name, bu: x.bu, era: x.era, author: x.author, intro: x.intro,
            quoteCount: x.quoteCount || 0,
            c1: x.color1 || '', c2: x.color2 || ''
          };
        }),
        total: d.total || list.length,
        poolSize: d.poolSize || engine.BOOKS.length,
        bus: d.bus || null
      }
    };
  });
}

/* 详情：服务端 13 个字段与本地 relate() 结构对齐，这里统一成页面认识的键名。
   注意两边的形状差异：服务端是扁平的书目对象，本地 relate() 返回的是
   { book:{书名/部类/朝代/作者/简介}, note, quotes, pairs, ... } —— 元数据要取 d.book。 */
function book(name){
  return tryServer(
    function(){ return api.get('/api/books/' + encodeURIComponent(name)); },
    function(){ return rel.relate(name); }
  ).then(function(r){
    const raw = r.data;
    if (!raw) throw { code: 404, msg: '未找到该古籍' };
    const isServer = r.source === 'server';
    const meta = isServer ? raw : (raw.book || {});
    const out = {
      name: meta.name, bu: meta.bu, era: meta.era, author: meta.author, intro: meta.intro,
      note: raw.note || '',
      alias: raw.alias || [],
      quotes: raw.quotes || [],
      buIntro: raw.buIntro || '',
      pairs: (isServer ? raw.relatedPairs : raw.pairs) || [],
      buPairs: raw.buPairs || [],
      authorPairs: raw.authorPairs || [],
      calendar: (isServer ? raw.relatedCalendar : raw.calendar) || [],
      sameBu: raw.sameBu || [],
      pairCount: isServer ? (raw.relatedPairCount || 0) : (raw.pairCount || 0),
      calendarCount: isServer ? (raw.relatedCalendarCount || 0) : (raw.calendarCount || 0),
      quoteCount: raw.quoteCount || 0,
      honest: raw.honest || ''
    };
    return { data: out, source: r.source };
  });
}

/* ---------------- 科普日历 ---------------- */
function calendar(){
  return tryServer(
    function(){ return api.get('/api/calendar'); },
    function(){
      return {
        date: store.fmtDate(Date.now()),
        poolSize: engine.CAL.length,
        list: engine.CAL,
        today: null,
        rule: '本地内置 16 条词条，按「日序 % 词条数」排期。'
      };
    }
  ).then(function(r){
    const d = r.data || {};
    const list = d.list || engine.CAL;
    return {
      source: r.source,
      data: { list: list, today: d.today || null, poolSize: d.poolSize || list.length, rule: d.rule || '' }
    };
  });
}

/* ---------------- 溯源核验 ---------------- */
function normalizeVerify(r){
  // 服务端 non_null 会把 null 的 credibility 省掉，这里补回 null，页面判定才与本地一致
  if (r && r.overall && r.overall.credibility === undefined) r.overall.credibility = null;
  if (r && r.segments) {
    r.segments.forEach(function(s){
      if (s.verdict && s.verdict.credibility === undefined) s.verdict.credibility = null;
    });
  }
  return r;
}

function verify(text){
  return tryServer(
    function(){ return api.post('/api/verify', { text: text }); },
    function(){ return verdict.verify(text); }
  ).then(function(r){
    const d = normalizeVerify(r.data || {});
    if (d.error) throw { code: 400, msg: d.error };
    return { data: d, source: r.source };
  });
}

function verifyMeta(){
  return tryServer(
    function(){ return api.get('/api/verify/meta'); },
    function(){
      const lv = verdict.levels();
      return {
        casesTotal: verdict.casesTotal,
        verifiedTotal: verdict.verifiedTotal,
        indexSize: verdict.indexSize,
        levels: lv
      };
    }
  ).then(function(r){
    const d = r.data || {};
    return {
      source: r.source,
      data: {
        casesTotal: d.casesTotal || 0,
        verifiedTotal: d.verifiedTotal || 0,
        indexSize: d.indexSize || 0,
        levels: d.levels || {}
      }
    };
  });
}

function verifyCases(kw, level){
  return tryServer(
    function(){ return api.get('/api/verify/cases', { kw: kw || '', level: level || '', page: 1, size: 50 }); },
    function(){ return { list: verdict.cases(kw || '', level || '') }; }
  ).then(function(r){
    const d = r.data || {};
    return { source: r.source, data: { list: d.list || [], total: d.total || (d.list || []).length } };
  });
}

/* ---------------- 改编 ---------------- */
/* 三级优先：后端 AdaptService（与 H5 逐条一致 + Redis 缓存）→ 用户自配大模型 API → 本地规则引擎 */
function adapt(text, mode, ctx, tone, form){
  const localAdapt = function(){
    const cfg = store.get('llm', { engine: 'local', base: '', key: '', model: '' });
    if (cfg.engine === 'api' && cfg.base){
      return engine.apiAdapt(cfg, text, mode, ctx, tone, form)
        .then(function(r){
          return { output: r.output, source: r.source || '', notes: r.notes || [] };
        })
        .catch(function(err){
          const r = engine.localAdapt(text, mode, ctx, tone, form);
          r.notes.unshift('大模型 API 不可用（' + ((err && err.message) || err) + '），已回退本地规则引擎');
          return { output: r.output, source: r.source, notes: r.notes || [] };
        });
    }
    const r = engine.localAdapt(text, mode, ctx, tone, form);
    return Promise.resolve({ output: r.output, source: r.source, notes: r.notes || [] });
  };

  return tryServer(
    function(){ return api.post('/api/adapt', { text: text, mode: mode, context: ctx, tone: tone, form: form }); },
    localAdapt
  ).then(function(r){
    const d = r.data || {};
    return {
      source: r.source,
      data: {
        output: d.output || '',
        source: d.source || '',
        notes: d.notes || [],
        traces: d.traces || [],
        params: { mode: d.mode || mode, context: d.context || ctx, tone: d.tone || tone, form: d.form || form }
      }
    };
  });
}

/* 服务端改编历史（需登录）；未登录或离线时退回本地历史 */
function adaptHistory(n){
  return tryServer(
    function(){ return api.get('/api/adapt/history', { n: n || 10 }); },
    function(){
      return store.get('history', []).slice(0, n || 10).map(function(h){
        return { input: h.in, output: h.out, mode: h.mode, at: h.at };
      });
    }
  );
}

/* ---------------- 古籍收藏（书目级） ---------------- */
function favNames(){
  return tryServer(
    function(){ return api.get('/api/book-favorites'); },
    function(){ return { names: store.get('favBooks', []) }; }
  ).then(function(r){
    const d = r.data || {};
    const names = d.names || [];
    // 服务端有数据就顺手同步到本地，断网时书架仍然完整
    if (r.source === 'server') store.set('favBooks', names);
    return { source: r.source, data: { names: names, total: d.total || names.length } };
  });
}

function toggleFav(name){
  return tryServer(
    function(){ return api.post('/api/book-favorites/' + encodeURIComponent(name), {}); },
    function(){
      const fav = store.get('favBooks', []);
      const i = fav.indexOf(name);
      if (i >= 0) fav.splice(i, 1); else fav.push(name);
      store.set('favBooks', fav);
      return { bookName: name, favorited: i < 0, count: fav.length };
    }
  ).then(function(r){
    // 服务端成功时也要把本地书架对齐，保证离线时看到的是同一份
    if (r.source === 'server') {
      const fav = store.get('favBooks', []);
      const i = fav.indexOf(name);
      if (r.data.favorited && i < 0) { fav.push(name); store.set('favBooks', fav); }
      if (!r.data.favorited && i >= 0) { fav.splice(i, 1); store.set('favBooks', fav); }
    }
    return r;
  });
}

/* 登录后把本地书架推到服务端（只加不删），避免换设备丢收藏 */
function mergeFav(){
  const local = store.get('favBooks', []);
  if (!local.length || !api.loggedIn()) return Promise.resolve({ source: 'skip', data: { added: 0 } });
  return api.post('/api/book-favorites/merge', { names: local })
    .then(function(d){ return { source: 'server', data: d }; })
    .catch(function(){ return { source: 'local', data: { added: 0 } }; });
}

module.exports = {
  books: books,
  book: book,
  calendar: calendar,
  verify: verify,
  verifyMeta: verifyMeta,
  verifyCases: verifyCases,
  adapt: adapt,
  adaptHistory: adaptHistory,
  favNames: favNames,
  toggleFav: toggleFav,
  mergeFav: mergeFav,
  config: config
};
