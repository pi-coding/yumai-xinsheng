import { api, session } from '../api.js';
import { esc, tag, toast, openModal, closeModal, empty, loading } from '../ui.js';

const state = {
    kw: '',
    category: '',
    dataSource: 'REAL',
    sort: 'default',
    page: 1,
    size: 12
};

export default {
    title: '语料库',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">古风网语语料库</h1>
                <div class="small muted mt8">按现代用语或古风表达检索，点击卡片查看释义与出处。</div>
            </div>
            <div class="row">
                <span class="tag dai" id="srcBadge">来源：真实语料</span>
            </div>
        </div>

        <div class="card mt14">
            <div class="row">
                <input class="input" id="kwInput" placeholder="搜索：摸鱼 / 长风破浪 / 情感 / 唐代…"
                       style="flex:1;min-width:200px;">
                <button class="btn btn-primary" id="searchBtn">检索</button>
                <button class="btn" id="resetBtn">重置</button>
            </div>
            <div class="row mt14" id="catRow">${loading('分类加载中…')}</div>
            <div class="row mt14">
                <span class="small muted">排序</span>
                <div class="chips" id="sortChips">
                    <button class="chip on" data-v="default">默认</button>
                    <button class="chip" data-v="view">浏览最多</button>
                    <button class="chip" data-v="fav">收藏最多</button>
                </div>
                <span class="small muted" style="margin-left:auto;">数据源</span>
                <div class="chips" id="srcChips">
                    <button class="chip on" data-v="REAL">仅真实语料</button>
                    <button class="chip" data-v="TEMPLATE">模板扩充</button>
                    <button class="chip" data-v="">全部</button>
                </div>
            </div>
        </div>

        <div id="listBox" class="mt22">${loading()}</div>
        <div class="pager" id="pager"></div>
        `;

        bind(el);
        loadCategories(el);
        loadList(el);
    }
};

function bind(el) {
    el.querySelector('#searchBtn').onclick = () => {
        state.kw = el.querySelector('#kwInput').value.trim();
        state.page = 1;
        loadList(el);
    };
    el.querySelector('#kwInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') el.querySelector('#searchBtn').click();
    });
    el.querySelector('#resetBtn').onclick = () => {
        state.kw = '';
        state.category = '';
        state.page = 1;
        el.querySelector('#kwInput').value = '';
        el.querySelectorAll('#catRow .chip').forEach(c => c.classList.toggle('on', c.dataset.value === ''));
        loadList(el);
    };
    el.querySelector('#sortChips').addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        el.querySelectorAll('#sortChips .chip').forEach(c => c.classList.remove('on'));
        b.classList.add('on');
        state.sort = b.dataset.v;
        state.page = 1;
        loadList(el);
    });
    el.querySelector('#srcChips').addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        el.querySelectorAll('#srcChips .chip').forEach(c => c.classList.remove('on'));
        b.classList.add('on');
        state.dataSource = b.dataset.v;
        state.page = 1;
        el.querySelector('#srcBadge').textContent = '来源：' + (b.dataset.v === 'REAL' ? '真实语料'
            : b.dataset.v === 'TEMPLATE' ? '模板扩充语料' : '全部');
        loadList(el);
    });
}

async function loadCategories(el) {
    const box = el.querySelector('#catRow');
    try {
        const list = await api.get('/corpus/categories');
        box.innerHTML = `<span class="small muted">分类</span>
            <div class="chips" id="catChips">
                <button class="chip on" data-value="">全部</button>
                ${list.map(c => `<button class="chip" data-value="${esc(c.name)}">${esc(c.name)}<span class="small muted"> ${c.count}</span></button>`).join('')}
            </div>`;
        box.addEventListener('click', e => {
            const b = e.target.closest('.chip');
            if (!b) return;
            box.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
            b.classList.add('on');
            state.category = b.dataset.value;
            state.page = 1;
            loadList(el);
        });
    } catch (e) {
        box.innerHTML = `<span class="small muted">${esc(e.message)}</span>`;
    }
}

async function loadList(el) {
    const box = el.querySelector('#listBox');
    const pager = el.querySelector('#pager');
    box.innerHTML = loading();
    pager.innerHTML = '';
    try {
        const data = await api.get('/corpus', {
            kw: state.kw,
            category: state.category,
            dataSource: state.dataSource,
            sort: state.sort,
            page: state.page,
            size: state.size
        });
        if (!data.list.length) {
            box.innerHTML = empty('没有匹配的语料，试试放宽筛选条件');
            return;
        }
        box.innerHTML = `<div class="grid g3">${data.list.map(card).join('')}</div>`;
        box.querySelectorAll('.pair').forEach(node => {
            node.addEventListener('click', e => {
                if (e.target.closest('.fav-btn')) return;
                openDetail(node.dataset.id);
            });
        });
        box.querySelectorAll('.fav-btn').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                if (!session.logged) {
                    toast('请先登录后再收藏');
                    location.hash = '#/login';
                    return;
                }
                try {
                    const r = await api.post('/favorites/' + btn.dataset.id);
                    btn.classList.toggle('on', r.favorited);
                    btn.textContent = r.favorited ? '♥' : '♡';
                    btn.title = r.favorited ? '取消收藏' : '收藏';
                    toast(r.favorited ? '已加入收藏' : '已取消收藏', 'ok');
                } catch (err) {
                    toast(err.message, 'err');
                }
            };
        });

        const totalPages = data.pages || 1;
        pager.innerHTML = `
            <button class="btn btn-sm" id="prev" ${data.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="info">第 ${data.page} / ${totalPages} 页 · 共 ${data.total} 条</span>
            <button class="btn btn-sm" id="next" ${data.page >= totalPages ? 'disabled' : ''}>下一页</button>`;
        const prev = pager.querySelector('#prev');
        const next = pager.querySelector('#next');
        if (prev) prev.onclick = () => { state.page = Math.max(1, data.page - 1); loadList(el); };
        if (next) next.onclick = () => { state.page = Math.min(totalPages, data.page + 1); loadList(el); };
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}

function card(c) {
    const isTemplate = c.dataSource === 'TEMPLATE';
    return `<div class="pair" data-id="${c.id}">
        <div class="row between">
            <div class="modern">${esc(c.modern)}</div>
            ${isTemplate ? tag('模板', 'gold') : tag('真实', 'dai')}
        </div>
        <div class="ancient">${esc(c.ancient)}</div>
        <div class="src">${esc(c.source || '出处待考')}</div>
        <div class="row">${(c.categories || '').split('、').filter(Boolean).slice(0, 2).map(x => tag(x)).join('')}</div>
        <div class="foot">
            <span class="small muted">浏览 ${c.viewCount || 0} · 收藏 ${c.favCount || 0}</span>
            <button class="fav-btn ${c.favorited ? 'on' : ''}" data-id="${c.id}"
                    title="${c.favorited ? '取消收藏' : '收藏'}">${c.favorited ? '♥' : '♡'}</button>
        </div>
    </div>`;
}

async function openDetail(id) {
    try {
        const c = await api.get('/corpus/' + id);
        openModal(`
            <div class="row between">
                <h3>${esc(c.modern)}</h3>
                <button class="btn btn-sm btn-ghost" id="mClose">关闭</button>
            </div>
            <div class="output-box mt14">${esc(c.ancient)}</div>
            <div class="row mt14">
                ${tag(c.dataSource === 'TEMPLATE' ? '模板扩充语料' : '报告真实语料', c.dataSource === 'TEMPLATE' ? 'gold' : 'dai')}
                ${(c.categories || '').split('、').filter(Boolean).map(x => tag(x, 'zhu')).join('')}
            </div>
            <table class="table mt14">
                <tr><th style="width:74px;">出处</th><td>${esc(c.source || '待考')}</td></tr>
                <tr><th>编号</th><td class="mono">${esc(c.code || '—')}</td></tr>
                <tr><th>标签</th><td>${esc(c.tags || '—')}</td></tr>
                <tr><th>平台</th><td>${esc(c.platform || '—')}</td></tr>
                <tr><th>年代</th><td>${esc(c.era || '—')}</td></tr>
                <tr><th>热度</th><td>${esc(c.popularity || '—')}</td></tr>
                <tr><th>浏览/收藏</th><td>${c.viewCount || 0} / ${c.favCount || 0}</td></tr>
            </table>
            <div class="row mt14">
                <button class="btn ${c.favorited ? '' : 'btn-zhu'}" id="mFav">${c.favorited ? '♥ 已收藏' : '♡ 收藏此条'}</button>
                <a class="btn" href="#/workshop">去改编工坊试用</a>
            </div>
        `);
        const body = document.getElementById('modalBody');
        body.querySelector('#mClose').onclick = closeModal;
        body.querySelector('#mFav').onclick = async e => {
            if (!session.logged) {
                toast('请先登录后再收藏');
                closeModal();
                location.hash = '#/login';
                return;
            }
            try {
                const r = await api.post('/favorites/' + id);
                e.target.className = 'btn ' + (r.favorited ? '' : 'btn-zhu');
                e.target.textContent = r.favorited ? '♥ 已收藏' : '♡ 收藏此条';
                toast(r.favorited ? '已加入收藏' : '已取消收藏', 'ok');
            } catch (err) {
                toast(err.message, 'err');
            }
        };
    } catch (e) {
        toast(e.message, 'err');
    }
}
