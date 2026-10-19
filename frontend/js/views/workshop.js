import { api, session } from '../api.js';
import { esc, tag, toast, empty, loading } from '../ui.js';

const state = {
    mode: 'm2c',
    context: '日常',
    tone: '自然',
    form: '原词使用',
    busy: false
};

let options = {
    contexts: ['日常', '职场', '学习', '情感', '社交'],
    tones: ['自然', '俏皮', '庄重', '深情', '豪迈', '温婉'],
    m2cForms: ['原词使用', '诗词语素拼接', '网络改编', '文言句式'],
    c2mForms: ['通俗转写', '网络改编', '文言句式'],
    examples: ['今天上班好困啊，不想干活只想摸鱼', '这个方案太赞了，我直接给跪了', '我emo了']
};

export default {
    title: '改编工坊',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">语言改编工坊</h1>
                <div class="small muted mt8">服务端引擎：语料对最长匹配 → 掩码保护 → 文言词表单次扫描 → 句法变换 → 语境语气修饰。
                    结果写入 Redis（TTL 1h），相同请求直接命中缓存。</div>
            </div>
        </div>

        <div class="grid mt14" style="grid-template-columns: 1.15fr 1fr;">
            <div class="card">
                <div class="tabs" id="modeTabs">
                    <button class="on" data-v="m2c">现代 → 古风</button>
                    <button data-v="c2m">文言 → 通俗</button>
                </div>
                <div class="field">
                    <label>输入文本（单次 ≤ 300 字）</label>
                    <textarea class="textarea" id="txt" placeholder="例如：今天上班好困啊，不想干活只想摸鱼"></textarea>
                </div>
                <div class="row mt8" id="exampleRow"></div>

                <div class="field mt14"><label>语境</label><div id="ctxRow"></div></div>
                <div class="field"><label>语气</label><div id="toneRow"></div></div>
                <div class="field"><label>形式</label><div id="formRow"></div></div>

                <div class="row mt14">
                    <button class="btn btn-zhu" id="goBtn">开始改编</button>
                    <button class="btn" id="clearBtn">清空</button>
                    <span class="small muted" id="counter">0 / 300</span>
                </div>
            </div>

            <div class="card">
                <div class="card-title"><span class="dot"></span>输出结果
                    <span class="small muted" id="cacheBadge"></span>
                </div>
                <div class="output-box" id="out">等待输入…</div>
                <ul class="notes" id="notes"></ul>
                <div id="traces"></div>
                <div class="hr"></div>
                <div class="row between">
                    <span class="small muted">近期记录${session.logged ? '' : '（登录后可保存）'}</span>
                    <button class="btn btn-sm" id="copyBtn">复制结果</button>
                </div>
                <div id="history" class="mt8">${empty('暂无记录')}</div>
            </div>
        </div>
        `;

        renderChips(el);
        bind(el);
        prefill(el);
        loadOptions(el);
        if (session.logged) loadHistory(el);
    }
};

/** 从「科普日历 / 书库」跳转过来时带一个词，直接填进输入框 */
function prefill(el) {
    let v = '';
    try {
        v = sessionStorage.getItem('ym_prefill') || '';
        sessionStorage.removeItem('ym_prefill');
    } catch (e) {
        v = '';
    }
    if (!v) return;
    const txt = el.querySelector('#txt');
    if (!txt) return;
    txt.value = v;
    txt.dispatchEvent(new Event('input'));
    toast('已带入：' + v);
}

async function loadOptions(el) {
    try {
        const o = await api.get('/adapt/options');
        options = Object.assign(options, o);
        renderChips(el);
    } catch (e) {
        /* 使用内置默认值 */
    }
}

function renderChips(el) {
    const forms = state.mode === 'm2c' ? options.m2cForms : options.c2mForms;
    if (!forms.includes(state.form)) state.form = forms[0];

    el.querySelector('#ctxRow').innerHTML = chipHtml(options.contexts, state.context);
    el.querySelector('#toneRow').innerHTML = chipHtml(options.tones, state.tone);
    el.querySelector('#formRow').innerHTML = chipHtml(forms, state.form);
    el.querySelector('#exampleRow').innerHTML = (options.examples || [])
        .slice(0, 4).map(x => `<button class="tag click" data-ex="${esc(x)}">${esc(x)}</button>`).join('');

    el.querySelectorAll('#ctxRow .chip').forEach(b => b.onclick = () => {
        state.context = b.dataset.value;
        renderChips(el);
    });
    el.querySelectorAll('#toneRow .chip').forEach(b => b.onclick = () => {
        state.tone = b.dataset.value;
        renderChips(el);
    });
    el.querySelectorAll('#formRow .chip').forEach(b => b.onclick = () => {
        state.form = b.dataset.value;
        renderChips(el);
    });
    el.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => {
        el.querySelector('#txt').value = b.dataset.ex;
        updateCounter(el);
    });
}

function chipHtml(list, current) {
    return `<div class="chips">` + list.map(x =>
        `<button class="chip ${x === current ? 'on' : ''}" data-value="${esc(x)}">${esc(x)}</button>`
    ).join('') + `</div>`;
}

function updateCounter(el) {
    const len = el.querySelector('#txt').value.length;
    const c = el.querySelector('#counter');
    c.textContent = len + ' / 300';
    c.style.color = len > 300 ? 'var(--zhu)' : '';
}

function bind(el) {
    el.querySelector('#modeTabs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        el.querySelectorAll('#modeTabs button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        state.mode = b.dataset.v;
        renderChips(el);
    });

    const txt = el.querySelector('#txt');
    txt.addEventListener('input', () => updateCounter(el));

    el.querySelector('#clearBtn').onclick = () => {
        txt.value = '';
        el.querySelector('#out').textContent = '等待输入…';
        el.querySelector('#notes').innerHTML = '';
        el.querySelector('#traces').innerHTML = '';
        el.querySelector('#cacheBadge').textContent = '';
        updateCounter(el);
    };

    el.querySelector('#copyBtn').onclick = async () => {
        const text = el.querySelector('#out').textContent;
        if (!text || text === '等待输入…') return;
        try {
            await navigator.clipboard.writeText(text);
            toast('已复制', 'ok');
        } catch (e) {
            toast('浏览器未授权剪贴板，请手动选择复制', 'err');
        }
    };

    el.querySelector('#goBtn').onclick = async () => {
        const text = txt.value.trim();
        if (!text) {
            toast('请先输入内容');
            return;
        }
        if (text.length > 300) {
            toast('单次不超过 300 字');
            return;
        }
        if (state.busy) return;
        state.busy = true;
        const btn = el.querySelector('#goBtn');
        btn.disabled = true;
        btn.textContent = '改编中…';
        try {
            const r = await api.post('/adapt', {
                text,
                mode: state.mode,
                context: state.context,
                tone: state.tone,
                form: state.form
            });
            el.querySelector('#out').textContent = r.output;
            el.querySelector('#notes').innerHTML = (r.notes || []).map(n => `<li>${esc(n)}</li>`).join('');
            renderTraces(el, r.traces);
            el.querySelector('#cacheBadge').innerHTML = r.hitCache
                ? tag('Redis 缓存命中', 'dai') : tag('实时计算', '');
            if (session.logged) loadHistory(el);
        } catch (e) {
            toast(e.message, 'err');
        } finally {
            state.busy = false;
            btn.disabled = false;
            btn.textContent = '开始改编';
        }
    };
}

const TYPE_LABEL = {
    corpus: '语料对',
    lexicon: '词表',
    syntax: '句法',
    style: '文体',
    context: '语境',
    tone: '语气'
};

/** 改写依据链：每一步改了什么、依据哪条语料／词表，都能回查 */
function renderTraces(el, traces) {
    const box = el.querySelector('#traces');
    if (!box) return;
    if (!traces || !traces.length) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `
        <div class="hr"></div>
        <div class="row between">
            <span class="small muted">改写依据链 <b>${traces.length}</b> 步</span>
            <a class="small" href="#/corpus">去语料库核对 →</a>
        </div>
        <div class="trace-list mt8">
            ${traces.map(t => `<div class="trace-row">
                <div class="trace-step">${t.step}</div>
                <div>
                    <div>
                        <span class="trace-title">${esc(t.title)}</span>
                        ${tag(TYPE_LABEL[t.type] || t.type)}
                        ${t.count > 1 ? `<span class="small muted">×${t.count}</span>` : ''}
                    </div>
                    <div class="trace-detail">${esc(t.detail || '')}</div>
                    ${t.source ? `<div class="trace-src">依据：${esc(t.source)}</div>` : ''}
                </div>
            </div>`).join('')}
        </div>`;
}

async function loadHistory(el) {
    const box = el.querySelector('#history');
    try {
        const list = await api.get('/adapt/history', { n: 6 });
        if (!list.length) {
            box.innerHTML = empty('暂无记录');
            return;
        }
        box.innerHTML = list.map(h => `<div class="card flat" style="padding:10px 12px;margin-bottom:8px;">
            <div class="small muted">${esc(h.input)}</div>
            <div style="font-family:var(--font-serif);color:var(--zhu);margin-top:4px;">${esc(h.output)}</div>
            <div class="small muted mt8">${esc(h.mode === 'm2c' ? '今→古' : '古→今')} · ${esc(h.context || '')} · ${esc(h.tone || '')} · ${esc(h.at || '')}</div>
        </div>`).join('');
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}
