const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const view = $('#view');
const vc = view.getContext('2d');
const cw = $('#cw');

const mk0 = () => document.createElement('canvas');

let W = 1024;
let H = 768;
let pixel = false;
let L = [];
let A = 0;
let nid = 1;

let tool = 'brush';
let color = '#111111';
let size = 6;
let op = 1;
let fillS = false;
let sym = false;
let grid = true;
let tol = 32;
let recent = [];

let V = { s: 1, x: 0, y: 0 };
let dpr = 1;
let cur = null;
let hs = [];
let rs = [];
let pat = null;
let chk = null;
let CV = '#e4e4e0';
let dirty = 0;
let hov = null;

const sk = mk0();
const kc = sk.getContext('2d');
const P = new Map();

let penSeen = false;
let space = false;
let G = null;

const clamp = s => Math.min(64, Math.max(0.05, s));
const wait = ms => new Promise(r => setTimeout(r, ms));


function toast(t) {
    const e = $('#toast');

    e.textContent = t;
    e.style.opacity = 1;

    clearTimeout(toast.t);

    toast.t = setTimeout(() => {
        e.style.opacity = 0;
    }, 1800);
}


function mk(nm) {
    const c = mk0();

    c.width = W;
    c.height = H;

    return {
        id: nid++,
        name: nm,
        vis: true,
        op: 1,
        c,
        x: c.getContext('2d')
    };
}


function draw() {
    if (dirty) return;

    dirty = 1;

    requestAnimationFrame(() => {
        dirty = 0;
        paint();
    });
}


function newDoc(w, h, px) {
    W = w;
    H = h;
    pixel = px;

    L = [];
    A = 0;
    hs = [];
    rs = [];

    sk.width = W;
    sk.height = H;

    pat = null;

    const l = mk('Fondo');

    if (!px) {
        l.x.fillStyle = '#fff';
        l.x.fillRect(0, 0, W, H);
    }

    L.push(l);

    const k = px ? 1 : 8;
    const c = mk0();

    c.width = c.height = k * 2;

    const q = c.getContext('2d');

    q.fillStyle = '#c9c9c9';
    q.fillRect(0, 0, k * 2, k * 2);

    q.fillStyle = '#fff';
    q.fillRect(0, 0, k, k);
    q.fillRect(k, k, k, k);

    chk = c;

    $('#sz').max = px ? 16 : 120;

    size = px ? 1 : Math.max(size, 4);

    $('#sz').value = size;

    fit();
    ui();
}


function fit() {
    const w = cw.clientWidth;
    const h = cw.clientHeight;

    let s = Math.min((w - 24) / W, (h - 24) / H);

    if (pixel && s > 1) {
        s = Math.floor(s);
    }

    if (!(s > 0)) s = 1;

    V = {
        s,
        x: (w - W * s) / 2,
        y: (h - H * s) / 2
    };

    draw();
}


function zoomAt(cx, cy, ns) {
    ns = clamp(ns);

    V.x = cx - (cx - V.x) * ns / V.s;
    V.y = cy - (cy - V.y) * ns / V.s;
    V.s = ns;

    draw();
}


function paint() {
    const w = view.width;
    const h = view.height;

    vc.setTransform(1, 0, 0, 1, 0, 0);

    vc.fillStyle = CV;
    vc.fillRect(0, 0, w, h);

    vc.setTransform(
        V.s * dpr,
        0,
        0,
        V.s * dpr,
        V.x * dpr,
        V.y * dpr
    );

    vc.imageSmoothingEnabled = !pixel && V.s < 2;

    pat = pat || vc.createPattern(chk, 'repeat');

    vc.fillStyle = pat;
    vc.fillRect(0, 0, W, H);

    L.forEach((l, i) => {
        if (!l.vis) return;

        vc.globalAlpha = l.op;
        vc.drawImage(l.c, 0, 0);

        if (i === A && cur && cur.buf) {
            vc.globalAlpha = l.op * op;
            vc.drawImage(sk, 0, 0);
        }
    });

    vc.globalAlpha = 1;

    const u = 1 / V.s;

    vc.lineWidth = u;

    if (pixel && grid && V.s >= 6) {
        vc.strokeStyle = 'rgba(128,128,128,.35)';
        vc.beginPath();

        for (let i = 0; i <= W; i++) {
            vc.moveTo(i, 0);
            vc.lineTo(i, H);
        }

        for (let j = 0; j <= H; j++) {
            vc.moveTo(0, j);
            vc.lineTo(W, j);
        }

        vc.stroke();
    }

    vc.strokeStyle = 'rgba(128,128,128,.7)';
    vc.strokeRect(0, 0, W, H);

    if (sym) {
        vc.strokeStyle = 'rgba(37,99,235,.7)';
        vc.setLineDash([6 * u, 6 * u]);

        vc.beginPath();
        vc.moveTo(W / 2, 0);
        vc.lineTo(W / 2, H);
        vc.stroke();

        vc.setLineDash([]);
    }

    if (
        hov &&
        !G &&
        ['brush', 'eraser', 'line', 'rect', 'ellipse'].includes(tool) &&
        (!cur || cur.t !== 'pan')
    ) {
        vc.strokeStyle = '#888';
        vc.beginPath();

        if (pixel) {
            const o = Math.floor(size / 2);

            vc.rect(
                Math.floor(hov.x) - o,
                Math.floor(hov.y) - o,
                size,
                size
            );
        } else {
            vc.arc(hov.x, hov.y, size / 2, 0, 7);
        }

        vc.stroke();
    }

    $('#zl').textContent = Math.round(V.s * 100) + '%';
}


