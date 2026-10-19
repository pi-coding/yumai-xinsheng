import { api, session } from '../api.js';
import { esc, tag, bars, empty, loading, fmtDate, toast } from '../ui.js';

export default {
    title: '首页',
    async render(el) {
        el.innerHTML = `
        <section class="hero">
            <div class="glyph">语</div>
            <h1>让古人的话，重新活在你的<strong>聊天框</strong>里</h1>
            <p>本平台把调研报告中的语料与方法做成可用工具：检索古风表达、按语境改编、
               答题巩固，并用数据看板观察传播效果。语料标注 <span class="tag dai">真实语料</span>
               与 <span class="tag gold">模板扩充</span> 两类，来源可追溯。</p>
            <div class="row mt14">
                <a class="btn btn-primary" href="#/workshop">进入改编工坊</a>
                <a class="btn btn-zhu" href="#/verify">溯源核验</a>
                <a class="btn" href="#/corpus">检索语料库</a>
                <a class="btn" href="#/books">逛古籍书库</a>
                <a class="btn btn-ghost" href="#/archive">工具集（需本地存档）</a>
            </div>
        </section>

        <div class="grid g4 mt22" id="statRow">
            ${skeletonStat(4)}
        </div>

        <div class="card mt22" id="verifyCard">${loading('核验索引加载中…')}</div>

        <div class="grid mt22" style="grid-template-columns: 1.6fr 1fr;">
            <div class="card" id="dailyCard">${loading('正在取今日词条…')}</div>
            <div class="card" id="hotCard">${loading('热度榜加载中…')}</div>
        </div>

        <div class="card mt22" id="shelf">${loading('古籍书目加载中…')}</div>
        `;

        loadStats();
        loadVerify();
        loadDaily();
        loadHot();
        loadShelf();
    }
};

function skeletonStat(n) {
    return Array.from({ length: n }, () => `<div class="stat"><div class="k">—</div><div class="v">· · ·</div></div>`).join('');
}

