/* 语脉新生小程序 · 工程自检
   1) 全部 JS 语法可编译  2) 全部 JSON 合法
   3) app.json 页面路径文件齐全  4) WXML 事件处理函数在 JS 中均已定义
   5) WXML 数据根标识符在页 data 中存在
   6) 改编引擎与原 H5 复现版逐条比对（保真度）
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 定位工程：从本脚本所在目录逐级向上找小程序工程（以含 app.json 为准）。
   2026-10-18 起小程序已从「附录五-技术复原/小程序复现/微信小程序」上移为顶层的
   「miniprogram」，这里先找新位置，找不到再回退旧位置，两种布局都能跑。 */
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

/* H5 参考实现（报告附录五里的单文件版）。附录五**不随仓库分发**，
   所以这里做成「有就逐条比对原文，没有就比对已固化的指纹基线」——
   两条路都能守住「小程序引擎与 H5 版逐条一致」这条约束。 */
function findUpFile(start, relPath) {
  let d = start;
  for (let i = 0; i < 10; i++) {
    const cand = path.join(d, relPath);
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const HTML = findUpFile(__dirname, path.join('附录五-技术复原', '小程序复现', '语脉新生.html'));
const BASELINE = path.join(__dirname, 'adapt-baseline.json');

const errs = [];
const warns = [];
const ok = [];

function rel(p){ return path.relative(MP, p).replace(/\\/g, '/'); }
function walk(dir, out){
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

/* _tools 是本目录自己（校验脚本 + 基线）；project.private.config.json 是开发者工具
   按机器生成的私有配置 —— 两样都不属于小程序包内容，不参与统计。 */
const files = walk(MP).filter(function(f){
  if (f.indexOf(path.sep + '_tools' + path.sep) >= 0) return false;
  if (path.basename(f) === 'project.private.config.json') return false;
  return true;
});
const jsFiles = files.filter(f => f.endsWith('.js'));
const jsonFiles = files.filter(f => f.endsWith('.json'));
const wxmlFiles = files.filter(f => f.endsWith('.wxml'));

/* ---------- 1. JS 语法 ---------- */
jsFiles.forEach(function(f){
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }); }
  catch (e){ errs.push('JS 语法错误 ' + rel(f) + ' → ' + e.message); }
});
ok.push('JS 语法编译通过：' + jsFiles.length + ' 个文件');

/* ---------- 2. JSON 合法性 ---------- */
const jsonMap = {};
jsonFiles.forEach(function(f){
  try { jsonMap[f] = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e){ errs.push('JSON 非法 ' + rel(f) + ' → ' + e.message); }
});
ok.push('JSON 解析通过：' + jsonFiles.length + ' 个文件');

/* ---------- 3. app.json 与页面文件 ---------- */
const app = jsonMap[path.join(MP, 'app.json')];
if (!app){ errs.push('缺少 app.json'); }
else {
  app.pages.forEach(function(p){
    ['.js', '.wxml', '.json'].forEach(function(ext){
      const f = path.join(MP, p + ext);
      if (!fs.existsSync(f)) errs.push('页面文件缺失：' + p + ext);
    });
  });
  (app.tabBar && app.tabBar.list || []).forEach(function(t){
    if (app.pages.indexOf(t.pagePath) < 0) errs.push('tabBar 页面未在 pages 中注册：' + t.pagePath);
    if (!fs.existsSync(path.join(MP, t.pagePath + '.wxml'))) errs.push('tabBar 页面文件缺失：' + t.pagePath);
  });
  ok.push('app.json 页面 ' + app.pages.length + ' 个 / tabBar ' +
          ((app.tabBar && app.tabBar.list.length) || 0) + ' 项，文件齐全');
}

