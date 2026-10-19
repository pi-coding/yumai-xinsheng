/* ================================================================
   语脉新生 · 溯源核验引擎（小程序端本地实现）
   判定口径与全栈版 service/VerdictBase + VerifyService 完全一致：
     · 归一化：去空白与中英标点后匹配
     · 索引五层：误传案例（含分句）→ 真典（含分句）→ 语料对 → 日历词条 → 现代网语（仅参考）
     · 命中检测：长键优先，按「位置升序、同位置取更长」去重
     · 结论六档：伪古风 / 出处讹变 / 出处存疑 / 真伪混杂 / 有据可考 / 未收录
   说明：本引擎是**离线判定**，不联网、不上传文本。
   ================================================================ */
const engine = require('./engine.js');
const VD = require('./verdictdata.js');

const PUNCT = '，。、；：！？\u201c\u201d\u2018\u2019「」『』（）《》〈〉…—·,.!?;:()[]"\'';
const MAX_SEGMENTS = 20;
const MAX_HITS_PER_SEGMENT = 40;

function norm(s) {
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (/\s/.test(c) || PUNCT.indexOf(c) >= 0) continue;
    out += c;
  }
  return out;
}

function entry(key, label, level, source, kind, note, advice, check, modern, cats) {
  return {
    key: key, label: label, level: level, source: source, kind: kind,
    note: note, advice: advice, check: check, modern: modern, cats: cats
  };
}

function inMisinfo(s, misKeys) {
  const n = norm(s);
  if (n.length < 4) return false;
  for (let i = 0; i < misKeys.length; i++) {
    if (misKeys[i].indexOf(n) >= 0 || n.indexOf(misKeys[i]) >= 0) return true;
  }
  return false;
}

/* ---------------- 建索引（启动时算一次，常驻内存） ---------------- */
const MISINFO = VD.MISINFO;
const VERIFIED = VD.VERIFIED;
const LEVEL_ORDER = VD.LEVEL_ORDER;

const misKeys = MISINFO.map(function (c) { return norm(c.phrase); });
const INDEX = [];

/* 1) 误传案例：整句 + 分句 */
MISINFO.forEach(function (c) {
  INDEX.push(entry(norm(c.phrase), c.phrase, c.level, c.wrong, 'misinfo', c.truth, c.advice, c.check, null, null));
  c.phrase.split(/[，、；]/).forEach(function (seg) {
    const s = seg.trim();
    if (norm(s).length < 5) return;
    INDEX.push(entry(norm(s), s, c.level, c.wrong, 'misinfo', c.truth, c.advice, c.check, null, null));
  });
});

/* 2) 真典：整句 + 分句 */
VERIFIED.forEach(function (c) {
  INDEX.push(entry(norm(c.text), c.text, '有据可考', c.source, 'verified', null, null, null, null, null));
  c.text.split(/[，、；]/).forEach(function (seg) {
    const s = seg.trim();
    if (norm(s).length < 5) return;
    INDEX.push(entry(norm(s), s, '有据可考', c.source, 'verified', null, null, null, null, null));
  });
});

/* 3) 语料对古风句（与已知误传重合的跳过，交由误传库判定） */
engine.PAIRS.forEach(function (p) {
  const ancient = p.ancient;
  if (!ancient || inMisinfo(ancient, misKeys)) return;
  const src = p.source || '语料库收录';
  INDEX.push(entry(norm(ancient), ancient, '有据可考', src, 'pair', null, null, null, p.modern, p.categories));
  ancient.split(/[，、；]/).forEach(function (seg) {
    const s = seg.trim();
    if (norm(s).length < 5) return;
    INDEX.push(entry(norm(s), s, '有据可考', src, 'pair', null, null, null, p.modern, p.categories));
  });
});

/* 4) 日历词条 + 其出处引句 */
engine.CAL.forEach(function (c) {
  INDEX.push(entry(norm(c.word), c.word, '有据可考', c.source, 'calendar', null, null, null, c.modern, c.category));
  const m = /[\u201c"]([^\u201d"]{6,})[\u201d"]/.exec(c.source || '');
  if (m) {
    const t = m[1].split(/[，、；]/)[0].trim();
    if (t) INDEX.push(entry(norm(t), t, '有据可考', c.source, 'calendar', null, null, null, c.modern, c.category));
  }
});

