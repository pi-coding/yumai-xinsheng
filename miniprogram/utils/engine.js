/* ================================================================
   语脉新生 · 改编引擎（本地规则引擎，零外部依赖）
   由 语脉新生.html 的同名实现移植而来：
     · 单次扫描替换，避免「不可 → 不行 → 不走」连锁改写
     · 语料对命中后掩码保护，避免词典把已正确的古籍原句改坏
   ================================================================ */
const D = require('./data.js');
const BOOKS = D.BOOKS;
const PAIRS = D.PAIRS;
const LEX   = D.LEX;
const C2M   = D.C2M;
const CAL   = D.CAL;

const CONTEXTS = ['日常', '职场', '学习', '情感', '社交'];
const TONES    = ['自然', '俏皮', '庄重', '深情', '豪迈', '温婉'];
const FORMS    = ['原词使用', '诗词语素拼接', '网络改编', '文言句式'];

const CTX_PREFIX = { '日常': '', '职场': '案牍之间，', '学习': '青灯之下，', '情感': '心事如潮，', '社交': '宾主之间，' };
const TONE_TAIL  = { '自然': '', '俏皮': '，亦是快事', '庄重': '，斯为雅正', '深情': '，此情难已', '豪迈': '，壮哉', '温婉': '，聊寄幽怀' };
const TONE_HEAD  = { '自然': '', '俏皮': '咦，', '庄重': '夫', '深情': '嗟乎，', '豪迈': '壮哉！', '温婉': '悄然' };
const EGS        = ['今天上班好困啊，不想干活只想摸鱼', '这个方案太赞了，我直接给跪了', '落霞与孤鹜齐飞，秋水共长天一色', '我emo了'];

/* ---------------- 正则转义 ---------------- */
function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* 单次扫描替换：每个位置只替换一次，替换结果不再被扫描 */
function applyLex(text, dict){
  const items = dict.slice().sort(function(a, b){ return b[0].length - a[0].length; });
  if (!items.length) return { text: text, count: 0 };
  const map = new Map(items);
  const re = new RegExp(items.map(function(p){ return escapeRe(p[0]); }).join('|'), 'g');
  let count = 0;
  const out = text.replace(re, function(m){ count++; return map.get(m); });
  return { text: out, count: count };
}

/* 语料对命中后先「掩码保护」，再走词典 */
function maskPairs(text, key, store){
  const items = PAIRS.filter(function(p){ return p[key]; })
                     .sort(function(a, b){ return b[key].length - a[key].length; });
  if (!items.length) return { masked: text, used: null };
  const map = new Map(items.map(function(p){ return [p[key], p]; }));
  const re = new RegExp(items.map(function(p){ return escapeRe(p[key]); }).join('|'), 'g');
  let used = null;
  const masked = text.replace(re, function(m){
    const p = map.get(m);
    if (!used) used = p;
    store.push(key === 'modern' ? p.ancient : p.modern);
    return '\u0001' + (store.length - 1) + '\u0001';
  });
  return { masked: masked, used: used };
}
function unmask(text, store){
  return text.replace(/\u0001(\d+)\u0001/g, function(m, i){ return store[+i] || ''; });
}

/* 文言句式微调：把字句→将字句、被字句→为…所、之字结构 */
function classicalSyntax(s){
  let o = s;
  o = o.replace(/把(.{1,6})当作/g, '以$1为');
  o = o.replace(/把/g, '将');
  o = o.replace(/被(.{1,6})了/g, '为$1所');
  o = o.replace(/的时候/g, '之时');
  o = o.replace(/的地方/g, '之处');
  o = o.replace(/的原因/g, '之由');
  return o;
}
/* 反向：文言语序还原为白话 */
function modernSyntax(s){
  let o = s;
  o = o.replace(/以(.{1,6})为/g, '把$1当作');
  o = o.replace(/为(.{1,6})所/g, '被$1');
  o = o.replace(/之(时|处|由)/g, function(m, g){ return ({ '时': '的时候', '处': '的地方', '由': '的原因' })[g]; });
  return o;
}

