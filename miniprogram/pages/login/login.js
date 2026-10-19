/* ================================================================
   登录 / 注册：登录后收藏、核验流水、改编历史走服务端，可跨设备
   ================================================================ */
const api = require('../../utils/api.js');
const repo = require('../../utils/repo.js');
const config = require('../../utils/config.js');
const store = require('../../utils/store.js');

Page({
  data: {
    tab: 'login',
    username: '',
    password: '',
    nickname: '',
    busy: false,
    errMsg: '',
    online: null,          // null 未探测 / true 在线 / false 离线
    base: config.base(),
    showBase: false,
    loggedIn: false,
    nickname0: '',
    favCount: 0
  },

  onLoad: function(){
    this.setData({ loggedIn: api.loggedIn(), base: config.base() });
    const u = api.user();
    if (u) this.setData({ nickname0: u.nickname || u.username || '' });
    this.checkServer();
  },

  checkServer: function(){
    const self = this;
    api.probe().then(function(ok){ self.setData({ online: ok }); });
  },

  onTab: function(e){
    this.setData({ tab: e.currentTarget.dataset.t, errMsg: '' });
  },
  onUser: function(e){ this.setData({ username: e.detail.value }); },
  onPass: function(e){ this.setData({ password: e.detail.value }); },
  onNick: function(e){ this.setData({ nickname: e.detail.value }); },
  onToggleBase: function(){ this.setData({ showBase: !this.data.showBase }); },
  onBase: function(e){ this.setData({ base: e.detail.value }); },

  saveBase: function(){
    config.setBase(this.data.base);
    this.setData({ base: config.base() });
    store.toast('后端地址已保存');
    this.checkServer();
  },

  /* 未起后端时一键跳到本机默认地址，避免用户手打 */
  resetBase: function(){
    config.setBase(config.DEFAULT_BASE);
    this.setData({ base: config.DEFAULT_BASE });
    store.toast('已恢复默认地址');
    this.checkServer();
  },

  submit: function(){
    const self = this;
    if (this.data.busy) return;
    const u = this.data.username.trim();
    const p = this.data.password;
    if (!u || !p){ this.setData({ errMsg: '请填写账号与密码' }); return; }
    if (this.data.tab === 'register' && p.length < 6){
      this.setData({ errMsg: '密码至少 6 位' }); return;
    }
    this.setData({ busy: true, errMsg: '' });

    const call = this.data.tab === 'login'
      ? api.login(u, p)
      : api.register(u, p, this.data.nickname.trim() || u);

    call.then(function(user){
      return repo.mergeFav().then(function(){ return user; });
    }).then(function(user){
      self.setData({ busy: false, loggedIn: true, nickname0: (user && (user.nickname || user.username)) || u });
      store.toast(self.data.tab === 'login' ? '欢迎回来' : '账号已创建');
      wx.navigateBack({
        fail: function(){ wx.switchTab({ url: '/pages/home/home' }); }
      });
    }).catch(function(err){
      self.setData({ busy: false, errMsg: (err && err.msg) || '操作失败' });
    });
  },

  logout: function(){
    const self = this;
    api.logout().then(function(){
      self.setData({ loggedIn: false, nickname0: '', username: '', password: '', errMsg: '' });
      store.toast('已退出登录');
    });
  },

  back: function(){
    wx.navigateBack({
      fail: function(){ wx.switchTab({ url: '/pages/home/home' }); }
    });
  },

  /* 不登录也有一条明路：直接去看书库，别把人堵在这页 */
  toBooks: function(){ wx.switchTab({ url: '/pages/books/books' }); }
});
