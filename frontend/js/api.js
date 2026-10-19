/**
 * 极简 API 客户端：统一处理 token、错误码与 401 跳转。
 * 不依赖任何前端框架/打包工具，浏览器原生 ES Module 直接运行。
 */
const TOKEN_KEY = 'ym_token';
const REFRESH_KEY = 'ym_refresh';
const USER_KEY = 'ym_user';

export const session = {
    get token() {
        return localStorage.getItem(TOKEN_KEY) || '';
    },
    get refreshToken() {
        return localStorage.getItem(REFRESH_KEY) || '';
    },
    get user() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        } catch (e) {
            return null;
        }
    },
    save(data) {
        if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
        if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
        if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    },
    clear() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
    },
    get logged() {
        return !!this.token;
    }
};

function qs(params) {
    if (!params) return '';
    const parts = [];
    Object.keys(params).forEach(k => {
        const v = params[k];
        if (v === undefined || v === null || v === '') return;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
}

let redirecting = false;

async function request(method, path, { params, body } = {}) {
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session.token) headers['Authorization'] = 'Bearer ' + session.token;

    let res;
    try {
        res = await fetch('/api' + path + qs(params), {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (e) {
        const err = new Error('网络连接失败，请确认后端服务已启动');
        err.code = -1;
        throw err;
    }

    let payload = null;
    const text = await res.text();
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch (e) {
            payload = null;
        }
    }
    if (!payload) {
        const err = new Error('服务返回了非 JSON 响应（HTTP ' + res.status + '）');
        err.code = res.status;
        throw err;
    }
    if (payload.code === 0) {
        return payload.data;
    }
    const err = new Error(payload.msg || ('请求失败（' + payload.code + '）'));
    err.code = payload.code;
    if (payload.code === 401 && !redirecting) {
        redirecting = true;
        session.clear();
        renderTopbar();
        setTimeout(() => {
            redirecting = false;
            location.hash = '#/login';
        }, 300);
    }
    throw err;
}

export const api = {
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    del: (path) => request('DELETE', path)
};

/** 顶栏右侧账号区，登录态变化时由 app.js 注入具体实现 */
let renderTopbar = () => {};
export function bindTopbar(fn) {
    renderTopbar = fn;
}
export function refreshTopbar() {
    renderTopbar();
}
