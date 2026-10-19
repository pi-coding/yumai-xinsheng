/** 通用 UI 工具：转义、提示、模态、格式化 */
export function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function toast(msg, type = '') {
    const box = document.getElementById('toast');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .25s';
        setTimeout(() => el.remove(), 260);
    }, 2600);
}

export function openModal(html) {
    const mask = document.getElementById('modalMask');
    const body = document.getElementById('modalBody');
    body.innerHTML = html;
    mask.classList.add('on');
    mask.onclick = e => {
        if (e.target === mask) closeModal();
    };
    return body;
}

export function closeModal() {
    document.getElementById('modalMask').classList.remove('on');
}

export function chips(list, current, name) {
    return `<div class="chips" data-chips="${name}">` + list.map(x => {
        const value = typeof x === 'string' ? x : x.value;
        const label = typeof x === 'string' ? x : x.label;
        const on = current === value ? ' on' : '';
        return `<button type="button" class="chip${on}" data-value="${esc(value)}">${esc(label)}</button>`;
    }).join('') + '</div>';
}

export function bindChips(root, name, onChange) {
    const box = root.querySelector(`[data-chips="${name}"]`);
    if (!box) return;
    box.addEventListener('click', e => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        [...box.children].forEach(c => c.classList.remove('on'));
        btn.classList.add('on');
        onChange(btn.dataset.value);
    });
}

export function tag(text, cls = '') {
    return `<span class="tag ${cls}">${esc(text)}</span>`;
}

export function fmtDate(v) {
    if (!v) return '';
    const s = String(v).replace('T', ' ');
    return s.length >= 16 ? s.slice(0, 16) : s;
}

export function empty(text = '暂无数据') {
    return `<div class="empty">${esc(text)}</div>`;
}

export function loading(text = '加载中…') {
    return `<div class="loading">${esc(text)}</div>`;
}

export function bars(list, { valueKey = 'value', nameKey = 'name', unit = '' } = {}) {
    const max = Math.max(1, ...list.map(x => Number(x[valueKey]) || 0));
    return list.map(x => {
        const v = Number(x[valueKey]) || 0;
        const w = Math.round(v * 100 / max);
        return `<div class="bar-row">
            <div class="n">${esc(x[nameKey])}</div>
            <div class="track"><div class="fill" style="width:${w}%"></div></div>
            <div class="v">${v}${esc(unit)}</div>
        </div>`;
    }).join('');
}

/** 折线图（手绘 SVG，无外部图表库依赖） */
export function lineChart(points, { height = 170, labelKey = 'day', valueKey = 'count' } = {}) {
    if (!points.length) return empty('暂无趋势数据');
    const w = 620, h = height, padL = 34, padR = 12, padT = 14, padB = 26;
    const values = points.map(p => Number(p[valueKey]) || 0);
    const max = Math.max(1, ...values);
    const stepX = points.length > 1 ? (w - padL - padR) / (points.length - 1) : 0;
    const scaleY = v => padT + (h - padT - padB) * (1 - v / max);
    const coords = points.map((p, i) => [padL + i * stepX, scaleY(Number(p[valueKey]) || 0)]);
    const line = coords.map(c => c.join(',')).join(' ');
    const area = `M${coords[0][0]},${h - padB} ` + coords.map(c => `L${c[0]},${c[1]}`).join(' ')
        + ` L${coords[coords.length - 1][0]},${h - padB} Z`;
    const grid = [0, .25, .5, .75, 1].map(r => {
        const y = padT + (h - padT - padB) * r;
        const v = Math.round(max * (1 - r));
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e3dbc9" stroke-dasharray="3 4"/>
                <text x="4" y="${y + 4}" font-size="10" fill="#7d7466">${v}</text>`;
    }).join('');
    const dots = coords.map((c, i) =>
        `<circle cx="${c[0]}" cy="${c[1]}" r="3.2" fill="#fdf8f2" stroke="#3c6e64" stroke-width="2"/>`).join('');
    const labels = points.map((p, i) =>
        `<text x="${padL + i * stepX}" y="${h - 8}" font-size="10" fill="#7d7466" text-anchor="middle">${esc(p[labelKey] || '')}</text>`
    ).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="趋势折线图">
        ${grid}
        <path d="${area}" fill="rgba(60,110,100,.10)"/>
        <polyline points="${line}" fill="none" stroke="#3c6e64" stroke-width="2.2" stroke-linejoin="round"/>
        ${dots}${labels}
    </svg>`;
}
