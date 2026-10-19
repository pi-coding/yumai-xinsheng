import { api } from '../api.js';
import { esc, tag, empty, loading, toast, openModal, closeModal } from '../ui.js';

/**
 * 工具集：把附录五-技术复原 的全部交付物收进统一导航。
 * 后端只提供索引（/api/archive/catalog），文件本体由 /archive/** 直接托管，
 * 因此点开就是原来的单文件应用，不会被本站样式污染。
 */

const KIND_LABEL = {
    html: '单文件 H5',
    md: '文档',
    json: '数据',
    txt: '纯文本',
    docx: '文档',
    dir: '目录',
    image: '图片'
};

const state = { kw: '', data: null };

export default {
    title: '工具集',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">工具集 · 附录五全部交付</h1>
                <div class="small muted mt8">
                    调研报告附录五的 18 项工具与门户、原始语料数据、报告原文与复原脚本，全部原样托管在此，
                    不改动一个字节。点开即以独立应用运行。
                </div>
            </div>
            <div class="row">
                <button class="btn btn-sm" id="refreshBtn" title="重新扫描磁盘">重新扫描</button>
            </div>
        </div>

        <div class="card mt14" id="statCard">${loading('正在读取归档索引…')}</div>

        <div class="card mt14">
            <div class="row">
                <input class="input" id="akw" placeholder="筛选：语料库 / 教案 / 问卷 / 溯源…"
                       style="flex:1;min-width:200px;">
                <button class="btn" id="clearBtn">清空</button>
            </div>
        </div>

        <div id="groupsBox" class="mt22">${loading()}</div>
        `;

        el.querySelector('#refreshBtn').onclick = async () => {
            el.querySelector('#groupsBox').innerHTML = loading('重新扫描磁盘…');
            await load(el, true);
            toast('归档索引已刷新', 'ok');
        };
        el.querySelector('#clearBtn').onclick = () => {
            state.kw = '';
            el.querySelector('#akw').value = '';
            paint(el);
        };
        el.querySelector('#akw').addEventListener('input', e => {
            state.kw = e.target.value.trim();
            paint(el);
        });

        await load(el, false);
    }
};

async function load(el, refresh) {
    try {
        state.data = await api.get('/archive/catalog', refresh ? { refresh: true } : {});
    } catch (e) {
        el.querySelector('#statCard').innerHTML = empty(e.message);
        el.querySelector('#groupsBox').innerHTML = '';
        return;
    }
    paintStat(el);
    paint(el);
}

function paintStat(el) {
    const d = state.data;
    const box = el.querySelector('#statCard');
    if (!d.available) {
        box.innerHTML = `
            <div class="card-title"><span class="dot"></span>归档目录未挂载</div>
            <p class="small">${esc(d.hint || '未找到「附录五-技术复原」目录。')}</p>
            <p class="small">该目录是调研报告附录五的 18 项离线交付物（纯静态 HTML），
               <b>不随本仓库分发</b>，因此从 GitHub 克隆下来后这一页必然为空 —— 其余功能不受影响。</p>
            <div class="notes mt14">
                <b>如果你手上有这份存档，两种方式接上（任选其一）：</b><br>
                1. 把 <span class="mono">server</span> 与 <span class="mono">附录五-技术复原</span>
                   放在同一个父目录下（默认自动探测）；<br>
                2. 在 <span class="mono">application.yml</span> 里设置
                   <span class="mono">yumai.archive.dir: D:/…/附录五-技术复原</span> 的绝对路径后重启。
            </div>`;
        return;
    }
    const mb = (d.indexedBytes / 1048576).toFixed(1);
    box.innerHTML = `
        <div class="row between">
            <div class="card-title" style="margin:0;"><span class="dot"></span>归档已挂载</div>
            <span class="tag dai">${esc(d.totalItems)} 项索引 · ${esc(d.missingItems)} 项缺失</span>
        </div>
        <div class="grid g4 mt14">
            <div class="stat"><div class="k">收录项目</div>
                <div class="v">${d.totalItems}<span class="u">项</span></div></div>
            <div class="stat"><div class="k">文件总数</div>
                <div class="v">${d.indexedFiles}<span class="u">个</span></div></div>
            <div class="stat"><div class="k">占用体积</div>
                <div class="v">${mb}<span class="u">MB</span></div></div>
            <div class="stat"><div class="k">托管路径</div>
                <div class="v" style="font-size:12px;line-height:1.5;word-break:break-all;">/archive/</div></div>
        </div>
        <div class="small muted mt8 mono" style="word-break:break-all;">根目录：${esc(d.root)}</div>`;
}

function paint(el) {
    const d = state.data;
    const box = el.querySelector('#groupsBox');
    if (!d) return;
    const kw = state.kw;
    const groups = (d.groups || []).map(g => {
        const items = (g.items || []).filter(it => !kw || hit(it, kw));
        return { ...g, items };
    }).filter(g => g.items.length);

    if (!groups.length) {
        box.innerHTML = empty(kw ? '没有匹配的项目，换个关键词试试' : '归档为空');
        return;
    }
    box.innerHTML = groups.map(g => `
        <section class="sec">
            <div class="row between">
                <h2 class="sec-title">${esc(g.name)}</h2>
                <span class="small muted">${g.items.length} 项</span>
            </div>
            <p class="small muted" style="margin:4px 0 14px;">${esc(g.note || '')}</p>
            <div class="grid g3">${g.items.map(card).join('')}</div>
        </section>`).join('');
    box.querySelectorAll('[data-preview]').forEach(btn => {
        btn.onclick = () => preview(btn.dataset.preview, btn.dataset.name);
    });
    box.querySelectorAll('[data-browse]').forEach(btn => {
        btn.onclick = () => browse(btn.dataset.browse);
    });
}

/** 目录型项目（复原脚本 / 构建脚本 / 微信工程）没有 index.html，用清单弹窗浏览 */
async function browse(path) {
    let data;
    try {
        data = await api.get('/archive/list', { path });
    } catch (e) {
        toast(e.message, 'err');
        return;
    }
    const crumbs = String(data.path || '').split('/').filter(Boolean);
    const body = openModal(`
        <div class="row between">
            <h3 class="mono" style="font-size:15px;">/${esc(data.path || '')}</h3>
            <button class="btn btn-sm btn-ghost" id="brClose">关闭</button>
        </div>
        <div class="row mt8">
            <span class="tag dai">${data.dirCount} 个子目录</span>
            <span class="tag">${data.fileCount} 个文件</span>
            ${data.path ? '<button class="btn btn-sm" id="brUp">← 返回上级</button>' : ''}
            ${crumbs.length ? `<span class="small muted mono">${esc(crumbs.join(' / '))}</span>` : ''}
        </div>
        <div class="mt14" id="brBody"></div>`);
    body.querySelector('#brClose').onclick = closeModal;
    const up = body.querySelector('#brUp');
    if (up) up.onclick = () => browse(data.parent);

    const rows = [];
    (data.dirs || []).forEach(d => {
        rows.push(`<div class="br-row">
            <span class="mono">📁 ${esc(d.name)}/</span>
            <span class="small muted">${d.files} 个文件</span>
            <button class="btn btn-sm" data-browse="${esc(d.path)}">进入</button>
        </div>`);
    });
    (data.files || []).forEach(f => {
        const act = (f.kind === 'html' || f.kind === 'image')
            ? `<a class="btn btn-sm btn-primary" href="${esc(f.url)}" target="_blank" rel="noopener">打开 ↗</a>`
            : `<span class="row" style="gap:6px;">
                 ${f.kind === 'docx' ? '' : `<button class="btn btn-sm" data-preview="${esc(f.url)}" data-name="${esc(f.name)}">预览</button>`}
                 <a class="btn btn-sm btn-ghost" href="${esc(f.url)}" target="_blank" rel="noopener" download>下载</a>
               </span>`;
        rows.push(`<div class="br-row">
            <span class="mono">${esc(f.name)}</span>
            <span class="small muted">${esc(fmtSize(f.bytes))}</span>
            ${act}
        </div>`);
    });
    const target = body.querySelector('#brBody');
    target.innerHTML = rows.length ? rows.join('') : empty('空目录');
    target.querySelectorAll('[data-browse]').forEach(b => {
        b.onclick = () => browse(b.dataset.browse);
    });
    target.querySelectorAll('[data-preview]').forEach(b => {
        b.onclick = () => preview(b.dataset.preview, b.dataset.name);
    });
}

function hit(it, kw) {
    const blob = [it.name, it.desc, it.id, (it.tags || []).join(' '), (it.meta || []).join(' ')]
        .join(' ').toLowerCase();
    return blob.includes(kw.toLowerCase());
}

function card(it) {
    const dead = !it.exists;
    const size = fmtSize(it.bytes, it.files);
    return `<div class="tool-card${dead ? ' dead' : ''}">
        <div class="row between">
            <div class="row" style="gap:8px;">
                <span class="tool-emoji">${esc(it.emoji || '📦')}</span>
                <div>
                    <div class="tool-name">${esc(it.name)}</div>
                    <div class="small muted mono">${esc(it.id)} · ${esc(KIND_LABEL[it.kind] || it.kind)}</div>
                </div>
            </div>
            ${dead ? tag('缺失', 'zhu') : ''}
        </div>
        <div class="small mt8" style="line-height:1.75;color:var(--ink-soft);">${esc(it.desc)}</div>
        <div class="row mt8">
            ${(it.tags || []).map(t => tag(t)).join('')}
        </div>
        <div class="tool-foot">
            <span class="small muted">${esc((it.meta || []).join(' · '))}${size ? ' · ' + esc(size) : ''}</span>
            ${actions(it, dead)}
        </div>
    </div>`;
}

function actions(it, dead) {
    if (dead) return '<span class="small muted">文件不在磁盘</span>';
    const url = esc(it.url);
    if (it.kind === 'html' || it.kind === 'image') {
        return `<a class="btn btn-sm btn-primary" href="${url}" target="_blank" rel="noopener">打开 ↗</a>`;
    }
    if (it.kind === 'dir') {
        return `<button class="btn btn-sm" data-browse="${esc(it.path)}" data-name="${esc(it.name)}">浏览目录</button>`;
    }
    const previewable = it.kind !== 'docx';
    return `<span class="row" style="gap:6px;">
        ${previewable ? `<button class="btn btn-sm" data-preview="${url}" data-name="${esc(it.name)}">预览</button>` : ''}
        <a class="btn btn-sm btn-ghost" href="${url}" target="_blank" rel="noopener"
           ${previewable ? '' : 'download'}>下载</a>
    </span>`;
}

/** 纯文本类文件就地预览（不解析 Markdown，保留原文，避免误导性渲染） */
async function preview(url, name) {
    const body = openModal(`
        <div class="row between">
            <h3>${esc(name)}</h3>
            <button class="btn btn-sm btn-ghost" id="pvClose">关闭</button>
        </div>
        <div class="small muted mt8">原文按纯文本显示，未做 Markdown 渲染；需要完整排版请点「下载」。</div>
        <pre class="doc-pre mt14">载入中…</pre>`);
    body.querySelector('#pvClose').onclick = closeModal;
    try {
        const res = await fetch(url);
        const text = await res.text();
        body.querySelector('.doc-pre').textContent = text.length > 200000
            ? text.slice(0, 200000) + '\n\n…（内容过长，已截断，完整内容请下载）'
            : text;
    } catch (e) {
        body.querySelector('.doc-pre').textContent = '载入失败：' + e.message;
    }
}

function fmtSize(bytes, files) {
    if (!bytes) return '';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
}
