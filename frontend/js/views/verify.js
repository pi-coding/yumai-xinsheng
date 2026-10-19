import { api, session } from '../api.js';
import { esc, tag, toast, empty, loading } from '../ui.js';

/**
 * 溯源核验：报告「反伪古风」核心命题的在线实现。
 * 判定口径与附录五 P1 一致：误传库分级（伪古风/出处讹变/出处存疑）、真典与语料对算有据可考、
 * 两类共存判为真伪混杂、都没命中判为未收录（并明确说明「未收录≠伪古风」）。
 */

const state = {
    tab: 'check',
    text: '',
    result: null,
    busy: false,
    // 案例库
    kw: '',
    level: '',
    page: 1,
    size: 8,
    cases: null
};

const LEVELS = [
    { v: '', label: '全部' },
    { v: '伪古风', label: '伪古风' },
    { v: '出处讹变', label: '出处讹变' },
    { v: '出处存疑', label: '出处存疑' }
];

const SAMPLE_BAD = '无人与我立黄昏，无人问我粥可温';
const SAMPLE_MIX = '人生若只如初见，何事秋风悲画扇\n无人与我立黄昏，无人问我粥可温';
const SAMPLE_OK = '长风破浪会有时，直挂云帆济沧海';

export default {
    title: '溯源核验',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">溯源核验</h1>
                <div class="small muted mt8">
                    报告的核心命题是「反伪古风」。把一段文案贴进来，逐句判定
                    <b>有据可考 / 出处存疑 / 出处讹变 / 伪古风</b>，并给出实际情况、修改建议与核验方式。
                </div>
            </div>
            <div class="row"><span class="tag dai" id="vMeta">索引加载中…</span></div>
        </div>

        <div class="tabs mt14" id="vTabs">
            <button class="on" data-t="check">文案核验</button>
            <button data-t="cases">误传案例库</button>
        </div>

        <div id="paneCheck">
            <div class="card">
                <div class="field">
                    <label>待核验文案（单次 ≤ 2000 字；换行即分批，最多 20 段）</label>
                    <textarea class="textarea" id="vText" style="min-height:96px;"
                        placeholder="例如：无人与我立黄昏，无人问我粥可温"></textarea>
                </div>
                <div class="row mt8">
                    <button class="btn btn-zhu" id="vGo">开始核验</button>
                    <button class="btn" id="vClear">清空</button>
                    <span class="small muted">试试：</span>
                    <button class="chip" data-sample="bad">典型伪古风</button>
                    <button class="chip" data-sample="mix">真伪混杂</button>
                    <button class="chip" data-sample="ok">有据可考</button>
                </div>
            </div>
            <div id="vOut" class="mt22">${empty('输入文案后点「开始核验」')}</div>
            <div id="vHistory" class="mt22"></div>
        </div>

        <div id="paneCases" style="display:none;">
            <div class="card">
                <div class="row">
                    <input class="input" id="cKw" placeholder="搜索：浮生六记 / 纳兰 / 讹变…" style="flex:1;min-width:200px;">
                    <button class="btn btn-primary" id="cSearch">检索</button>
                </div>
                <div class="row mt14" id="cLevels"></div>
            </div>
            <div id="cList" class="mt22">${loading('案例库加载中…')}</div>
            <div class="pager" id="cPager"></div>
        </div>
        `;

        bind(el);
        loadMeta(el);
        loadCases(el);
        pickup(el);
        if (session.logged) loadHistory(el);
    }
};

/** 从首页快检框带过来的文案，直接开跑 */
function pickup(el) {
    let v = '';
    try {
        v = sessionStorage.getItem('ym_verify_text') || '';
        sessionStorage.removeItem('ym_verify_text');
    } catch (e) {
        v = '';
    }
    if (!v) return;
    const ta = el.querySelector('#vText');
    if (!ta) return;
    ta.value = v;
    state.text = v;
    runVerge(el);
}

function bind(el) {
    el.querySelector('#vTabs').addEventListener('click', e => {
        const b = e.target.closest('button[data-t]');
        if (!b) return;
        el.querySelectorAll('#vTabs button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        state.tab = b.dataset.t;
        el.querySelector('#paneCheck').style.display = state.tab === 'check' ? '' : 'none';
        el.querySelector('#paneCases').style.display = state.tab === 'cases' ? '' : 'none';
    });

    const ta = el.querySelector('#vText');
    ta.addEventListener('input', () => {
        state.text = ta.value;
    });
    el.querySelector('#vClear').onclick = () => {
        ta.value = '';
        state.text = '';
        state.result = null;
        el.querySelector('#vOut').innerHTML = empty('输入文案后点「开始核验」');
    };
    el.querySelector('#vGo').onclick = () => runVerge(el);
    el.querySelectorAll('[data-sample]').forEach(b => {
        b.onclick = () => {
            const k = b.dataset.sample;
            ta.value = k === 'bad' ? SAMPLE_BAD : k === 'mix' ? SAMPLE_MIX : SAMPLE_OK;
            state.text = ta.value;
            runVerge(el);
        };
    });

    el.querySelector('#cSearch').onclick = () => {
        state.kw = el.querySelector('#cKw').value.trim();
        state.page = 1;
        loadCases(el);
    };
    el.querySelector('#cKw').addEventListener('keydown', e => {
        if (e.key === 'Enter') el.querySelector('#cSearch').click();
    });
    el.querySelector('#cLevels').addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        el.querySelectorAll('#cLevels .chip').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        state.level = b.dataset.v;
        state.page = 1;
        loadCases(el);
    });
}

async function loadMeta(el) {
    try {
        const m = await api.get('/verify/meta');
        el.querySelector('#vMeta').textContent =
            `误传案例 ${m.casesTotal} 条 · 真典 ${m.verifiedTotal} 条 · 索引 ${m.indexSize} 条`;
    } catch (e) {
        el.querySelector('#vMeta').textContent = '元信息读取失败';
    }
}

async function runVerge(el) {
    const out = el.querySelector('#vOut');
    if (state.busy) return;
    if (!state.text.trim()) {
        toast('请先输入要核验的文案');
        return;
    }
    state.busy = true;
    out.innerHTML = loading('正在比对误传库与真典库…');
    try {
        const data = await api.post('/verify', { text: state.text });
        state.result = data;
        out.innerHTML = renderResult(data);
        if (session.logged) loadHistory(el);
    } catch (e) {
        out.innerHTML = empty(e.message);
    } finally {
        state.busy = false;
    }
}

function vClass(order) {
    return order >= 3 ? 'v-bad' : order === 2 ? 'v-warn' : order === 1 ? 'v-ok' : 'v-none';
}

function renderResult(d) {
    const o = d.overall;
    const c = o.counts;
    const cred = o.credibility;
    const credPct = cred === null || cred === undefined ? 0 : cred;
    return `
    <div class="verdict ${vClass(o.order)}">
        <div class="row between">
            <div class="row" style="gap:10px;">
                <span class="vbadge">${esc(o.name)}</span>
                <span class="small">共 ${c.total} 处命中 · 可溯源 ${c.traceable} · 存疑或讹变 ${c.suspect}
                    ${c.modern ? ' · 现代网语 ' + c.modern : ''}</span>
            </div>
            <div class="creditbox">
                <span class="small muted">可信度</span>
                <div class="credit"><div class="track">
                    <div class="fill" style="width:${credPct}%"></div>
                </div></div>
                <b>${cred === null || cred === undefined ? '—' : cred}</b>
                <span class="small muted">${esc(o.credLabel)}</span>
            </div>
        </div>
        <div class="vsum">${esc(o.summary)}</div>
        ${o.advice && o.advice.length ? `<ul class="notes">${o.advice.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        ${d.cacheHit ? '<div class="small muted mt8">（本次结果来自 Redis 缓存）</div>' : ''}
    </div>

    ${d.segments.map(seg => segmentCard(seg, d.mode === 'batch')).join('')}

    <div class="notes mt22"><b>说明：</b>${esc(d.disclaimer)}</div>`;
}

function segmentCard(seg, batch) {
    const v = seg.verdict;
    const c = seg.counts;
    const body = seg.hits.length
        ? seg.hits.map(hitCard).join('')
        : `<div class="small muted">未命中任何条目</div>`;
    return `<div class="card mt14">
        <div class="row between">
            <div style="min-width:0;">
                ${batch ? `<span class="small muted mono">第 ${seg.index} 段</span>` : ''}
                <div style="font-family:var(--font-serif);font-size:16px;margin-top:2px;">${esc(seg.text)}</div>
            </div>
            <div class="row">
                <span class="vbadge sm ${vClass(v.order)}">${esc(v.name)}</span>
            </div>
        </div>
        <div class="small muted mt8">${esc(v.summary)}</div>
        <div class="hr"></div>
        ${body}
        <div class="small muted mt8">本段命中 ${c.total} 处：可溯源 ${c.traceable}、存疑或讹变 ${c.suspect}
            ${c.modern ? '、现代网语 ' + c.modern : ''}</div>
    </div>`;
}

const KIND_LABEL = {
    misinfo: '误传案例',
    verified: '真典',
    pair: '语料对',
    calendar: '日历词条',
    modern: '现代网语'
};

function hitCard(h) {
    const cls = h.level === '伪古风' ? 'v-bad'
        : (h.level === '出处讹变' || h.level === '出处存疑') ? 'v-warn'
            : h.level === '现代网语' ? 'v-info' : 'v-ok';
    return `<div class="hit ${cls}">
        <div class="row between">
            <div class="frag">${esc(h.label)}</div>
            <div class="row">
                ${tag(h.level, h.level === '伪古风' ? 'zhu' : h.level === '有据可考' ? 'dai' : 'gold')}
                ${tag(KIND_LABEL[h.kind] || h.kind)}
                ${h.check ? tag('核验：' + h.check) : ''}
            </div>
        </div>
        ${h.kind === 'misinfo' ? `
            <div class="kv"><span class="k">常见误标</span><span class="bad">${esc(h.source || '—')}</span></div>
            <div class="kv"><span class="k">实际情况</span><span>${esc(h.note || '—')}</span></div>
            ${h.advice ? `<div class="kv"><span class="k">建议</span><span class="good">${esc(h.advice)}</span></div>` : ''}
        ` : h.kind === 'modern' ? `
            <div class="kv"><span class="k">古风对应</span><span>${esc(h.source || '—')}</span></div>
            ${h.note ? `<div class="kv"><span class="k">出处</span><span>${esc(h.note)}</span></div>` : ''}
        ` : `
            <div class="kv"><span class="k">出处</span><span>${esc(h.source || '—')}</span></div>
            ${h.modern ? `<div class="kv"><span class="k">对应今语</span><span>${esc(h.modern)}</span></div>` : ''}
        `}
    </div>`;
}

async function loadCases(el) {
    const box = el.querySelector('#cList');
    const pager = el.querySelector('#cPager');
    if (!el.querySelector('#cLevels').children.length) {
        el.querySelector('#cLevels').innerHTML = `<span class="small muted">等级</span>
            <div class="chips">${LEVELS.map(l =>
            `<button class="chip ${state.level === l.v ? 'on' : ''}" data-v="${esc(l.v)}">${esc(l.label)}</button>`).join('')}</div>`;
    }
    box.innerHTML = loading();
    try {
        const data = await api.get('/verify/cases', {
            kw: state.kw, level: state.level, page: state.page, size: state.size
        });
        state.cases = data;
        const lv = Object.entries(data.levels || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
        const rel = data.relatedVerifiedTotal ? `<div class="card mt14">
            <div class="card-title"><span class="dot"></span>另：真典库命中 ${data.relatedVerifiedTotal} 条
                <span class="small muted">这些是有明确出处的真句</span>
            </div>
            ${data.relatedVerified.map(v => `<div class="row between" style="padding:7px 0;border-bottom:1px dashed var(--border);">
                <div style="min-width:0;">
                    <div style="font-family:var(--font-serif);font-size:15px;">${esc(v.text)}</div>
                    <div class="small muted">${esc(v.source || '')}</div>
                </div>
                ${tag('有据可考', 'dai')}
            </div>`).join('')}
            <div class="small muted mt8">检索词若只是作者名或朝代名，请以这些真典条目为准，不要判成伪古风。</div>
        </div>` : '';
        box.innerHTML = `
            <div class="row between">
                <div class="small muted">共 ${data.total} 条 · ${esc(lv)}</div>
                <div class="small muted">每条都标注了核验方式，可据此自行复查</div>
            </div>
            <div class="mt14">${data.list.map(caseCard).join('') || empty('没有匹配的案例')}</div>
            ${rel}`;
        pager.innerHTML = `
            <button class="btn btn-sm" id="cPrev" ${data.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="info">第 ${data.page} / ${data.pages || 1} 页 · 共 ${data.total} 条</span>
            <button class="btn btn-sm" id="cNext" ${data.page >= (data.pages || 1) ? 'disabled' : ''}>下一页</button>`;
        const prev = pager.querySelector('#cPrev');
        const next = pager.querySelector('#cNext');
        if (prev) prev.onclick = () => { state.page = Math.max(1, data.page - 1); loadCases(el); };
        if (next) next.onclick = () => { state.page = Math.min(data.pages || 1, data.page + 1); loadCases(el); };
        box.querySelectorAll('[data-try]').forEach(b => {
            b.onclick = () => {
                const ta = el.querySelector('#vText');
                ta.value = b.dataset.try;
                state.text = ta.value;
                el.querySelector('#vTabs').querySelector('[data-t="check"]').click();
                runVerge(el);
            };
        });
    } catch (e) {
        box.innerHTML = empty(e.message);
        pager.innerHTML = '';
    }
}

function caseCard(c) {
    const lvClass = c.level === '伪古风' ? 'zhu' : 'gold';
    return `<div class="card mt14">
        <div class="row between">
            <div class="frag">${esc(c.phrase)}</div>
            <div class="row">${tag(c.level, lvClass)}${c.check ? tag('核验：' + c.check) : ''}</div>
        </div>
        <div class="kv mt8"><span class="k">常见误标</span><span class="bad">${esc(c.wrong)}</span></div>
        <div class="kv"><span class="k">实际情况</span><span>${esc(c.truth)}</span></div>
        <div class="kv"><span class="k">建议</span><span class="good">${esc(c.advice)}</span></div>
        <div class="row mt8">
            <button class="btn btn-sm" data-try="${esc(c.phrase)}">拿它试一次核验</button>
        </div>
    </div>`;
}

async function loadHistory(el) {
    const box = el.querySelector('#vHistory');
    if (!box) return;
    try {
        const list = await api.get('/verify/history', { n: 6 });
        if (!list.length) {
            box.innerHTML = '';
            return;
        }
        box.innerHTML = `<div class="card">
            <div class="card-title"><span class="dot"></span>我的核验记录 <span class="small muted">（写入 MySQL，跨设备可见）</span></div>
            ${list.map(r => `<div class="row between" style="padding:7px 0;border-bottom:1px dashed var(--border);">
                <div style="min-width:0;">
                    <div style="font-size:14px;">${esc(r.input)}</div>
                    <div class="small muted">${esc(r.time)} · 命中 ${r.hitCount} 处 · 存疑 ${r.suspectCount} 处</div>
                </div>
                <div class="row">
                    ${tag(r.verdict, r.verdict === '有据可考' ? 'dai' : r.verdict === '伪古风' ? 'zhu' : 'gold')}
                    <span class="small muted">${r.credibility === null || r.credibility === undefined ? '—' : r.credibility}</span>
                </div>
            </div>`).join('')}
        </div>`;
    } catch (e) {
        box.innerHTML = '';
    }
}
