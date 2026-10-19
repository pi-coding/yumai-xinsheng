import { api } from '../api.js';
import { esc, tag, toast, openModal, closeModal, empty, loading } from '../ui.js';

/**
 * 古籍书库：补齐 H5 版五大模块里的「古籍书库」。
 * 封面为程序化 SVG（与 H5 版同一套配色与哈希），不加载任何图片资源。
 */

const state = { kw: '', bu: '', era: '', page: 1, size: 12 };

export default {
    title: '古籍书库',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">古籍书库</h1>
                <div class="small muted mt8">
                    经、史、子、集四部共 60 部典籍。点开可看：这本书的<b>要旨</b>（在考据里有什么用）、
                    <b>带篇名的名句摘录</b>、被哪些语料对引用，以及同部典籍荐读——每部书都有内容，不留空页。
                </div>
            </div>
            <button class="btn btn-sm" id="randBtn" title="随机翻一本">随便翻一本</button>
        </div>

        <div class="card mt14">
            <div class="row">
                <input class="input" id="bkw" placeholder="搜索：论语 / 苏轼 / 先秦 / 史部…"
                       style="flex:1;min-width:200px;">
                <button class="btn btn-primary" id="bsearch">检索</button>
                <button class="btn" id="breset">重置</button>
            </div>
            <div class="row mt14" id="facets">${loading('部类加载中…')}</div>
        </div>

        <div id="bookBox" class="mt22">${loading()}</div>
        <div class="pager" id="bpager"></div>
        <div class="notes mt22">
            <b>数据诚实声明：</b>本模块提供书目元数据、要旨与带篇名的名句摘录；
            报告与语料范围内没有这 60 部书的正文，因此不提供「点开就读全文」，也不做全文检索的虚假承诺。
            「同部类参考语料」已单独标注，<b>不是本书引文</b>；可阅读的原文片段见「工具集 → 古籍素材库」。
        </div>
        `;

        bind(el);
        await load(el);
    }
};

function bind(el) {
    el.querySelector('#bsearch').onclick = () => {
        state.kw = el.querySelector('#bkw').value.trim();
        state.page = 1;
        load(el);
    };
    el.querySelector('#bkw').addEventListener('keydown', e => {
        if (e.key === 'Enter') el.querySelector('#bsearch').click();
    });
    el.querySelector('#breset').onclick = () => {
        state.kw = '';
        state.bu = '';
        state.era = '';
        state.page = 1;
        el.querySelector('#bkw').value = '';
        load(el);
    };
    el.querySelector('#randBtn').onclick = async () => {
        try {
            const b = await api.get('/books/random');
            openDetail(b.name);
        } catch (e) {
            toast(e.message, 'err');
        }
    };
}

async function load(el) {
    const box = el.querySelector('#bookBox');
    box.innerHTML = loading();
    try {
        const data = await api.get('/books', {
            kw: state.kw, bu: state.bu, era: state.era, page: state.page, size: state.size
        });
        paintFacets(el, data);
        if (!data.list.length) {
            box.innerHTML = empty('没有匹配的书目，换个关键词试试');
            el.querySelector('#bpager').innerHTML = '';
            return;
        }
        box.innerHTML = `<div class="grid g3">${data.list.map(bookCard).join('')}</div>`;
        box.querySelectorAll('.book-card').forEach(n => {
            n.onclick = () => openDetail(n.dataset.name);
        });
        paintPager(el, data);
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}

function paintFacets(el, data) {
    const box = el.querySelector('#facets');
    box.innerHTML = `
        <span class="small muted">部类</span>
        <div class="chips" id="buChips">
            <button class="chip ${state.bu === '' ? 'on' : ''}" data-v="">全部</button>
            ${(data.bus || []).map(x => `<button class="chip ${state.bu === x.name ? 'on' : ''}" data-v="${esc(x.name)}">${esc(x.name)}<span class="small muted"> ${x.count}</span></button>`).join('')}
        </div>
        <span class="small muted" style="margin-left:auto;">年代</span>
        <div class="chips" id="eraChips">
            <button class="chip ${state.era === '' ? 'on' : ''}" data-v="">不限</button>
            ${(data.eras || []).map(x => `<button class="chip ${state.era === x.name ? 'on' : ''}" data-v="${esc(x.name)}">${esc(x.name)}<span class="small muted"> ${x.count}</span></button>`).join('')}
        </div>`;
    box.querySelector('#buChips').addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        state.bu = b.dataset.v;
        state.page = 1;
        load(el);
    });
    box.querySelector('#eraChips').addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        state.era = b.dataset.v;
        state.page = 1;
        load(el);
    });
}

function paintPager(el, data) {
    const pager = el.querySelector('#bpager');
    const pages = data.pages || 1;
    pager.innerHTML = `
        <button class="btn btn-sm" id="bprev" ${data.page <= 1 ? 'disabled' : ''}>上一页</button>
        <span class="info">第 ${data.page} / ${pages} 页 · 共 ${data.total} 部</span>
        <button class="btn btn-sm" id="bnext" ${data.page >= pages ? 'disabled' : ''}>下一页</button>`;
    const prev = pager.querySelector('#bprev');
    const next = pager.querySelector('#bnext');
    if (prev) prev.onclick = () => { state.page = Math.max(1, data.page - 1); load(el); };
    if (next) next.onclick = () => { state.page = Math.min(pages, data.page + 1); load(el); };
}

function bookCard(b) {
    return `<div class="book-card" data-name="${esc(b.name)}" title="点击查看《${esc(b.name)}》">
        <div class="cover">${coverSVG(b)}</div>
        <div class="book-meta">
            <div class="row between">
                <div class="book-name">${esc(b.name)}</div>
                ${tag(b.bu, 'dai')}
            </div>
            <div class="small muted mt8">${esc(b.era)} · ${esc(b.author || '著者待考')}</div>
            <div class="small mt8 book-intro">${esc(b.intro || '')}</div>
            <div class="row mt8">${b.quoteCount ? `<span class="tag gold">名句 ${b.quoteCount}</span>` : ''}</div>
        </div>
    </div>`;
}

/** 程序化封面：渐变底 + 云纹 + 层叠远山 + 书名，与 H5 版逐像素同源 */
function coverSVG(b) {
    const seed = (Number(b.seed) || 0) >>> 0;
    const gid = 'bk' + seed;
    let hills = '';
    for (let i = 0; i < 3; i++) {
        const y = 118 + i * 26 + ((seed >> (i * 3)) & 7);
        const o = (0.10 + i * 0.07).toFixed(2);
        hills += `<path d="M0 ${y} Q 60 ${y - 30} 120 ${y} T 240 ${y} L240 180 L0 180Z" fill="#fff" opacity="${o}"/>`;
    }
    let clouds = '';
    for (let i = 0; i < 3; i++) {
        const cx = 34 + ((seed >> (i * 4)) % 170);
        const cy = 26 + i * 15;
        clouds += `<ellipse cx="${cx}" cy="${cy}" rx="${26 + i * 6}" ry="${7 + i}" fill="#fff" opacity="0.13"/>`;
    }
    const name = String(b.name || '');
    const title = name.length > 5 ? name.slice(0, 5) : name;
    const fs = title.length > 4 ? 30 : 36;
    return `<svg viewBox="0 0 240 180" preserveAspectRatio="xMidYMid slice" role="img"
                 aria-label="${esc(name)}封面">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${esc(b.color1)}"/>
            <stop offset="1" stop-color="${esc(b.color2)}"/>
        </linearGradient></defs>
        <rect width="240" height="180" fill="url(#${gid})"/>
        ${clouds}${hills}
        <rect x="9" y="9" width="222" height="162" rx="5" fill="none"
              stroke="#fff" stroke-opacity="0.34" stroke-width="1.1"/>
        <rect x="15" y="15" width="210" height="150" rx="3" fill="none"
              stroke="#fff" stroke-opacity="0.18" stroke-width="0.8"/>
        <text x="120" y="101" text-anchor="middle" font-size="${fs}" letter-spacing="3"
              font-family="Songti SC,STSong,SimSun,serif"
              fill="#fdf8f2" fill-opacity="0.95">${esc(title)}</text>
        <text x="120" y="127" text-anchor="middle" font-size="12" letter-spacing="6"
              font-family="Songti SC,STSong,SimSun,serif"
              fill="#fff" fill-opacity="0.72">${esc(b.bu || '')}</text>
    </svg>`;
}

async function openDetail(name) {
    let b;
    try {
        b = await api.get('/books/' + encodeURIComponent(name));
    } catch (e) {
        toast(e.message, 'err');
        return;
    }
    openModal(`
        <div class="row between">
            <h3>《${esc(b.name)}》</h3>
            <button class="btn btn-sm btn-ghost" id="dClose">关闭</button>
        </div>
        <div class="book-detail">
            <div class="cover lg">${coverSVG(b)}</div>
            <div style="flex:1;min-width:220px;">
                <div class="row">${tag(b.bu, 'dai')}${tag(b.era)}${tag(b.author || '著者待考', 'gold')}</div>
                <p class="mt8">${esc(b.intro || '')}</p>
                <table class="table mt8">
                    <tr><th style="width:80px;">部类</th><td>${esc(b.bu)}</td></tr>
                    <tr><th>成书</th><td>${esc(b.era)}</td></tr>
                    <tr><th>著者</th><td>${esc(b.author || '待考')}</td></tr>
                    ${b.alias && b.alias.length ? `<tr><th>别名</th><td>${b.alias.map(a => esc(a)).join('、')}</td></tr>` : ''}
                    <tr><th>名句摘录</th><td>${b.quoteCount} 条</td></tr>
                    <tr><th>语料引用</th><td>${b.relatedPairCount} 条${b.relatedPairCount === 0 && b.buPairs && b.buPairs.length ? `（另附同部类参考 ${b.buPairs.length} 条）` : ''}</td></tr>
                    <tr><th>相关词条</th><td>${b.relatedCalendarCount} 条</td></tr>
                </table>
            </div>
        </div>

        ${b.note ? `<div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>要旨 · 这本书有什么用</div>
            <div class="bu-note">${esc(b.note)}</div>` : ''}

        <div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>名句摘录
            <span class="small muted">${b.quotes && b.quotes.length ? `共 ${b.quotes.length} 条，句后标注篇名，可据此核对原文` : '工具型典籍不强行摘句'}</span>
        </div>
        ${b.quotes && b.quotes.length ? `<div class="quote-list">${b.quotes.map((q, i) => `
            <div class="quote">
                <div class="quote-text">${esc(q.text)}</div>
                <div class="row between">
                    <span class="quote-from">——《${esc(b.name)}·${esc(q.from || '')}》</span>
                    <button class="btn btn-sm btn-ghost" data-verify="${esc(q.text)}">核验这句</button>
                </div>
            </div>`).join('')}</div>`
            : `<div class="small muted" style="padding:8px 0;">本书暂未收录名句摘录——我们只收能确指篇名、可核对的句子，宁可留白也不凑数；
                   上方「要旨」已说明它在考据里的用法。</div>`}

        <div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>被以下语料引用</div>
        ${b.relatedPairs.length ? b.relatedPairs.map(pairBlock).join('')
            : `<div class="small muted" style="padding:6px 0 2px;">报告语料库里没有直接引用本书的条目${b.buPairs && b.buPairs.length ? '，下面是同部类的参考语料（<b>不是本书引文</b>）' : ''}。</div>`}
        ${b.relatedPairs.length === 0 && b.buPairs && b.buPairs.length ? `
            <div class="row mt8"><span class="tag">同部类参考 · ${esc(b.bu)}</span>
                <span class="small muted">仅作语境参照，引用时不要标成本书出处</span></div>
            ${b.buPairs.map(p => pairBlock(p, true)).join('')}` : ''}

        ${b.authorPairs && b.authorPairs.length ? `
            <div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>同作者作品被语料引用
                <span class="small muted">作者相同，是否收入本集未逐篇核对，引用时以别集原书为准</span>
            </div>
            ${b.authorPairs.map(p => pairBlock(p, true)).join('')}` : ''}

        <div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>相关日历词条</div>
        ${b.relatedCalendar.length ? `<div class="row">${b.relatedCalendar.map(c =>
            `<span class="tag zhu">${esc(c.word)} · ${esc(c.modern || '')}</span>`).join('')}</div>`
            : `<div class="small muted" style="padding:6px 0;">本书暂未进入 16 条科普词条的出处，<a href="#/calendar">去日历看全量</a>。</div>`}

        <div class="card-title" style="margin:16px 0 8px;"><span class="dot"></span>同部其他典籍</div>
        <div class="chips">${b.sameBu.map(x =>
            `<button class="chip" data-book="${esc(x.name)}">${esc(x.name)}${x.quoteCount ? `<span class="small muted"> ${x.quoteCount}句</span>` : ''}</button>`).join('')}</div>

        ${b.buIntro ? `<div class="bu-intro mt14"><b>${esc(b.bu)}导读：</b>${esc(b.buIntro)}</div>` : ''}

        <div class="row mt14">
            <a class="btn btn-sm" href="#/corpus">去语料库检索相关表达</a>
            <a class="btn btn-sm btn-ghost" id="dArchive">查看古籍素材库</a>
        </div>

        <div class="small muted mt14">${esc(b.honest || '')}</div>
    `);
    const body = document.getElementById('modalBody');
    body.querySelector('#dClose').onclick = closeModal;
    body.querySelectorAll('[data-book]').forEach(btn => {
        btn.onclick = () => openDetail(btn.dataset.book);
    });
    body.querySelectorAll('[data-verify]').forEach(btn => {
        btn.onclick = () => {
            try {
                sessionStorage.setItem('ym_verify_text', btn.dataset.verify);
            } catch (e) { /* 隐私模式忽略 */ }
            location.hash = '#/verify';
        };
    });
    body.querySelector('#dArchive').onclick = () => {
        location.hash = '#/archive';
    };
}

function pairBlock(p, refOnly) {
    return `<div class="pair" style="cursor:default;box-shadow:none;margin-bottom:10px;${refOnly ? 'opacity:.92;' : ''}">
        <div class="modern">${esc(p.modern)}</div>
        <div class="ancient">${esc(p.ancient)}</div>
        <div class="src">${esc(p.source || '')}</div>
    </div>`;
}