const snap = () => ({
    a: A,
    l: L.map(l => ({ ...l }))
});


function trim() {
    if (hs.length > 40) hs.shift();
}


function pushSt() {
    hs.push({
        k: 'st',
        s: snap()
    });

    trim();

    rs = [];

    ui();
}


function push(l, img) {
    hs.push({
        k: 'px',
        id: l.id,
        img
    });

    trim();

    rs = [];

    ui();
    autosave();
}


function swap(e) {
    if (e.k === 'px') {
        const l = L.find(x => x.id === e.id);

        if (!l) return null;

        const c = l.x.getImageData(0, 0, W, H);

        l.x.putImageData(e.img, 0, 0);

        return {
            k: 'px',
            id: e.id,
            img: c
        };
    }

    const c = snap();

    L = e.s.l.map(l => ({ ...l }));
    A = Math.min(e.s.a, L.length - 1);

    return {
        k: 'st',
        s: c
    };
}


function undo() {
    if (cur) return;

    const e = hs.pop();

    if (!e) return;

    const r = swap(e);

    if (r) rs.push(r);

    ui();
    draw();
    autosave();
}


function redo() {
    if (cur) return;

    const e = rs.pop();

    if (!e) return;

    const r = swap(e);

    if (r) hs.push(r);

    ui();
    draw();
    autosave();
}


function setColor(c) {
    color = c;
    $('#col').value = c;
}


function plot(c, x, y) {
    const o = Math.floor(size / 2);
    const m = sym && (cur.t === 'brush' || cur.t === 'eraser');

    for (const X of m ? [x, W - 1 - x] : [x]) {
        if (cur.t === 'eraser') {
            c.clearRect(X - o, y - o, size, size);
        } else {
            c.fillStyle = color;
            c.fillRect(X - o, y - o, size, size);
        }
    }
}


function bres(a, b, f) {
    let x0 = Math.floor(a.x);
    let y0 = Math.floor(a.y);

    const x1 = Math.floor(b.x);
    const y1 = Math.floor(b.y);

    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);

    const ix = x0 < x1 ? 1 : -1;
    const iy = y0 < y1 ? 1 : -1;

    let e = dx + dy;

    for (;;) {
        f(x0, y0);

        if (x0 === x1 && y0 === y1) break;

        const e2 = 2 * e;

        if (e2 >= dy) {
            e += dy;
            x0 += ix;
        }

        if (e2 <= dx) {
            e += dx;
            y0 += iy;
        }
    }
}


function sty(c, w) {
    c.globalAlpha = 1;
    c.lineWidth = w;
    c.lineCap = c.lineJoin = 'round';

    c.strokeStyle = c.fillStyle = color;

    c.globalCompositeOperation =
        cur.t === 'eraser' ? 'destination-out' : 'source-over';
}


function qd(c, a, k, b, w) {
    sty(c, w);

    for (const M of sym ? [1, -1] : [1]) {
        const X = x => M > 0 ? x : W - x;

        c.beginPath();
        c.moveTo(X(a.x), a.y);

        c.quadraticCurveTo(
            X(k.x),
            k.y,
            X(b.x),
            b.y
        );

        c.stroke();
    }
}


const tgt = () => cur.t === 'eraser' ? L[A].x : kc;


function dot(p) {
    const c = tgt();

    if (pixel) {
        plot(c, Math.floor(p.x), Math.floor(p.y));
        return;
    }

    sty(c, 1);

    const w = size * (0.2 + 0.8 * p.p);

    for (const M of sym ? [1, -1] : [1]) {
        c.beginPath();

        c.arc(
            M > 0 ? p.x : W - p.x,
            p.y,
            w / 2,
            0,
            7
        );

        c.fill();
    }
}