/* 5) 现代网络用语 → 古风对应（仅参考，不参与真伪判定） */
engine.PAIRS.forEach(function (p) {
  const modern = p.modern;
  if (!modern || inMisinfo(p.ancient, misKeys)) return;
  INDEX.push(entry(norm(modern), modern, '现代网语', p.ancient, 'modern', p.source, null, null, null, null));
});

INDEX.sort(function (a, b) { return b.key.length - a.key.length; });

/* ---------------- 命中检测 ---------------- */
function detect(text) {
  const n = norm(text);
  const raw = [];
  for (let i = 0; i < INDEX.length; i++) {
    const e = INDEX[i];
    const min = e.kind === 'modern' ? 2 : 4;
    if (e.key.length < min) continue;
    let from = 0;
    while (true) {
      const pos = n.indexOf(e.key, from);
      if (pos < 0) break;
      raw.push({ pos: pos, len: e.key.length, e: e });
      from = pos + 1;
    }
  }
  raw.sort(function (a, b) {
    if (a.pos !== b.pos) return a.pos - b.pos;
    return b.len - a.len;
  });
  const out = [];
  let last = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].pos >= last) {
      out.push(raw[i]);
      last = raw[i].pos + raw[i].len;
    }
  }
  return out;
}

function orderOf(level) {
  const v = LEVEL_ORDER[level];
  return v === undefined ? 0 : v;
}

function summaryOf(name, good, bad, modern) {
  if (name === '未收录') {
    return '未在已有语料中检索到可对应的词句。这不等于「伪古风」——也可能是生僻典故或现代原创，建议补充出处后再使用。'
      + (modern > 0 ? ' 不过检出 ' + modern + ' 处现代网络用语，其对应的古风表达见下方。' : '');
  }
  if (name === '有据可考') {
    return '检出的词句均能找到出处。引用时请把出处标注到具体篇名。';
  }
  if (name === '真伪混杂') {
    return '这段文字里既有可溯源的真句，也有查无出处的拟古句，建议分开处理：真句标注出处，拟古句注明「当代创作」。';
  }
  const why = name === '出处讹变' ? '字句与原作不符（版本讹变）'
    : name === '出处存疑' ? '出处归属存疑' : '查无出处的伪古风';
  return '检出' + why + '。请按下方说明修正后再使用。';
}

function credibility(traceable, fake, corrupt, doubtful, modern) {
  if (traceable === 0 && fake + corrupt + doubtful === 0) return null;
  let score = 100 - fake * 35 - corrupt * 22 - doubtful * 12 - modern * 3;
  if (score < 0) score = 0;
  if (traceable === 0 && score > 40) score = 40;
  return score;
}

function credLabel(score) {
  if (score === null) return '无从判断';
  if (score >= 85) return '可放心引用';
  if (score >= 60) return '需再核一次';
  if (score >= 35) return '风险较高';
  return '高风险·建议改写';
}

/* ---------------- 单段判定 ---------------- */
function judge(text) {
  const hits = detect(text);
  let fake = 0, corrupt = 0, doubtful = 0, good = 0, modern = 0;
  let worstOrder = -1, worstLevel = null;
  const hitOut = [];
  const advice = [];
  const adviceSeen = {};

  hits.forEach(function (h) {
    const e = h.e;
    if (e.kind === 'modern') {
      modern++;
    } else if (e.kind === 'misinfo') {
      if (e.level === '伪古风') fake++;
      else if (e.level === '出处讹变') corrupt++;
      else doubtful++;
      const o = orderOf(e.level);
      if (o > worstOrder) { worstOrder = o; worstLevel = e.level; }
      if (e.advice && !adviceSeen[e.advice]) { adviceSeen[e.advice] = 1; advice.push(e.advice); }
    } else {
      good++;
    }
    if (hitOut.length < MAX_HITS_PER_SEGMENT) {
      hitOut.push({
        label: e.label, level: e.level, kind: e.kind, source: e.source,
        note: e.note, advice: e.advice, check: e.check, modern: e.modern,
        cats: e.cats, pos: h.pos
      });
    }
  });

  const bad = fake + corrupt + doubtful;
  let name, order;
  if (bad > 0 && good > 0) { name = '真伪混杂'; order = 2; }
  else if (bad > 0) { name = worstLevel || '出处存疑'; order = 3; }
  else if (good > 0) { name = '有据可考'; order = 1; }
  else { name = '未收录'; order = 0; }

  if (bad === 0 && good > 0 && !adviceSeen['k1']) {
    advice.push('引用时把出处标注到具体篇名，便于他人复核。');
    adviceSeen['k1'] = 1;
  }
  if (name === '未收录' && !adviceSeen['k2']) {
    advice.push('未收录不等于伪古风：可能是生僻典故或当代原创，补上出处再使用更稳妥。');
    adviceSeen['k2'] = 1;
  }

  return {
    verdict: { name: name, order: order, summary: summaryOf(name, good, bad, modern) },
    counts: {
      total: hits.length, traceable: good, suspect: bad,
      modern: modern, fake: fake, corrupt: corrupt, doubtful: doubtful
    },
    hits: hitOut,
    advice: advice
  };
}