/* ---------------- 主入口：本地规则引擎 ---------------- */
function localAdapt(text, mode, ctx, tone, form){
  const notes = [], store = [];
  let out = text, source = '';

  if (mode === 'm2c'){
    const mk = maskPairs(text, 'modern', store);
    out = mk.masked;
    if (mk.used){
      source = mk.used.source || '';
      notes.push((mk.used.supp ? '命中补充语料条目' : '命中语料库条目') +
                 '：「' + mk.used.modern + '」→「' + mk.used.ancient + '」');
    }
    const r = applyLex(out, LEX);
    out = r.text;
    if (r.count) notes.push('文言词汇替换 ' + r.count + ' 处');

    if (form === '文言句式'){
      out = classicalSyntax(out);
      notes.push('套用文言句式（将字句／为…所／之字结构）');
    } else if (form === '诗词语素拼接'){
      out = out.replace(/的/g, '之').replace(/了/g, '矣');
      notes.push('诗词语素拼接：以「之」「矣」缀合语素');
    } else if (form === '网络改编'){
      out = out.replace(/[啊呀哦嘛]/g, '');
      notes.push('网络改编：保留原意骨架，套以浅近文言');
    } else {
      notes.push('原词使用：仅做词汇层替换，不改动原句结构');
    }
    out = unmask(out, store);
  } else {
    const mk = maskPairs(text, 'ancient', store);
    out = mk.masked;
    if (mk.used){
      source = mk.used.source || '';
      notes.push((mk.used.supp ? '命中补充语料条目' : '命中语料库条目') +
                 '：「' + mk.used.ancient + '」→「' + mk.used.modern + '」');
    }
    const r = applyLex(out, C2M);
    out = r.text;
    if (r.count) notes.push('白话词汇还原 ' + r.count + ' 处');
    out = modernSyntax(out);
    if (form === '网络改编'){ out = out + '（笑）'; notes.push('网络改编：补入网络语气标记'); }
    else if (form === '文言句式'){ notes.push('保留原文语序，仅做词面转写'); }
    else notes.push('通俗转写：按常用白话词表逐词还原');
    out = unmask(out, store);
  }

  const head = TONE_HEAD[tone] || '';
  const tail = TONE_TAIL[tone] || '';
  const pre  = CTX_PREFIX[ctx] || '';
  if (pre)  { out = pre + out; notes.push('语境限定：' + ctx + '（前缀「' + pre + '」）'); }
  if (head) { out = head + out; }
  if (tail) { out = out.replace(/[，。,.]$/, '') + tail; notes.push('语气修饰：' + tone); }

  if (source) notes.push('出处：' + source);
  return { output: out, source: source, notes: notes };
}

/* ---------------- 可选：接入大模型（需在小程序后台配置 request 合法域名） ---------------- */
function apiAdapt(cfg, text, mode, ctx, tone, form){
  const dir = mode === 'm2c' ? '把现代白话/网络用语改写为规范的古风表达' : '把文言文转写为通俗现代白话';
  const sys = '你是中华古风语言转译助手。任务：' + dir + '。' +
    '必须同时满足三项约束——语境：' + ctx + '；语气：' + tone + '；语法形式：' + form + '。' +
    '只输出改写结果，不要解释，不要加引号。若原句有确切古籍出处，可在结果后用「——出处」标注。';
  return new Promise(function(resolve, reject){
    wx.request({
      url: cfg.base,
      method: 'POST',
      timeout: 30000,
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      data: {
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: text }],
        temperature: 0.8
      },
      success: function(res){
        try {
          resolve({
            output: res.data.choices[0].message.content.trim(),
            source: '',
            notes: ['由大模型 API 生成（' + (cfg.model || '默认模型') + '）']
          });
        } catch (e){ reject(new Error('返回格式异常')); }
      },
      fail: function(e){ reject(new Error(e.errMsg || '请求失败')); }
    });
  });
}

/* ---------------- 古籍封面主题（CSS 渐变替代原 SVG，小程序 image 不保证支持 SVG） ---------------- */
const BU_PALETTE = {
  '经部': [['#3f7d63', '#7fb79a'], ['#2f6b57', '#6aa88c']],
  '史部': [['#9c3f36', '#d98b6a'], ['#8a3830', '#c97a5c']],
  '子部': [['#2f6b6b', '#7fb3ad'], ['#356f57', '#86b894']],
  '集部': [['#33587d', '#7fa3c4'], ['#3b4f7d', '#8b9ec9']]
};
function hashCode(s){ let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function coverTheme(book){
  const p = BU_PALETTE[book.bu] || BU_PALETTE['经部'];
  const pal = p[hashCode(book.name) % p.length];
  const name = book.name;
  return {
    c1: pal[0],
    c2: pal[1],
    title: name.length > 5 ? name.slice(0, 5) : name,
    // 小程序 text 无法按字数自适应字号，改为三档
    size: name.length > 5 ? 30 : (name.length > 3 ? 36 : 42),
    era: book.era,
    letter: book.bu.charAt(0)
  };
}

/* ---------------- 日历：按日期取词（与原实现同一算法，保证同日同词） ---------------- */
const WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
function pickFor(y, m, d){
  const key = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return CAL[((key % CAL.length) + CAL.length) % CAL.length];
}
function pad(n){ return String(n).length < 2 ? '0' + n : String(n); }

module.exports = {
  BOOKS: BOOKS, PAIRS: PAIRS, LEX: LEX, C2M: C2M, CAL: CAL,
  CONTEXTS: CONTEXTS, TONES: TONES, FORMS: FORMS, EGS: EGS,
  localAdapt: localAdapt, apiAdapt: apiAdapt,
  coverTheme: coverTheme, hashCode: hashCode,
  pickFor: pickFor, pad: pad, WEEK_CN: WEEK_CN
};
