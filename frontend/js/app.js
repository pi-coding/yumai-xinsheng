import { api, session, bindTopbar, refreshTopbar } from './api.js';
import { esc, toast } from './ui.js';
import home from './views/home.js';
import corpus from './views/corpus.js';
import books from './views/books.js';
import workshop from './views/workshop.js';
import verify from './views/verify.js';
import calendar from './views/calendar.js';
import quiz from './views/quiz.js';
import dashboard from './views/dashboard.js';
import archive from './views/archive.js';
import me from './views/me.js';
import login from './views/login.js';

const routes = {
    '/home': home,
    '/corpus': corpus,
    '/books': books,
    '/workshop': workshop,
    '/verify': verify,
    '/calendar': calendar,
    '/quiz': quiz,
    '/dashboard': dashboard,
    '/archive': archive,
    '/me': me,
    '/login': login
};

function currentPath() {
    const raw = (location.hash || '').replace(/^#/, '');
    return routes[raw] ? raw : '/home';
}

function renderTopbar() {
    const side = document.getElementById('topbarSide');
    if (!side) return;
    const u = session.user;
    if (!u) {
        side.innerHTML = `<a class="btn btn-sm btn-primary" href="#/login">登录 / 注册</a>`;
        return;
    }
    side.innerHTML = `
        <a class="btn btn-sm" href="#/me">${esc(u.nickname || u.username)}</a>
        <button class="btn btn-sm btn-ghost" id="topLogout" title="退出登录">退出</button>`;
    side.querySelector('#topLogout').onclick = async () => {
        try {
            await api.post('/auth/logout');
        } catch (e) {
            /* 忽略：本地清理优先 */
        }
        session.clear();
        toast('已退出登录');
        renderTopbar();
        location.hash = '#/home';
    };
}

let mounting = false;

async function mount() {
    if (mounting) return;
    mounting = true;
    const path = currentPath();
    const view = routes[path];
    const app = document.getElementById('app');

    document.querySelectorAll('#nav a').forEach(a => {
        a.classList.toggle('on', a.dataset.route === path);
    });
    document.title = (view.title ? view.title + ' · ' : '') + '语脉新生 · 古风网语赋能平台';

    app.className = path === '/login' ? '' : 'wrap';
    app.innerHTML = '';
    try {
        await view.render(app);
    } catch (e) {
        app.innerHTML = `<div class="card" style="margin-top:20px;">
            <h3>页面渲染失败</h3>
            <p class="small muted">${esc(e.message)}</p>
            <button class="btn" onclick="location.reload()">刷新重试</button>
        </div>`;
    }
    window.scrollTo({ top: 0 });
    refreshTopbar();
    mounting = false;
}

bindTopbar(renderTopbar);
window.addEventListener('hashchange', mount);

// type="module" 脚本在 DOM 解析完成后执行，直接启动即可
renderTopbar();
if (!location.hash) {
    location.hash = '#/home';
}
mount();