/* ---------------- 整段核验 ---------------- */
function verify(raw) {
  const input = (raw || '').trim();
  if (!input) return { error: '请先输入要核验的文案' };
  if (input.length > 2000) return { error: '单次核验不超过 2000 字' };

  let units = input.split(/\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  if (!units.length) units = [input];
  let batch = false;
  if (units.length > 1) {
    batch = true;
    if (units.length > MAX_SEGMENTS) units = units.slice(0, MAX_SEGMENTS);
  }

  const segments = [];
  let total = 0, traceable = 0, suspect = 0, modern = 0;
  let fake = 0, corrupt = 0, doubtful = 0;
  let worstOrder = -1, worstLevel = null;
  const advice = [];
  const adviceSeen = {};

  units.forEach(function (unit, i) {
    const seg = judge(unit);
    seg.index = i + 1;
    seg.text = unit;
    segments.push(seg);
    total += seg.counts.total;
    traceable += seg.counts.traceable;
    suspect += seg.counts.suspect;
    modern += seg.counts.modern;
    fake += seg.counts.fake;
    corrupt += seg.counts.corrupt;
    doubtful += seg.counts.doubtful;
    if (seg.verdict.order > worstOrder) { worstOrder = seg.verdict.order; worstLevel = seg.verdict.name; }
    seg.advice.forEach(function (a) {
      if (!adviceSeen[a]) { adviceSeen[a] = 1; advice.push(a); }
    });
  });

  let name, order;
  if (suspect > 0 && traceable > 0) { name = '真伪混杂'; order = 2; }
  else if (suspect > 0) { name = worstLevel || '出处存疑'; order = 3; }
  else if (traceable > 0) { name = '有据可考'; order = 1; }
  else { name = '未收录'; order = 0; }

  const score = credibility(traceable, fake, corrupt, doubtful, modern);

  return {
    mode: batch ? 'batch' : 'single',
    inputLength: input.length,
    segments: segments,
    overall: {
      name: name,
      order: order,
      credibility: score,
      credLabel: credLabel(score),
      counts: {
        total: total, traceable: traceable, suspect: suspect,
        modern: modern, fake: fake, corrupt: corrupt, doubtful: doubtful
      },
      summary: summaryOf(name, traceable, suspect, modern),
      advice: advice
    },
    indexSize: INDEX.length,
    casesTotal: MISINFO.length,
    verifiedTotal: VERIFIED.length,
    disclaimer: '「可信度」是本平台依据误传案例库派生的辅助指标，不是调研报告的统计结果；'
      + '「未收录」只表示未在现有语料中检索到对应条目，不等于伪古风。'
  };
}

/* 误传案例库（按等级筛选 + 关键词） */
function cases(kw, level) {
  const k = (kw || '').trim();
  const lv = (level || '').trim();
  return MISINFO.filter(function (c) {
    if (lv && c.level !== lv) return false;
    if (!k) return true;
    const blob = [c.phrase, c.wrong, c.truth, c.advice, c.check].join(' ');
    return blob.indexOf(k) >= 0;
  });
}

function levels() {
  const out = {};
  MISINFO.forEach(function (c) { out[c.level] = (out[c.level] || 0) + 1; });
  return out;
}

module.exports = {
  norm: norm,
  detect: detect,
  judge: judge,
  verify: verify,
  cases: cases,
  levels: levels,
  indexSize: INDEX.length,
  casesTotal: MISINFO.length,
  verifiedTotal: VERIFIED.length
};
