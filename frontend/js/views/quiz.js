import { api, session } from '../api.js';
import { esc, tag, toast, empty, loading } from '../ui.js';

const state = {
    questions: [],
    answers: {},
    startedAt: 0,
    result: null,
    count: 10
};

export default {
    title: '答题闯关',
    async render(el) {
        el.innerHTML = `
        <div class="row between">
            <div>
                <h1 style="font-size:23px;">古今对照 · 答题闯关</h1>
                <div class="small muted mt8">从题库随机抽题，交卷后展示解析；成绩写入 Redis 日榜（保留 3 天）。</div>
            </div>
            <div class="row">
                <select class="select" id="countSel" style="width:auto;">
                    <option value="5">5 题</option>
                    <option value="10" selected>10 题</option>
                    <option value="15">15 题</option>
                </select>
                <button class="btn btn-primary" id="startBtn">换一组题</button>
            </div>
        </div>

        <div class="grid mt14" style="grid-template-columns: 1.5fr 1fr;">
            <div id="quizBox" class="card">${loading('抽题中…')}</div>
            <div class="card" id="rankBox">${loading('榜单加载中…')}</div>
        </div>
        `;

        el.querySelector('#startBtn').onclick = () => {
            state.count = Number(el.querySelector('#countSel').value);
            start(el);
        };
        start(el);
        loadRank(el);
    }
};

async function start(el) {
    const box = el.querySelector('#quizBox');
    box.innerHTML = loading('抽题中…');
    state.answers = {};
    state.result = null;
    try {
        state.questions = await api.get('/quiz/questions', { n: state.count });
        state.startedAt = Date.now();
        renderQuestions(el);
    } catch (e) {
        box.innerHTML = empty(e.message);
    }
}

function renderQuestions(el) {
    const box = el.querySelector('#quizBox');
    box.innerHTML = `
        <div class="row between">
            <div class="card-title" style="margin:0;"><span class="dot"></span>共 ${state.questions.length} 题</div>
            <span class="small muted" id="progress">已答 0 / ${state.questions.length}</span>
        </div>
        <div class="mt14">
            ${state.questions.map((q, i) => `
                <div class="q" data-qid="${q.id}">
                    <div class="stem">${i + 1}. ${esc(q.stem)}</div>
                    ${q.options.map(o => `<div class="opt" data-k="${esc(o.key)}">
                        <span class="k">${esc(o.key)}</span><span>${esc(o.text)}</span>
                    </div>`).join('')}
                    <div class="row mt8">${tag(q.category || '综合', 'dai')}${tag(q.difficulty || 'normal', '')}</div>
                </div>`).join('')}
        </div>
        <div class="row mt14">
            <button class="btn btn-zhu" id="submitBtn">交卷</button>
            <span class="small muted">${session.logged ? '成绩将计入今日榜单' : '未登录也可作答，登录后计入榜单'}</span>
        </div>`;

    box.querySelectorAll('.q').forEach(qEl => {
        qEl.addEventListener('click', e => {
            const opt = e.target.closest('.opt');
            if (!opt) return;
            qEl.querySelectorAll('.opt').forEach(o => o.classList.remove('on'));
            opt.classList.add('on');
            state.answers[qEl.dataset.qid] = opt.dataset.k;
            el.querySelector('#progress').textContent =
                `已答 ${Object.keys(state.answers).length} / ${state.questions.length}`;
        });
    });
    box.querySelector('#submitBtn').onclick = () => submit(el);
}

async function submit(el) {
    if (!session.logged) {
        toast('请先登录后交卷');
        location.hash = '#/login';
        return;
    }
    const answers = Object.entries(state.answers).map(([id, choice]) => ({ id: Number(id), choice }));
    if (!answers.length) {
        toast('至少作答一题');
        return;
    }
    try {
        const r = await api.post('/quiz/submit', { answers, durationMs: Date.now() - state.startedAt });
        state.result = r;
        renderResult(el);
        loadRank(el);
    } catch (e) {
        toast(e.message, 'err');
    }
}

function renderResult(el) {
    const r = state.result;
    const box = el.querySelector('#quizBox');
    box.innerHTML = `
        <div class="row between">
            <div>
                <div class="small muted">本次得分</div>
                <div style="font-family:var(--font-serif);font-size:38px;font-weight:700;line-height:1.2;">
                    ${r.score}<span class="small muted" style="font-size:14px;"> / 100</span></div>
                <div class="small muted mt8">答对 ${r.correct} / ${r.total} 题${r.rank ? ' · 今日第 ' + r.rank + ' 名' : ''}</div>
            </div>
            <div class="row">
                <button class="btn" id="againBtn">再来一组</button>
                <button class="btn" id="reviewBtn">查看解析</button>
            </div>
        </div>
        <div class="hr"></div>
        <div id="reviewBox">
            ${r.details.map((d, i) => `<div class="q">
                <div class="stem">${i + 1}. ${esc(d.stem)}</div>
                <div class="row">
                    <span class="tag ${d.correct ? 'dai' : 'zhu'}">${d.correct ? '正确' : '错误'}</span>
                    <span class="small">你的选择：${esc(d.yourChoice || '未答')}</span>
                    <span class="small">正确答案：${esc(d.answer)}</span>
                </div>
                <div class="small muted mt8">${esc(d.analysis || '')}</div>
            </div>`).join('')}
        </div>`;
    box.querySelector('#againBtn').onclick = () => start(el);
    box.querySelector('#reviewBtn').onclick = () => {
        const rb = box.querySelector('#reviewBox');
        rb.style.display = rb.style.display === 'none' ? '' : 'none';
    };
}

async function loadRank(el) {
    const box = el.querySelector('#rankBox');
    try {
        const list = await api.get('/quiz/rank', { n: 10 });
        box.innerHTML = `<div class="card-title"><span class="dot"></span>今日榜单</div>` +
            (list.length ? list.map(x => `<div class="row between" style="padding:7px 0;border-bottom:1px dashed var(--border);">
                <span><b>${x.rank}.</b> ${esc(x.nickname)}</span>
                <span class="tag dai">${x.score} 分</span>
            </div>`).join('') : empty('今日还没有人上榜，来当第一个'));
    } catch (e) {
        box.innerHTML = `<div class="card-title"><span class="dot"></span>今日榜单</div>${empty(e.message)}`;
    }
}