/* ---------- 4/5. WXML 事件与数据引用 ---------- */
function jsOf(wxml){ return wxml.replace(/\.wxml$/, '.js'); }
wxmlFiles.forEach(function(w){
  const src = fs.readFileSync(w, 'utf8');
  const js = fs.existsSync(jsOf(w)) ? fs.readFileSync(jsOf(w), 'utf8') : '';

  // 4) 事件处理函数
  const handlers = new Set();
  src.replace(/\b(?:bind|catch|capture-bind|capture-catch)[:]?[a-zA-Z]+\s*=\s*"([^"{}]+)"/g,
    function(m, h){ handlers.add(h.trim()); return m; });
  handlers.forEach(function(h){
    const re = new RegExp('(^|[\\s,{])' + h + '\\s*[:(]', 'm');
    if (!re.test(js)) errs.push('WXML 事件未在 JS 中定义：' + rel(w) + ' → ' + h);
  });

  // 4b) WXML 表达式不支持函数调用（必须放到 JS 侧预计算）
  src.replace(/\{\{([^}]*)\}\}/g, function(m, expr){
    const clean = expr.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ');
    if (/[A-Za-z_$][A-Za-z0-9_$.]*\s*\(/.test(clean)) {
      errs.push('WXML 表达式出现函数调用（小程序不支持）：' + rel(w) + ' → {{' + expr.trim() + '}}');
    }
    return m;
  });

  // 5) 数据根标识符（先剔除字符串字面量与「.属性」访问，避免把 item.c1、'chip-on' 误判为数据）
  const roots = new Set();
  const KEYWORDS = ['true','false','null','undefined','item','index','length','slice','join','split','charAt','indexOf'];
  src.replace(/\{\{([^}]*)\}\}/g, function(m, expr){
    const clean = expr
      .replace(/'[^']*'/g, ' ')
      .replace(/"[^"]*"/g, ' ')
      .replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, ' ');
    clean.replace(/[A-Za-z_$][A-Za-z0-9_$]*/g, function(id){
      if (KEYWORDS.indexOf(id) < 0) roots.add(id);
      return id;
    });
    return m;
  });
  const dataBlock = (js.match(/data\s*:\s*\{([\s\S]*?)\n  \}/) || [])[1] || '';
  const okRoots = new Set(['item', 'index']);
  roots.forEach(function(r){
    if (okRoots.has(r)) return;
    // 出现在 data 里（含嵌套引用）或页面上 wx:for-item/wx:for-index 声明过
    const declared = new RegExp('[\\s,{]' + r + '\\s*:').test(dataBlock);
    const loopAlias = new RegExp('wx:for-(?:item|index)\\s*=\\s*"' + r + '"').test(src);
    if (!declared && !loopAlias) warns.push('WXML 引用了未在 data 声明的标识符：' + rel(w) + ' → ' + r);
  });
});
ok.push('WXML 事件绑定与 data 引用检查完成：' + wxmlFiles.length + ' 个文件');

/* ---------- 6. 数据与引擎保真度 ---------- */
const mpData = require(path.join(MP, 'utils', 'data.js'));
const eng = require(path.join(MP, 'utils', 'engine.js'));
const TEXTS = [
  '我emo了',
  '今天上班好困啊，不想干活只想摸鱼',
  '这个方案太赞了，我直接给跪了',
  '落霞与孤鹜齐飞，秋水共长天一色',
  '我把这个方案当作宝贝，被你发现了',
  '世间无限丹青手，一片伤心画不成',
  '不可不行',
  '我们大家一起去这里玩的时候，别人都说好'
];
const MODES = ['m2c', 'c2m'];
const FORMS = eng.FORMS, CTXS = eng.CONTEXTS, TONES = eng.TONES;