function stroke(p) {
    const c = tgt();

    if (pixel) {
        bres(cur.last, p, (x, y) => plot(c, x, y));

        cur.last = p;

        return;
    }

    cur.pp = cur.pp * 0.6 + p.p * 0.4;

    const w = size * (0.2 + 0.8 * cur.pp);

    const m = {
        x: (cur.last.x + p.x) / 2,
        y: (cur.last.y + p.y) / 2
    };

    qd(c, cur.m, cur.last, m, w);

    cur.m = m;
    cur.last = p;
    cur.w = w;
}


function shape(p, sh) {
    const a = cur.p0;
    let b = p;

    if (sh) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        if (cur.t === 'line') {
            const g =
                Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) *
                Math.PI / 4;

            const r = Math.hypot(dx, dy);

            b = {
                x: a.x + r * Math.cos(g),
                y: a.y + r * Math.sin(g)
            };
        } else {
            const m = Math.max(Math.abs(dx), Math.abs(dy));

            b = {
                x: a.x + Math.sign(dx) * m,
                y: a.y + Math.sign(dy) * m
            };
        }
    }

    kc.clearRect(0, 0, W, H);

    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);

    const fl = Math.floor;

    if (pixel) {
        const pl = (x, y) => plot(kc, x, y);

        kc.fillStyle = color;

        if (cur.t === 'line') {
            bres(a, b, pl);
        } else if (cur.t === 'rect') {
            const X0 = fl(x0);
            const Y0 = fl(y0);
            const X1 = fl(x1);
            const Y1 = fl(y1);

            if (fillS) {
                kc.fillRect(
                    X0,
                    Y0,
                    X1 - X0 + 1,
                    Y1 - Y0 + 1
                );
            } else {
                bres({ x: X0, y: Y0 }, { x: X1, y: Y0 }, pl);
                bres({ x: X1, y: Y0 }, { x: X1, y: Y1 }, pl);
                bres({ x: X1, y: Y1 }, { x: X0, y: Y1 }, pl);
                bres({ x: X0, y: Y1 }, { x: X0, y: Y0 }, pl);
            }
        } else {
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            const rx = (x1 - x0) / 2;
            const ry = (y1 - y0) / 2;

            if (fillS) {
                for (let y = fl(y0); y <= fl(y1); y++) {
                    const t = ry ? (y + 0.5 - cy) / ry : 0;
                    const d = rx * Math.sqrt(Math.max(0, 1 - t * t));

                    kc.fillRect(
                        fl(cx - d),
                        y,
                        Math.max(1, Math.round(2 * d)),
                        1
                    );
                }
            } else {
                const n = Math.max(12, Math.ceil((rx + ry) * 6));

                for (let i = 0; i < n; i++) {
                    const t = i / n * 6.2832;

                    pl(
                        fl(cx + rx * Math.cos(t)),
                        fl(cy + ry * Math.sin(t))
                    );
                }
            }
        }
    } else {
        sty(kc, size);

        kc.beginPath();

        if (cur.t === 'line') {
            kc.moveTo(a.x, a.y);
            kc.lineTo(b.x, b.y);
        } else if (cur.t === 'rect') {
            kc.rect(x0, y0, x1 - x0, y1 - y0);
        } else {
            kc.ellipse(
                (x0 + x1) / 2,
                (y0 + y1) / 2,
                (x1 - x0) / 2,
                (y1 - y0) / 2,
                0,
                0,
                7
            );
        }

        if (fillS && cur.t !== 'line') {
            kc.fill();
        }

        kc.stroke();
    }

    cur.last = b;
}


function flood(l, p) {
    const sx = Math.floor(p.x);
    const sy = Math.floor(p.y);

    if (sx < 0 || sy < 0 || sx >= W || sy >= H) {
        return false;
    }

    const id = l.x.getImageData(0, 0, W, H);
    const d = id.data;
    const seen = new Uint8Array(W * H);

    const i0 = (sy * W + sx) * 4;

    const t = [
        d[i0],
        d[i0 + 1],
        d[i0 + 2],
        d[i0 + 3]
    ];

    const n = parseInt(color.slice(1), 16);
    const r = n >> 16;
    const g = n >> 8 & 255;
    const b = n & 255;

    if (
        t[0] === r &&
        t[1] === g &&
        t[2] === b &&
        t[3] === 255
    ) {
        return false;
    }

    const m = i => {
        const j = i * 4;

        return (
            Math.abs(d[j] - t[0]) <= tol &&
            Math.abs(d[j + 1] - t[1]) <= tol &&
            Math.abs(d[j + 2] - t[2]) <= tol &&
            Math.abs(d[j + 3] - t[3]) <= tol
        );
    };

    const st = [sx, sy];

    while (st.length) {
        const y = st.pop();
        const x = st.pop();

        if (seen[y * W + x] || !m(y * W + x)) {
            continue;
        }

        let a = x;
        let z = x;

        while (
            a > 0 &&
            !seen[y * W + a - 1] &&
            m(y * W + a - 1)
        ) {
            a--;
        }

        while (
            z < W - 1 &&
            !seen[y * W + z + 1] &&
            m(y * W + z + 1)
        ) {
            z++;
        }

        for (let k = a; k <= z; k++) {
            const q = y * W + k;
            const j = q * 4;

            seen[q] = 1;

            d[j] = r;
            d[j + 1] = g;
            d[j + 2] = b;
            d[j + 3] = 255;

            if (y > 0 && !seen[q - W] && m(q - W)) {
                st.push(k, y - 1);
            }

            if (y < H - 1 && !seen[q + W] && m(q + W)) {
                st.push(k, y + 1);
            }
        }
    }

    l.x.putImageData(id, 0, 0);

    return true;
}


