const engine = require('../../utils/engine.js');
const repo = require('../../utils/repo.js');

/* 与服务端同一排期规则：epochDay % 词条数（LocalDate.toEpochDay 与 UTC 日序一致） */
function pickFrom(list, y, m, d){
  const key = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return list[((key % list.length) + list.length) % list.length];
}

Page({
  data: {
    dateStr: '',
    weekStr: '',
    isToday: true,
    e: null,
    isDebunk: false,
    cats: [],
    cat: '全部',
    q: '',
    list: [],
    countText: '',
    src: '',
    rule: ''
  },

  onLoad: function(){
    const t = new Date();
    this.y = t.getFullYear(); this.m = t.getMonth() + 1; this.d = t.getDate();
    this.pool = engine.CAL;      // 先用内置数据渲染，接口回来再替换，避免白屏
    this.renderAll();
    this.load();
  },

  /* 16 条词条以服务端为准；连不上就用内置的同一份数据 */
  load: function(){
    const self = this;
    repo.calendar().then(function(r){
      const list = r.data.list && r.data.list.length ? r.data.list : engine.CAL;
      self.pool = list;
      self.setData({ src: r.source, rule: r.data.rule || '' });
      const cats = ['全部'];
      list.forEach(function(x){ if (cats.indexOf(x.category) < 0) cats.push(x.category); });
      self.setData({ cats: cats });
      self.renderAll();
    }).catch(function(){
      self.setData({ src: 'local' });
    });
  },

  renderAll: function(){
    this.renderToday();
    this.renderList();
  },

  /* ---------------- 今日词条 ---------------- */
  renderToday: function(){
    const pool = this.pool || engine.CAL;
    const y = this.y, m = this.m, d = this.d;
    const dt = new Date(y, m - 1, d);
    const e = pickFrom(pool, y, m, d);
    const now = new Date();
    this.setData({
      dateStr: y + '年' + engine.pad(m) + '月' + engine.pad(d) + '日',
      weekStr: engine.WEEK_CN[dt.getDay()],
      isToday: (now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d),
      e: {
        word: e.word,
        category: e.category,
        modern: e.modern,
        source: e.source,
        grammar: e.grammar,
        usage: e.usage,
        misuse: e.misuse,
        examples: e.examples
      },
      isDebunk: (e.category || '').indexOf('辟谣') >= 0
    });
  },

  step: function(n){
    const dt = new Date(this.y, this.m - 1, this.d + n);
    this.y = dt.getFullYear(); this.m = dt.getMonth() + 1; this.d = dt.getDate();
    this.renderAll();
  },
  prev: function(){ this.step(-1); },
  next: function(){ this.step(1); },
  today: function(){
    const t = new Date();
    this.y = t.getFullYear(); this.m = t.getMonth() + 1; this.d = t.getDate();
    this.renderAll();
  },

  /* ---------------- 分类与检索 ---------------- */
  onCat: function(e){
    this.setData({ cat: e.currentTarget.dataset.c });
    this.renderList();
  },

  onInput: function(e){
    this.setData({ q: e.detail.value });
    this.renderList();
  },
  onClear: function(){ this.setData({ q: '' }); this.renderList(); },

  renderList: function(){
    const pool = this.pool || engine.CAL;
    const cat = this.data.cat;
    const kw = this.data.q.trim().toLowerCase();
    const curWord = pickFrom(pool, this.y, this.m, this.d).word;
    const rows = pool.filter(function(x){
      const okC = cat === '全部' || x.category === cat;
      const okK = !kw || [x.word, x.modern, x.source, x.category, x.usage].join(' ').toLowerCase().indexOf(kw) >= 0;
      return okC && okK;
    }).map(function(x){
      return {
        word: x.word,
        modern: x.modern,
        cat: x.category.split(' · ')[0],
        on: x.word === curWord
      };
    });
    this.setData({
      list: rows,
      countText: '共 ' + pool.length + ' 条 · 显示 ' + rows.length + ' 条'
      + (this.data.src === 'local' ? ' · 离线数据' : '')
    });
  },

  /* 点击列表项：回溯到最近一次出现该词条的日期 */
  onPickWord: function(e){
    const pool = this.pool || engine.CAL;
    const w = e.currentTarget.dataset.w;
    const base = new Date(this.y, this.m - 1, this.d);
    for (let i = 0; i < pool.length * 2; i++){
      const dt = new Date(base.getTime() - i * 86400000);
      const ent = pickFrom(pool, dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      if (ent.word === w){
        this.y = dt.getFullYear(); this.m = dt.getMonth() + 1; this.d = dt.getDate();
        break;
      }
    }
    this.renderAll();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  /* 日历给词，下一步是拿这些词去写 */
  toWorkshop: function(){ wx.switchTab({ url: '/pages/workshop/workshop' }); },

  copyWord: function(){
    wx.setClipboardData({
      data: this.data.e.word + '：' + this.data.e.modern + '\n出处：' + this.data.e.source,
      success: function(){ wx.showToast({ title: '已复制', icon: 'none' }); }
    });
  }
});
