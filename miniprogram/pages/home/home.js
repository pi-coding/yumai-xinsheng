const store = require('../../utils/store.js');
const engine = require('../../utils/engine.js');
const repo = require('../../utils/repo.js');
const api = require('../../utils/api.js');
const VD = require('../../utils/verdictdata.js');
const app = getApp();

Page({
  data: {
    stats: { books: 0, works: 0, days: 1 },
    online: null,
    loggedIn: false,
    nick: '',
    quick: [
      { key: 'books',    icon: '📚', title: '古籍书库',     desc: '经史子集 · ' + engine.BOOKS.length + ' 部，含要旨与名句' },
      { key: 'calendar', icon: '🗓️', title: '古风科普日历', desc: '每日一词 · ' + engine.CAL.length + ' 条词条' },
      { key: 'fav',      icon: '♥',  title: '我的',         desc: '收藏 · 作品 · 账号与设置' }
    ],
    corpus: {
      books: engine.BOOKS.length,
      pairs: engine.PAIRS.length,
      lex: engine.LEX.length + engine.C2M.length,
      cal: engine.CAL.length,
      misinfo: VD.MISINFO.length,
      verified: VD.VERIFIED.length
    }
  },

  onShow: function(){
    const u = api.user();
    this.setData({
      loggedIn: api.loggedIn(),
      nick: u ? (u.nickname || u.username) : '',
      online: app.globalData.online
    });
    this.refresh();
    // 每次进首页顺手探一次后端，状态行才可信
    const self = this;
    app.checkServer().then(function(ok){
      self.setData({ online: ok });
      if (ok && api.loggedIn()) self.refreshFromServer();
    });
  },

  refresh: function(){
    this.setData({
      stats: {
        books: store.get('favBooks', []).length,
        works: store.get('works', []).length,
        days: app.globalData.streak || 1
      }
    });
  },

  /* 登录后以服务端收藏数为准，避免本机缓存与云端不一致 */
  refreshFromServer: function(){
    const self = this;
    repo.favNames().then(function(r){
      if (r.source !== 'server') return;
      self.setData({ 'stats.books': r.data.total });
    }).catch(function(){});
  },

  toBooks: function(){ wx.switchTab({ url: '/pages/books/books' }); },
  toWorkshop: function(){ wx.switchTab({ url: '/pages/workshop/workshop' }); },
  toVerify: function(){ wx.navigateTo({ url: '/pages/verify/verify' }); },
  toLogin: function(){ wx.navigateTo({ url: '/pages/login/login' }); },
  onQuick: function(e){
    const k = e.currentTarget.dataset.key;
    wx.switchTab({ url: '/pages/' + k + '/' + k });
  },
  toSettings: function(){ wx.navigateTo({ url: '/pages/settings/settings' }); },
  toCalendar: function(){ wx.switchTab({ url: '/pages/calendar/calendar' }); }
});