function flat() {
    const c = mk0();

    c.width = W;
    c.height = H;

    const x = c.getContext('2d');

    L.forEach(l => {
        if (l.vis) {
            x.globalAlpha = l.op;
            x.drawImage(l.c, 0, 0);
        }
    });

    return c;
}


function pickAt(p) {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);

    if (x < 0 || y < 0 || x >= W || y >= H) {
        return;
    }

    const d = flat()
        .getContext('2d')
        .getImageData(x, y, 1, 1).data;

    if (d[3] === 0) {
        toast('Píxel transparente');
        return;
    }

    setColor(
        '#' +
        [d[0], d[1], d[2]]
            .map(v => v.toString(16).padStart(2, '0'))
            .join('')
    );
}


function addRecent() {
    const i = recent.indexOf(color);

    if (i >= 0) {
        recent.splice(i, 1);
    }

    recent.unshift(color);
    recent = recent.slice(0, 12);

    ui();
}


const rel = e => {
    const r = view.getBoundingClientRect();

    return {
        x: e.clientX - r.left,
        y: e.clientY - r.top
    };
};


const toDoc = e => {
    const r = rel(e);

    return {
        x: (r.x - V.x) / V.s,
        y: (r.y - V.y) / V.s,
        p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 1
    };
};


const touches = () => [...P.values()].filter(q => q.t === 'touch');


function gStart(T) {
    const [a, b] = T;

    G = {
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        c0: {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        },
        V0: { ...V },
        t0: performance.now(),
        mv: 0
    };
}


function gMove(T) {
    const [a, b] = T;

    const c = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
    };

    const d = Math.hypot(a.x - b.x, a.y - b.y);

    G.mv = Math.max(
        G.mv,
        Math.hypot(c.x - G.c0.x, c.y - G.c0.y),
        Math.abs(d - G.d0)
    );

    const s = clamp(G.V0.s * d / G.d0);

    const px = (G.c0.x - G.V0.x) / G.V0.s;
    const py = (G.c0.y - G.V0.y) / G.V0.s;

    V.s = s;
    V.x = c.x - px * s;
    V.y = c.y - py * s;

    draw();
}


function cancel() {
    if (!cur) return;

    if (cur.snap && cur.t === 'eraser') {
        L[A].x.putImageData(cur.snap, 0, 0);
    }

    kc.clearRect(0, 0, W, H);

    L[A].x.globalCompositeOperation = 'source-over';

    cur = null;

    draw();
}


function begin(e) {
    const l = L[A];

    if (!l.vis) {
        toast('La capa está oculta');
        return;
    }

    const p = toDoc(e);

    cur = {
        t: tool,
        id: e.pointerId,
        p0: p,
        last: p
    };

    if (tool === 'fill' || tool === 'pick') {
        return;
    }

    cur.snap = l.x.getImageData(0, 0, W, H);

    if (tool === 'brush' || tool === 'eraser') {
        cur.buf = tool === 'brush';
        cur.m = p;
        cur.pp = p.p;

        dot(p);
    } else {
        cur.buf = true;
    }

    draw();
}


function end(e) {
    const c = cur;
    const l = L[A];

    if (c.t === 'pick') {
        cur = null;

        pickAt(toDoc(e));
        draw();

        return;
    }

    if (c.t === 'fill') {
        const s = l.x.getImageData(0, 0, W, H);

        cur = null;

        if (flood(l, toDoc(e))) {
            push(l, s);
            addRecent();
        }

        draw();

        return;
    }

    if ((c.t === 'brush' || c.t === 'eraser') && !pixel) {
        qd(tgt(), c.m, c.last, c.last, c.w || size);
    }

    if (c.buf) {
        l.x.globalAlpha = op;
        l.x.drawImage(sk, 0, 0);
        l.x.globalAlpha = 1;

        kc.clearRect(0, 0, W, H);
    }

    l.x.globalCompositeOperation = 'source-over';

    cur = null;

    push(l, c.snap);

    if (c.t !== 'eraser') {
        addRecent();
    }

    draw();
}


