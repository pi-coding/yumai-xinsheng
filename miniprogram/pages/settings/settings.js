const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const config = require('../../utils/config.js');
const app = getApp();

Page({
  data: {
    // 账号与服务端
    loggedIn: false,
    nick: '',
    serverBase: '',
    online: null,
    // 兜底引擎（后端不可用时才生效）
    engineMode: 'local',
    apiBase: '',
    apiKey: '',
    apiModel: '',
    corpus: {
      books: engine.BOOKS.length,
      pairs: engine.PAIRS.length,
      lex: engine.LEX.length,
      c2m: engine.C2M.length,
      cal: engine.CAL.length
    },
    streak: 1,
    version: '2.0.0',
    // 只读参考区默认收起，首屏只留能改的项
    dataOpen: false,
    aboutOpen: false
  },

  onLoad: function(){
    const cfg = store.get('llm', { engine: 'local', base: '', key: '', model: '' });
    const u = api.user();
    this.setData({
      engineMode: cfg.engine || 'local',
      apiBase: cfg.base || '',
      apiKey: cfg.key || '',
      apiModel: cfg.model || '',
      streak: app.globalData.streak || 1,
      loggedIn: api.loggedIn(),
      nick: u ? (u.nickname || u.username) : '',
      serverBase: config.base(),
      online: app.globalData.online
    });
    this.checkServer();
  },

  onShow: function(){
    const u = api.user();
    this.setData({
      loggedIn: api.loggedIn(),
      nick: u ? (u.nickname || u.username) : ''
    });
  },

  checkServer: function(){
    const self = this;
    api.probe().then(function(ok){
      self.setData({ online: ok });
      app.globalData.online = ok;
    });
  },

  /* ---------------- 账号 ---------------- */
  toLogin: function(){ wx.navigateTo({ url: '/pages/login/login' }); },
  logout: function(){
    const self = this;
    api.logout().then(function(){
      self.setData({ loggedIn: false, nick: '' });
      store.toast('已退出登录');
    });
  },

  /* ---------------- 服务端地址 ---------------- */
  onBase: function(e){ this.setData({ serverBase: e.detail.value }); },
  saveBase: function(){
    config.setBase(this.data.serverBase);
    this.setData({ serverBase: config.base() });
    store.toast('后端地址已保存');
    this.checkServer();
  },
  resetBase: function(){
    config.setBase(config.DEFAULT_BASE);
    this.setData({ serverBase: config.DEFAULT_BASE });
    store.toast('已恢复默认地址');
    this.checkServer();
  },

  /* ---------------- 兜底引擎 ---------------- */
  onEngine: function(e){
    this.setData({ engineMode: e.detail.value });
  },
  onKey: function(e){ this.setData({ apiKey: e.detail.value }); },
  onModel: function(e){ this.setData({ apiModel: e.detail.value }); },
  onApiBase: function(e){ this.setData({ apiBase: e.detail.value }); },

  save: function(){
    const d = this.data;
    if (d.engineMode === 'api' && !d.apiBase.trim()){ store.toast('请先填写 API 地址'); return; }
    store.set('llm', {
      engine: d.engineMode,
      base: d.apiBase.trim(),
      key: d.apiKey.trim(),
      model: d.apiModel.trim()
    });
    store.toast(d.engineMode === 'api' ? '已启用大模型兜底' : '已切换到本地规则引擎兜底');
  },

  test: function(){
    const cfg = { engine: 'api', base: this.data.apiBase.trim(), key: this.data.apiKey.trim(), model: this.data.apiModel.trim() };
    if (!cfg.base){ store.toast('请先填写 API 地址'); return; }
    wx.showLoading({ title: '测试中…', mask: true });
    engine.apiAdapt(cfg, '我emo了', 'm2c', '日常', '自然', '网络改编')
      .then(function(res){
        wx.hideLoading();
        wx.showModal({ title: '连接成功', content: res.output, showCancel: false });
      })
      .catch(function(err){
        wx.hideLoading();
        wx.showModal({
          title: '连接失败',
          content: String(err.message || err) + '\n请检查：1) 地址是否 https 且已加入 request 合法域名 2) Key 是否有效',
          showCancel: false
        });
      });
  },

  /* ---------------- 只读参考区折叠 ---------------- */
  onToggleData: function(){ this.setData({ dataOpen: !this.data.dataOpen }); },
  onToggleAbout: function(){ this.setData({ aboutOpen: !this.data.aboutOpen }); },

  clearData: function(){
    const self = this;
    wx.showModal({
      title: '清空本地数据',
      content: '将删除本机的收藏、改编作品、改编历史、连续天数与兜底引擎设置。服务端已保存的数据不受影响。此操作不可撤销。',
      confirmText: '确认清空',
      confirmColor: '#c0504d',
      success: function(r){
        if (!r.confirm) return;
        ['favBooks', 'works', 'history', 'llm', 'streak'].forEach(function(k){ store.del(k); });
        app.globalData.streak = store.trackStreak();
        self.setData({
          engineMode: 'local', apiBase: '', apiKey: '', apiModel: '',
          streak: app.globalData.streak
        });
        store.toast('本地数据已清空');
      }
    });
  },

  copyReport: function(){
    wx.setClipboardData({
      data: '语脉新生小程序 v' + this.data.version + '｜古籍 ' + this.data.corpus.books + ' 部｜语料对 ' +
            this.data.corpus.pairs + ' 条｜词典 ' + (this.data.corpus.lex + this.data.corpus.c2m) + ' 条｜日历 ' +
            this.data.corpus.cal + ' 条｜后端 ' + this.data.serverBase,
      success: function(){ store.toast('已复制'); }
    });
  }
});
