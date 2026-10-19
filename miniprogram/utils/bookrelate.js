/* ================================================================
   书目关联计算（小程序端本地实现，与全栈版 BookService.detail 同口径）
   目标：任何一部书点开都不留空页——
     1) 直接引用：语料出处里出现书名或通行别名
     2) 同部类参考：直接引用为 0 时，取同部类语料作语境参照（明确不是本书引文）
     3) 同作者作品：作者相同，是否收入本集未逐篇核对
     4) 相关词条：出处命中书名/别名，或命中本书名句的篇名
     5) 名句摘录 + 要旨 + 部类导读：来自 booknotes.js
   ================================================================ */
const engine = require('./engine.js');
const BN = require('./booknotes.js');

const BOOKS = engine.BOOKS;
const PAIRS = engine.PAIRS;
const CAL = engine.CAL;

function notesOf(name) {
  return BN.BOOK_NOTES[name] || null;
}

/* 出处是否引用了本书 */
function citedBy(source, name) {
  if (!source) return false;
  if (source.indexOf(name) >= 0) return true;
  const n = notesOf(name);
  if (!n || !n.alias) return false;
  for (let i = 0; i < n.alias.length; i++) {
    const a = n.alias[i];
    if (a === name) continue;
    // 短别名（如「易」）必须带书名号，避免误伤普通词
    if (source.indexOf('《' + a) >= 0) return true;
    if (a.length >= 2 && source.indexOf(a) >= 0) return true;
  }
  return false;
}

/* 日历出处里是否出现本书名句的篇名（如「水调歌头」） */
function hitsQuote(source, name) {
  const n = notesOf(name);
  if (!source || !n || !n.quotes) return false;
  for (let i = 0; i < n.quotes.length; i++) {
    const from = n.quotes[i].from || '';
    const key = from.split('·')[0];
    if (key.length >= 3 && source.indexOf(key) >= 0) return true;
  }
  return false;
}

/* 反查一条语料出处的主人书 */
function bookOfSource(source) {
  if (!source) return null;
  for (let i = 0; i < BOOKS.length; i++) {
    if (source.indexOf(BOOKS[i].name) >= 0) return BOOKS[i];
  }
  for (let i = 0; i < BOOKS.length; i++) {
    const n = notesOf(BOOKS[i].name);
    if (!n || !n.alias) continue;
    for (let j = 0; j < n.alias.length; j++) {
      if (source.indexOf('《' + n.alias[j]) >= 0) return BOOKS[i];
    }
  }
  return null;
}

function brief(p) {
  return { modern: p.modern, ancient: p.ancient, source: p.source || '' };
}

function relate(name) {
  const book = BOOKS.filter(function (x) { return x.name === name; })[0];
  if (!book) return null;
  const n = notesOf(name);

  const pairs = [];
  for (let i = 0; i < PAIRS.length; i++) {
    if (citedBy(PAIRS[i].source, name)) pairs.push(brief(PAIRS[i]));
  }

  const calendar = [];
  for (let i = 0; i < CAL.length; i++) {
    if (citedBy(CAL[i].source, name) || hitsQuote(CAL[i].source, name)) {
      calendar.push({
        word: CAL[i].word,
        modern: CAL[i].modern || '',
        category: CAL[i].category || '',
        source: CAL[i].source || ''
      });
    }
  }

  const buPairs = [];
  if (!pairs.length) {
    for (let i = 0; i < PAIRS.length && buPairs.length < 6; i++) {
      const owner = bookOfSource(PAIRS[i].source);
      if (owner && owner.bu === book.bu) buPairs.push(brief(PAIRS[i]));
    }
  }

  const seen = {};
  pairs.forEach(function (p) { seen[p.modern] = 1; });

  const authors = [];
  if (book.author && book.author.length >= 2) authors.push(book.author);
  if (n && n.authorAlias) {
    for (let i = 0; i < n.authorAlias.length; i++) authors.push(n.authorAlias[i]);
  }

  const authorPairs = [];
  if (authors.length) {
    for (let i = 0; i < PAIRS.length; i++) {
      const src = PAIRS[i].source || '';
      if (!src || seen[PAIRS[i].modern]) continue;
      for (let j = 0; j < authors.length; j++) {
        const a = authors[j];
        if (a.length >= 2 && src.indexOf(a) >= 0) {
          authorPairs.push(brief(PAIRS[i]));
          seen[PAIRS[i].modern] = 1;
          break;
        }
      }
    }
  }

  const sameBu = [];
  for (let i = 0; i < BOOKS.length && sameBu.length < 8; i++) {
    if (BOOKS[i].name !== name && BOOKS[i].bu === book.bu) {
      const b = BOOKS[i];
      const bn = notesOf(b.name);
      sameBu.push({
        name: b.name,
        era: b.era,
        quoteCount: (bn && bn.quotes) ? bn.quotes.length : 0
      });
    }
  }

  return {
    book: book,
    note: n ? (n.note || '') : '',
    alias: n && n.alias ? n.alias : [],
    quotes: n && n.quotes ? n.quotes : [],
    buIntro: BN.BU_INTRO[book.bu] || '',
    pairs: pairs,
    buPairs: buPairs,
    authorPairs: authorPairs,
    calendar: calendar,
    sameBu: sameBu,
    pairCount: pairs.length,
    calendarCount: calendar.length,
    quoteCount: (n && n.quotes) ? n.quotes.length : 0
  };
}

module.exports = { relate: relate, citedBy: citedBy, bookOfSource: bookOfSource };
