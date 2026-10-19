import { api, session } from '../api.js';
import { esc, toast } from '../ui.js';

let mode = 'login';

export default {
    title: '登录',
    async render(el) {
        el.classList.remove('wrap');
        el.innerHTML = `
        <div class="auth-shell">
            <div class="card auth-card">
                <h2>${mode === 'login' ? '登录语脉新生' : '创建账号'}</h2>
                <div class="small muted">同一账号可收藏语料、保存改编记录、计入答题榜。</div>
                <div class="tabs" id="tabs">
                    <button class="${mode === 'login' ? 'on' : ''}" data-v="login">登录</button>
                    <button class="${mode === 'register' ? 'on' : ''}" data-v="register">注册</button>
                </div>
                <div class="stack">
                    <div class="field"><label>账号</label>
                        <input class="input" id="u" placeholder="3–20 位，字母或数字" autocomplete="username"></div>
                    <div class="field"><label>密码</label>
                        <input class="input" id="p" type="password" placeholder="至少 6 位" autocomplete="current-password"></div>
                    <div class="field" id="nickField" style="display:${mode === 'register' ? 'flex' : 'none'};">
                        <label>昵称（可选）</label><input class="input" id="n" placeholder="展示用昵称"></div>
                    <button class="btn btn-primary" id="submitBtn" style="width:100%;">
                        ${mode === 'login' ? '登录' : '注册并登录'}</button>
                    <button class="btn btn-ghost" id="guestBtn" style="width:100%;">以游客身份浏览</button>
                </div>
                <div class="hr"></div>
                <div class="small muted">
                    内置演示账号：<span class="mono">demo / demo123</span>　管理员：<span class="mono">admin / admin123</span>
                </div>
            </div>
        </div>`;

        el.querySelector('#tabs').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            mode = b.dataset.v;
            this.render(el);
        });
        el.querySelector('#guestBtn').onclick = () => {
            location.hash = '#/home';
        };
        el.querySelector('#submitBtn').onclick = () => submit(el);
        el.querySelector('#p').addEventListener('keydown', e => {
            if (e.key === 'Enter') submit(el);
        });
    }
};

async function submit(el) {
    const username = el.querySelector('#u').value.trim();
    const password = el.querySelector('#p').value;
    const nickname = el.querySelector('#n').value.trim();
    if (!username || !password) {
        toast('请填写账号与密码');
        return;
    }
    const btn = el.querySelector('#submitBtn');
    btn.disabled = true;
    btn.textContent = '处理中…';
    try {
        const data = mode === 'login'
            ? await api.post('/auth/login', { username, password })
            : await api.post('/auth/register', { username, password, nickname });
        session.save(data);
        toast(mode === 'login' ? '欢迎回来' : '注册成功', 'ok');
        location.hash = '#/home';
    } catch (e) {
        toast(e.message, 'err');
    } finally {
        btn.disabled = false;
        btn.textContent = mode === 'login' ? '登录' : '注册并登录';
    }
}
