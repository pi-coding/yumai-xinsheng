const store = require('../../utils/store.js');
const repo = require('../../utils/repo.js');

const SAMPLE_BAD = '无人与我立黄昏，无人问我粥可温';
const SAMPLE_MIX = '人生若只如初见，何事秋风悲画扇\n无人与我立黄昏，无人问我粥可温';
const SAMPLE_OK = '长风破浪会有时，直挂云帆济沧海';

const TYPE_LABEL = {
  misinfo: '误传案例',
  verified: '真典',
  pair: '语料对',
  calendar: '日历词条',
  modern: '现代网语'
};

Page({
  data: {
    tab: 'check',
    text: '',
    result: null,
    busy: false,
    indexSize: 0,
    casesTotal: 0,
    verifiedTotal: 0,
    src: '',                 // server | local
    // 案例库
    level: '',
    levels: [],
    kw: '',
    list: []
  },

  onLoad: function(options){
    const self = this;
    this.setData({ levels: [], list: [] });

    repo.verifyMeta().then(function(r){
      const d = r.data;
      self.setData({
        src: r.source,
        indexSize: d.indexSize,
        casesTotal: d.casesTotal,
        verifiedTotal: d.verifiedTotal,
        levels: Object.keys(d.levels).map(function (k) { return { name: k, count: d.levels[k] }; })
      });
    });

    this.loadCases('', '');

    // 从改编工坊带过来的一句：直接核验，省一次点击
    const pre = options && options.text ? decodeURIComponent(options.text) : '';
    if (pre) {
      this.setData({ text: pre, tab: 'check' });
      this.run(pre);
    }
  },

  /* 命中条目补两个展示字段：颜色类与类型中文名 */
  decorate: function(list){
    return (list || []).map(function (c) {
      return {
        phrase: c.phrase,
        level: c.level,
        check: c.check || '',
        wrong: c.wrong || '',
        truth: c.truth || '',
        advice: c.advice || '',
        cls: c.level === '伪古风' ? 'lv-bad' : 'lv-warn'
      };
    });
  },

  onTab: function(e){
    this.setData({ tab: e.currentTarget.dataset.t });
  },
  onInput: function(e){
    this.setData({ text: e.detail.value });
  },
  onSample: function(e){
    const k = e.currentTarget.dataset.k;
    const v = k === 'bad' ? SAMPLE_BAD : k === 'mix' ? SAMPLE_MIX : SAMPLE_OK;
    this.setData({ text: v });
    this.run(v);
  },
  onClear: function(){
    this.setData({ text: '', result: null });
  },

  run: function(opt){
    const self = this;
    const text = typeof opt === 'string' ? opt : this.data.text;
    if (!text || !text.trim()) {
      wx.showToast({ title: '请先输入文案', icon: 'none' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true });

    repo.verify(text).then(function(r){
      const res = r.data;
      res.segments = (res.segments || []).map(function (seg) {
        seg.cls = seg.verdict.order >= 3 ? 'lv-bad' : seg.verdict.order === 2 ? 'lv-warn'
          : seg.verdict.order === 1 ? 'lv-ok' : 'lv-none';
        seg.hits = (seg.hits || []).map(function (h) {
          return {
            label: h.label,
            level: h.level,
            kind: h.kind,
            kindText: TYPE_LABEL[h.kind] || h.kind,
            source: h.source || '',
            note: h.note || '',
            advice: h.advice || '',
            check: h.check || '',
            modern: h.modern || '',
            cls: h.level === '伪古风' ? 'lv-bad'
              : (h.level === '出处讹变' || h.level === '出处存疑') ? 'lv-warn'
                : h.level === '现代网语' ? 'lv-info' : 'lv-ok'
          };
        });
        seg.countLine = '本段命中 ' + seg.counts.total + ' 处：可溯源 ' + seg.counts.traceable
          + '、存疑或讹变 ' + seg.counts.suspect
          + (seg.counts.modern ? '、现代网语 ' + seg.counts.modern : '');
        return seg;
      });
      const ov = res.overall || {};
      ov.cls = res.segments.length ? res.segments[0].cls : 'lv-none';
      if (ov.order >= 3) ov.cls = 'lv-bad';
      else if (ov.order === 2) ov.cls = 'lv-warn';
      else if (ov.order === 1) ov.cls = 'lv-ok';
      else ov.cls = 'lv-none';
      ov.credPct = ov.credibility === null || ov.credibility === undefined ? 0 : ov.credibility;
      ov.hasCred = ov.credibility !== null && ov.credibility !== undefined;
      ov.countLine = '共 ' + ov.counts.total + ' 处命中 · 可溯源 ' + ov.counts.traceable
        + ' · 存疑或讹变 ' + ov.counts.suspect
        + (ov.counts.modern ? ' · 现代网语 ' + ov.counts.modern : '');
      res.overall = ov;
      res.src = r.source;

      self.setData({ result: res, tab: 'check', busy: false, src: r.source });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    }).catch(function(err){
      self.setData({ busy: false });
      wx.showToast({ title: (err && err.msg) || '核验失败', icon: 'none' });
    });
  },

  onKw: function(e){
    this.setData({ kw: e.detail.value });
    this.loadCases(e.detail.value, this.data.level);
  },
  onLevel: function(e){
    const v = e.currentTarget.dataset.v;
    this.setData({ level: v });
    this.loadCases(this.data.kw, v);
  },
  loadCases: function(kw, level){
    const self = this;
    repo.verifyCases(kw || '', level || '').then(function(r){
      self.setData({ list: self.decorate(r.data.list), src: r.source });
    });
  },

  /* 案例库空结果时一键回到全量 */
  onLevelAll: function(){
    this.setData({ level: '', kw: '' });
    this.loadCases('', '');
  },

  /* 核验完的下一步：带着当前文案去改编工坊（tab 页走 switchTab + prefill） */
  toWorkshop: function(){
    const t = (this.data.text || '').trim();
    if (t) store.set('prefill', t);
    wx.switchTab({ url: '/pages/workshop/workshop' });
  },

  /* 拿案例里的一句去核验 */
  tryPhrase: function(e){
    const p = e.currentTarget.dataset.phrase;
    this.setData({ text: p });
    this.run(p);
  },

  copyResult: function(){
    const r = this.data.result;
    if (!r) return;
    const lines = [r.overall.name + '（' + r.overall.credLabel + '）'];
    r.segments.forEach(function (s) {
      lines.push(s.text + ' → ' + s.verdict.name);
    });
    wx.setClipboardData({ data: lines.join('\n') });
  }
});
