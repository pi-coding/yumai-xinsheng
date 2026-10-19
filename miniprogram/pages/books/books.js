const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');
const repo = require('../../utils/repo.js');
const api = require('../../utils/api.js');

const BUS = ['全部', '经部', '史部', '子部', '集部'];

Page({
  data: {
    bus: BUS,
    bu: '全部',
    q: '',
    list: [],
    shown: 0,
    total: engine.BOOKS.length,
    loading: false,
    src: '',                 // server | local
    loggedIn: false,
    timer: null
  },

  onShow: function(){
    this.setData({ loggedIn: api.loggedIn() });
    this.load();
  },

  /* 服务端优先，断网时 repo 自动回退本地 60 部 */
  load: function(){
    const self = this;
    const seq = (this._seq || 0) + 1;
    this._seq = seq;
    this.setData({ loading: true });

    repo.books({ kw: this.data.q.trim(), bu: this.data.bu, size: 60 }).then(function(r){
      if (seq !== self._seq) return;           // 输入很快时丢弃过期响应
      const fav = store.get('favBooks', []);
      const rows = r.data.list.map(function(b){
        const t = engine.coverTheme(b);
        return {
          name: b.name,
          bu: b.bu,
          buShort: b.bu.charAt(0),
          era: b.era,
          author: b.author,
          intro: b.intro,
          c1: t.c1,
          c2: t.c2,
          title: t.title,
          fsize: t.size * 2,
          fav: fav.indexOf(b.name) >= 0
        };
      });
      self.setData({
        list: rows,
        shown: rows.length,
        total: r.data.poolSize || engine.BOOKS.length,
        loading: false,
        src: r.source
      });
    }).catch(function(){
      if (seq !== self._seq) return;
      self.setData({ loading: false });
      store.toast('书库加载失败');
    });
  },

  onTab: function(e){
    this.setData({ bu: e.currentTarget.dataset.bu });
    this.load();
  },

  /* 输入防抖 300ms：服务端检索不至于每敲一个字都发一次 */
  onInput: function(e){
    const v = e.detail.value;
    this.setData({ q: v });
    if (this.data.timer) clearTimeout(this.data.timer);
    const self = this;
    const t = setTimeout(function(){ self.load(); }, 300);
    this.setData({ timer: t });
  },

  onClear: function(){
    this.setData({ q: '' });
    this.load();
  },

  /* 空结果时一键回到全量：筛选条与关键词同时复位 */
  onReset: function(){
    this.setData({ q: '', bu: '全部' });
    this.load();
  },

  toggleFav: function(e){
    const self = this;
    const name = e.currentTarget.dataset.name;
    repo.toggleFav(name).then(function(r){
      store.toast(r.data.favorited ? '已收藏《' + name + '》' : '已取消收藏');
      if (r.source === 'local' && api.loggedIn()) store.toast('离线：收藏只存在本机');
      self.load();
    });
  },

  /* 未登录时点「去登录」，避免用户以为收藏丢了 */
  /* 书库是「挑句子」的环节，下一步天然是核验 */
  toVerify: function(){ wx.navigateTo({ url: '/pages/verify/verify' }); },

  toLogin: function(){
    wx.navigateTo({ url: '/pages/login/login' });
  },

  openBook: function(e){
    wx.navigateTo({ url: '/pages/book/book?name=' + encodeURIComponent(e.currentTarget.dataset.name) });
  }
});
