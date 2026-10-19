import { api } from '../api.js';
import { esc, tag, toast, openModal, closeModal, empty, loading } from '../ui.js';

/**
 * 古风科普日历：补齐 H5 版五大模块里的「科普日历」。
 * 16 条词条全量呈现 + 今日排期，排期规则与 /api/daily 完全一致。
 */

export default {
    title: '科普日历',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">古风科普日历</h1>
                <div class="small muted mt8">
                    按「日序 % 词条数」确定性排期，同一天所有人看到同一条；16 天一个完整轮回。
                </div>
            </div>
            <div class="row"><span class="tag dai" id="calDate">—</span></div>
        </div>

        <div class="card mt14" id="todayCard">${loading('正在取今日词条…')}</div>

        <div class="row between mt22">
            <h2 class="sec-title">全部词条</h2>
            <span class="small muted" id="calCount"></span>
        </div>
        <div id="calList" class="mt8">${loading()}</div>
        `;
        await load(el);
    }
};

let cache = null;

async function load(el) {
    try {
        cache = await api.get('/calendar');
    } catch (e) {
        el.querySelector('#todayCard').innerHTML = empty(e.message);
        el.querySelector('#calList').innerHTML = '';
        return;
    }
    el.querySelector('#calDate').textContent = cache.date;
    el.querySelector('#calCount').textContent = `${cache.poolSize} 条 · 今日第 ${cache.todayIndex} 条`;
    paintToday(el);
    paintList(el);
}

function paintToday(el) {
    const box = el.querySelector('#todayCard');
    const t = cache.today;
    if (!t) {
        box.innerHTML = empty('日历词条为空');
        return;
    }
    box.innerHTML = `
        <div class="card-title"><span class="dot"></span>今日 · ${esc(cache.date)}
            <span class="small muted">（第 ${esc(cache.todayIndex)} / ${esc(cache.poolSize)} 条）</span>
        </div>
        <div class="cal-word">${esc(t.word)}</div>
        <div class="row mt8">
            ${t.category ? tag(t.category, 'zhu') : ''}
            ${t.modern ? tag('今译：' + t.modern, 'dai') : ''}
            ${t.nextDate ? tag('下次：' + t.nextDate, '') : ''}
        </div>
        ${t.source ? `<p class="small muted mt8">${esc(t.source)}</p>` : ''}
        <div class="cal-grid mt8">
            ${t.grammar ? `<div><b>语法</b><span>${esc(t.grammar)}</span></div>` : ''}
            ${t.usage ? `<div><b>用法</b><span>${esc(t.usage)}</span></div>` : ''}
            ${t.misuse ? `<div class="warn"><b>误用提醒</b><span>${esc(t.misuse)}</span></div>` : ''}
            ${t.examples && t.examples.length ? `<div><b>示例</b><span>${t.examples.map(esc).join(' ／ ')}</span></div>` : ''}
        </div>
        <div class="row mt14">
            <button class="btn btn-sm btn-primary" id="tryBtn">拿它去改编</button>
            ${t.corpusId ? `<a class="btn btn-sm" href="#/corpus">看语料库里的同名词条</a>` : ''}
        </div>`;
    const btn = box.querySelector('#tryBtn');
    if (btn) {
        btn.onclick = () => {
            try {
                sessionStorage.setItem('ym_prefill', t.word);
            } catch (e) {
                /* 隐私模式下忽略 */
            }
            location.hash = '#/workshop';
            toast('已把「' + t.word + '」带到改编工坊');
        };
    }
}

function paintList(el) {
    const box = el.querySelector('#calList');
    box.innerHTML = `<div class="grid g3">${cache.list.map(card).join('')}</div>`;
    box.querySelectorAll('.cal-card').forEach(n => {
        n.onclick = () => openEntry(cache.list.find(x => String(x.index) === n.dataset.idx));
    });
    const rule = document.createElement('div');
    rule.className = 'notes mt22';
    rule.innerHTML = `<b>排期说明：</b>${esc(cache.rule)} 词条内容来自调研报告附录中的古风科普日历设计，
        每条含出处、语法、用法、误用提醒与示例五段。`;
    box.appendChild(rule);
}

function card(c) {
    return `<div class="cal-card${c.today ? ' today' : ''}" data-idx="${c.index}" title="点击查看详情">
        <div class="row between">
            <span class="small muted mono">#${c.index}</span>
            ${c.today ? tag('今日', 'zhu') : (c.nextDate ? tag(c.nextDate) : '')}
        </div>
        <div class="cal-card-word">${esc(c.word)}</div>
        <div class="small muted">${esc(c.modern || '')}</div>
        <div class="row mt8">${c.category ? tag(c.category) : ''}</div>
        <div class="small mt8" style="color:var(--ink-soft);line-height:1.7;">
            ${esc(shorten(c.source || '', 54))}
        </div>
    </div>`;
}

function shorten(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
}

function openEntry(c) {
    if (!c) return;
    openModal(`
        <div class="row between">
            <h3>${esc(c.word)} <span class="small muted">第 ${c.index} / ${cache.poolSize} 条</span></h3>
            <button class="btn btn-sm btn-ghost" id="cClose">关闭</button>
        </div>
        <div class="row mt8">
            ${c.category ? tag(c.category, 'zhu') : ''}
            ${c.modern ? tag('今译：' + c.modern, 'dai') : ''}
            ${c.today ? tag('今天就是它', 'gold') : tag('下次排期：' + c.nextDate, '')}
        </div>
        <table class="table mt14">
            <tr><th style="width:70px;">出处</th><td>${esc(c.source || '—')}</td></tr>
            <tr><th>语法</th><td>${esc(c.grammar || '—')}</td></tr>
            <tr><th>用法</th><td>${esc(c.usage || '—')}</td></tr>
            <tr><th>误用</th><td style="color:var(--zhu)">${esc(c.misuse || '—')}</td></tr>
            <tr><th>示例</th><td>${(c.examples || []).map(esc).join('<br>') || '—'}</td></tr>
        </table>
        <div class="row mt14">
            <button class="btn btn-sm btn-primary" id="cTry">拿它去改编</button>
            <a class="btn btn-sm" href="#/archive">查看日历单模块版</a>
        </div>
    `);
    const body = document.getElementById('modalBody');
    body.querySelector('#cClose').onclick = closeModal;
    body.querySelector('#cTry').onclick = () => {
        try {
            sessionStorage.setItem('ym_prefill', c.word);
        } catch (e) {
            /* ignore */
        }
        closeModal();
        location.hash = '#/workshop';
    };
}
