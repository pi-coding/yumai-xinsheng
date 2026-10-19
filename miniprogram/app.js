/* 语脉新生 · 小程序入口（全栈版：默认连「server」，连不上自动离线兜底） */
const store = require('./utils/store.js');
const api = require('./utils/api.js');

App({
  globalData: {
    streak: 1,
    version: '2.0.0',
    online: null          // null 未探测 / true 已连后端 / false 离线
  },
  onLaunch: function(){
    this.globalData.streak = store.trackStreak();
    this.checkServer();
  },
  onShow: function(){
    // 从后台切回来时顺手探一次：后端起晚了大可不必重启小程序
    this.checkServer();
  },
  /* 供各页面读取 / 刷新在线状态 */
  checkServer: function(){
    const self = this;
    return api.probe().then(function(ok){
      self.globalData.online = ok;
      return ok;
    });
  }
});