/* FNV-1a 32bit：与生成 adapt-baseline.json 时用的完全一致 */
function h32(s){
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function sig(r){ return h32(r.output + '\u0000' + JSON.stringify(r.notes)); }

if (HTML){
  /* 6a. 有 H5 原文：逐条比对，最强 */
  const html = fs.readFileSync(HTML, 'utf8');
  const srcData = JSON.parse(html.match(/const DATA = (\{[\s\S]*?\});\r?\n/)[1].replace(/<\\\//g, '</'));
  [['books', mpData.BOOKS, srcData.books],
   ['pairs', mpData.PAIRS, srcData.pairs],
   ['lexicon.modern2classical', mpData.LEX, srcData.lexicon.modern2classical],
   ['lexicon.classical2modern', mpData.C2M, srcData.lexicon.classical2modern],
   ['calendar', mpData.CAL, srcData.calendar]].forEach(function(t){
    if (JSON.stringify(t[1]) !== JSON.stringify(t[2])) {
      errs.push('data.js 与原 HTML 的 ' + t[0] + ' 不一致（' + t[1].length + ' vs ' + t[2].length + ' 条）');
    }
  });
  ok.push('数据保真度：books/pairs/lexicon/calendar 与原 HTML 的 DATA 逐字段一致');

  const seg = html.slice(html.indexOf('/* 正则转义 */'), html.indexOf('/* 可选：接入大模型 */'));
  const sandbox = { console: console };
  sandbox.PAIRS = JSON.parse(JSON.stringify(mpData.PAIRS));
  sandbox.LEX = mpData.LEX;
  sandbox.C2M = mpData.C2M;
  sandbox.CTX_PREFIX = { '日常': '', '职场': '案牍之间，', '学习': '青灯之下，', '情感': '心事如潮，', '社交': '宾主之间，' };
  sandbox.TONE_TAIL = { '自然': '', '俏皮': '，亦是快事', '庄重': '，斯为雅正', '深情': '，此情难已', '豪迈': '，壮哉', '温婉': '，聊寄幽怀' };
  sandbox.TONE_HEAD = { '自然': '', '俏皮': '咦，', '庄重': '夫', '深情': '嗟乎，', '豪迈': '壮哉！', '温婉': '悄然' };
  vm.createContext(sandbox);
  vm.runInContext(seg, sandbox);
  const refLocalAdapt = sandbox.localAdapt;
  if (typeof refLocalAdapt !== 'function') errs.push('未能从原 HTML 中提取 localAdapt 作为参照');
  else {
    let n = 0, diff = 0, firstDiff = '';
    TEXTS.forEach(function(t){
      MODES.forEach(function(mode){
        CTXS.forEach(function(ctx){
          TONES.forEach(function(tone){
            FORMS.forEach(function(form){
              const a = refLocalAdapt(t, mode, ctx, tone, form);
              const b = eng.localAdapt(t, mode, ctx, tone, form);
              n++;
              if (a.output !== b.output || JSON.stringify(a.notes) !== JSON.stringify(b.notes)){
                diff++;
                if (!firstDiff) firstDiff = JSON.stringify({ t: t, mode: mode, ctx: ctx, tone: tone, form: form, ref: a.output, port: b.output });
              }
            });
          });
        });
      });
    });
    if (diff) errs.push('引擎移植结果与原版不一致：' + diff + '/' + n + ' 组，首个差异 ' + firstDiff);
    else ok.push('引擎保真度：' + n + ' 组（文本×模式×语境×语气×语法形式）输出与出处注释完全一致（对照源：附录五存档的 H5 原文）');
  }
} else if (fs.existsSync(BASELINE)){
  /* 6b. 没有 H5 原文（公开仓库就是这种情况）：比对已固化的指纹基线 */
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const orderOk = JSON.stringify(base.texts) === JSON.stringify(TEXTS)
    && JSON.stringify(base.modes) === JSON.stringify(MODES)
    && JSON.stringify(base.contexts) === JSON.stringify(CTXS)
    && JSON.stringify(base.tones) === JSON.stringify(TONES)
    && JSON.stringify(base.forms) === JSON.stringify(FORMS);
  if (!orderOk) errs.push('基线文件里的遍历顺序与脚本不一致，无法比对（请重新生成 adapt-baseline.json）');

  const nowData = {
    books: h32(JSON.stringify(mpData.BOOKS)),
    pairs: h32(JSON.stringify(mpData.PAIRS)),
    'lexicon.modern2classical': h32(JSON.stringify(mpData.LEX)),
    'lexicon.classical2modern': h32(JSON.stringify(mpData.C2M)),
    calendar: h32(JSON.stringify(mpData.CAL))
  };
  let dataBad = [];
  Object.keys(base.dataHash).forEach(function(k){
    if (base.dataHash[k] !== nowData[k]) dataBad.push(k);
  });
  if (dataBad.length) errs.push('data.js 与基线指纹不一致：' + dataBad.join('、'));
  else ok.push('数据保真度：books/pairs/lexicon/calendar 与基线指纹一致（' + Object.keys(base.dataHash).length + ' 项）');

  if (orderOk){
    let i = 0, diff = 0, firstDiff = '';
    TEXTS.forEach(function(t){
      MODES.forEach(function(mode){
        CTXS.forEach(function(ctx){
          TONES.forEach(function(tone){
            FORMS.forEach(function(form){
              const got = sig(eng.localAdapt(t, mode, ctx, tone, form));
              if (got !== base.hashes[i]){
                diff++;
                if (!firstDiff) firstDiff = JSON.stringify({ t: t, mode: mode, ctx: ctx, tone: tone, form: form, expect: base.hashes[i], got: got });
              }
              i++;
            });
          });
        });
      });
    });
    if (diff) errs.push('引擎输出与基线指纹不一致：' + diff + '/' + i + ' 组，首个差异 ' + firstDiff);
    else ok.push('引擎保真度：' + i + ' 组输出指纹与基线完全一致（基线生成于 ' + base.generatedAt + '，源自 H5 原文）');
  }
} else {
  warns.push('既没有 H5 原文也没有 adapt-baseline.json，跳过引擎保真度比对（只做了静态校验）');
}

/* ---------- 报告 ---------- */
console.log('=== PASS (' + ok.length + ') ===');
ok.forEach(function(s){ console.log('  · ' + s); });
if (warns.length){
  console.log('\n=== WARN (' + warns.length + ') ===');
  warns.forEach(function(s){ console.log('  ! ' + s); });
}
console.log('\n=== ERROR (' + errs.length + ') ===');
errs.forEach(function(s){ console.log('  ✗ ' + s); });
console.log('\n文件统计：js ' + jsFiles.length + ' / json ' + jsonFiles.length + ' / wxml ' + wxmlFiles.length +
            ' / wxss ' + files.filter(f => f.endsWith('.wxss')).length);
process.exit(errs.length ? 1 : 0);
