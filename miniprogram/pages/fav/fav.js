const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');
const repo = require('../../utils/repo.js');
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    tab: 'books',
    bookCount: 0,
    workCount: 0,
    hisCount: 0,
    books: [],
    works: [],
    history: [],
    hisOpen: false,        // 服务端改编记录默认收起，避免与本机作品集混淆
    loggedIn: false,
    nick: '',
    days: 1,
    src: '',
    loading: false
  },

  onShow: function(){
    const u = api.user();
    this.setData({
      loggedIn: api.loggedIn(),
      nick: u ? (u.nickname || u.username) : '',
      days: app.globalData.streak || 1
    });
    this.render();
  },

  /* 「我的」页就是账号终点：退出后原地刷新，不弹回首页 */
  logout: function(){
    const self = this;
    api.logout().then(function(){
      self.setData({ loggedIn: false, nick: '' });
      store.toast('已退出登录');
      self.render();
    });
  },

  onTab: function(e){
    this.setData({ tab: e.currentTarget.dataset.t });
    this.render();
  },

  onToggleHis: function(){
    this.setData({ hisOpen: !this.data.hisOpen });
  },

  /* 古籍：登录后取服务端收藏（repo 会顺手同步到本地 ymxs_favBooks）；
     作品：本地手动保存的；改编记录：登录后取服务端 adapt_log（只读）。 */
  render: function(){
    const self = this;
    this.setData({ loading: true });

    const favP = repo.favNames();
    const booksP = repo.books({ size: 60 });

    Promise.all([favP, booksP]).then(function(res){
      const favNames = (res[0].data && res[0].data.names) || [];
      const all = (res[1].data && res[1].data.list) || [];
      const byName = {};
      all.forEach(function(b){ byName[b.name] = b; });

      const books = favNames.map(function(n){ return byName[n]; }).filter(Boolean).map(function(b){
        const t = engine.coverTheme(b);
        return {
          name: b.name, bu: b.bu, buShort: b.bu.charAt(0), era: b.era, author: b.author, intro: b.intro,
          c1: t.c1, c2: t.c2, title: t.title, fsize: t.size * 2
        };
      });

      const works = store.get('works', []);
      self.setData({
        books: books,
        bookCount: books.length,
        works: works.map(function(w, i){
          return {
            i: i, text: w.text,
            dir: w.mode === 'm2c' ? '现代→古风' : '文言→通俗',
            date: store.fmtDateTime(w.at)
          };
        }),
        workCount: works.length,
        src: res[0].source,
        loading: false
      });
    }).catch(function(){
      self.setData({ loading: false });
    });

    if (api.loggedIn()){
      repo.adaptHistory(10).then(function(r){
        const rows = (r.data || []).map(function(h){
          return {
            input: h.input || '',
            output: h.output || '',
            dir: h.mode === 'm2c' ? '现代→古风' : '文言→通俗',
            time: String(h.at || '').replace('T', ' ').slice(0, 16)
          };
        });
        self.setData({ history: rows, hisCount: rows.length });
      }).catch(function(){ self.setData({ history: [], hisCount: 0 }); });
    } else {
      this.setData({ history: [], hisCount: 0 });
    }
  },

  unfavBook: function(e){
    const self = this;
    const name = e.currentTarget.dataset.name;
    repo.toggleFav(name).then(function(r){
      store.toast(r.data.favorited ? '已收藏' : '已取消收藏');
      self.render();
    });
  },

  openBook: function(e){
    wx.navigateTo({ url: '/pages/book/book?name=' + encodeURIComponent(e.currentTarget.dataset.name) });
  },

  delWork: function(e){
    const i = +e.currentTarget.dataset.i;
    const works = store.get('works', []);
    works.splice(i, 1);
    store.set('works', works);
    store.toast('已删除');
    this.render();
  },

  copyWork: function(e){
    wx.setClipboardData({
      data: e.currentTarget.dataset.v,
      success: function(){ store.toast('已复制'); }
    });
  },

  toBooks: function(){ wx.switchTab({ url: '/pages/books/books' }); },
  toWorkshop: function(){ wx.switchTab({ url: '/pages/workshop/workshop' }); },
  toSettings: function(){ wx.navigateTo({ url: '/pages/settings/settings' }); },
  toLogin: function(){ wx.navigateTo({ url: '/pages/login/login' }); }
});