view.onpointerdown = e => {
    e.preventDefault();

    view.setPointerCapture(e.pointerId);

    if (e.pointerType === 'pen') {
        penSeen = true;
    }

    P.set(e.pointerId, {
        ...rel(e),
        t: e.pointerType
    });

    const T = touches();

    if (T.length >= 2) {
        cancel();
        gStart(T);

        return;
    }

    if (
        (e.pointerType === 'touch' && penSeen) ||
        e.button === 1 ||
        space ||
        tool === 'hand'
    ) {
        cur = {
            t: 'pan',
            ...rel(e),
            vx: V.x,
            vy: V.y
        };

        return;
    }

    if (e.button === 2) return;

    begin(e);
};


view.onpointermove = e => {
    const q = P.get(e.pointerId);

    if (e.pointerType !== 'touch') {
        hov = toDoc(e);
    }

    if (q) {
        Object.assign(q, rel(e));
    }

    const T = touches();

    if (G && T.length >= 2) {
        gMove(T);
        return;
    }

    if (cur) {
        if (cur.t === 'pan') {
            const r = rel(e);

            V.x = cur.vx + r.x - cur.x;
            V.y = cur.vy + r.y - cur.y;

            draw();
        } else if (e.pointerId === cur.id) {
            if (cur.t === 'fill' || cur.t === 'pick') {
                return;
            }

            for (const ev of (
                e.getCoalescedEvents
                    ? e.getCoalescedEvents()
                    : [e]
            )) {
                const p = toDoc(ev);

                if (cur.t === 'brush' || cur.t === 'eraser') {
                    stroke(p);
                } else {
                    shape(p, e.shiftKey);
                }
            }

            draw();
        }
    } else if (hov) {
        draw();
    }
};


view.onpointerup = view.onpointercancel = e => {
    P.delete(e.pointerId);

    if (G && touches().length < 2) {
        if (performance.now() - G.t0 < 300 && G.mv < 12) {
            undo();
        }

        G = null;
    }

    if (!cur) return;

    if (cur.t === 'pan') {
        cur = null;
        return;
    }

    if (cur.id === e.pointerId) {
        e.type === 'pointercancel' ? cancel() : end(e);
    }
};


view.onpointerleave = e => {
    if (e.pointerType !== 'touch') {
        hov = null;
        draw();
    }
};


view.oncontextmenu = e => e.preventDefault();


view.onwheel = e => {
    e.preventDefault();

    const r = rel(e);

    if (
        e.ctrlKey ||
        e.deltaMode === 1 ||
        (Math.abs(e.deltaY) >= 50 && e.deltaX === 0)
    ) {
        zoomAt(
            r.x,
            r.y,
            V.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
        );
    } else {
        V.x -= e.deltaX;
        V.y -= e.deltaY;

        draw();
    }
};


document.addEventListener('gesturestart', e => e.preventDefault());


addEventListener('keydown', e => {
    const t = e.target;

    if (
        t.tagName === 'INPUT' &&
        !['range', 'color', 'checkbox'].includes(t.type)
    ) {
        return;
    }

    const k = e.key.toLowerCase();
    const m = e.ctrlKey || e.metaKey;

    if (m && k === 'z') {
        e.preventDefault();

        e.shiftKey ? redo() : undo();

        return;
    }

    if (m && k === 'y') {
        e.preventDefault();
        redo();

        return;
    }

    if (m && k === 's') {
        e.preventDefault();
        $('#dF').showModal();

        return;
    }

    if (m && k === '0') {
        e.preventDefault();
        fit();

        return;
    }

    if (k === ' ') {
        space = true;
        e.preventDefault();

        return;
    }

    const T = {
        b: 'brush',
        e: 'eraser',
        g: 'fill',
        i: 'pick',
        l: 'line',
        r: 'rect',
        o: 'ellipse',
        h: 'hand'
    };

    if (!m && T[k]) {
        setTool(T[k]);
        return;
    }

    if (k === '[' || k === ']') {
        setSize(
            size + (k === ']' ? 1 : -1) * (size >= 10 && !pixel ? 2 : 1)
        );
    } else if (k === 'm') {
        sym = !sym;
        ui();
        draw();
    } else if (k === 'tab') {
        e.preventDefault();
        $('#panel').classList.toggle('off');
    } else if (k === 'delete' || k === 'backspace') {
        clearL();
    } else if (k === '+' || k === '=') {
        zoomAt(
            cw.clientWidth / 2,
            cw.clientHeight / 2,
            V.s * 1.25
        );
    } else if (k === '-') {
        zoomAt(
            cw.clientWidth / 2,
            cw.clientHeight / 2,
            V.s / 1.25
        );
    }
});


addEventListener('keyup', e => {
    if (e.key === ' ') {
        space = false;
    }
});


function setTool(t) {
    tool = t;

    ui();
    draw();
}