async function loadStats() {
    const box = document.getElementById('statRow');
    try {
        const o = await api.get('/stats/overview');
        const items = [
            { k: '真实语料', v: o.corpusReal, u: '条' },
            { k: '扩充语料', v: o.corpusTemplate, u: '条' },
            { k: '改编调用', v: o.adaptTotal, u: '次' },
            { k: '今日活跃', v: o.uvToday, u: '人' }
        ];
        box.innerHTML = items.map(i => `<div class="stat">
            <div class="k">${esc(i.k)}</div>
            <div class="v">${Number(i.v || 0).toLocaleString()}<span class="u">${esc(i.u)}</span></div>
        </div>`).join('');
    } catch (e) {
        box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
}

/** 首页快检：贴一句直接跳到核验台，并由核验台自动开跑 */
async function loadVerify() {
    const box = document.getElementById('verifyCard');
    if (!box) return;
    try {
        const m = await api.get('/verify/meta');
        const used = Object.values(m.verdictCounter || {}).reduce((a, v) => a + Number(v || 0), 0);
        box.innerHTML = `
            <div class="row between">
                <div class="card-title" style="margin:0;"><span class="dot"></span>溯源核验 · 反伪古风
                    <span class="small muted">误传案例 ${m.casesTotal} 条 · 真典 ${m.verifiedTotal} 条 · 索引 ${m.indexSize} 条</span>
                </div>
                <a class="small" href="#/verify">完整核验台 →</a>
            </div>
            <div class="row mt14" style="gap:10px;flex-wrap:wrap;">
                <input class="input" id="vHomeText" style="flex:1;min-width:240px;"
                    placeholder="贴一句文案，例如：无人与我立黄昏，无人问我粥可温">
                <button class="btn btn-zhu" id="vHomeGo">核验出处</button>
            </div>
            <div class="small muted mt8">判定分四级：有据可考 / 出处存疑 / 出处讹变 / 伪古风。
                平台累计核验 ${used} 次${used ? '（Redis 计数）' : ''}。</div>`;
        const go = () => {
            const v = box.querySelector('#vHomeText').value.trim();
            if (!v) {
                toast('请先输入一句要核验的文案');
                return;
            }
            try {
                sessionStorage.setItem('ym_verify_text', v);
            } catch (e) {
                /* 隐私模式下忽略，核验台仍可手动输入 */
            }
            location.hash = '#/verify';
        };
        box.querySelector('#vHomeGo').onclick = go;
        box.querySelector('#vHomeText').addEventListener('keydown', e => {
            if (e.key === 'Enter') go();
        });
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>溯源核验</div>${empty(e.message)}`;
    }
}

async function loadDaily() {
    const box = document.getElementById('dailyCard');
    try {
        const d = await api.get('/daily');
        const ex = d.examples ? String(d.examples).split('、') : [];
        box.innerHTML = `
            <div class="card-title"><span class="dot"></span>每日一词 · ${esc(d.date || '')}</div>
            <div style="font-family:var(--font-serif);font-size:26px;color:var(--zhu);line-height:1.5;">
                ${esc(d.word || '')}
            </div>
            <div class="row mt8">
                ${d.category ? tag(d.category, 'zhu') : ''}
                ${d.modern ? tag('今译：' + d.modern, 'dai') : ''}
                ${d.poolSize ? tag('第 ' + d.index + ' / ' + d.poolSize + ' 条排期', '') : ''}
            </div>
            ${d.source ? `<p class="small muted mt8">${esc(d.source)}</p>` : ''}
            ${d.grammar ? `<p class="small"><b>语法：</b>${esc(d.grammar)}</p>` : ''}
            ${d.usage ? `<p class="small"><b>用法：</b>${esc(d.usage)}</p>` : ''}
            ${d.misuse ? `<p class="small" style="color:var(--zhu)"><b>误用提醒：</b>${esc(d.misuse)}</p>` : ''}
            ${ex.length ? `<div class="mt8 small muted">示例：${ex.map(esc).join(' ／ ')}</div>` : ''}
            ${d.corpus ? `<div class="hr"></div>
                <div class="small muted">语料库对照</div>
                <div class="pair" style="cursor:default;margin-top:8px;box-shadow:none;">
                    <div class="modern">${esc(d.corpus.modern)}</div>
                    <div class="ancient">${esc(d.corpus.ancient)}</div>
                    <div class="src">${esc(d.corpus.source || '')}</div>
                </div>` : ''}
            <div class="row mt14"><a class="btn btn-sm" href="#/workshop">拿它试一句</a></div>
        `;
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>每日一词</div>${empty(e.message)}`;
    }
}

async function loadHot() {
    const box = document.getElementById('hotCard');
    try {
        const list = await api.get('/stats/hot', { n: 8 });
        if (!list.length) {
            box.innerHTML = `<div class="card-title"><span class="dot"></span>热度榜</div>${empty('还没有浏览记录，去语料库逛一逛')}</div>`;
            return;
        }
        box.innerHTML = `<div class="card-title"><span class="dot"></span>热度榜 <span class="small muted">（Redis ZSet 实时排序）</span></div>` +
            list.map((x, i) => `<div class="row between" style="padding:7px 0;border-bottom:1px dashed var(--border);">
                <div style="min-width:0;">
                    <div style="font-weight:600;font-size:14px;">${i + 1}. ${esc(x.modern)}</div>
                    <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(x.ancient)}</div>
                </div>
                <span class="tag">${x.score}</span>
            </div>`).join('');
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>热度榜</div>${empty(e.message)}`;
    }
}

async function loadShelf() {
    const box = document.getElementById('shelf');
    try {
        const meta = await api.get('/meta');
        const books = (meta.books || []).slice(0, 12);
        const k = meta.knowledge || {};
        box.innerHTML = `
            <div class="card-title"><span class="dot"></span>典籍书架
                <span class="small muted">共 ${k.books || 0} 部 · 语料对 ${k.pairs || 0} 条 · 文言词表 ${(k.lexM2C || 0) + (k.lexC2M || 0)} 组</span>
                <a class="small" href="#/books" style="margin-left:auto;">进入书库 →</a>
            </div>
            <div class="grid g4">
                ${books.map(b => `<a class="card flat" href="#/books" style="padding:14px;text-decoration:none;">
                    <div style="font-family:var(--font-serif);font-size:16px;font-weight:600;">${esc(b.name)}</div>
                    <div class="row mt8">${tag(b.bu, 'dai')}${tag(b.era, '')}</div>
                    <div class="small muted mt8" style="line-height:1.7;">${esc(b.intro || '')}</div>
                </a>`).join('')}
            </div>
            <div class="small muted mt14">当前版本 v${esc(meta.version || '1.0.0')} · Redis ${esc(meta.redis ? '在线' : '离线')} ·
                数据策略：${esc(meta.dataPolicy || '')}</div>
        `;
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>典籍书架</div>${empty(e.message)}`;
    }
}
