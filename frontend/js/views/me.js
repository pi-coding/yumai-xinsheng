import { api, session } from '../api.js';
import { esc, tag, toast, empty, loading, fmtDate } from '../ui.js';

export default {
    title: '个人中心',
    async render(el) {
        if (!session.logged) {
            el.innerHTML = `<div class="card center" style="padding:40px;">
                <h2 style="font-size:20px;">需要先登录</h2>
                <p class="muted small">个人中心包含收藏、改编历史与答题记录。</p>
                <a class="btn btn-primary mt14" href="#/login">去登录</a>
            </div>`;
            return;
        }
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">个人中心</h1>
                <div class="small muted mt8">账号资料、我的收藏与答题记录。</div>
            </div>
            <button class="btn" id="logoutBtn">退出登录</button>
        </div>
        <div id="profile" class="mt14">${loading()}</div>
        <div class="grid mt22" style="grid-template-columns: 1.3fr 1fr;">
            <div class="card" id="favBox">${loading('收藏加载中…')}</div>
            <div class="card" id="recBox">${loading('记录加载中…')}</div>
        </div>
        `;
        el.querySelector('#logoutBtn').onclick = async () => {
            try {
                await api.post('/auth/logout');
            } catch (e) {
                /* 本地清理优先 */
            }
            session.clear();
            toast('已退出登录');
            location.hash = '#/home';
        };
        loadProfile(el);
        loadFavorites(el);
        loadRecords(el);
    }
};

async function loadProfile(el) {
    const box = el.querySelector('#profile');
    try {
        const p = await api.get('/auth/me');
        box.innerHTML = `<div class="card">
            <div class="row between">
                <div>
                    <div style="font-family:var(--font-serif);font-size:20px;font-weight:600;">${esc(p.nickname || p.username)}</div>
                    <div class="row mt8">
                        ${tag('@' + p.username, '')}
                        ${tag(p.role === 'ADMIN' ? '管理员' : '普通用户', p.role === 'ADMIN' ? 'zhu' : 'dai')}
                        ${tag('注册于 ' + fmtDate(p.createdAt), '')}
                    </div>
                </div>
                <div class="row">
                    <div class="stat" style="min-width:96px;"><div class="k">收藏</div><div class="v">${p.favCount}</div></div>
                    <div class="stat" style="min-width:96px;"><div class="k">改编</div><div class="v">${p.adaptCount}</div></div>
                    <div class="stat" style="min-width:96px;"><div class="k">最高分</div><div class="v">${p.bestScore || 0}</div></div>
                </div>
            </div>
            <div class="hr"></div>
            <div class="row">
                <div class="field" style="flex:1;min-width:180px;">
                    <label>修改昵称</label>
                    <input class="input" id="nickInput" value="${esc(p.nickname || '')}" maxlength="20">
                </div>
                <button class="btn btn-primary" id="saveNick" style="align-self:flex-end;">保存</button>
            </div>
        </div>`;
        box.querySelector('#saveNick').onclick = async () => {
            const nickname = box.querySelector('#nickInput').value.trim();
            if (!nickname) {
                toast('昵称不能为空');
                return;
            }
            try {
                const updated = await api.put('/auth/profile', { nickname });
                const u = session.user || {};
                u.nickname = updated.nickname;
                session.save({ user: u });
                toast('已保存', 'ok');
                loadProfile(el);
            } catch (e) {
                toast(e.message, 'err');
            }
        };
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}

async function loadFavorites(el) {
    const box = el.querySelector('#favBox');
    try {
        const data = await api.get('/favorites', { page: 1, size: 8 });
        if (!data.list.length) {
            box.innerHTML = `<div class="card-title"><span class="dot"></span>我的收藏</div>
                ${empty('还没有收藏，去语料库逛逛')}
                <a class="btn btn-sm mt14" href="#/corpus">去语料库</a>`;
            return;
        }
        box.innerHTML = `<div class="card-title"><span class="dot"></span>我的收藏
                <span class="small muted">共 ${data.total} 条</span></div>
            ${data.list.map(c => `<div class="row between" style="padding:8px 0;border-bottom:1px dashed var(--border);">
                <div style="min-width:0;">
                    <div style="font-weight:600;font-size:14px;">${esc(c.modern)}</div>
                    <div class="small" style="color:var(--zhu);font-family:var(--font-serif);">${esc(c.ancient)}</div>
                </div>
                <button class="btn btn-sm btn-ghost" data-unfav="${c.id}">移除</button>
            </div>`).join('')}`;
        box.querySelectorAll('[data-unfav]').forEach(b => b.onclick = async () => {
            try {
                await api.del('/favorites/' + b.dataset.unfav);
                toast('已移除', 'ok');
                loadFavorites(el);
                loadProfile(el);
            } catch (e) {
                toast(e.message, 'err');
            }
        });
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>我的收藏</div>${empty(e.message)}`;
    }
}

async function loadRecords(el) {
    const box = el.querySelector('#recBox');
    try {
        const list = await api.get('/quiz/records', { n: 8 });
        if (!list.length) {
            box.innerHTML = `<div class="card-title"><span class="dot"></span>答题记录</div>
                ${empty('还没有答题记录')}
                <a class="btn btn-sm mt14" href="#/quiz">去闯关</a>`;
            return;
        }
        box.innerHTML = `<div class="card-title"><span class="dot"></span>答题记录</div>
            <table class="table">
                <tr><th>时间</th><th>答对</th><th>得分</th></tr>
                ${list.map(r => `<tr>
                    <td class="small">${esc(fmtDate(r.at))}</td>
                    <td>${r.correct} / ${r.total}</td>
                    <td><b>${r.score}</b></td>
                </tr>`).join('')}
            </table>`;
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>答题记录</div>${empty(e.message)}`;
    }
}
