/* 语脉新生小程序 · 运行时冒烟测试
   mock wx / Page / getApp，逐个页面走一遍生命周期与关键交互，
   捕获运行时异常并断言渲染数据的形状与数量。

   全栈版起页面数据先走后端（utils/repo.js → utils/api.js → wx.request），
   因此这里必须按异步跑：每一步之后 await settle() 让 Promise 链走完。
   两个通道都要验：
     · 离线通道 —— wx.request 一律 fail，页面应回退内置数据并标 src='local'
     · 服务端通道 —— 注入若干路由的成功响应，页面应用服务端数据并标 src='server'
*/
const fs = require('fs');
const path = require('path');

/* 定位工程：先找顶层「miniprogram」，找不到再回退旧位置「小程序复现/微信小程序」 */
function findUpAny(start, candidates, marker) {
  let d = start;
  for (let i = 0; i < 10; i++) {
    for (const sub of candidates) {
      const cand = path.join(d, sub);
      if (fs.existsSync(path.join(cand, marker))) return cand;
    }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('未能从 ' + start + ' 向上找到 ' + candidates.join(' 或 ') + ' / ' + marker);
}
const MP = findUpAny(__dirname, [
  'miniprogram',
  path.join('小程序复现', '微信小程序')
], 'app.json');

const store = {};                       // 内存版 Storage
const calls = [];                       // 记录 API 调用

/* mockRoutes = null → 一律失败（离线通道）
   mockRoutes = { '/api/books': {...} } → 命中即返回成功（服务端通道） */
let mockRoutes = null;

global.wx = {
  getStorageSync: function(k){ return store[k] === undefined ? '' : store[k]; },
  setStorageSync: function(k, v){ store[k] = v; },
  removeStorageSync: function(k){ delete store[k]; },
  showToast: function(o){ calls.push(['toast', o.title]); },
  showModal: function(o){ calls.push(['modal', o.title]); if (o.success) o.success({ confirm: true }); },
  showLoading: function(){}, hideLoading: function(){},
  navigateTo: function(o){ calls.push(['navigateTo', o.url]); },
  switchTab: function(o){ calls.push(['switchTab', o.url]); },
  navigateBack: function(o){ calls.push(['navigateBack', (o && o.url) || '']); if (o && o.fail) { /* 有页面栈时可成功 */ } },
  setNavigationBarTitle: function(o){ calls.push(['title', o.title]); },
  setClipboardData: function(o){ calls.push(['clipboard', o.data]); if (o.success) o.success(); },
  pageScrollTo: function(o){ calls.push(['scroll', o.scrollTop]); },
  request: function(o){
    const p = String(o.url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (mockRoutes && Object.prototype.hasOwnProperty.call(mockRoutes, p)) {
      const v = mockRoutes[p];
      const data = typeof v === 'function' ? v(o) : v;
      o.success({ statusCode: 200, data: { code: 0, msg: 'ok', data: data } });
      return;
    }
    o.fail({ errMsg: 'mock: 未配置合法域名（' + p + '）' });
  }
};

let appCfg = null;
global.App = function(o){ appCfg = o; };
global.getApp = function(){ return appCfg; };

const loaded = {};
global.Page = function(){};

function load(file){
  delete require.cache[require.resolve(file)];
  global.Page = function(o){
    const inst = {};
    Object.keys(o).forEach(function(k){ inst[k] = o[k]; });
    inst.data = JSON.parse(JSON.stringify(o.data || {}));
    inst.setData = function(patch){ Object.keys(patch).forEach(function(k){ inst.data[k] = patch[k]; }); };
    loaded[file] = inst;
  };
  require(file);
  return loaded[file];
}

/* 冲洗异步：走两个宏任务，确保所有微任务（Promise 链）都走完再断言。
   mock 的 success/fail 是同步调用的，所以不需要真的等待网络。 */
function settle(){
  return new Promise(function(r){ setTimeout(r, 0); })
    .then(function(){ return new Promise(function(r){ setTimeout(r, 0); }); });
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

const steps = [];
const pass = [];
const errors = [];
function step(name, fn){ steps.push([name, fn]); }

const ev = function(dataset){ return { currentTarget: { dataset: dataset || {} } }; };
const inp = function(value){ return { detail: { value: value } }; };

/* ---------- app.js ---------- */
step('app.onLaunch 连续天数写入 + 后端探测', async function(){
  require(path.join(MP, 'app.js'));
  appCfg.onLaunch();
  await settle();
  if (!appCfg.globalData.streak) throw new Error('streak 未初始化');
  if (appCfg.globalData.online !== false) throw new Error('离线时 online 应为 false');
});

/* ---------- home ---------- */
step('home 生命周期与快捷入口', async function(){
  const p = load(path.join(MP, 'pages/home/home.js'));
  p.onShow();
  await settle();
  if (p.data.stats.days < 1) throw new Error('连续天数异常');
  if (p.data.online !== false) throw new Error('首页未识别离线状态');
  if (p.data.quick.length !== 3) throw new Error('首页快捷入口应为 3 个，实际 ' + p.data.quick.length);
  p.onQuick(ev({ key: 'books' }));
  p.toBooks(); p.toWorkshop(); p.toSettings(); p.toCalendar();
  p.refresh();
});

/* ---------- books ---------- */
step('books 筛选/搜索/收藏/进详情（离线兜底）', async function(){
  const p = load(path.join(MP, 'pages/books/books.js'));
  p.onShow();
  await settle();
  if (p.data.src !== 'local') throw new Error('离线时 src 应为 local，实际 ' + p.data.src);
  if (p.data.list.length !== 60) throw new Error('初始应为 60 部，实际 ' + p.data.list.length);

  p.onTab(ev({ bu: '经部' }));
  await settle();
  if (p.data.list.length !== 15) throw new Error('经部应为 15 部，实际 ' + p.data.list.length);

  p.onTab(ev({ bu: '全部' }));
  await settle();
  p.onInput(inp('史记'));
  await wait(360);                       // onInput 有 300ms 防抖
  if (p.data.list.length !== 1) throw new Error('搜索「史记」应命中 1 部，实际 ' + p.data.list.length);

  p.onClear();
  await settle();
  p.toggleFav(ev({ name: '周易' }));
  await settle();
  if (!p.data.list.filter(function(x){ return x.name === '周易'; })[0].fav) throw new Error('收藏态未回写');

  p.onInput(inp('不存在的书名xyz'));
  await wait(360);
  if (p.data.list.length !== 0) throw new Error('空结果未生效');
  p.onReset();
  await settle();
  if (p.data.q !== '' || p.data.bu !== '全部') throw new Error('onReset 未复位筛选');
  if (p.data.list.length !== 60) throw new Error('复位后应为 60 部，实际 ' + p.data.list.length);
  p.openBook(ev({ name: '史记' }));
});

/* ---------- book ---------- */
async function detail(name){
  const p = load(path.join(MP, 'pages/book/book.js'));
  p.onLoad({ name: encodeURIComponent(name) });
  await settle();
  return p;
}

step('book 详情页加载与收藏切换（离线兜底）', async function(){
  const p = await detail('史记');
  if (!p.data.b || p.data.b.bu !== '史部') throw new Error('详情数据错误');
  if (!p.data.note) throw new Error('缺少要旨');
  if (p.data.quotes.length < 2) throw new Error('史记名句应不少于 2 条，实际 ' + p.data.quotes.length);
  if (!p.data.buIntro) throw new Error('缺少部类导读');
  if (p.data.src !== 'local') throw new Error('离线时详情页 src 应为 local');

  const before = p.data.fav;
  p.toggleFav();
  await settle();
  if (p.data.fav === before) throw new Error('收藏态未切换');
  p.toggleFav();
  await settle();
  p.toWorkshop();
  p.openBook(ev({ name: '诗经' }));

  // 没有直接语料引用的书：必须有同部类参考兜底，不能是空页
  const z = await detail('周易');
  if (z.data.pairCount !== 0) throw new Error('周易本无直接引用，实际 ' + z.data.pairCount);
  if (z.data.quotes.length !== 3) throw new Error('周易名句应为 3 条，实际 ' + z.data.quotes.length);
  if (!z.data.buPairs.length) throw new Error('周易缺少同部类参考语料');
  if (!z.data.sameBu.length) throw new Error('周易缺少同部荐读');
  if (!z.data.buIntro) throw new Error('周易缺少部类导读');
  z.quoteToWorkshop(ev({ text: z.data.quotes[0].text }));

  // 全量抽查：任何一部都不能出现「要旨/名句/关联/同类」全空
  const engine = require(path.join(MP, 'utils/engine.js'));
  for (const b of engine.BOOKS) {
    const q = await detail(b.name);
    if (!q.data.note) throw new Error('《' + b.name + '》缺少要旨');
    const hasAny = q.data.quoteCount || q.data.pairCount || q.data.buPairs.length
      || q.data.authorPairs.length || q.data.sameBu.length;
    if (!hasAny) throw new Error('《' + b.name + '》详情为空页');
  }

  // 不存在的书
  const q2 = await detail('没有这部书');
  if (!q2.data.missing) throw new Error('缺失古籍未标记');
});

/* ---------- verify 溯源核验 ---------- */
step('verify 判定口径与案例库（离线兜底）', async function(){
  const p = load(path.join(MP, 'pages/verify/verify.js'));
  p.onLoad({});
  await settle();
  if (p.data.casesTotal !== 43) throw new Error('误传案例应为 43，实际 ' + p.data.casesTotal);
  if (p.data.verifiedTotal !== 47) throw new Error('真典应为 47，实际 ' + p.data.verifiedTotal);
  if (p.data.indexSize < 500) throw new Error('索引过小：' + p.data.indexSize);
  if (p.data.list.length !== 43) throw new Error('案例首屏应为 43 条，实际 ' + p.data.list.length);
  // 等级档位：伪古风 24 / 出处讹变 12 / 出处存疑 7，合计 43 条
  const lvSum = p.data.levels.reduce(function(a, x){ return a + x.count; }, 0);
  if (lvSum !== 43) throw new Error('等级档位合计应为 43，实际 ' + lvSum);

  p.onSample(ev({ k: 'bad' }));
  await settle();
  if (!p.data.result || p.data.result.overall.name !== '伪古风') {
    throw new Error('伪古风判定失败：' + (p.data.result && p.data.result.overall.name));
  }
  if (p.data.result.overall.credibility !== 40) throw new Error('伪古风可信度应为 40，实际 ' + p.data.result.overall.credibility);
  const hit0 = p.data.result.segments[0].hits[0];
  if (!hit0.note || !hit0.advice || !hit0.check) throw new Error('命中条目缺少实际情况/建议/核验方式');

  p.onSample(ev({ k: 'mix' }));
  await settle();
  if (p.data.result.overall.name !== '真伪混杂') throw new Error('混杂判定失败：' + p.data.result.overall.name);
  if (p.data.result.segments.length !== 2) throw new Error('分段数应为 2，实际 ' + p.data.result.segments.length);

  p.onSample(ev({ k: 'ok' }));
  await settle();
  if (p.data.result.overall.name !== '有据可考') throw new Error('真句判定失败：' + p.data.result.overall.name);
  if (p.data.result.overall.credibility !== 100) throw new Error('真句可信度应为 100');

  p.onInput(inp('今天食堂的面煮得有点软'));
  p.run();
  await settle();
  if (p.data.result.overall.name !== '未收录') throw new Error('未收录判定失败');
  if (p.data.result.overall.hasCred) throw new Error('未收录不应出可信度分');

  p.onClear();
  if (p.data.result) throw new Error('清空未生效');

  p.onTab(ev({ t: 'cases' }));
  p.onLevel(ev({ v: '伪古风' }));
  await settle();
  if (p.data.list.length !== 24) throw new Error('伪古风案例应为 24 条，实际 ' + p.data.list.length);
  p.onKw(inp('沈复'));
  await settle();
  if (!p.data.list.length) throw new Error('关键词检索无结果');
  if (p.data.list[0].cls !== 'lv-bad') throw new Error('案例等级样式缺失');

  p.onLevelAll();
  await settle();
  if (p.data.level !== '' || p.data.list.length !== 43) throw new Error('onLevelAll 未复位');

  p.tryPhrase(ev({ phrase: '无人与我立黄昏，无人问我粥可温' }));
  await settle();
  if (p.data.result.overall.name !== '伪古风') throw new Error('案例反查失败');
  p.copyResult();
  p.onTab(ev({ t: 'check' }));
});

/* ---------- workshop ---------- */
step('workshop 改编 / 保存 / 历史复用 / 删除（离线兜底）', async function(){
  const p = load(path.join(MP, 'pages/workshop/workshop.js'));
  p.onShow();
  await settle();
  p.onMode(ev({ k: 'c2m' }));
  if (p.data.placeholder.indexOf('落霞') < 0) throw new Error('切换模式未更新提示语');
  p.onMode(ev({ k: 'm2c' }));
  p.onCtx(inp('1'));       // 职场
  p.onTone(inp('1'));      // 俏皮
  p.onForm(inp('2'));      // 网络改编
  p.onEg(ev({ v: '我emo了' }));
  if (!p.data.input) throw new Error('示例未填入');

  p.onAdapt();
  await settle();
  if (!p.data.hasOut || !p.data.out) throw new Error('未产出改编结果');
  if (p.data.notes.length < 2) throw new Error('规则说明过少：' + p.data.notes.length);
  if (p.data.out.indexOf('案牍之间') < 0) throw new Error('语境前缀未生效：' + p.data.out);
  if (p.data.out.indexOf('亦是快事') < 0) throw new Error('语气尾词未生效：' + p.data.out);
  if (p.data.out.indexOf('一片伤心画不成') < 0) throw new Error('语料对原句被改坏：' + p.data.out);
  if (p.data.src !== 'local') throw new Error('离线时改编应标 local，实际 ' + p.data.src);

  const firstOut = p.data.out;
  p.onSave();
  if (p.data.workCount !== 1) throw new Error('作品未入库');
  p.onSave();                                    // 重复保存应被拦截
  if (p.data.workCount !== 1) throw new Error('重复作品被写入');
  if (p.data.works[0].text !== firstOut) throw new Error('作品文本不一致');

  p.onUseHistory(ev({ v: '落霞与孤鹜齐飞，秋水共长天一色' }));
  if (p.data.input.indexOf('落霞') < 0) throw new Error('历史复用失败');
  p.onAdapt();
  await settle();
  p.renderLists();
  if (p.data.hisCount !== 2) throw new Error('历史条数应为 2，实际 ' + p.data.hisCount);
  p.onDelWork(ev({ i: 0 }));
  if (p.data.workCount !== 0) throw new Error('删除作品失败');
  p.toSettings();
});

/* ---------- fav ---------- */
step('fav 双页签与删除、复制（离线兜底）', async function(){
  const p = load(path.join(MP, 'pages/fav/fav.js'));
  p.onShow();
  await settle();
  if (p.data.bookCount !== 1) throw new Error('收藏古籍应为 1，实际 ' + p.data.bookCount);
  if (p.data.loggedIn !== false) throw new Error('未登录却标记为已登录');
  p.onTab(ev({ t: 'works' }));
  await settle();
  p.onTab(ev({ t: 'books' }));
  await settle();
  p.unfavBook(ev({ name: '周易' }));
  await settle();
  if (p.data.bookCount !== 0) throw new Error('取消收藏失败');
  p.openBook(ev({ name: '周易' }));              // 未收藏也可进详情
  p.copyWork(ev({ v: '测试文本' }));
  p.toBooks(); p.toWorkshop(); p.toSettings(); p.toLogin();
});

/* ---------- calendar ---------- */
step('calendar 翻日 / 检索 / 分类 / 跳词（离线兜底）', async function(){
  const p = load(path.join(MP, 'pages/calendar/calendar.js'));
  p.onLoad();
  await settle();
  if (!p.data.e || !p.data.e.word) throw new Error('今日词条为空');
  if (p.data.e.examples.length < 1) throw new Error('网络用例为空');
  if (p.data.src !== 'local') throw new Error('离线时日历 src 应为 local');

  const d0 = p.data.dateStr;
  p.prev(); if (p.data.dateStr === d0) throw new Error('前一天未生效');
  p.next(); if (p.data.dateStr !== d0) throw new Error('回到今天失败');
  if (p.data.cats.length < 5) throw new Error('分类过少：' + p.data.cats.length);
  p.onCat(ev({ c: '古风翻译体' }));
  if (!p.data.list.length) throw new Error('分类筛选无结果');
  if (!p.data.list.every(function(x){ return x.cat === '古风翻译体'; })) throw new Error('分类筛选串类');
  p.onCat(ev({ c: '全部' }));
  p.onInput(inp('快哉'));
  if (p.data.list.length < 1) throw new Error('检索「快哉」无结果');
  const target = p.data.list[0].word;
  p.onClear();
  p.onPickWord(ev({ w: target }));
  if (p.data.e.word !== target) throw new Error('跳转到指定词条失败：期望 ' + target + '，实际 ' + p.data.e.word);
  p.today();
  if (!p.data.isToday) throw new Error('回到今天后未标记');
  p.copyWord();

  // 日历取词稳定性 + 与服务端排期规则一致（epochDay % poolSize）
  const a = p.data.e.word;
  const q = load(path.join(MP, 'pages/calendar/calendar.js'));
  q.onLoad();
  await settle();
  if (q.data.e.word !== a) throw new Error('同日取词不稳定');
  const CAL = require(path.join(MP, 'utils/engine.js')).CAL;
  const now = new Date();
  const epoch = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  if (a !== CAL[epoch % CAL.length].word) throw new Error('本地排期规则与服务端不一致');
});

/* ---------- settings ---------- */
step('settings 账号/服务端/兜底引擎/清空/复制', async function(){
  const p = load(path.join(MP, 'pages/settings/settings.js'));
  p.onLoad();
  await settle();
  if (p.data.loggedIn !== false) throw new Error('未登录却显示已登录');
  if (p.data.engineMode !== 'local') throw new Error('默认引擎应为 local');
  if (p.data.corpus.pairs !== 118) throw new Error('语料对数量异常');
  if (p.data.online !== false) throw new Error('设置页未识别离线状态');

  // 服务端地址保存 / 恢复
  p.onBase(inp('http://127.0.0.1:9999'));
  p.saveBase();
  if (p.data.serverBase !== 'http://127.0.0.1:9999') throw new Error('后端地址未保存');
  p.resetBase();
  if (p.data.serverBase.indexOf('8081') < 0) throw new Error('恢复默认地址失败');

  p.onEngine(inp('api'));
  p.save();                                      // 未填地址应被拦截
  if (JSON.parse(store['ymxs_llm'] || '{}').engine === 'api') throw new Error('空地址仍保存成功');
  p.onApiBase(inp('https://example.com/v1/chat/completions'));
  p.onKey(inp('sk-test'));
  p.onModel(inp('gpt-4o-mini'));
  p.save();
  if (JSON.parse(store['ymxs_llm']).engine !== 'api') throw new Error('API 配置未保存');

  p.test();                                      // mock request 会 fail，应回落到 showModal
  await settle();
  p.copyReport();
  p.clearData();
  if (JSON.parse(store['ymxs_llm'] || '{}').engine === 'api') throw new Error('清空后配置仍在');
  if (store['ymxs_favBooks'] && JSON.parse(store['ymxs_favBooks']).length) throw new Error('清空后收藏仍在');
});

/* ---------- 兜底链：后端不可用 + 配了大模型 → 回退本地规则引擎 ---------- */
step('兜底链：后端不可用 → 大模型不可用 → 本地规则引擎', async function(){
  const p = load(path.join(MP, 'pages/workshop/workshop.js'));
  store['ymxs_llm'] = JSON.stringify({ engine: 'api', base: 'https://example.com/v1/chat/completions', key: 'k', model: 'm' });
  p.onShow();
  await settle();
  p.onInput(inp('我emo了'));
  p.onAdapt();
  await settle();
  const notes = p.data.notes.join(' | ');
  if (notes.indexOf('回退本地规则引擎') < 0) throw new Error('未回退本地引擎：' + notes);
  if (p.data.src !== 'local') throw new Error('兜底结果应标 local');
  store['ymxs_llm'] = JSON.stringify({ engine: 'local', base: '', key: '', model: '' });
});

/* ---------- 界面改版：指引交互与空态复位 ---------- */
step('界面改版指引交互（折叠 / 双向跳转 / 登录入口）', async function(){
  const v2 = load(path.join(MP, 'pages/verify/verify.js'));
  v2.onLoad({ text: encodeURIComponent('无人与我立黄昏，无人问我粥可温') });
  await settle();
  if (!v2.data.result || v2.data.result.overall.name !== '伪古风') throw new Error('带参进入未自动核验');
  v2.toWorkshop();
  if (String(store['ymxs_prefill'] || '').indexOf('立黄昏') < 0) throw new Error('未把文案带进工坊');

  const w = load(path.join(MP, 'pages/workshop/workshop.js'));
  w.onShow();
  await settle();
  if (w.data.paramOpen !== false) throw new Error('参数区应默认收起');
  w.onToggleParam();
  if (w.data.paramOpen !== true) throw new Error('参数区未展开');
  w.onInput(inp('我emo了'));
  w.onAdapt();
  await settle();
  w.toVerify();
  const last = calls[calls.length - 1];
  if (last[0] !== 'navigateTo' || last[1].indexOf('/pages/verify/verify?text=') < 0) {
    throw new Error('toVerify 未带参跳转：' + JSON.stringify(last));
  }

  const h = load(path.join(MP, 'pages/home/home.js'));
  if (h.data.quick.length !== 3) throw new Error('首页快捷入口应为 3 个');
});

/* ---------- 登录（服务端通道） ---------- */
step('login 登录成功：写入令牌 / 合并本地书架 / 回到上一页', async function(){
  const p = load(path.join(MP, 'pages/login/login.js'));
  p.onLoad();
  await settle();
  if (p.data.loggedIn !== false) throw new Error('初始应为未登录');
  if (p.data.online !== false) throw new Error('离线时登录页应显示未连接');

  // 伪造一张本地书架，验证登录后会推到服务端
  store['ymxs_favBooks'] = JSON.stringify(['周易', '史记']);

  mockRoutes = {
    '/api/auth/login': {
      token: 'mock-access', refreshToken: 'mock-refresh', expiresIn: 3600,
      user: { id: 1, username: 'tester', nickname: '测试员' }
    },
    '/api/book-favorites/merge': { added: 2, count: 2 }
  };
  p.onUser(inp('tester'));
  p.onPass(inp('123456'));
  p.submit();
  await settle();

  if (p.data.errMsg) throw new Error('登录报错：' + p.data.errMsg);
  if (p.data.loggedIn !== true) throw new Error('登录后未置为已登录');
  if (JSON.parse(store['ymxs_token'] || '""') !== 'mock-access') throw new Error('令牌未写入本地');
  if (JSON.parse(store['ymxs_refresh'] || '""') !== 'mock-refresh') throw new Error('刷新令牌未写入本地');
  const back = calls.filter(function(c){ return c[0] === 'navigateBack'; });
  if (!back.length) throw new Error('登录后未返回上一页');
  mockRoutes = null;
});

/* ---------- 服务端通道：页面用服务端数据并标 src='server' ---------- */
step('服务端通道：书库 / 核验 / 日历 取服务端数据并标注来源', async function(){
  const engine = require(path.join(MP, 'utils/engine.js'));
  const b0 = engine.BOOKS[0];

  mockRoutes = {
    '/api/books': {
      list: [{
        name: b0.name, bu: b0.bu, era: b0.era, author: b0.author, intro: b0.intro,
        quoteCount: 3, color1: '#123456', color2: '#654321'
      }],
      total: 1, page: 1, size: 60, pages: 1, poolSize: 60, bus: null, eras: null
    },
    '/api/verify/meta': { casesTotal: 43, verifiedTotal: 47, indexSize: 555, levels: { '伪古风': 24, '出处讹变': 19 } },
    '/api/verify/cases': { list: [{ phrase: '某句', level: '伪古风', wrong: 'w', truth: 't', advice: 'a', check: 'c' }], total: 1 },
    '/api/calendar': {
      date: '2026-10-18', poolSize: engine.CAL.length, todayIndex: 1,
      today: engine.CAL[0], list: engine.CAL, rule: '服务端排期'
    }
  };

  // 书库
  const bs = load(path.join(MP, 'pages/books/books.js'));
  bs.onShow();
  await settle();
  if (bs.data.src !== 'server') throw new Error('书库未走服务端，src=' + bs.data.src);
  if (bs.data.list.length !== 1) throw new Error('书库服务端数据未生效');

  // 核验元信息 + 案例库
  const vf = load(path.join(MP, 'pages/verify/verify.js'));
  vf.onLoad({});
  await settle();
  if (vf.data.src !== 'server') throw new Error('核验未走服务端，src=' + vf.data.src);
  if (vf.data.indexSize !== 555) throw new Error('服务端索引规模未生效：' + vf.data.indexSize);
  if (vf.data.list.length !== 1) throw new Error('服务端案例库未生效');

  // 日历
  const cd = load(path.join(MP, 'pages/calendar/calendar.js'));
  cd.onLoad();
  await settle();
  if (cd.data.src !== 'server') throw new Error('日历未走服务端，src=' + cd.data.src);
  if (cd.data.rule !== '服务端排期') throw new Error('服务端排期说明未生效');

  mockRoutes = null;
});

/* ---------- 第二轮改版：只读区折叠 + 登录页让路 ---------- */
step('只读区折叠与「我的」页（第二轮改版）', async function(){
  // tabBar 第 4 项应为「我的」（收藏已并入该页，不再是独立 tab）
  const cfg = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  const favTab = cfg.tabBar.list.filter(function(x){ return x.pagePath === 'pages/fav/fav'; })[0];
  if (!favTab || favTab.text !== '我的') throw new Error('tabBar 第 4 项文案应为「我的」，实际 ' + (favTab && favTab.text));

  // fav：服务端改编记录默认收起；账号区字段齐全
  const f = load(path.join(MP, 'pages/fav/fav.js'));
  f.onShow();
  await settle();
  if (f.data.hisOpen !== false) throw new Error('服务端改编记录应默认收起');
  if (!(f.data.days >= 1)) throw new Error('连续天数未注入「我的」页');
  // 前一步已登录，这里应走「已登录」分支：有昵称才显示退出登录
  if (f.data.loggedIn && !f.data.nick) throw new Error('已登录却没有昵称');
  if (!f.data.loggedIn && f.data.nick) throw new Error('未登录却带昵称');
  if (typeof f.logout !== 'function') throw new Error('「我的」页缺少退出登录');
  f.onToggleHis();
  if (f.data.hisOpen !== true) throw new Error('服务端改编记录未展开');
  f.onToggleHis();
  if (f.data.hisOpen !== false) throw new Error('服务端改编记录未收起');

  // settings：内嵌数据 / 关于 默认收起
  const s = load(path.join(MP, 'pages/settings/settings.js'));
  s.onLoad();
  await settle();
  if (s.data.dataOpen !== false) throw new Error('内嵌数据应默认收起');
  if (s.data.aboutOpen !== false) throw new Error('关于应默认收起');
  s.onToggleData(); s.onToggleAbout();
  if (s.data.dataOpen !== true || s.data.aboutOpen !== true) throw new Error('折叠区未展开');
  s.onToggleData(); s.onToggleAbout();
  if (s.data.dataOpen !== false || s.data.aboutOpen !== false) throw new Error('折叠区未收起');

  // login：未登录时有一条「不登录也能用」的出路，直接跳书库
  const l = load(path.join(MP, 'pages/login/login.js'));
  l.onLoad();
  await settle();
  const n0 = calls.length;
  l.toBooks();
  const last = calls[calls.length - 1];
  if (calls.length === n0 || last[0] !== 'switchTab' || last[1].indexOf('/pages/books/books') < 0) {
    throw new Error('登录页未提供直达书库的出路：' + JSON.stringify(last));
  }
});

/* ---------- 报告 ---------- */
(async function(){
  for (const [name, fn] of steps) {
    try {
      await fn();
      pass.push(name);
    } catch (e) {
      errors.push(name + ' → ' + e.message + '\n      ' + String(e.stack || '').split('\n')[1]);
    }
  }
  console.log('=== PASS (' + pass.length + ') ===');
  pass.forEach(function(s){ console.log('  · ' + s); });
  console.log('\n=== ERROR (' + errors.length + ') ===');
  errors.forEach(function(s){ console.log('  ✗ ' + s); });
  const kinds = {};
  calls.forEach(function(c){ kinds[c[0]] = (kinds[c[0]] || 0) + 1; });
  console.log('\n小程序 API 调用统计：' + JSON.stringify(kinds));
  process.exit(errors.length ? 1 : 0);
})();
