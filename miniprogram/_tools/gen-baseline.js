#!/usr/bin/env node
/**
 * 一次性：从附录五存档里的 H5 单文件版提取「改编引擎」的 1920 组输出签名，
 * 生成 miniprogram/_tools/adapt-baseline.json。
 *
 * 为什么需要：附录五不随仓库分发，公开仓库里没有原 HTML，
 * 但「小程序引擎必须与 H5 版逐条一致」这条约束要能继续被验证 —— 于是把结果指纹固化下来。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOTP = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOTP, '附录五-技术复原', '小程序复现', '语脉新生.html');
const MP = path.join(ROOTP, 'miniprogram');
const OUT = path.join(MP, '_tools', 'adapt-baseline.json');

function h32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function sig(r) {
  return h32(r.output + '\u0000' + JSON.stringify(r.notes));
}

const html = fs.readFileSync(HTML, 'utf8');
const srcData = JSON.parse(html.match(/const DATA = (\{[\s\S]*?\});\r?\n/)[1].replace(/<\\\//g, '</'));
const mpData = require(path.join(MP, 'utils', 'data.js'));

// 数据指纹：与 H5 的 DATA 对照（等价于原来的逐字段 JSON.stringify 比对）
const dataHash = {
  books: h32(JSON.stringify(mpData.BOOKS)),
  pairs: h32(JSON.stringify(mpData.PAIRS)),
  'lexicon.modern2classical': h32(JSON.stringify(mpData.LEX)),
  'lexicon.classical2modern': h32(JSON.stringify(mpData.C2M)),
  calendar: h32(JSON.stringify(mpData.CAL))
};
const dataHashRef = {
  books: h32(JSON.stringify(srcData.books)),
  pairs: h32(JSON.stringify(srcData.pairs)),
  'lexicon.modern2classical': h32(JSON.stringify(srcData.lexicon.modern2classical)),
  'lexicon.classical2modern': h32(JSON.stringify(srcData.lexicon.classical2modern)),
  calendar: h32(JSON.stringify(srcData.calendar))
};
Object.keys(dataHash).forEach(function (k) {
  if (dataHash[k] !== dataHashRef[k]) {
    console.error('数据指纹不一致，拒绝生成基线：' + k);
    process.exit(1);
  }
});

// 引擎：直接从 H5 里切出 localAdapt
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
if (typeof refLocalAdapt !== 'function') {
  console.error('未能从 H5 中提取 localAdapt');
  process.exit(1);
}

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
const CTXS = eng.CONTEXTS, TONES = eng.TONES, FORMS = eng.FORMS;

const hashes = [];
let diff = 0;
TEXTS.forEach(function (t) {
  MODES.forEach(function (mode) {
    CTXS.forEach(function (ctx) {
      TONES.forEach(function (tone) {
        FORMS.forEach(function (form) {
          const a = refLocalAdapt(t, mode, ctx, tone, form);
          const b = eng.localAdapt(t, mode, ctx, tone, form);
          if (a.output !== b.output || JSON.stringify(a.notes) !== JSON.stringify(b.notes)) diff++;
          hashes.push(sig(a));
        });
      });
    });
  });
});
if (diff) {
  console.error('当前小程序引擎已与 H5 不一致（' + diff + ' 组），拒绝生成基线');
  process.exit(1);
}

const out = {
  version: 1,
  generatedAt: '2026-10-18',
  source: '附录五-技术复原/小程序复现/语脉新生.html（locAdapt 段）',
  note: '附录五不随仓库分发。这里固化 1920 组改编输出的指纹，供 verify_mp.js 在没有原 HTML 时做回归比对。',
  hash: 'FNV-1a 32bit over (output + "\\0" + JSON.stringify(notes))',
  iteration: 'texts → modes → contexts → tones → forms（与 verify_mp.js 完全一致）',
  texts: TEXTS,
  modes: MODES,
  contexts: CTXS,
  tones: TONES,
  forms: FORMS,
  dataHash: dataHash,
  hashes: hashes
};
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log('已生成 ' + OUT);
console.log('签名组数 ' + hashes.length + '，数据指纹 5 项一致，文件 ' + fs.statSync(OUT).size + ' 字节');