function setSize(v) {
    size = Math.max(1, Math.min(+$('#sz').max, v));

    $('#sz').value = size;
    $('#szv').textContent = size;

    draw();
}


$$('[data-t]').forEach(b => {
    b.onclick = () => setTool(b.dataset.t);
});


$('#col').oninput = e => {
    color = e.target.value;
};


$('#sz').oninput = e => {
    setSize(+e.target.value);
};


$('#op').oninput = e => {
    op = e.target.value / 100;
    $('#opv').textContent = e.target.value;
};


$('#tol').oninput = e => {
    tol = +e.target.value;
};


$('#tFill').onclick = () => {
    fillS = !fillS;
    ui();
};


$('#tSym').onclick = () => {
    sym = !sym;

    ui();
    draw();
};


$('#tGrid').onclick = () => {
    grid = !grid;

    ui();
    draw();
};


$('#bUn').onclick = undo;
$('#bRe').onclick = redo;
$('#zf').onclick = fit;


$('#zi').onclick = () => {
    zoomAt(
        cw.clientWidth / 2,
        cw.clientHeight / 2,
        V.s * 1.25
    );
};


$('#zo').onclick = () => {
    zoomAt(
        cw.clientWidth / 2,
        cw.clientHeight / 2,
        V.s / 1.25
    );
};


$('#bP').onclick = () => {
    $('#panel').classList.toggle('off');
};


const PAL = (
    '#000000 #ffffff #7f7f7f #c3c3c3 #880015 #ed1c24 ' +
    '#ff7f27 #ffc90e #fff200 #b5e61d #22b14c #00a2e8 ' +
    '#3f48cc #a349a4 #b97a57 #ffaec9 #1d2b53 #7e2553 ' +
    '#008751 #ab5236 #5f574f #fff1e8 #29adff #ffec27'
).split(' ');


function swatches(el, arr) {
    el.innerHTML = '';

    arr.forEach(c => {
        const s = document.createElement('div');

        s.className = 'sw';
        s.style.background = c;

        s.onclick = () => setColor(c);

        el.append(s);
    });
}


function ui() {
    $$('[data-t]').forEach(b => {
        b.classList.toggle('on', b.dataset.t === tool);
    });

    $('#tFill').classList.toggle('on', fillS);
    $('#tSym').classList.toggle('on', sym);
    $('#tGrid').classList.toggle('on', grid);

    $('#bUn').disabled = !hs.length;
    $('#bRe').disabled = !rs.length;

    $('#szv').textContent = size;

    swatches($('#rec'), recent);

    $('#lo').value = Math.round(L[A].op * 100);

    const el = $('#ll');

    el.innerHTML = '';

    [...L].reverse().forEach(l => {
        const i = L.indexOf(l);

        const r = document.createElement('div');

        r.className = 'ly' + (i === A ? ' on' : '');

        const eye = document.createElement('button');

        eye.className = 'b sm';
        eye.textContent = l.vis ? '👁' : '🚫';

        const th = mk0();

        th.width = 40;
        th.height = 30;

        th.getContext('2d').drawImage(l.c, 0, 0, 40, 30);

        const n = document.createElement('span');

        n.textContent = l.name;

        r.append(eye, th, n);

        r.onclick = () => {
            A = i;
            ui();
        };

        eye.onclick = ev => {
            ev.stopPropagation();

            pushSt();

            l.vis = !l.vis;

            ui();
            draw();
            autosave();
        };

        r.ondblclick = () => {
            const t = prompt('Nombre de la capa', l.name);

            if (t) {
                pushSt();

                l.name = t;

                ui();
            }
        };

        el.append(r);
    });
}


function chL(f) {
    pushSt();

    f();

    ui();
    draw();
    autosave();
}


$('#lA').onclick = () => {
    chL(() => {
        L.splice(A + 1, 0, mk('Capa ' + nid));
        A++;
    });
};


$('#lD').onclick = () => {
    chL(() => {
        const s = L[A];
        const l = mk(s.name + ' copia');

        l.x.drawImage(s.c, 0, 0);
        l.op = s.op;

        L.splice(A + 1, 0, l);

        A++;
    });
};


$('#lX').onclick = () => {
    if (L.length < 2) {
        return toast('Debe quedar al menos una capa');
    }

    chL(() => {
        L.splice(A, 1);
        A = Math.max(0, A - 1);
    });
};


$('#lU').onclick = () => {
    if (A < L.length - 1) {
        chL(() => {
            [L[A], L[A + 1]] = [L[A + 1], L[A]];
            A++;
        });
    }
};


$('#lW').onclick = () => {
    if (A > 0) {
        chL(() => {
            [L[A], L[A - 1]] = [L[A - 1], L[A]];
            A--;
        });
    }
};


