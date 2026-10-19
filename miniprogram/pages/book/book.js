const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');
const repo = require('../../utils/repo.js');
const api = require('../../utils/api.js');

Page({
  data: {
    b: null,
    fav: false,
    missing: false,
    src: '',                 // server | local
    loading: true,
    // 关联层
    note: '',
    alias: [],
    quotes: [],
    buIntro: '',
    pairs: [],
    buPairs: [],
    authorPairs: [],
    calendar: [],
    sameBu: [],
    pairCount: 0,
    calendarCount: 0,
    quoteCount: 0
  },

  onLoad: function(options){
    const self = this;
    const name = decodeURIComponent(options.name || '');

    repo.book(name).then(function(r){
      const b = r.data;
      const t = engine.coverTheme(b);
      wx.setNavigationBarTitle({ title: '《' + b.name + '》' });
      self.setData({
        b: {
          name: b.name, bu: b.bu, era: b.era, author: b.author, intro: b.intro,
          c1: t.c1, c2: t.c2, title: t.title, fsize: t.size * 2
        },
        fav: store.get('favBooks', []).indexOf(b.name) >= 0,
        src: r.source,
        loading: false,
        note: b.note,
        alias: b.alias,
        quotes: b.quotes,
        buIntro: b.buIntro,
        pairs: b.pairs,
        buPairs: b.buPairs,
        authorPairs: b.authorPairs,
        calendar: b.calendar,
        sameBu: b.sameBu,
        pairCount: b.pairCount,
        calendarCount: b.calendarCount,
        quoteCount: b.quoteCount
      });
    }).catch(function(){
      self.setData({ missing: true, loading: false });
    });
  },

  toggleFav: function(){
    const self = this;
    const name = this.data.b.name;
    repo.toggleFav(name).then(function(r){
      self.setData({ fav: !!r.data.favorited });
      store.toast(r.data.favorited ? '已收藏《' + name + '》' : '已取消收藏');
      if (r.source === 'local' && api.loggedIn()) store.toast('离线：收藏只存在本机');
    });
  },

  /* 名句一键带进改编工坊（古→今模式看今译） */
  quoteToWorkshop: function(e){
    store.set('prefill', e.currentTarget.dataset.text);
    wx.switchTab({ url: '/pages/workshop/workshop' });
  },

  openBook: function(e){
    wx.navigateTo({ url: '/pages/book/book?name=' + encodeURIComponent(e.currentTarget.dataset.name) });
  },

  toWorkshop: function(){ wx.switchTab({ url: '/pages/workshop/workshop' }); }
});
