const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');
const repo = require('../../utils/repo.js');
const api = require('../../utils/api.js');

const PH_M2C = '输入现代白话或网络用语，比如：今天上班好困啊，不想干活只想摸鱼';
const PH_C2M = '输入文言文，比如：落霞与孤鹜齐飞，秋水共长天一色';

Page({
  data: {
    mode: 'm2c',
    modes: [
      { k: 'm2c', t: '现代文 → 古风' },
      { k: 'c2m', t: '文言文 → 通俗' }
    ],
    contexts: engine.CONTEXTS,
    tones: engine.TONES,
    forms: engine.FORMS,
    ctxIdx: 0, toneIdx: 1, formIdx: 2,
    paramOpen: false,
    input: '',
    placeholder: PH_M2C,
    // WXML 不支持函数调用，示例的长短标签在 JS 侧算好
    egs: engine.EGS.map(function(x){
      return { v: x, label: x.length > 12 ? x.slice(0, 12) + '…' : x };
    }),
    hasOut: false,
    out: '',
    notes: [],
    params: '',
    running: false,
    canSave: false,
    works: [], history: [], workCount: 0, hisCount: 0,
    src: '',                  // server | local：这一次改编由谁算出来的
    loggedIn: false
  },

  onShow: function(){
    this.setData({ loggedIn: api.loggedIn() });
    // 从「古籍书库 · 名句」带过来的一句：直接填进输入框，并切到「文言 → 通俗」
    const pre = store.get('prefill', '');
    if (pre){
      store.del('prefill');
      this.setData({ input: pre, mode: 'c2m', placeholder: PH_C2M });
      store.toast('已带入名句');
    }
    this.renderLists();
  },

  /* ---------------- 参数交互 ---------------- */
  onMode: function(e){
    const k = e.currentTarget.dataset.k;
    this.setData({ mode: k, placeholder: k === 'm2c' ? PH_M2C : PH_C2M });
  },
  onCtx: function(e){ this.setData({ ctxIdx: +e.detail.value }); },
  onTone: function(e){ this.setData({ toneIdx: +e.detail.value }); },
  onForm: function(e){ this.setData({ formIdx: +e.detail.value }); },
  /* 参数区默认收起，首次改编或手动点开才展开 */
  onToggleParam: function(){ this.setData({ paramOpen: !this.data.paramOpen }); },
  onInput: function(e){ this.setData({ input: e.detail.value }); },
  onEg: function(e){ this.setData({ input: e.currentTarget.dataset.v }); },
  onClearIn: function(){ this.setData({ input: '' }); },

  /* ---------------- 开始改编 ---------------- */
  onAdapt: function(){
    const self = this;
    const text = (this.data.input || '').trim();
    if (!text){ store.toast('请先输入内容'); return; }
    if (this.data.running) return;

    const mode = this.data.mode;
    const ctx  = engine.CONTEXTS[this.data.ctxIdx];
    const tone = engine.TONES[this.data.toneIdx];
    const form = engine.FORMS[this.data.formIdx];

    this.setData({ running: true });

    repo.adapt(text, mode, ctx, tone, form).then(function(r){
      const res = r.data;
      self.setData({
        out: res.output,
        notes: res.notes,
        params: (mode === 'm2c' ? '现代文→古风' : '文言文→通俗') + ' / ' + ctx + ' / ' + tone + ' / ' + form,
        hasOut: true,
        running: false,
        canSave: true,
        src: r.source
      });
      const history = store.get('history', []);
      history.unshift({ in: text, out: res.output, mode: mode, at: Date.now() });
      store.set('history', history.slice(0, 40));
      self.renderLists();
    }).catch(function(err){
      self.setData({ running: false });
      store.toast((err && err.msg) || '改编失败');
    });
  },

  /* ---------------- 作品集 ---------------- */
  onSave: function(){
    if (!this.data.out) return;
    const cur = this.data.out;
    const works = store.get('works', []);
    if (works.some(function(w){ return w.text === cur; })){
      store.toast('已在作品集中'); return;
    }
    works.unshift({ text: cur, mode: this.data.mode, at: Date.now() });
    store.set('works', works.slice(0, 60));
    store.toast('已加入我的作品');
    this.renderLists();
  },

  onDelWork: function(e){
    const i = +e.currentTarget.dataset.i;
    const works = store.get('works', []);
    works.splice(i, 1);
    store.set('works', works);
    this.renderLists();
    store.toast('已删除');
  },

  onUseHistory: function(e){
    this.setData({ input: e.currentTarget.dataset.v, hasOut: false });
  },

  renderLists: function(){
    const works = store.get('works', []);
    const history = store.get('history', []);
    this.setData({
      workCount: works.length,
      hisCount: history.length,
      works: works.slice(0, 10).map(function(w, i){
        return {
          i: i, text: w.text,
          dir: w.mode === 'm2c' ? '现代→古风' : '文言→通俗',
          date: store.fmtDate(w.at)
        };
      }),
      history: history.slice(0, 10).map(function(h, i){
        return {
          i: i,
          text: h.in,
          dir: h.mode === 'm2c' ? '现代→古风' : '文言→通俗',
          time: store.fmtTime(h.at)
        };
      })
    });
  },

  toSettings: function(){ wx.navigateTo({ url: '/pages/settings/settings' }); },

  /* 下一步：把刚改编的结果直接带去溯源核验（verify 是普通页，走 navigateTo + query） */
  toVerify: function(){
    const t = (this.data.out || this.data.input || '').trim();
    if (!t){ wx.showToast({ title: '先输入或改编一句', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/verify/verify?text=' + encodeURIComponent(t) });
  }
});
