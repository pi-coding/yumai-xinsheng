import { api } from '../api.js';
import { esc, tag, bars, lineChart, empty, loading } from '../ui.js';

export default {
    title: '数据看板',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">数据看板</h1>
                <div class="small muted mt8">指标来自 MySQL 聚合与 Redis 实时计数（UV 用 HyperLogLog 估算）。</div>
            </div>
            <button class="btn" id="refreshBtn">刷新</button>
        </div>
        <div id="board" class="mt14">${loading()}</div>
        `;
        el.querySelector('#refreshBtn').onclick = () => load(el);
        load(el);
    }
};

async function load(el) {
    const box = el.querySelector('#board');
    box.innerHTML = loading();
    try {
        const d = await api.get('/stats/dashboard');
        const o = d.overview || {};
        const k = o.knowledge || {};
        box.innerHTML = `
        <div class="grid g4">
            ${stat('语料总量', o.corpusTotal, '条', `真实 ${o.corpusReal} · 模板 ${o.corpusTemplate}`)}
            ${stat('注册用户', o.userTotal, '人', `收藏 ${o.favoriteTotal || 0} 次`)}
            ${stat('改编调用', o.adaptTotal, '次', `今日 ${o.adaptToday || 0} 次`)}
            ${stat('今日 UV / PV', (o.uvToday || 0) + ' / ' + (o.pvToday || 0), '', 'HyperLogLog + Hash')}
        </div>

        <div class="grid mt22" style="grid-template-columns: 1.4fr 1fr;">
            <div class="card">
                <div class="card-title"><span class="dot"></span>近 7 日改编趋势</div>
                ${lineChart(d.trend || [], { valueKey: 'count' })}
                <div class="small muted">横轴 MM-DD；数值为当日改编调用次数（MySQL 流水聚合）。</div>
            </div>
            <div class="card">
                <div class="card-title"><span class="dot"></span>语料分类分布 <span class="small muted">（真实语料）</span></div>
                ${(d.categories || []).length ? bars(d.categories) : empty('暂无分类数据')}
            </div>
        </div>

        <div class="grid mt22" style="grid-template-columns: 1fr 1fr;">
            <div class="card">
                <div class="card-title"><span class="dot"></span>热度分布</div>
                ${(d.popularity || []).length ? bars(d.popularity, { nameKey: 'name', valueKey: 'value', unit: ' 条' }) : empty('暂无数据')}
                <div class="hr"></div>
                <div class="small muted">知识库：语料对 ${k.pairs || 0} 条（含补充 ${k.supplementPairs || 0}）、
                    古籍 ${k.books || 0} 部、日历词 ${k.calendar || 0} 条、词表 ${(k.lexM2C || 0) + (k.lexC2M || 0)} 组。</div>
            </div>
            <div class="card">
                <div class="card-title"><span class="dot"></span>实时热词 <span class="small muted">（Redis ZSet）</span></div>
                ${(d.hotWords || []).length ? d.hotWords.map((w, i) => `<div class="row between"
                        style="padding:7px 0;border-bottom:1px dashed var(--border);">
                        <span style="min-width:0;">
                            <b>${i + 1}.</b> ${esc(w.modern)}
                            <span class="small muted"> · ${esc((w.ancient || '').slice(0, 14))}</span>
                        </span>
                        <span class="tag">${w.score}</span>
                    </div>`).join('') : empty('暂无浏览热度')}
            </div>
        </div>

        <div class="card mt22">
            <div class="card-title"><span class="dot"></span>改编模式分布</div>
            ${renderModes(o.adaptModes || {})}
            <div class="small muted mt14">数据来源：Redis Hash <span class="mono">ym:adapt:counter</span>，Redis 为空时回落到 MySQL 流水。</div>
        </div>
        `;
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}

function stat(k, v, u, sub) {
    return `<div class="stat">
        <div class="k">${esc(k)}</div>
        <div class="v">${Number(v || 0).toLocaleString()}<span class="u">${esc(u)}</span></div>
        <div class="small muted">${esc(sub)}</div>
    </div>`;
}

function renderModes(modes) {
    const keys = Object.keys(modes);
    if (!keys.length) return empty('暂无调用数据');
    const total = keys.reduce((s, k) => s + Number(modes[k] || 0), 0) || 1;
    return keys.map(k => {
        const v = Number(modes[k] || 0);
        const pct = Math.round(v * 100 / total);
        return `<div class="bar-row">
            <div class="n">${esc(k === 'm2c' ? '今译古' : k === 'c2m' ? '古译今' : k)}</div>
            <div class="track"><div class="fill" style="width:${pct}%"></div></div>
            <div class="v">${v}</div>
        </div>`;
    }).join('');
}
