/* رسوم بيانية ثلاثية الأبعاد على Canvas — بدون مكتبات خارجية */
(function () {
  const INK = '#241a1d', MUTED = '#7a6c70', GRID = '#e8dfe1', SURFACE = '#ffffff';
  const fmt = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  const short = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
  function shade(hex, f) { // f>0 تفتيح، f<0 تغميق
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function tip() { let t = document.getElementById('chartTip'); if (!t) { t = document.createElement('div'); t.id = 'chartTip'; t.className = 'chart-tip'; document.body.appendChild(t); } return t; }
  function showTip(e, html) { const t = tip(); t.innerHTML = html; t.style.display = 'block'; const w = t.offsetWidth, h = t.offsetHeight; let x = e.clientX + 14, y = e.clientY - h - 10; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 16; t.style.left = x + 'px'; t.style.top = y + 'px'; }
  function hideTip() { tip().style.display = 'none'; }
  function setup(canvas, cssH) { const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || canvas.parentElement.clientWidth; canvas.style.height = cssH + 'px'; canvas.width = Math.round(W * dpr); canvas.height = Math.round(cssH * dpr); const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, W, H: cssH }; }
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

  /* أعمدة مجمّعة ثلاثية الأبعاد. series: [{month, key1, key2…}] ، sets: [{key,label,color}] */
  window.chart3dBars = function (canvas, series, sets, opts = {}) {
    const cssH = opts.height || 300, unit = opts.unit || 'ر.س';
    let hover = null, rects = [], geo = null;
    function draw() {
      const { c, W, H } = setup(canvas, cssH); rects = [];
      const padL = 46, padR = 22, padT = 20, padB = 30;
      const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
      const n = series.length, groupW = plotW / n, gap = Math.max(4, groupW * 0.16), barW = Math.max(3, (groupW - gap) / sets.length - 1);
      const DX = Math.max(3, Math.min(9, barW * 0.5)), DY = DX * 0.75;   // إزاحة العمق متناسبة مع عرض العمود
      geo = { padL, plotW, groupW, padT, base, n };
      const max = niceMax(Math.max(1, ...series.flatMap(s => sets.map(k => +s[k.key] || 0))));
      // الجدار الخلفي والأرضية
      c.fillStyle = '#fbf9f9'; c.fillRect(padL + DX, padT - DY, plotW, plotH);
      c.fillStyle = '#f2ecee'; c.beginPath(); c.moveTo(padL, base); c.lineTo(padL + DX, base - DY); c.lineTo(padL + DX + plotW, base - DY); c.lineTo(padL + plotW, base); c.closePath(); c.fill();
      c.fillStyle = '#f6f1f2'; c.beginPath(); c.moveTo(padL, padT); c.lineTo(padL + DX, padT - DY); c.lineTo(padL + DX, base - DY); c.lineTo(padL, base); c.closePath(); c.fill();
      c.font = '11px "Segoe UI",Tahoma,sans-serif'; c.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) { const y = base - plotH * i / 4; c.strokeStyle = GRID; c.lineWidth = 1; c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + DX, y - DY); c.lineTo(padL + DX + plotW, y - DY); c.stroke(); c.fillStyle = MUTED; c.textAlign = 'right'; c.fillText(short(max * i / 4), padL - 6, y); }
      // الأعمدة — الأقدم يمينًا (اتجاه القراءة العربي)، والرسم من اليسار لليمين لصحة التراكب
      const items = [];
      series.forEach((s, i) => { const gx = padL + plotW - (i + 1) * groupW + gap / 2; sets.forEach((k, j) => { const v = +s[k.key] || 0; items.push({ x: gx + (sets.length - 1 - j) * (barW + 1), v, h: v / max * plotH, set: k, s, i, j }); }); });
      items.sort((a, b) => a.x - b.x);
      for (const it of items) {
        const { x, h, set } = it, y = base - h, on = hover && hover.i === it.i && (hover.j === it.j || hover.j < 0), col = on ? shade(set.color, 0.18) : set.color;
        if (h > 0.5) {
          c.fillStyle = shade(col, -0.28); c.beginPath(); c.moveTo(x + barW, y); c.lineTo(x + barW + DX, y - DY); c.lineTo(x + barW + DX, base - DY); c.lineTo(x + barW, base); c.closePath(); c.fill();      // الجانب
          c.fillStyle = shade(col, 0.32); c.beginPath(); c.moveTo(x, y); c.lineTo(x + DX, y - DY); c.lineTo(x + barW + DX, y - DY); c.lineTo(x + barW, y); c.closePath(); c.fill();                      // القمة
          const g = c.createLinearGradient(x, y, x, base); g.addColorStop(0, col); g.addColorStop(1, shade(col, -0.12)); c.fillStyle = g; c.fillRect(x, y, barW, h);                                     // الواجهة
        }
        rects.push({ x0: x - 1, x1: x + barW + 1, y0: Math.min(y, base - 14) - DY, y1: base, it });
      }
      // تسميات الأشهر
      c.fillStyle = MUTED; c.textAlign = 'center'; c.textBaseline = 'top';
      series.forEach((s, i) => { const cx = padL + plotW - (i + .5) * groupW; c.fillStyle = hover && hover.i === i ? INK : MUTED; c.fillText(s.month.slice(5) + (s.month.slice(5) === '01' || i === 0 ? '/' + s.month.slice(2, 4) : ''), cx, base + 8); });
    }
    canvas.onmousemove = e => {
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let h = null;
      if (geo && mx >= geo.padL && mx <= geo.padL + geo.plotW + 10 && my >= geo.padT - 10 && my <= geo.base + 22) { // منطقة الشهر كاملة هدف للتحويم
        const i = Math.min(geo.n - 1, Math.max(0, Math.floor((geo.padL + geo.plotW - mx) / geo.groupW)));
        const bar = rects.filter(q => q.it.i === i && mx >= q.x0 && mx <= q.x1 && my >= q.y0 && my <= q.y1).pop();
        h = { i, j: bar ? bar.it.j : -1 };
      }
      if (!!h !== !!hover || (h && (h.i !== hover.i || h.j !== hover.j))) { hover = h; draw(); }
      if (h) { const s = series[h.i]; showTip(e, `<b>${s.month}</b>` + sets.map((k, j) => `<div class="row${h.j < 0 || j === h.j ? ' on' : ''}"><i style="background:${k.color}"></i><span>${k.label}</span><b>${fmt(s[k.key])} ${unit}</b></div>`).join('')); canvas.style.cursor = 'pointer'; } else { hideTip(); canvas.style.cursor = ''; }
    };
    canvas.onmouseleave = () => { hover = null; hideTip(); draw(); };
    draw(); return { redraw: draw };
  };

  /* حلقة (Donut) ثلاثية الأبعاد. items: [{label,value,color}] */
  window.chart3dDonut = function (canvas, items, opts = {}) {
    const cssH = opts.height || 230, unit = opts.unit ?? '', total = items.reduce((a, x) => a + Math.max(0, +x.value || 0), 0);
    let hover = -1, geo = null;
    function draw() {
      const { c, W, H } = setup(canvas, cssH), depth = 20;
      const rx = Math.min(W / 2 - 12, (H - depth - 16) / 2 / 0.56, 150), ry = rx * 0.56, cx = W / 2, cy = (H - depth) / 2 + 2, ir = 0.56;
      geo = { cx, cy, rx, ry, ir };
      if (total <= 0) { c.fillStyle = MUTED; c.font = '13px "Segoe UI",Tahoma,sans-serif'; c.textAlign = 'center'; c.fillText('لا توجد بيانات بعد', cx, H / 2); return; }
      let a = -Math.PI / 2; const arcs = items.map((it, i) => { const v = Math.max(0, +it.value || 0), a0 = a, a1 = a + v / total * Math.PI * 2; a = a1; return { it, i, a0, a1, v }; }).filter(x => x.v > 0);
      const ring = (x, dy, fill) => { c.beginPath(); c.ellipse(cx, cy + dy, rx, ry, 0, x.a0, x.a1); c.ellipse(cx, cy + dy, rx * ir, ry * ir, 0, x.a1, x.a0, true); c.closePath(); c.fillStyle = fill; c.fill(); };
      // الظل
      c.fillStyle = 'rgba(58,15,24,.10)'; c.beginPath(); c.ellipse(cx, cy + depth + 6, rx * 0.96, ry * 0.9, 0, 0, Math.PI * 2); c.fill();
      // جسم البثق: طبقات من الأسفل للأعلى
      for (let k = depth; k >= 1; k--) for (const x of arcs) ring(x, k - (x.i === hover ? 6 : 0), shade(x.it.color, -0.30 + 0.10 * (1 - k / depth)));
      // الوجه العلوي
      for (const x of arcs) { const lift = x.i === hover ? -6 : 0; ring(x, lift, x.i === hover ? shade(x.it.color, 0.15) : x.it.color); c.lineWidth = 2; c.strokeStyle = SURFACE; c.stroke(); }
      // النص في المنتصف
      if (opts.center) { c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK; c.font = '700 20px "Segoe UI",Tahoma,sans-serif'; c.fillText(opts.center, cx, cy - 4); if (opts.centerSub) { c.fillStyle = MUTED; c.font = '11px "Segoe UI",Tahoma,sans-serif'; c.fillText(opts.centerSub, cx, cy + 14); } }
      geo.arcs = arcs;
    }
    function hit(e) { if (!geo || !geo.arcs) return -1; const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - geo.cx) / geo.rx, y = (e.clientY - r.top - geo.cy) / geo.ry, d = Math.hypot(x, y); if (d < geo.ir || d > 1.04) return -1; let ang = Math.atan2(y, x); if (ang < -Math.PI / 2) ang += Math.PI * 2; const f = geo.arcs.find(q => ang >= q.a0 && ang <= q.a1); return f ? f.i : -1; }
    canvas.onmousemove = e => { const h = hit(e); if (h !== hover) { hover = h; draw(); } if (h >= 0) { const it = items[h]; showTip(e, `<div class="row on"><i style="background:${it.color}"></i><span>${it.label}</span><b>${fmt(it.value)}${unit ? ' ' + unit : ''} · <span dir="ltr">${(it.value / total * 100).toFixed(1)}%</span></b></div>`); canvas.style.cursor = 'pointer'; } else { hideTip(); canvas.style.cursor = ''; } };
    canvas.onmouseleave = () => { hover = -1; hideTip(); draw(); };
    draw(); return { redraw: draw };
  };

  /* وسيلة إيضاح HTML: النص بلون الحبر والمربع يحمل لون السلسلة */
  window.chartLegend = function (items, opts = {}) {
    const total = items.reduce((a, x) => a + Math.max(0, +x.value || 0), 0), unit = opts.unit ?? '';
    return `<div class="chart-legend${opts.column ? ' col' : ''}">${items.map(it => `<div><i style="background:${it.color}"></i><span>${it.label}</span>${it.value != null ? `<b>${fmt(it.value)}${unit ? ' ' + unit : ''}${opts.pct && total ? ` <small dir="ltr">${(it.value / total * 100).toFixed(0)}%</small>` : ''}</b>` : ''}</div>`).join('')}</div>`;
  };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => (window.__charts || []).forEach(ch => { try { ch.redraw(); } catch (e) { } }), 150); });
})();
