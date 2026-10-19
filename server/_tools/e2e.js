#!/usr/bin/env node
/**
 * 语脉新生 · 全栈版 接口自检脚本
 * 覆盖：健康检查、注册登录、鉴权拦截、语料检索、收藏、改编（含 Redis 缓存命中）、
 *      答题交卷与日榜、数据看板、每日一词、元信息、限流。
 *
 * 用法：node _tools/e2e.js [http://127.0.0.1:8081]
 * 退出码：0 全部通过；1 存在失败项。
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8081').replace(/\/$/, '');
const results = [];

function record(name, ok, detail) {
    results.push({ name, ok, detail });
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function call(method, path, { token, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(BASE + '/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (e) {
        json = { code: res.status, msg: text.slice(0, 120) };
    }
    return { status: res.status, body: json };
}

async function ensureWriteQuota() {
    for (let i = 0; i < 2; i++) {
        const probe = await call('POST', '/auth/login', { body: { username: '__quota_probe__', password: 'x' } });
        if (probe.body.code !== 429) return;
        console.log('检测到限流窗口未过期，等待 62 秒后继续…');
        await new Promise(r => setTimeout(r, 62000));
    }
}

function assert(name, cond, detail) {
    record(name, !!cond, detail);
    return !!cond;
}

/** 跳过：仍然计入「通过」，但在明细里标明原因，避免误以为真的验过 */
function skip(name, reason) {
    results.push({ name, ok: true, skipped: true });
    console.log(`[SKIP] ${name}${reason ? ' — ' + reason : ''}`);
}