function clearL() {
    const l = L[A];
    const s = l.x.getImageData(0, 0, W, H);

    l.x.clearRect(0, 0, W, H);

    push(l, s);

    draw();
    ui();
}


$('#lC').onclick = clearL;


let pre = null;

$('#lo').onpointerdown = () => {
    pre = snap();
};


$('#lo').oninput = e => {
    L[A].op = e.target.value / 100;
    draw();
};


$('#lo').onchange = () => {
    if (pre) {
        hs.push({
            k: 'st',
            s: pre
        });

        rs = [];
        pre = null;

        ui();
        autosave();
    }
};


const nm = () => (
    $('#nm').value.trim() || 'dibujo'
).replace(/[\\/:*?"<>|]/g, '_');


const blobP = c => new Promise(r => c.toBlob(r));


function dl(b, fn) {
    const a = document.createElement('a');

    a.href = URL.createObjectURL(b);
    a.download = fn;

    a.click();

    setTimeout(() => {
        URL.revokeObjectURL(a.href);
    }, 5000);
}


const ser = () => ({
    v: 1,
    w: W,
    h: H,
    pixel,
    a: A,
    layers: L.map(l => ({
        name: l.name,
        vis: l.vis,
        op: l.op,
        png: l.c.toDataURL()
    }))
});


const img = u => new Promise((ok, no) => {
    const i = new Image();

    i.onload = () => ok(i);
    i.onerror = no;
    i.src = u;
});


async function loadProj(o) {
    newDoc(o.w, o.h, o.pixel);

    L = [];

    for (const q of o.layers) {
        const l = mk(q.name);

        l.vis = q.vis;
        l.op = q.op;

        l.x.drawImage(await img(q.png), 0, 0);

        L.push(l);
    }

    A = Math.min(o.a || 0, L.length - 1);

    ui();
    draw();
}


let at;


function autosave() {
    clearTimeout(at);

    at = setTimeout(() => {
        try {
            localStorage.setItem('draw.auto', JSON.stringify(ser()));
        } catch (e) {}
    }, 1500);
}


$('#bFile').onclick = () => {
    $('#cid').value = localStorage.getItem('draw.cid') || '';

    $('#dmsg').textContent = '';
    $('#dl').innerHTML = '';

    $('#dF').showModal();
};


$('#bNew').onclick = () => {
    $('#dF').close();
    $('#dN').showModal();
};


$('#pre').onchange = e => {
    const [w, h, p] = e.target.value.split(',');

    $('#nw').value = w;
    $('#nh').value = h;
    $('#npx').checked = p === '1';
};


$('#nOk').onclick = () => {
    const w = Math.min(4096, Math.max(1, +$('#nw').value || 1));
    const h = Math.min(4096, Math.max(1, +$('#nh').value || 1));

    $('#dN').close();

    newDoc(w, h, $('#npx').checked);

    autosave();
};


$('#bOpen').onclick = () => {
    $('#fi').click();
};


$('#fi').onchange = async e => {
    const f = e.target.files[0];

    e.target.value = '';

    if (!f) return;

    $('#dF').close();

    try {
        if (/\.json$/i.test(f.name)) {
            await loadProj(JSON.parse(await f.text()));

            $('#nm').value = f.name.replace(
                /\.drawing\.json$|\.json$/i,
                ''
            );
        } else {
            const i = await img(URL.createObjectURL(f));

            newDoc(
                i.width,
                i.height,
                i.width <= 256 && i.height <= 256
            );

            L[0].x.imageSmoothingEnabled = !pixel;
            L[0].x.drawImage(i, 0, 0);

            ui();
            draw();

            $('#nm').value = f.name.replace(/\.\w+$/, '');
        }

        autosave();
    } catch (err) {
        toast('No se pudo abrir el archivo');
    }
};


$('#bPng').onclick = async () => {
    dl(await blobP(flat()), nm() + '.png');

    $('#dF').close();
};


$('#bJson').onclick = () => {
    dl(
        new Blob(
            [JSON.stringify(ser())],
            { type: 'application/json' }
        ),
        nm() + '.drawing.json'
    );

    $('#dF').close();
};


const D = {
    tok: null
};


const dmsg = t => {
    $('#dmsg').textContent = t;
};


async function gis() {
    if (
        window.google &&
        google.accounts &&
        google.accounts.oauth2
    ) {
        return;
    }

    await new Promise((ok, no) => {
        const s = document.createElement('script');

        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = ok;
        s.onerror = () => no(new Error('gis'));

        document.head.appendChild(s);
    });
}


async function auth() {
    const id = $('#cid').value.trim();

    if (!id) {
        throw new Error('cid');
    }

    localStorage.setItem('draw.cid', id);

    await gis();

    return new Promise((ok, no) => {
        google.accounts.oauth2.initTokenClient({
            client_id: id,
            scope: 'https://www.googleapis.com/auth/drive.file',

            callback: r => {
                if (r.access_token) {
                    D.tok = r.access_token;
                    ok();
                } else {
                    no(new Error(r.error || 'auth'));
                }
            }
        }).requestAccessToken({
            prompt: D.tok ? '' : 'consent'
        });
    });
}


async function dfetch(u, o = {}, retry = 1) {
    if (!D.tok) {
        await auth();
    }

    const r = await fetch(u, {
        ...o,
        headers: {
            ...o.headers,
            Authorization: 'Bearer ' + D.tok
        }
    });

    if (r.status === 401 && retry) {
        D.tok = null;

        return dfetch(u, o, 0);
    }

    if (!r.ok) {
        throw new Error('http' + r.status);
    }

    return r;
}


function dErr(e) {
    dmsg(
        e.message === 'cid'
            ? 'Pega primero tu Client ID de Google (ver instrucciones).'
            : e.message === 'gis' || e instanceof TypeError
                ? 'No se pudo conectar con Google. Esto solo funciona si abres el archivo desde tu propio sitio (https o localhost) autorizado en tu Client ID.'
                : 'Error de Drive: ' + e.message
    );
}


async function dUp(fn, mime, blob) {
    const key = 'dr.' + fn;
    const id = localStorage.getItem(key);
    const b = 'b' + Date.now();

    const body = new Blob([
        `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: fn })}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`,
        blob,
        `\r\n--${b}--`
    ]);

    try {
        const r = await dfetch(
            `https://www.googleapis.com/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=multipart&fields=id`,
            {
                method: id ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'multipart/related; boundary=' + b
                },
                body
            }
        );

        localStorage.setItem(key, (await r.json()).id);
    } catch (e) {
        if (id && e.message === 'http404') {
            localStorage.removeItem(key);

            return dUp(fn, mime, blob);
        }

        throw e;
    }
}


$('#bDs').onclick = async () => {
    try {
        dmsg('Guardando…');

        await dUp(
            nm() + '.drawing.json',
            'application/json',
            new Blob([JSON.stringify(ser())])
        );

        await dUp(
            nm() + '.png',
            'image/png',
            await blobP(flat())
        );

        dmsg('Guardado en Drive ✓ (proyecto + PNG)');
    } catch (e) {
        dErr(e);
    }
};


$('#bDo').onclick = async () => {
    try {
        dmsg('Cargando lista…');

        const r = await dfetch(
            'https://www.googleapis.com/drive/v3/files?q=' +
            encodeURIComponent("name contains '.drawing.json' and trashed=false") +
            '&orderBy=' +
            encodeURIComponent('modifiedTime desc') +
            '&pageSize=30&fields=' +
            encodeURIComponent('files(id,name,modifiedTime)')
        );

        const f = (await r.json()).files;
        const box = $('#dl');

        box.innerHTML = '';

        dmsg(
            f.length
                ? 'Elige un dibujo:'
                : 'No hay dibujos guardados todavía.'
        );

        f.forEach(x => {
            const b = document.createElement('button');

            b.className = 'b';

            b.textContent =
                x.name.replace('.drawing.json', '') +
                ' · ' +
                new Date(x.modifiedTime).toLocaleDateString();

            b.onclick = async () => {
                try {
                    dmsg('Abriendo…');

                    const t = await (
                        await dfetch(
                            'https://www.googleapis.com/drive/v3/files/' +
                            x.id +
                            '?alt=media'
                        )
                    ).text();

                    await loadProj(JSON.parse(t));

                    $('#nm').value = x.name.replace('.drawing.json', '');

                    localStorage.setItem('dr.' + x.name, x.id);

                    $('#dF').close();

                    autosave();
                } catch (e) {
                    dErr(e);
                }
            };

            box.append(b);
        });
    } catch (e) {
        dErr(e);
    }
};


const mq = matchMedia('(prefers-color-scheme: dark)');


function theme() {
    CV =
        getComputedStyle(document.documentElement)
            .getPropertyValue('--cv')
            .trim() || '#e4e4e0';
}


mq.onchange = () => {
    theme();
    draw();
};


new ResizeObserver(() => {
    dpr = devicePixelRatio || 1;

    view.width = Math.round(cw.clientWidth * dpr);
    view.height = Math.round(cw.clientHeight * dpr);

    theme();
    draw();
}).observe(cw);


swatches($('#pal'), PAL);


if (innerWidth <= 900) {
    $('#panel').classList.add('off');
}


(async () => {
    let ok = false;

    try {
        const s = localStorage.getItem('draw.auto');

        if (s) {
            await loadProj(JSON.parse(s));
            ok = true;
        }
    } catch (e) {}

    if (!ok) {
        newDoc(1024, 768, false);
    }

    requestAnimationFrame(fit);
})();