(async () => {
    const stamp = Date.now().toString().slice(-8);
    const username = 'e2e' + stamp;
    const password = 'test123456';
    let token = '';
    let corpusId = null;

    // 0. 先确认写接口配额（上一轮自检可能刚触发限流，等窗口过期再跑）
    await ensureWriteQuota();

    // 1. 健康检查
    const health = await call('GET', '/health');
    assert('健康检查', health.body.code === 0 && health.body.data.redis === 'UP',
        'redis=' + (health.body.data && health.body.data.redis));

    // 2. 鉴权拦截：未登录访问个人接口
    const noAuth = await call('GET', '/favorites');
    assert('未登录访问受保护接口返回 401', noAuth.body.code === 401, 'code=' + noAuth.body.code);

    // 3. 注册
    const reg = await call('POST', '/auth/register', { body: { username, password, nickname: '自检用户' } });
    if (!assert('注册成功', reg.body.code === 0, reg.body.msg)) {
        finish();
        return;
    }
    token = reg.body.data.token;
    assert('注册返回 access/refresh 双令牌', !!reg.body.data.token && !!reg.body.data.refreshToken);

    // 4. 重复注册应失败
    const dup = await call('POST', '/auth/register', { body: { username, password } });
    assert('重复账号被拒绝', dup.body.code === 409, 'code=' + dup.body.code);

    // 5. 登录 + 错误口令
    const badLogin = await call('POST', '/auth/login', { body: { username, password: 'wrong-pass' } });
    assert('错误口令被拒绝', badLogin.body.code === 401, badLogin.body.msg);
    const login = await call('POST', '/auth/login', { body: { username, password } });
    assert('登录成功', login.body.code === 0 && !!login.body.data.token);
    token = login.body.data.token;

    // 6. 个人资料
    const me = await call('GET', '/auth/me', { token });
    assert('个人资料可读', me.body.code === 0 && me.body.data.username === username,
        'favCount=' + (me.body.data && me.body.data.favCount));

    // 7. 语料检索
    const search = await call('GET', '/corpus?size=3');
    assert('语料分页检索', search.body.code === 0 && search.body.data.total > 0,
        'total=' + (search.body.data && search.body.data.total));
    if (search.body.data && search.body.data.list.length) {
        corpusId = search.body.data.list[0].id;
    }
    const kw = await call('GET', '/corpus?kw=' + encodeURIComponent('摸鱼'));
    assert('关键词检索命中', kw.body.code === 0 && kw.body.data.total >= 1,
        'total=' + (kw.body.data && kw.body.data.total));
    const temp = await call('GET', '/corpus?dataSource=TEMPLATE&size=2');
    assert('模板语料可单独筛选', temp.body.code === 0 && temp.body.data.total > 0,
        'total=' + (temp.body.data && temp.body.data.total));

    // 8. 收藏（幂等切换）
    if (corpusId) {
        const fav1 = await call('POST', '/favorites/' + corpusId, { token });
        assert('收藏成功', fav1.body.code === 0 && fav1.body.data.favorited === true);
        const favList = await call('GET', '/favorites', { token });
        assert('收藏列表包含该条', favList.body.code === 0 && favList.body.data.total >= 1);
        const fav2 = await call('POST', '/favorites/' + corpusId, { token });
        assert('再次点击取消收藏', fav2.body.code === 0 && fav2.body.data.favorited === false);
    }
    const detail = corpusId ? await call('GET', '/corpus/' + corpusId) : { body: { code: -1 } };
    assert('语料详情可读并累加浏览', detail.body.code === 0 && detail.body.data.viewCount >= 1,
        'view=' + (detail.body.data && detail.body.data.viewCount));

    // 8.5 古籍收藏（书目级，供小程序端「我的收藏 · 书库」用）
    const bfAnon = await call('GET', '/book-favorites');
    assert('古籍收藏需登录（401）', bfAnon.body.code === 401);
    const bf1 = await call('POST', '/book-favorites/' + encodeURIComponent('周易'), { token });
    assert('收藏一部古籍', bf1.body.code === 0 && bf1.body.data.favorited === true,
        'favorited=' + (bf1.body.data && bf1.body.data.favorited));
    const bfList = await call('GET', '/book-favorites', { token });
    assert('古籍收藏清单包含该书',
        bfList.body.code === 0 && (bfList.body.data.names || []).indexOf('周易') >= 0,
        'names=' + JSON.stringify(bfList.body.data && bfList.body.data.names));
    const bf2 = await call('POST', '/book-favorites/' + encodeURIComponent('周易'), { token });
    assert('再次点击取消古籍收藏', bf2.body.code === 0 && bf2.body.data.favorited === false);
    const bfMerge = await call('POST', '/book-favorites/merge', { token, body: { names: ['史记', '诗经', '不存在的书'] } });
    assert('批量合并书架只收有效书目',
        bfMerge.body.code === 0 && bfMerge.body.data.added === 2,
        'added=' + (bfMerge.body.data && bfMerge.body.data.added));
    await call('POST', '/book-favorites/' + encodeURIComponent('史记'), { token });
    await call('POST', '/book-favorites/' + encodeURIComponent('诗经'), { token });

    // 9. 改编引擎 + Redis 缓存
    const a1 = await call('POST', '/adapt', {
        token,
        body: { text: '今天上班好困啊，不想干活只想摸鱼', mode: 'm2c', context: '职场', tone: '庄重', form: '文言句式' }
    });
    assert('改编接口返回结果', a1.body.code === 0 && !!a1.body.data.output, a1.body.data && a1.body.data.output);
    assert('改编返回批注', a1.body.code === 0 && (a1.body.data.notes || []).length > 0);
    const a2 = await call('POST', '/adapt', {
        token,
        body: { text: '今天上班好困啊，不想干活只想摸鱼', mode: 'm2c', context: '职场', tone: '庄重', form: '文言句式' }
    });
    assert('相同请求命中 Redis 缓存', a2.body.code === 0 && a2.body.data.hitCache === true,
        'hitCache=' + (a2.body.data && a2.body.data.hitCache));
    const a3 = await call('POST', '/adapt', {
        body: { text: '世间无限丹青手，一片伤心画不成', mode: 'c2m', form: '通俗转写' }
    });
    assert('文言→通俗方向可用（匿名）', a3.body.code === 0 && !!a3.body.data.output);
    const hist = await call('GET', '/adapt/history', { token });
    assert('改编历史可读', hist.body.code === 0 && hist.body.data.length > 0,
        'n=' + (hist.body.data && hist.body.data.length));

    // 10. 答题
    const qs = await call('GET', '/quiz/questions?n=5');
    assert('抽题接口返回 5 题', qs.body.code === 0 && qs.body.data.length === 5);
    if (qs.body.data && qs.body.data.length) {
        assert('题目不下发答案', !('answer' in qs.body.data[0]));
        const answers = qs.body.data.map(q => ({ id: q.id, choice: 'A' }));
        const sub = await call('POST', '/quiz/submit', { token, body: { answers, durationMs: 12345 } });
        assert('交卷并计分', sub.body.code === 0 && typeof sub.body.data.score === 'number',
            'score=' + (sub.body.data && sub.body.data.score));
        assert('交卷返回逐题解析', sub.body.code === 0 && sub.body.data.details.length === answers.length);
        const rank = await call('GET', '/quiz/rank?n=10');
        assert('今日榜单包含本人', rank.body.code === 0 && rank.body.data.some(x => x.nickname === '自检用户'),
            'n=' + (rank.body.data && rank.body.data.length));
        const recs = await call('GET', '/quiz/records', { token });
        assert('个人答题记录可读', recs.body.code === 0 && recs.body.data.length >= 1);
    }

    // 11. 数据看板 / 每日一词 / 元信息
    const dash = await call('GET', '/stats/dashboard');
    assert('看板聚合返回', dash.body.code === 0 && !!dash.body.data.overview
        && Array.isArray(dash.body.data.trend) && dash.body.data.trend.length === 7);
    const daily = await call('GET', '/daily');
    assert('每日一词可读', daily.body.code === 0 && !!daily.body.data.word);
    const daily2 = await call('GET', '/daily');
    assert('每日一词走 Redis 缓存（稳定）', daily2.body.data && daily2.body.data.word === daily.body.data.word);
    const meta = await call('GET', '/meta');
    assert('元信息含知识库与书目', meta.body.code === 0 && meta.body.data.knowledge.pairs > 0
        && meta.body.data.books.length > 0);
    const cats = await call('GET', '/corpus/categories');
    assert('分类聚合非空', cats.body.code === 0 && cats.body.data.length > 0,
        'n=' + (cats.body.data && cats.body.data.length));

    // 12. 附录五整合：归档目录 + 静态托管
    //     注意：附录五离线存档**不随仓库分发**。clone 后若没有这个目录，
    //     后端会把 available 置 false 并给出 hint，此组整组跳过，不算失败。
    const arc = await call('GET', '/archive/catalog');
    assert('归档接口可访问（不论是否挂载）', arc.body.code === 0,
        `available=${arc.body.data && arc.body.data.available} root=${arc.body.data && arc.body.data.root}`);

    if (!arc.body.data || arc.body.data.available !== true) {
        skip('附录五归档未挂载，跳过归档专项校验（9 项）',
            (arc.body.data && arc.body.data.hint) || '未找到「附录五-技术复原」目录');
    } else {
    // 24 项 = 报告类素材移出（-4）、微信小程序工程上移为顶层「miniprogram」（-1）后的现行规模
    assert('归档索引覆盖全部交付物（24 项）', arc.body.code === 0 && arc.body.data.totalItems === 24
        && arc.body.data.missingItems === 0,
        `items=${arc.body.data && arc.body.data.totalItems} missing=${arc.body.data && arc.body.data.missingItems}`);
    const arcGroups = (arc.body.data && arc.body.data.groups) || [];
    assert('归档分 6 组且每项都有 URL', arcGroups.length === 6
        && arcGroups.every(g => g.items.every(i => i.url && i.url.startsWith('/archive/'))),
        'groups=' + arcGroups.length);

    const flat = [];
    arcGroups.forEach(g => g.items.forEach(i => flat.push(i)));
    const tools = flat.filter(i => i.kind === 'html');
    assert('HTML 交付物不少于 18 个', tools.length >= 18, 'html=' + tools.length);

    let served = 0;
    for (const item of tools.slice(0, 6)) {
        const r = await fetch(BASE + item.url);
        const buf = await r.arrayBuffer();
        if (r.status === 200 && buf.byteLength > 1000) served++;
    }
    assert('归档 HTML 可被服务端原样托管', served === Math.min(6, tools.length), `served=${served}`);

    const bigData = flat.find(i => i.id === 'DATA');
    const datRes = bigData ? await fetch(BASE + bigData.url) : { status: 0 };
    assert('语料库原始 JSON 可下载', datRes.status === 200, 'status=' + datRes.status);

    const passTrav = await fetch(BASE + '/archive/%2e%2e/%2e%2e/application.yml');
    assert('归档目录禁止越权穿越', passTrav.status === 404, 'status=' + passTrav.status);

    const dirList = await call('GET', '/archive/list?path=' + encodeURIComponent('复原脚本'));
    assert('目录型项目可浏览清单', dirList.body.code === 0
        && dirList.body.data.fileCount > 0 && dirList.body.data.dirs.length > 0,
        `files=${dirList.body.data && dirList.body.data.fileCount} dirs=${dirList.body.data && dirList.body.data.dirCount}`);
    assert('目录清单里每个文件都有 URL', dirList.body.code === 0
        && dirList.body.data.files.every(f => f.url.startsWith('/archive/')));
    const dirTrav = await call('GET', '/archive/list?path=' + encodeURIComponent('../'));
    assert('目录浏览禁止越权穿越', dirTrav.body.code === 404, 'code=' + dirTrav.body.code);
    }

    // 13. 古籍书库
    const books = await call('GET', '/books?size=5');
    assert('书库分页返回（60 部）', books.body.code === 0 && books.body.data.total === 60,
        'total=' + (books.body.data && books.body.data.total));
    assert('书库按四部分类汇总', books.body.code === 0 && books.body.data.bus.length === 4
        && books.body.data.bus.reduce((s, x) => s + x.count, 0) === 60,
        (books.body.data.bus || []).map(x => x.name + x.count).join('/'));
    assert('书目带确定性封面参数', books.body.code === 0
        && books.body.data.list.every(b => b.seed >= 0 && /^#[0-9a-f]{6}$/i.test(b.color1)),
        books.body.data.list[0] && books.body.data.list[0].name);
    const bookKw = await call('GET', '/books?kw=' + encodeURIComponent('苏轼'));
    assert('书库关键词检索可用', bookKw.body.code === 0 && bookKw.body.data.total >= 1,
        'total=' + (bookKw.body.data && bookKw.body.data.total));
    const bookBu = await call('GET', '/books?bu=' + encodeURIComponent('史部'));
    assert('书库按部类筛选可用', bookBu.body.code === 0 && bookBu.body.data.total === 14,
        '史部=' + (bookBu.body.data && bookBu.body.data.total));
    const bookDetail = await call('GET', '/books/' + encodeURIComponent('论语'));
    assert('书目详情含关联语料', bookDetail.body.code === 0
        && Array.isArray(bookDetail.body.data.relatedPairs)
        && bookDetail.body.data.relatedPairs.length >= 1,
        'pairs=' + (bookDetail.body.data && bookDetail.body.data.relatedPairCount));
    const book404 = await call('GET', '/books/' + encodeURIComponent('不存在的书'));
    assert('不存在的书目返回 404', book404.body.code === 404, 'code=' + book404.body.code);
    const bookRandom = await call('GET', '/books/random');
    assert('随机翻一本可用', bookRandom.body.code === 0 && !!bookRandom.body.data.name);

    // 书目增强层：没有直接引用的书也不能是空页
    const zy = await call('GET', '/books/' + encodeURIComponent('周易'));
    const zyD = zy.body.data || {};
    assert('《周易》详情有要旨与名句', zy.body.code === 0
        && !!zyD.note && zyD.quoteCount === 3
        && zyD.quotes.every(q => q.text && q.from) && !!zyD.buIntro,
        'quotes=' + zyD.quoteCount);
    assert('无直接引用的书给出同部类参考', zy.body.code === 0
        && zyD.relatedPairCount === 0
        && Array.isArray(zyD.buPairs) && zyD.buPairs.length >= 1
        && zyD.sameBu.length >= 1,
        'buPairs=' + (zyD.buPairs && zyD.buPairs.length));
    const sj = await call('GET', '/books/' + encodeURIComponent('史记'));
    assert('有引用的书同时给出名句与直接引用', sj.body.code === 0
        && sj.body.data.relatedPairCount >= 3 && sj.body.data.quoteCount >= 2);
    const ddl = await call('GET', '/books/' + encodeURIComponent('道德经'));
    assert('别名参与出处匹配（道德经←《老子》）', ddl.body.code === 0
        && ddl.body.data.alias.includes('老子'),
        'alias=' + (ddl.body.data && ddl.body.data.alias.join('/')));
    const aliasSearch = await call('GET', '/books?kw=' + encodeURIComponent('老子'));
    assert('书目检索支持别名（搜「老子」命中《道德经》）', aliasSearch.body.code === 0
        && aliasSearch.body.data.list.some(x => x.name === '道德经'),
        'total=' + (aliasSearch.body.data && aliasSearch.body.data.total));

    // 14. 古风科普日历
    const cal = await call('GET', '/calendar');
    assert('日历返回全部 16 条词条', cal.body.code === 0 && cal.body.data.poolSize === 16
        && cal.body.data.list.length === 16, 'pool=' + (cal.body.data && cal.body.data.poolSize));
    assert('日历今日标记唯一', cal.body.code === 0
        && cal.body.data.list.filter(x => x.today).length === 1);
    assert('日历每条含五段要素', cal.body.code === 0 && cal.body.data.list.every(x =>
        x.word && x.source && x.grammar && x.usage && x.misuse && x.examples.length >= 1));
    assert('日历今日词条与 /daily 一致', cal.body.code === 0 && daily.body.code === 0
        && cal.body.data.today.word === daily.body.data.word,
        cal.body.data.today && cal.body.data.today.word);

    // 15. 溯源核验（报告「反伪古风」命题的在线实现）
    const vMeta = await call('GET', '/verify/meta');
    assert('核验索引规模正确（43 误传 / 47 真典）', vMeta.body.code === 0
        && vMeta.body.data.casesTotal === 43
        && vMeta.body.data.verifiedTotal === 47
        && vMeta.body.data.indexSize >= 500,
        'cases=' + (vMeta.body.data && vMeta.body.data.casesTotal)
        + ' verified=' + (vMeta.body.data && vMeta.body.data.verifiedTotal)
        + ' index=' + (vMeta.body.data && vMeta.body.data.indexSize));

    const FAKE = '无人与我立黄昏，无人问我粥可温';
    const vFake = await call('POST', '/verify', { body: { text: FAKE } });
    const vFakeD = vFake.body.data || {};
    assert('伪古风文案判为「伪古风」', vFake.body.code === 0
        && vFakeD.overall && vFakeD.overall.name === '伪古风' && vFakeD.overall.order === 3,
        vFakeD.overall && vFakeD.overall.name);
    assert('伪古风给出实际情况／建议／核验方式', vFake.body.code === 0
        && vFakeD.segments[0].hits[0].level === '伪古风'
        && !!vFakeD.segments[0].hits[0].note
        && !!vFakeD.segments[0].hits[0].advice
        && !!vFakeD.segments[0].hits[0].check);
    assert('核验结论附「未收录≠伪古风」免责说明', vFake.body.code === 0
        && /未收录/.test(vFakeD.disclaimer || '') && /不等于/.test(vFakeD.disclaimer || ''));

    const vFake2 = await call('POST', '/verify', { body: { text: FAKE } });
    assert('重复核验命中 Redis 缓存', vFake2.body.code === 0 && vFake2.body.data.cacheHit === true);

    const vMix = await call('POST', '/verify', {
        body: { text: '人生若只如初见，何事秋风悲画扇\n' + FAKE }
    });
    const vMixD = vMix.body.data || {};
    assert('真句与伪古风混排判为「真伪混杂」', vMix.body.code === 0
        && vMixD.mode === 'batch'
        && vMixD.overall && vMixD.overall.name === '真伪混杂'
        && vMixD.segments.length === 2
        && vMixD.segments[0].verdict.name === '有据可考'
        && vMixD.segments[1].verdict.name === '伪古风',
        vMixD.overall && vMixD.overall.name);

    const vReal = await call('POST', '/verify', { body: { text: '长风破浪会有时，直挂云帆济沧海' } });
    const vRealD = vReal.body.data || {};
    assert('真句判为「有据可考」并给出出处', vReal.body.code === 0
        && vRealD.overall && vRealD.overall.name === '有据可考'
        && /李白/.test(vRealD.segments[0].hits[0].source || ''),
        vRealD.segments && vRealD.segments[0].hits[0].source);

    const vNone = await call('POST', '/verify', { body: { text: '今天食堂的面煮得有点软' } });
    const vNoneD = vNone.body.data || {};
    assert('未收录不判成伪古风且不出可信度分', vNone.body.code === 0
        && vNoneD.overall && vNoneD.overall.name === '未收录'
        && vNoneD.overall.order === 0
        && /不等于/.test(vNoneD.overall.summary || '')
        && vNoneD.overall.credibility === undefined);

    const vCases = await call('GET', '/verify/cases?level=' + encodeURIComponent('伪古风') + '&size=5');
    assert('误传案例库支持等级筛选与分页', vCases.body.code === 0
        && vCases.body.data.total === 24
        && vCases.body.data.list.length === 5
        && vCases.body.data.list.every(c => c.level === '伪古风'),
        'total=' + (vCases.body.data && vCases.body.data.total));

    const vCross = await call('GET', '/verify/cases?kw=' + encodeURIComponent('纳兰'));
    assert('案例库为空时给出真典库交叉提示', vCross.body.code === 0
        && vCross.body.data.total === 0
        && vCross.body.data.relatedVerifiedTotal >= 1,
        'related=' + (vCross.body.data && vCross.body.data.relatedVerifiedTotal));

    const vVerified = await call('GET', '/verify/verified?kw=' + encodeURIComponent('李白'));
    assert('真典库可按作者检索', vVerified.body.code === 0
        && Array.isArray(vVerified.body.data) && vVerified.body.data.length >= 3,
        'n=' + (vVerified.body.data && vVerified.body.data.length));

    const vHist401 = await call('GET', '/verify/history');
    assert('核验流水需登录（401）', vHist401.body.code === 401, 'code=' + vHist401.body.code);

    await call('POST', '/verify', { token, body: { text: '辞暮尔尔，烟火年年' } });
    const vHist = await call('GET', '/verify/history', { token });
    assert('登录用户核验流水落库', vHist.body.code === 0
        && Array.isArray(vHist.body.data) && vHist.body.data.length >= 1
        && vHist.body.data[0].verdict === '伪古风',
        'n=' + (vHist.body.data && vHist.body.data.length));

    // 16. 改写的依据链
    const adaptTrace = await call('POST', '/adapt', {
        token,
        body: { text: '今天上班好困啊，只想摸鱼', mode: 'm2c', context: '职场', tone: '俏皮', form: '文言句式' }
    });
    const tr = adaptTrace.body.data || {};
    assert('改编结果返回改写依据链', adaptTrace.body.code === 0
        && Array.isArray(tr.traces) && tr.traces.length >= 2
        && tr.traces.every(t => t.step >= 1 && t.title && t.type)
        && tr.traces.some(t => t.type === 'corpus' && t.source),
        'steps=' + (tr.traces && tr.traces.length));

    // 17. 前端模块可达
    for (const f of ['/js/views/archive.js', '/js/views/books.js', '/js/views/calendar.js', '/js/views/verify.js']) {
        const r = await fetch(BASE + f);
        assert('前端模块可加载 ' + f, r.status === 200, 'status=' + r.status);
    }

    // 18. 限流（写接口 30 次/分钟，计数在鉴权之前完成，避免 401 短路）
    let limited = false;
    for (let i = 0; i < 40; i++) {
        const r = await call('POST', '/adapt', { token, body: { text: '限流探测' + i, mode: 'm2c' } });
        if (r.body.code === 429) {
            limited = true;
            break;
        }
    }
    assert('写接口触发限流（429）', limited, limited ? 'Redis Lua 计数器生效' : '未触发，检查限流配置');

    finish();

    function finish() {
        const fail = results.filter(r => !r.ok);
        const skipped = results.filter(r => r.skipped);
        console.log('\n———————— 汇总 ————————');
        console.log(`通过 ${results.length - fail.length} / ${results.length}`
            + (skipped.length ? `（其中跳过 ${skipped.length} 项）` : ''));
        if (fail.length) {
            console.log('失败项：' + fail.map(f => f.name).join('、'));
            process.exitCode = 1;
        } else {
            console.log('全部通过。');
        }
    }
})().catch(e => {
    console.error('自检异常：', e);
    process.exitCode = 1;
});
