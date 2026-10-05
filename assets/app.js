/* محفظتي العقارية — واجهة SPA */
const API = 'api/index.php?r=';
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' ر.س';
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = new Date().toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cache = { properties: [], tenants: [], contracts: [], settings: {} };
let view = 'dashboard', chat = [];

async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: 'استجابة غير صالحة' }));
  if (r.status === 401 && j.auth === false) { location.href = 'login.html'; throw new Error('auth'); }
  if (!r.ok || j.error) { toast('خطأ: ' + (j.error || r.status)); throw new Error(j.error || r.status); }
  return j;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
const badge = s => { const c = { 'مؤجرة': 'good', 'ساري': 'good', 'مدفوع': 'good', 'مغلق': 'good', 'شاغرة': 'warn', 'للبيع': 'warn', 'قريب الانتهاء': 'warn', 'جزئي': 'warn', 'قيد التنفيذ': 'warn', 'مباعة': 'bad', 'منتهي': 'bad', 'متأخر': 'bad', 'مفتوح': 'bad', 'عالية': 'bad', 'مستحق': 'info' }[s] || ''; return `<span class="badge ${c}">${esc(s)}</span>`; };

async function loadRefs() {
  const safe = (res, d) => canR(res) ? api(res).catch(() => d) : Promise.resolve(d);
  [cache.properties, cache.tenants, cache.contracts, cache.settings] = await Promise.all([safe('properties', []), safe('tenants', []), safe('contracts', []), safe('settings', {})]);
  $('#ownerName').textContent = cache.settings.owner_name || 'المالك';
}
async function refreshAlerts() { if (!canR('alerts')) { $('#alertCount').style.display = 'none'; return; } try { const a = await api('alerts'); $('#alertCount').textContent = a.filter(x => x.level !== 'info').length; } catch (e) { } }

/* ---------- التنقل ---------- */
const TITLES = { dashboard: 'لوحة التحكم', properties: 'الوحدات', tenants: 'المستأجرون', contracts: 'العقود', collections: 'التحصيل', expenses: 'المصروفات', maintenance: 'الصيانة', loans: 'التمويل', growth: 'التوسع والاستبدال', reports: 'التقارير', assistant: 'المساعد الذكي', users: 'المستخدمون', settings: 'الإعدادات', onboarding: 'مرحبًا بك', portal: 'بوابتي' };
const ICONS = { dashboard: '📊', properties: '🏢', tenants: '👥', contracts: '📄', collections: '💰', expenses: '🧾', maintenance: '🔧', loans: '🏦', growth: '📈', reports: '📑', assistant: '✨', users: '🛡️', settings: '⚙️', portal: '🏠' };
function buildNav() { $('#nav').innerHTML = (user.pages || []).map(p => `<a data-v="${p}"><i>${ICONS[p] || '•'}</i>${TITLES[p]}</a>`).join(''); document.querySelectorAll('#nav a').forEach(a => a.onclick = () => go(a.dataset.v)); const hideAsk = !(user.pages || []).includes('assistant'); document.querySelector('.top-actions .btn.primary').style.display = hideAsk ? 'none' : ''; $('#globalSearch').style.display = (user.pages || []).includes('properties') ? '' : 'none'; }
const canW = res => user && (user.perms['*'] === 'rw' || user.perms[res] === 'rw');
const canR = res => user && (user.perms['*'] || user.perms[res]);
async function go(v, opts = {}) {
  if (user && v !== 'onboarding' && !(user.pages || []).includes(v)) v = user.pages[0];
  view = v; document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.v === v));
  $('#viewTitle').textContent = TITLES[v]; $('#sidebar').classList.remove('open');
  $('#view').innerHTML = '<div class="empty">جارٍ التحميل…</div>';
  try { await loadRefs(); await VIEWS[v](opts); applyReadOnly(v); } catch (e) { $('#view').innerHTML = `<div class="card">تعذّر التحميل: ${esc(e.message)}<br><br>تأكد أن Apache وMySQL يعملان في XAMPP.</div>`; }
  refreshAlerts();
}
const VIEW_RES = { properties: 'properties', tenants: 'tenants', contracts: 'contracts', collections: 'collections', expenses: 'expenses', maintenance: 'maintenance', loans: 'loans', growth: 'transactions' };
function applyReadOnly(v) { const res = VIEW_RES[v]; if (!res || canW(res)) return; $('#view').querySelectorAll('.btn.primary, .btn.success, .btn.danger').forEach(b => { if (!/طباعة|CSV|احسب|كشف|الاستحقاقات|سند/.test(b.textContent)) b.style.display = 'none'; }); $('#view').insertAdjacentHTML('afterbegin', '<div class="notice small">👁️ وضع العرض فقط — دورك لا يسمح بالتعديل هنا.</div>'); }
function globalSearch(q) { if (!q) return; if (view !== 'properties') go('properties', { search: q }); else { $('#psearch').value = q; filterTable(); } }

/* ---------- عناصر مساعدة ---------- */
const kpi = (label, val, cls = '', sub = '') => `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="val num">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const table = (cols, rows, rowFn, empty = 'لا توجد بيانات') => `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(rowFn).join('') : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
const sel = (name, options, val, placeholder) => `<select name="${name}">${placeholder ? `<option value="">${placeholder}</option>` : ''}${options.map(o => `<option value="${esc(o.v ?? o)}" ${String(o.v ?? o) === String(val) ? 'selected' : ''}>${esc(o.t ?? o)}</option>`).join('')}</select>`;
const propOptions = () => cache.properties.filter(p => p.status !== 'مباعة').map(p => ({ v: p.id, t: p.name + ' — ' + p.city }));
const allPropOptions = () => cache.properties.map(p => ({ v: p.id, t: p.name }));
const tenantOptions = () => cache.tenants.map(t => ({ v: t.id, t: t.name }));
const contractOptions = () => cache.contracts.filter(c => c.status === 'ساري').map(c => ({ v: c.id, t: `${c.property_name} — ${c.tenant_name}` }));

function field(f, val) {
  const v = val ?? f.def ?? '';
  const inner = f.type === 'select' ? sel(f.name, typeof f.options === 'function' ? f.options() : f.options, v, f.placeholder)
    : f.type === 'textarea' ? `<textarea name="${f.name}">${esc(v)}</textarea>`
      : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''}>`;
  return `<label class="${f.full ? 'full' : ''}">${f.label}${inner}</label>`;
}
function openModal(title, fields, data, onSave, extraFoot = '') {
  $('#modalTitle').textContent = title;
  $('#modalForm').innerHTML = `<div class="form">${fields.map(f => field(f, data?.[f.name])).join('')}</div>`;
  $('#modalFoot').innerHTML = `<button class="btn primary" id="modalSave">حفظ</button><button class="btn" onclick="closeModal()">إلغاء</button>${extraFoot}`;
  $('#modalSave').onclick = async () => { const o = Object.fromEntries(new FormData($('#modalForm')).entries()); for (const f of fields) if (f.required && !o[f.name]) return toast('أكمل الحقل: ' + f.label); await onSave(o); closeModal(); };
  $('#modal').classList.add('show');
}
function closeModal() { $('#modal').classList.remove('show'); }
function openDrawer(title, html) { $('#drawerTitle').textContent = title; $('#drawerBody').innerHTML = html; $('#drawer').classList.add('show'); }
function closeDrawer() { $('#drawer').classList.remove('show'); }
async function del(res, id, label = 'السجل') { if (!confirm(`حذف ${label}؟ لا يمكن التراجع.`)) return; await api(`${res}/${id}`, 'DELETE'); toast('تم الحذف'); go(view); }

function drawBars(canvas, series, keys, colors) {
  const c = canvas.getContext('2d'), W = canvas.width = canvas.clientWidth * 2, H = canvas.height = 440; c.scale(1, 1);
  const max = Math.max(1, ...series.flatMap(s => keys.map(k => +s[k] || 0))); const pad = 40, bw = (W - pad * 2) / series.length;
  c.font = '20px Tahoma'; c.textAlign = 'center';
  series.forEach((s, i) => { keys.forEach((k, j) => { const h = (+s[k] || 0) / max * (H - 90); const x = W - pad - (i + 1) * bw + j * (bw / keys.length / 1.2) + 8; c.fillStyle = colors[j]; c.fillRect(x, H - 50 - h, bw / keys.length / 1.3, h); }); c.fillStyle = '#7a6c70'; c.fillText(s.month.slice(5), W - pad - (i + .5) * bw, H - 20); });
}

/* ---------- لوحة التحكم ---------- */
const VIEWS = {};
VIEWS.dashboard = async () => {
  const [s, alerts] = await Promise.all([api('stats'), api('alerts')]);
  $('#view').innerHTML = `
  <div class="grid">
    ${kpi('الوحدات', s.units, '', `${s.rented} مؤجرة · ${s.vacant} شاغرة · ${s.for_sale} للبيع`)}
    ${kpi('نسبة الإشغال', s.occupancy + '%', s.occupancy >= 90 ? 'good' : s.occupancy >= 75 ? 'warn' : 'bad')}
    ${kpi('الإيجار الشهري (عقود سارية)', money(s.rent_month), '', 'الممكن: ' + money(s.potential_rent))}
    ${kpi('التحصيل هذا الشهر', s.collection_rate + '%', s.collection_rate >= 90 ? 'good' : 'warn', `${money(s.paid_month)} من ${money(s.due_month)}`)}
    ${kpi('المتأخرات', money(s.overdue), s.overdue > 0 ? 'bad' : 'good', s.overdue_n + ' استحقاق')}
    ${kpi('NOI سنوي', money(s.noi_year), 'good', 'Cap Rate ' + s.cap_rate + '%')}
    ${kpi('التدفق النقدي السنوي', money(s.cashflow_year), s.cashflow_year > 0 ? 'good' : 'bad', 'بعد الأقساط')}
    ${kpi('قيمة المحفظة', money(s.value_total), '', 'الشراء: ' + money(s.purchase_total))}
    ${kpi('حقوق الملكية', money(s.equity), '', 'LTV ' + s.ltv + '%')}
    ${kpi('الدين القائم', money(s.loan_balance), '', 'أقساط ' + money(s.install_month) + '/شهر · DSCR ' + (s.dscr ?? '—'))}
    ${kpi('النقد المتاح', money(s.cash))}
    ${kpi('يحتاج انتباهك', s.expiring_60 + ' / ' + s.open_maintenance, s.expiring_60 + s.open_maintenance > 0 ? 'warn' : 'good', 'عقود تنتهي قريبًا / بلاغات مفتوحة')}
  </div>
  <div class="grid2" style="margin-top:14px">
    <div class="card"><h3>التحصيل مقابل المستحق والمصروفات — 12 شهرًا</h3><canvas id="chart"></canvas><div class="small muted" style="display:flex;gap:14px;margin-top:8px"><span>■ <span style="color:#7a6c70">المستحق</span></span><span>■ <span style="color:#0f9d6e">المحصّل</span></span><span>■ <span style="color:#c93838">المصروفات</span></span></div></div>
    <div class="card" id="alerts"><h3>التنبيهات (${alerts.length})</h3><div style="max-height:300px;overflow:auto">${alerts.length ? alerts.map(a => `<div class="alert ${a.level}" onclick="go('${a.link}')"><div><b>${a.type}</b><small>${esc(a.text)}</small></div></div>`).join('') : '<div class="empty">لا تنبيهات 🎉</div>'}</div></div>
  </div>
  <div class="grid2" style="margin-top:14px">
    <div class="card"><h3>مرشحون للاستبدال (${s.replacement.length})</h3>${s.replacement.length ? s.replacement.slice(0, 6).map(r => `<div class="kv"><span><b>${esc(r.name)}</b> <span class="muted small">${r.reasons.join(' · ')}</span></span><span class="num">${r.yield}%</span></div>`).join('') : '<div class="empty">لا شيء وفق القاعدة الحالية</div>'}<button class="btn sm" style="margin-top:8px" onclick="go('growth')">عرض الكل</button></div>
    <div class="card"><h3>ملخص ذكي</h3><div id="aiSummary" class="muted">جارٍ التحليل…</div></div>
  </div>`;
  drawBars($('#chart'), s.series, ['due', 'collected', 'expenses'], ['#9a8f92', '#0f9d6e', '#c93838']);
  api('assistant', 'POST', { q: 'ملخص المحفظة' }).then(r => $('#aiSummary').innerHTML = `<div style="white-space:pre-wrap;line-height:1.7;color:var(--ink)">${esc(r.answer)}</div>`).catch(() => { });
};

/* ---------- الوحدات ---------- */
const PROP_FIELDS = [
  { name: 'name', label: 'اسم الوحدة', required: true }, { name: 'type', label: 'النوع', type: 'select', options: ['شقة', 'فيلا', 'دور', 'محل', 'مكتب', 'أرض', 'مستودع', 'عمارة'] },
  { name: 'city', label: 'المدينة', def: 'الدمام' }, { name: 'district', label: 'الحي' }, { name: 'address', label: 'العنوان', full: true },
  { name: 'deed_no', label: 'رقم الصك' }, { name: 'area', label: 'المساحة م²', type: 'number' }, { name: 'rooms', label: 'الغرف', type: 'number' },
  { name: 'status', label: 'الحالة', type: 'select', options: ['شاغرة', 'مؤجرة', 'للبيع', 'مباعة'] },
  { name: 'purchase_price', label: 'سعر الشراء', type: 'number' }, { name: 'purchase_date', label: 'تاريخ الشراء', type: 'date' }, { name: 'current_value', label: 'القيمة الحالية', type: 'number' },
  { name: 'expected_rent', label: 'الإيجار الشهري المتوقع', type: 'number' }, { name: 'monthly_expense', label: 'المصروف الشهري التقديري', type: 'number' }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true }];
let tableRows = [];
VIEWS.properties = async (o) => {
  tableRows = cache.properties;
  const cities = [...new Set(cache.properties.map(p => p.city).filter(Boolean))];
  $('#view').innerHTML = `<div class="toolbar"><input id="psearch" placeholder="بحث…" value="${esc(o.search || '')}" oninput="filterTable()"><select id="pstatus" onchange="filterTable()"><option value="">كل الحالات</option>${['مؤجرة', 'شاغرة', 'للبيع', 'مباعة'].map(s => `<option>${s}</option>`).join('')}</select><select id="pcity" onchange="filterTable()"><option value="">كل المدن</option>${cities.map(c => `<option>${c}</option>`).join('')}</select><select id="psort" onchange="filterTable()"><option value="">ترتيب افتراضي</option><option value="yield_desc">الأعلى عائدًا</option><option value="yield_asc">الأقل عائدًا</option><option value="rent_desc">الأعلى إيجارًا</option><option value="value_desc">الأعلى قيمة</option></select><span class="spacer"></span><span class="muted small" id="pcount"></span><button class="btn primary" onclick="editProperty()">+ وحدة</button></div><div id="ptable"></div>`;
  filterTable();
};
function filterTable() {
  const q = ($('#psearch').value || '').toLowerCase(), st = $('#pstatus').value, city = $('#pcity').value, sort = $('#psort').value;
  let rows = tableRows.filter(p => (!q || (p.name + p.city + p.district + p.address + p.type).toLowerCase().includes(q)) && (!st || p.status === st) && (!city || p.city === city));
  const sorters = { yield_desc: (a, b) => b.gross_yield - a.gross_yield, yield_asc: (a, b) => a.gross_yield - b.gross_yield, rent_desc: (a, b) => b.expected_rent - a.expected_rent, value_desc: (a, b) => b.current_value - a.current_value };
  if (sorters[sort]) rows = [...rows].sort(sorters[sort]);
  $('#pcount').textContent = rows.length + ' وحدة';
  $('#ptable').innerHTML = table(['الوحدة', 'النوع', 'الموقع', 'الحالة', 'الشراء', 'القيمة الحالية', 'الإيجار', 'المصروف', 'عائد إجمالي', 'عائد صافي', ''], rows, p => `<tr><td><a onclick="propertyDetail(${p.id})"><b>${esc(p.name)}</b></a></td><td>${esc(p.type)}</td><td>${esc(p.city)}${p.district ? ' — ' + esc(p.district) : ''}</td><td>${badge(p.status)}</td><td class="num">${money(p.purchase_price)}</td><td class="num">${money(p.current_value)}</td><td class="num">${money(p.expected_rent)}</td><td class="num">${money(p.monthly_expense)}</td><td class="num ${p.gross_yield < (+cache.settings.replacement_yield || 5) ? 'neg' : 'pos'}">${p.gross_yield}%</td><td class="num">${p.net_yield}%</td><td class="actions"><button class="btn sm" onclick="editProperty(${p.id})">تعديل</button> <button class="btn sm danger" onclick="del('properties',${p.id},'الوحدة وكل ما يرتبط بها')">حذف</button></td></tr>`);
}
function editProperty(id) { const p = id ? cache.properties.find(x => x.id == id) : null; openModal(id ? 'تعديل وحدة' : 'إضافة وحدة', PROP_FIELDS, p, async o => { await api(id ? `properties/${id}` : 'properties', id ? 'PUT' : 'POST', o); toast('تم الحفظ'); go(view); }); }
async function propertyDetail(id) {
  const [p, contracts, cols, exps, maint, loans] = await Promise.all([api(`properties/${id}`), api(`contracts?property_id=${id}`), api(`collections?property_id=${id}`), api(`expenses?property_id=${id}`), api(`maintenance?property_id=${id}`), api(`loans?property_id=${id}`)]);
  const inc = cols.reduce((a, x) => a + +x.amount, 0), ex = exps.reduce((a, x) => a + +x.amount, 0);
  openDrawer(p.name, `
  <div class="grid">${kpi('الحالة', badge(p.status))}${kpi('العائد الإجمالي', p.gross_yield + '%')}${kpi('إجمالي المحصّل', money(inc), 'good')}${kpi('إجمالي المصروفات', money(ex), 'bad')}${kpi('الصافي', money(inc - ex), inc - ex >= 0 ? 'good' : 'bad')}${kpi('القيمة الحالية', money(p.current_value), '', 'الشراء ' + money(p.purchase_price))}</div>
  <div class="card" style="margin-top:12px"><h3>البيانات</h3><div class="kv"><span>النوع</span><b>${esc(p.type)}</b></div><div class="kv"><span>الموقع</span><b>${esc(p.city)} — ${esc(p.district)} ${esc(p.address)}</b></div><div class="kv"><span>الصك</span><b>${esc(p.deed_no) || '—'}</b></div><div class="kv"><span>المساحة / الغرف</span><b>${num(p.area)} م² / ${p.rooms}</b></div><div class="kv"><span>تاريخ الشراء</span><b>${p.purchase_date || '—'}</b></div><div class="kv"><span>ملاحظات</span><b>${esc(p.notes) || '—'}</b></div><div style="margin-top:8px;display:flex;gap:6px"><button class="btn sm" onclick="closeDrawer();editProperty(${p.id})">تعديل</button><button class="btn sm primary" onclick="closeDrawer();editContract(null,${p.id})">+ عقد لهذه الوحدة</button><button class="btn sm" onclick="closeDrawer();editMaintenance(null,${p.id})">+ بلاغ صيانة</button><button class="btn sm" onclick="closeDrawer();editExpense(null,${p.id})">+ مصروف</button></div></div>
  <div class="card" style="margin-top:12px"><h3>العقود (${contracts.length})</h3>${table(['المستأجر', 'من', 'إلى', 'الإيجار', 'الحالة', 'متأخر'], contracts, c => `<tr><td>${esc(c.tenant_name)}</td><td>${c.start_date}</td><td>${c.end_date}</td><td class="num">${money(c.rent)}</td><td>${badge(c.status)}</td><td class="num neg">${c.overdue ? money(c.overdue) : '—'}</td></tr>`)}</div>
  <div class="card" style="margin-top:12px"><h3>التحصيلات (${cols.length})</h3>${table(['التاريخ', 'المستأجر', 'المبلغ', 'الطريقة'], cols.slice(0, 12), c => `<tr><td>${c.date}</td><td>${esc(c.tenant_name)}</td><td class="num">${money(c.amount)}</td><td>${esc(c.method)}</td></tr>`)}</div>
  <div class="card" style="margin-top:12px"><h3>المصروفات (${exps.length})</h3>${table(['التاريخ', 'النوع', 'المبلغ', 'المورد'], exps.slice(0, 12), e => `<tr><td>${e.date}</td><td>${esc(e.category)}</td><td class="num">${money(e.amount)}</td><td>${esc(e.vendor)}</td></tr>`)}</div>
  <div class="card" style="margin-top:12px"><h3>الصيانة (${maint.length})</h3>${table(['التاريخ', 'البلاغ', 'الأولوية', 'التكلفة', 'الحالة'], maint, m => `<tr><td>${m.date}</td><td>${esc(m.issue)}</td><td>${badge(m.priority)}</td><td class="num">${money(m.cost)}</td><td>${badge(m.status)}</td></tr>`)}</div>
  ${loans.length ? `<div class="card" style="margin-top:12px"><h3>التمويل</h3>${table(['البنك', 'الرصيد', 'القسط'], loans, l => `<tr><td>${esc(l.bank)}</td><td class="num">${money(l.balance)}</td><td class="num">${money(l.payment)}</td></tr>`)}</div>` : ''}`);
}

/* ---------- المستأجرون ---------- */
const TENANT_FIELDS = [{ name: 'name', label: 'الاسم', required: true }, { name: 'phone', label: 'الجوال' }, { name: 'national_id', label: 'الهوية / الإقامة' }, { name: 'email', label: 'البريد', type: 'email' }, { name: 'nationality', label: 'الجنسية' }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true }];
VIEWS.tenants = async () => {
  const rows = cache.tenants;
  $('#view').innerHTML = `<div class="toolbar"><input placeholder="بحث…" oninput="const q=this.value;document.querySelectorAll('#ttable tbody tr').forEach(r=>r.style.display=r.textContent.includes(q)?'':'none')"><span class="spacer"></span><button class="btn primary" onclick="editTenant()">+ مستأجر</button></div><div id="ttable">${table(['الاسم', 'الجوال', 'الهوية', 'الوحدة الحالية', 'المتأخرات', ''], rows, t => `<tr><td><a onclick="tenantDetail(${t.id})"><b>${esc(t.name)}</b></a></td><td dir="ltr" style="text-align:right">${esc(t.phone)}</td><td>${esc(t.national_id)}</td><td>${esc(t.unit)}</td><td class="num ${t.arrears > 0 ? 'neg' : ''}">${t.arrears > 0 ? money(t.arrears) : '—'}</td><td class="actions"><button class="btn sm" onclick="editTenant(${t.id})">تعديل</button> <button class="btn sm" onclick="tenantDetail(${t.id})">كشف حساب</button> <button class="btn sm danger" onclick="del('tenants',${t.id},'المستأجر')">حذف</button></td></tr>`)}</div>`;
};
function editTenant(id) { const t = id ? cache.tenants.find(x => x.id == id) : null; openModal(id ? 'تعديل مستأجر' : 'إضافة مستأجر', TENANT_FIELDS, t, async o => { await api(id ? `tenants/${id}` : 'tenants', id ? 'PUT' : 'POST', o); toast('تم الحفظ'); go(view); }); }
async function tenantDetail(id) {
  const t = cache.tenants.find(x => x.id == id), r = await api(`reports/tenant_statement&tenant_id=${id}`);
  openDrawer('كشف حساب: ' + t.name, `<div class="grid">${kpi('إجمالي المستحق', money(r.total_due))}${kpi('إجمالي المدفوع', money(r.total_paid), 'good')}${kpi('الرصيد', money(r.total_due - r.total_paid), r.total_due - r.total_paid > 0 ? 'bad' : 'good')}${kpi('الجوال', `<span dir="ltr">${esc(t.phone)}</span>`)}</div>
  <div class="toolbar" style="margin-top:12px"><button class="btn" onclick="window.print()">🖨️ طباعة</button><button class="btn" onclick="sendReminder(${id})">📩 صياغة تذكير</button></div>
  <div class="card"><h3>الاستحقاقات</h3>${table(['الوحدة', 'الاستحقاق', 'المبلغ', 'المدفوع', 'الحالة'], r.installments, i => `<tr><td>${esc(i.property_name)}</td><td>${i.due_date}</td><td class="num">${money(i.amount)}</td><td class="num">${money(i.paid)}</td><td>${badge(i.status)}</td></tr>`)}</div>
  <div class="card" style="margin-top:12px"><h3>الدفعات</h3>${table(['التاريخ', 'المبلغ', 'الطريقة', 'المرجع'], r.collections, c => `<tr><td>${c.date}</td><td class="num">${money(c.amount)}</td><td>${esc(c.method)}</td><td>${esc(c.ref_no)}</td></tr>`)}</div>`);
}
async function sendReminder(tid) { const t = cache.tenants.find(x => x.id == tid); const r = await api('assistant', 'POST', { q: `اكتب تذكير سداد للمستأجر ${t.name}` }); const txt = r.answer.split('\n\n').slice(1).join('\n\n'); openModal('رسالة تذكير', [{ name: 'msg', label: 'النص', type: 'textarea', full: true }], { msg: txt }, async o => { await navigator.clipboard?.writeText(o.msg).catch(() => { }); toast('تم نسخ الرسالة'); const ph = (t.phone || '').replace(/^0/, '966'); if (ph) window.open(`https://wa.me/${ph}?text=${encodeURIComponent(o.msg)}`); }); $('#modalSave').textContent = 'نسخ وإرسال واتساب'; }

/* ---------- العقود ---------- */
const CONTRACT_FIELDS = () => [{ name: 'property_id', label: 'الوحدة', type: 'select', options: propOptions, required: true }, { name: 'tenant_id', label: 'المستأجر', type: 'select', options: tenantOptions, required: true }, { name: 'ejar_no', label: 'رقم عقد إيجار (منصة إيجار)' }, { name: 'frequency', label: 'دورية الدفع', type: 'select', options: ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'] }, { name: 'start_date', label: 'البداية', type: 'date', def: today, required: true }, { name: 'end_date', label: 'النهاية', type: 'date', def: new Date(Date.now() + 364 * 864e5).toISOString().slice(0, 10), required: true }, { name: 'rent', label: 'الإيجار الشهري', type: 'number', required: true }, { name: 'deposit', label: 'التأمين', type: 'number' }, { name: 'status', label: 'الحالة', type: 'select', options: ['ساري', 'منتهي'] }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true }];
VIEWS.contracts = async () => {
  const rows = cache.contracts;
  $('#view').innerHTML = `<div class="toolbar"><select onchange="document.querySelectorAll('#ctable tbody tr').forEach(r=>r.style.display=!this.value||r.dataset.s===this.value?'':'none')"><option value="">كل الحالات</option><option>ساري</option><option>منتهي</option></select><span class="spacer"></span><button class="btn primary" onclick="editContract()">+ عقد</button></div><div id="ctable">${table(['الوحدة', 'المستأجر', 'إيجار #', 'من', 'إلى', 'باقي', 'الإيجار', 'الدورية', 'مدفوع/مستحق', 'الحالة', ''], rows, c => `<tr data-s="${c.status}"><td><b>${esc(c.property_name)}</b></td><td>${esc(c.tenant_name)}</td><td>${esc(c.ejar_no) || '—'}</td><td>${c.start_date}</td><td>${c.end_date}</td><td class="num ${c.status === 'ساري' && c.days_left < 60 ? 'neg' : ''}">${c.status === 'ساري' ? c.days_left + ' يوم' : '—'}</td><td class="num">${money(c.rent)}</td><td>${esc(c.frequency)}</td><td class="num">${money(c.total_paid)} / ${money(c.total_due)}${c.overdue > 0 ? ` <span class="badge bad">متأخر ${money(c.overdue)}</span>` : ''}</td><td>${badge(c.status)}</td><td class="actions"><button class="btn sm" onclick="installments(${c.id})">الاستحقاقات</button> <button class="btn sm" onclick="editContract(${c.id})">تعديل</button>${c.status === 'ساري' ? ` <button class="btn sm success" onclick="renewContract(${c.id})">تجديد</button> <button class="btn sm danger" onclick="terminateContract(${c.id})">إنهاء</button>` : ''} <button class="btn sm danger" onclick="del('contracts',${c.id},'العقد واستحقاقاته')">حذف</button></td></tr>`)}</div>`;
};
function editContract(id, propertyId) { const c = id ? cache.contracts.find(x => x.id == id) : (propertyId ? { property_id: propertyId } : null); if (!cache.tenants.length) return toast('أضف مستأجرًا أولًا'); openModal(id ? 'تعديل عقد' : 'عقد جديد', CONTRACT_FIELDS(), c, async o => { await api(id ? `contracts/${id}` : 'contracts', id ? 'PUT' : 'POST', o); toast('تم الحفظ وتوليد الاستحقاقات'); go('contracts'); }); }
function renewContract(id) { const c = cache.contracts.find(x => x.id == id); openModal('تجديد العقد', [{ name: 'months', label: 'مدة التجديد (أشهر)', type: 'number', def: 12 }, { name: 'rent', label: 'الإيجار الجديد', type: 'number', def: c.rent }, { name: 'ejar_no', label: 'رقم عقد إيجار الجديد' }], null, async o => { await api(`contracts/${id}/renew`, 'POST', o); toast('تم التجديد'); go('contracts'); }); }
async function terminateContract(id) { if (!confirm('إنهاء العقد الآن؟ ستُحذف الاستحقاقات المستقبلية غير المدفوعة وتصبح الوحدة شاغرة.')) return; await api(`contracts/${id}/terminate`, 'POST', {}); toast('تم إنهاء العقد'); go('contracts'); }
async function installments(cid) {
  const c = cache.contracts.find(x => x.id == cid), rows = await api(`installments?contract_id=${cid}`);
  openDrawer(`استحقاقات: ${c.property_name} — ${c.tenant_name}`, `<div class="grid">${kpi('إجمالي', money(c.total_due))}${kpi('مدفوع', money(c.total_paid), 'good')}${kpi('متأخر', money(c.overdue), c.overdue > 0 ? 'bad' : 'good')}</div><div style="margin-top:12px">${table(['الاستحقاق', 'المبلغ', 'المدفوع', 'الباقي', 'الحالة', ''], rows, i => `<tr><td>${i.due_date}</td><td class="num">${money(i.amount)}</td><td class="num">${money(i.paid)}</td><td class="num">${money(i.remaining)}</td><td>${badge(i.status)}</td><td class="actions">${i.remaining > 0 ? `<button class="btn sm success" onclick="closeDrawer();editCollection(null,${i.id},${cid},${i.remaining})">تحصيل</button>` : ''}</td></tr>`)}</div>`);
}

/* ---------- التحصيل ---------- */
const COLLECTION_FIELDS = () => [{ name: 'contract_id', label: 'العقد', type: 'select', options: contractOptions, required: true }, { name: 'installment_id', label: 'رقم الاستحقاق (اختياري — يُوزَّع تلقائيًا إن تُرك)', type: 'number' }, { name: 'date', label: 'التاريخ', type: 'date', def: today, required: true }, { name: 'amount', label: 'المبلغ', type: 'number', required: true }, { name: 'method', label: 'طريقة الدفع', type: 'select', options: ['تحويل', 'نقد', 'سداد', 'شيك', 'بطاقة', 'أخرى'] }, { name: 'ref_no', label: 'رقم المرجع' }, { name: 'note', label: 'ملاحظة', type: 'textarea', full: true }];
VIEWS.collections = async () => {
  const [due, cols] = await Promise.all([api('installments'), api('collections')]);
  const pending = due.filter(i => i.remaining > 0 && i.due_date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  $('#view').innerHTML = `<div class="tabs"><button class="active" onclick="switchTab(this,'tabDue')">المستحق والمتأخر (${pending.length})</button><button onclick="switchTab(this,'tabCols')">سجل التحصيلات (${cols.length})</button><span class="spacer" style="flex:1"></span><button class="btn primary" onclick="editCollection()">+ تسجيل تحصيل</button></div>
  <div id="tabDue">${table(['الاستحقاق', 'الوحدة', 'المستأجر', 'المبلغ', 'المدفوع', 'الباقي', 'الحالة', ''], pending, i => `<tr><td>${i.due_date}</td><td>${esc(i.property_name)}</td><td>${esc(i.tenant_name)}</td><td class="num">${money(i.amount)}</td><td class="num">${money(i.paid)}</td><td class="num neg">${money(i.remaining)}</td><td>${badge(i.status)}</td><td class="actions"><button class="btn sm success" onclick="editCollection(null,${i.id},${i.contract_id},${i.remaining})">تحصيل</button></td></tr>`, 'لا مستحقات خلال 30 يومًا')}</div>
  <div id="tabCols" style="display:none">${table(['التاريخ', 'الوحدة', 'المستأجر', 'المبلغ', 'الطريقة', 'المرجع', 'ملاحظة', ''], cols, c => `<tr><td>${c.date}</td><td>${esc(c.property_name)}</td><td>${esc(c.tenant_name)}</td><td class="num pos">${money(c.amount)}</td><td>${esc(c.method)}</td><td>${esc(c.ref_no)}</td><td>${esc(c.note)}</td><td class="actions"><button class="btn sm" onclick="receipt(${c.id})">سند</button> <button class="btn sm danger" onclick="del('collections',${c.id},'التحصيل')">حذف</button></td></tr>`)}</div>`;
};
function switchTab(btn, id) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn)); btn.parentElement.parentElement.querySelectorAll('[id^=tab]').forEach(d => d.style.display = d.id === id ? '' : 'none'); }
function editCollection(id, installmentId, contractId, amount) { openModal('تسجيل تحصيل', COLLECTION_FIELDS(), { installment_id: installmentId || '', contract_id: contractId || '', amount: amount || '' }, async o => { await api('collections', 'POST', o); toast('تم تسجيل التحصيل'); go(view); }); }
async function receipt(id) { const c = await api(`collections/${id}`); openDrawer('سند قبض #' + id, `<div class="card" style="max-width:600px;margin:auto"><h2 style="text-align:center">سند قبض</h2><div class="kv"><span>الرقم</span><b>${id}</b></div><div class="kv"><span>التاريخ</span><b>${c.date}</b></div><div class="kv"><span>استلمنا من</span><b>${esc(c.tenant_name)}</b></div><div class="kv"><span>مبلغًا وقدره</span><b>${money(c.amount)}</b></div><div class="kv"><span>وذلك عن</span><b>إيجار ${esc(c.property_name)}</b></div><div class="kv"><span>طريقة الدفع</span><b>${esc(c.method)} ${esc(c.ref_no)}</b></div><br><div class="kv"><span>المستلم: ${esc(cache.settings.owner_name)}</span><span>التوقيع: ____________</span></div><br><button class="btn primary" onclick="window.print()">🖨️ طباعة</button></div>`); }

/* ---------- المصروفات ---------- */
const EXPENSE_FIELDS = () => [{ name: 'property_id', label: 'الوحدة (أو عام)', type: 'select', options: allPropOptions, placeholder: 'عام — على المحفظة' }, { name: 'date', label: 'التاريخ', type: 'date', def: today, required: true }, { name: 'category', label: 'التصنيف', type: 'select', options: ['صيانة', 'كهرباء', 'ماء', 'رسوم بلدية', 'تأمين', 'عمولة', 'إدارة', 'تسويق', 'قانوني', 'زكاة', 'أخرى'] }, { name: 'amount', label: 'المبلغ', type: 'number', required: true }, { name: 'vendor', label: 'المورد' }, { name: 'note', label: 'ملاحظة', type: 'textarea', full: true }];
VIEWS.expenses = async () => {
  const rows = await api('expenses'); const total = rows.reduce((a, x) => a + +x.amount, 0);
  $('#view').innerHTML = `<div class="toolbar"><input type="date" id="efrom" value="${new Date().getFullYear()}-01-01"><input type="date" id="eto" value="${today}"><button class="btn" onclick="reloadExpenses()">تصفية</button><span class="spacer"></span><b>الإجمالي: ${money(total)}</b><button class="btn primary" onclick="editExpense()">+ مصروف</button></div><div id="etable">${expenseTable(rows)}</div>`;
};
const expenseTable = rows => table(['التاريخ', 'الوحدة', 'التصنيف', 'المبلغ', 'المورد', 'ملاحظة', ''], rows, e => `<tr><td>${e.date}</td><td>${esc(e.property_name || 'عام')}</td><td>${badge(e.category)}</td><td class="num neg">${money(e.amount)}</td><td>${esc(e.vendor)}</td><td>${esc(e.note)}</td><td class="actions"><button class="btn sm" onclick="editExpense(${e.id})">تعديل</button> <button class="btn sm danger" onclick="del('expenses',${e.id},'المصروف')">حذف</button></td></tr>`);
async function reloadExpenses() { const rows = await api(`expenses&from=${$('#efrom').value}&to=${$('#eto').value}`); $('#etable').innerHTML = expenseTable(rows); }
async function editExpense(id, propertyId) { const e = id ? await api(`expenses/${id}`) : (propertyId ? { property_id: propertyId } : null); openModal(id ? 'تعديل مصروف' : 'مصروف جديد', EXPENSE_FIELDS(), e, async o => { await api(id ? `expenses/${id}` : 'expenses', id ? 'PUT' : 'POST', o); toast('تم الحفظ'); go(view); }); }

/* ---------- الصيانة ---------- */
const MAINT_FIELDS = () => [{ name: 'property_id', label: 'الوحدة', type: 'select', options: allPropOptions, required: true }, { name: 'date', label: 'تاريخ البلاغ', type: 'date', def: today, required: true }, { name: 'issue', label: 'وصف البلاغ', required: true, full: true }, { name: 'priority', label: 'الأولوية', type: 'select', options: ['عالية', 'متوسطة', 'منخفضة'], def: 'متوسطة' }, { name: 'status', label: 'الحالة', type: 'select', options: ['مفتوح', 'قيد التنفيذ', 'مغلق'] }, { name: 'vendor', label: 'الفني / المقاول' }, { name: 'cost', label: 'التكلفة (تقديرية أو فعلية)', type: 'number' }, { name: 'note', label: 'ملاحظة', type: 'textarea', full: true }];
VIEWS.maintenance = async () => {
  const rows = await api('maintenance'); const open = rows.filter(m => m.status !== 'مغلق');
  $('#view').innerHTML = `<div class="grid">${kpi('بلاغات مفتوحة', open.length, open.length ? 'warn' : 'good')}${kpi('تكلفة المفتوحة التقديرية', money(open.reduce((a, x) => a + +x.cost, 0)))}${kpi('إجمالي بلاغات السنة', rows.filter(m => m.date >= new Date().getFullYear() + '-01-01').length)}</div><div class="toolbar" style="margin-top:12px"><select onchange="document.querySelectorAll('#mtable tbody tr').forEach(r=>r.style.display=!this.value||r.dataset.s===this.value?'':'none')"><option value="">كل الحالات</option><option>مفتوح</option><option>قيد التنفيذ</option><option>مغلق</option></select><span class="spacer"></span><button class="btn primary" onclick="editMaintenance()">+ بلاغ صيانة</button></div><div id="mtable">${table(['التاريخ', 'الوحدة', 'البلاغ', 'الأولوية', 'الفني', 'التكلفة', 'الحالة', ''], rows, m => `<tr data-s="${m.status}"><td>${m.date}</td><td>${esc(m.property_name)}</td><td>${esc(m.issue)}</td><td>${badge(m.priority)}</td><td>${esc(m.vendor)}</td><td class="num">${money(m.cost)}</td><td>${badge(m.status)}${m.closed_at ? `<div class="small muted">${m.closed_at}</div>` : ''}</td><td class="actions">${m.status !== 'مغلق' ? `<button class="btn sm success" onclick="closeMaint(${m.id})">إغلاق + ترحيل التكلفة</button> ` : ''}<button class="btn sm" onclick="editMaintenance(${m.id})">تعديل</button> <button class="btn sm danger" onclick="del('maintenance',${m.id},'البلاغ')">حذف</button></td></tr>`)}</div>`;
};
async function editMaintenance(id, propertyId) { const m = id ? await api(`maintenance/${id}`) : (propertyId ? { property_id: propertyId } : null); openModal(id ? 'تعديل بلاغ' : 'بلاغ صيانة', MAINT_FIELDS(), m, async o => { await api(id ? `maintenance/${id}` : 'maintenance', id ? 'PUT' : 'POST', o); toast('تم الحفظ'); go(view); }); }
async function closeMaint(id) { if (!confirm('إغلاق البلاغ وترحيل التكلفة إلى المصروفات؟')) return; await api(`maintenance/${id}/close`, 'POST', {}); toast('تم الإغلاق'); go(view); }

/* ---------- التمويل ---------- */
const LOAN_FIELDS = () => [{ name: 'bank', label: 'البنك / جهة التمويل', required: true }, { name: 'property_id', label: 'الوحدة المرتبطة', type: 'select', options: allPropOptions, placeholder: 'على المحفظة' }, { name: 'principal', label: 'أصل التمويل', type: 'number', required: true }, { name: 'balance', label: 'الرصيد المتبقي', type: 'number', required: true }, { name: 'payment', label: 'القسط الشهري', type: 'number', required: true }, { name: 'rate', label: 'نسبة الفائدة/المرابحة %', type: 'number', step: '0.01' }, { name: 'start_date', label: 'تاريخ البداية', type: 'date' }, { name: 'months', label: 'المدة (أشهر)', type: 'number' }, { name: 'note', label: 'ملاحظة', type: 'textarea', full: true }];
VIEWS.loans = async () => {
  const rows = await api('loans'); const bal = rows.reduce((a, x) => a + +x.balance, 0), pay = rows.reduce((a, x) => a + +x.payment, 0);
  $('#view').innerHTML = `<div class="grid">${kpi('الدين القائم', money(bal), 'bad')}${kpi('الأقساط الشهرية', money(pay))}${kpi('الأقساط السنوية', money(pay * 12))}${kpi('متوسط المتبقي', rows.length && pay ? Math.round(bal / pay) + ' شهر' : '—')}</div><div class="toolbar" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" onclick="editLoan()">+ تمويل</button></div>${table(['البنك', 'الوحدة', 'الأصل', 'الرصيد', 'المسدد', 'القسط', 'النسبة', 'البداية', ''], rows, l => `<tr><td><b>${esc(l.bank)}</b></td><td>${esc(l.property_name || 'المحفظة')}</td><td class="num">${money(l.principal)}</td><td class="num neg">${money(l.balance)}</td><td><div class="bar"><i style="width:${l.principal ? l.paid_total / l.principal * 100 : 0}%"></i></div><span class="small muted">${money(l.paid_total)}</span></td><td class="num">${money(l.payment)}</td><td class="num">${l.rate}%</td><td>${l.start_date || '—'}</td><td class="actions"><button class="btn sm success" onclick="payLoan(${l.id},${l.payment})">تسجيل قسط</button> <button class="btn sm" onclick="editLoan(${l.id})">تعديل</button> <button class="btn sm danger" onclick="del('loans',${l.id},'التمويل')">حذف</button></td></tr>`)}`;
};
async function editLoan(id) { const l = id ? await api(`loans/${id}`) : null; openModal(id ? 'تعديل تمويل' : 'تمويل جديد', LOAN_FIELDS(), l, async o => { await api(id ? `loans/${id}` : 'loans', id ? 'PUT' : 'POST', o); toast('تم الحفظ'); go(view); }); }
function payLoan(id, amount) { openModal('تسجيل قسط', [{ name: 'date', label: 'التاريخ', type: 'date', def: today }, { name: 'amount', label: 'المبلغ', type: 'number', def: amount, required: true }, { name: 'note', label: 'ملاحظة', full: true }], null, async o => { await api('loan_payments', 'POST', { ...o, loan_id: id }); toast('تم تسجيل القسط'); go(view); }); }

/* ---------- التوسع والاستبدال ---------- */
const TX_FIELDS = () => [{ name: 'type', label: 'النوع', type: 'select', options: ['بيع', 'شراء'] }, { name: 'property_id', label: 'الوحدة', type: 'select', options: allPropOptions, placeholder: 'اختر (أو أضف الوحدة أولًا)' }, { name: 'date', label: 'التاريخ', type: 'date', def: today, required: true }, { name: 'amount', label: 'المبلغ', type: 'number', required: true }, { name: 'fees', label: 'الرسوم والعمولات', type: 'number' }, { name: 'counterparty', label: 'الطرف الآخر' }, { name: 'note', label: 'ملاحظة', type: 'textarea', full: true }];
VIEWS.growth = async () => {
  const [s, tx] = await Promise.all([api('stats'), api('transactions')]);
  const sold = cache.properties.filter(p => p.status === 'مباعة');
  $('#view').innerHTML = `<div class="grid">${kpi('النقد المتاح', money(s.cash), 'good')}${kpi('قيمة المحفظة', money(s.value_total))}${kpi('حقوق الملكية', money(s.equity))}${kpi('مرشحون للاستبدال', s.replacement.length, s.replacement.length ? 'warn' : 'good')}${kpi('قدرة شرائية تقريبية (نقد + تمويل 70%)', money(s.cash / 0.3), '', 'بافتراض دفعة أولى 30%')}</div>
  <div class="grid2" style="margin-top:14px"><div class="card"><div class="toolbar"><h3 style="margin:0">مرشحون للاستبدال</h3><span class="spacer"></span><button class="btn sm" onclick="go('settings')">تعديل القاعدة</button></div><div class="small muted" style="margin-bottom:8px">القاعدة: عائد إجمالي أقل من ${cache.settings.replacement_yield}% أو مصروف شهري ≥ ${money(cache.settings.expense_limit)} أو ≥ 4 بلاغات صيانة خلال سنة.</div>${s.replacement.length ? s.replacement.map(r => `<div class="alert warn"><div style="flex:1"><b>${esc(r.name)}</b> — عائد ${r.yield}%<small>${r.reasons.join(' · ')}</small><small>قيمة حالية ${money(r.current_value)} — لو بيعت وأعيد توجيهها بعائد ${cache.settings.replacement_yield}% → إيجار ${money(r.current_value * cache.settings.replacement_yield / 100 / 12)}/شهر</small></div><button class="btn sm" onclick="markForSale(${r.id})">للبيع</button></div>`).join('') : '<div class="empty">لا شيء</div>'}</div>
  <div class="card"><h3>محاكاة «ماذا لو»</h3><div class="form"><label>سعر الوحدة<input id="simPrice" type="number" value="450000"></label><label>الإيجار الشهري المتوقع<input id="simRent" type="number" value="2200"></label><label>نسبة التمويل %<input id="simLtv" type="number" value="70"></label><label>الفائدة %<input id="simRate" type="number" value="5" step="0.1"></label><label>المدة (سنة)<input id="simYears" type="number" value="15"></label><label>مصروف شهري<input id="simExp" type="number" value="250"></label></div><button class="btn primary" style="margin-top:10px" onclick="simulate()">احسب</button><div id="simOut" style="margin-top:10px"></div></div></div>
  <div class="card" style="margin-top:14px"><div class="toolbar"><h3 style="margin:0">سجل البيع والشراء</h3><span class="spacer"></span><button class="btn primary" onclick="editTx()">+ تسجيل بيع/شراء</button></div>${table(['التاريخ', 'النوع', 'الوحدة', 'المبلغ', 'الرسوم', 'الطرف الآخر', 'ملاحظة', ''], tx, t => `<tr><td>${t.date}</td><td>${badge(t.type)}</td><td>${esc(t.property_name)}</td><td class="num ${t.type === 'بيع' ? 'pos' : 'neg'}">${money(t.amount)}</td><td class="num">${money(t.fees)}</td><td>${esc(t.counterparty)}</td><td>${esc(t.note)}</td><td class="actions"><button class="btn sm danger" onclick="del('transactions',${t.id},'العملية')">حذف</button></td></tr>`)}</div>
  ${sold.length ? `<div class="card" style="margin-top:14px"><h3>وحدات مباعة (${sold.length})</h3>${table(['الوحدة', 'الشراء', 'البيع', 'الربح'], sold, p => `<tr><td>${esc(p.name)}</td><td class="num">${money(p.purchase_price)}</td><td class="num">${money(p.current_value)}</td><td class="num ${p.current_value - p.purchase_price >= 0 ? 'pos' : 'neg'}">${money(p.current_value - p.purchase_price)}</td></tr>`)}</div>` : ''}`;
  simulate();
};
function simulate() { const P = +$('#simPrice').value, R = +$('#simRent').value, L = +$('#simLtv').value / 100, r = +$('#simRate').value / 100 / 12, n = +$('#simYears').value * 12, E = +$('#simExp').value; const loan = P * L, pay = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n; const net = R - E - pay, down = P - loan; $('#simOut').innerHTML = `<div class="kv"><span>الدفعة الأولى</span><b>${money(down)}</b></div><div class="kv"><span>القسط الشهري</span><b>${money(pay)}</b></div><div class="kv"><span>العائد الإجمالي</span><b>${(R * 12 / P * 100).toFixed(2)}%</b></div><div class="kv"><span>صافي شهري بعد القسط والمصروف</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b></div><div class="kv"><span>العائد النقدي على الدفعة الأولى</span><b class="${net >= 0 ? 'pos' : 'neg'}">${down ? (net * 12 / down * 100).toFixed(2) : 0}%</b></div><div class="kv"><span>النقد بعد الشراء</span><b>${money((+cache.settings.cash || 0) - down)}</b></div>`; }
async function markForSale(id) { await api(`properties/${id}`, 'PUT', { status: 'للبيع' }); toast('تم وضعها للبيع'); go(view); }
function editTx() { openModal('تسجيل بيع / شراء', TX_FIELDS(), null, async o => { await api('transactions', 'POST', o); toast('تم التسجيل وتحديث النقد وحالة الوحدة'); go(view); }); }

/* ---------- التقارير ---------- */
VIEWS.reports = async () => {
  $('#view').innerHTML = `<div class="toolbar"><input type="date" id="rfrom" value="${new Date().getFullYear()}-01-01"><input type="date" id="rto" value="${today}"><span class="spacer"></span><button class="btn" onclick="window.print()">🖨️ طباعة</button><button class="btn" onclick="exportCsv()">⬇️ CSV</button></div><div class="tabs" id="rtabs">${[['pnl', 'ربح وخسارة لكل وحدة'], ['arrears', 'كشف المتأخرات'], ['expiring', 'العقود والانتهاء'], ['expenses', 'تحليل المصروفات'], ['cashflow', 'التدفق النقدي المتوقع'], ['zakat', 'تقدير الزكاة'], ['audit', 'سجل العمليات']].map(([k, t], i) => `<button class="${i ? '' : 'active'}" onclick="runReport('${k}',this)">${t}</button>`).join('')}</div><div id="rout"></div>`;
  runReport('pnl', $('#rtabs button'));
};
let lastReportRows = [];
async function runReport(kind, btn) {
  if (btn) btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  const q = `&from=${$('#rfrom').value}&to=${$('#rto').value}`; const out = $('#rout'); out.innerHTML = '<div class="empty">…</div>';
  if (kind === 'audit') { const rows = await api('audit'); lastReportRows = rows; out.innerHTML = table(['الوقت', 'الإجراء', 'الكيان', 'المعرف', 'ملخص'], rows, r => `<tr><td>${r.at}</td><td>${badge(r.action)}</td><td>${r.entity}</td><td>${r.entity_id}</td><td>${esc(r.summary)}</td></tr>`); return; }
  const r = await api(`reports/${kind}${q}`);
  if (kind === 'pnl') { lastReportRows = r.rows; out.innerHTML = `<div class="grid">${kpi('إجمالي الدخل', money(r.total_income), 'good')}${kpi('إجمالي المصروفات', money(r.total_expenses), 'bad')}${kpi('الصافي', money(r.total_income - r.total_expenses))}</div><div style="margin-top:12px">${table(['الوحدة', 'الحالة', 'الدخل', 'المصروفات', 'الصافي', 'ROI على الشراء'], r.rows, x => `<tr><td><b>${esc(x.name)}</b></td><td>${badge(x.status)}</td><td class="num pos">${money(x.income)}</td><td class="num neg">${money(x.expenses)}</td><td class="num ${x.net >= 0 ? 'pos' : 'neg'}">${money(x.net)}</td><td class="num">${x.roi}%</td></tr>`)}</div>`; }
  if (kind === 'arrears') { lastReportRows = r.rows; out.innerHTML = `<div class="grid">${kpi('إجمالي المتأخرات', money(r.rows.reduce((a, x) => a + +x.remaining, 0)), 'bad')}${kpi('عدد الاستحقاقات', r.rows.length)}</div><div style="margin-top:12px">${table(['الاستحقاق', 'الوحدة', 'المستأجر', 'الجوال', 'المبلغ', 'المدفوع', 'الباقي', 'أيام التأخر'], r.rows, x => `<tr><td>${x.due_date}</td><td>${esc(x.property_name)}</td><td>${esc(x.tenant_name)}</td><td dir="ltr" style="text-align:right">${esc(x.phone)}</td><td class="num">${money(x.amount)}</td><td class="num">${money(x.paid)}</td><td class="num neg">${money(x.remaining)}</td><td class="num">${Math.floor((Date.now() - new Date(x.due_date)) / 864e5)}</td></tr>`, 'لا متأخرات')}</div>`; }
  if (kind === 'expiring') { lastReportRows = r.rows; out.innerHTML = table(['الوحدة', 'المستأجر', 'الجوال', 'البداية', 'النهاية', 'باقي (يوم)', 'الإيجار', 'إيجار #'], r.rows, x => { const d = Math.floor((new Date(x.end_date) - Date.now()) / 864e5); return `<tr><td>${esc(x.property_name)}</td><td>${esc(x.tenant_name)}</td><td dir="ltr" style="text-align:right">${esc(x.phone)}</td><td>${x.start_date}</td><td>${x.end_date}</td><td class="num ${d < 60 ? 'neg' : ''}">${d}</td><td class="num">${money(x.rent)}</td><td>${esc(x.ejar_no)}</td></tr>`; }); }
  if (kind === 'expenses') { lastReportRows = r.by_category; out.innerHTML = `<div class="grid2"><div class="card"><h3>حسب التصنيف</h3>${table(['التصنيف', 'العدد', 'الإجمالي'], r.by_category, x => `<tr><td>${badge(x.category)}</td><td>${x.n}</td><td class="num">${money(x.total)}</td></tr>`)}</div><div class="card"><h3>حسب الوحدة</h3>${table(['الوحدة', 'الإجمالي'], r.by_property, x => `<tr><td>${esc(x.name)}</td><td class="num">${money(x.total)}</td></tr>`)}</div></div>`; }
  if (kind === 'cashflow') { lastReportRows = r.rows; out.innerHTML = table(['الشهر', 'دخل متوقع (استحقاقات)', 'أقساط', 'مصروفات تقديرية', 'صافي متوقع'], r.rows, x => { const n = x.expected_in - x.loan_out - x.expense_out; return `<tr><td>${x.month}</td><td class="num pos">${money(x.expected_in)}</td><td class="num neg">${money(x.loan_out)}</td><td class="num neg">${money(x.expense_out)}</td><td class="num ${n >= 0 ? 'pos' : 'neg'}"><b>${money(n)}</b></td></tr>`; }); }
  if (kind === 'zakat') { lastReportRows = [r]; out.innerHTML = `<div class="grid">${kpi('النقد', money(r.cash))}${kpi('المستحقات', money(r.receivables))}${kpi('الوعاء', money(r.base))}${kpi('الزكاة التقديرية (2.5%)', money(r.zakat), 'warn')}</div><div class="card" style="margin-top:12px">${esc(r.note)}</div>`; }
}
function exportCsv() { if (!lastReportRows.length) return toast('لا بيانات'); const keys = Object.keys(lastReportRows[0]); const csv = '﻿' + [keys.join(','), ...lastReportRows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'report.csv'; a.click(); }

/* ---------- المساعد الذكي ---------- */
VIEWS.assistant = async () => {
  $('#view').innerHTML = `<div class="chat"><div class="chat-log" id="chatLog">${chat.length ? chat.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}</div>`).join('') : '<div class="msg bot">مرحبًا! أنا مساعدك العقاري. أعرف محفظتك بالكامل — اسألني عن المتأخرات، الشاغر، أضعف الوحدات، العقود، التمويل، التدفق النقدي، أو اطلب محاكاة أو صياغة رسالة.</div>'}</div><div class="chips">${['ملخص المحفظة', 'ما المتأخرات؟', 'الوحدات الشاغرة', 'أضعف الوحدات وماذا أستبدل؟', 'العقود التي تنتهي قريبًا', 'وضع التمويل', 'التدفق النقدي', 'ماذا لو اشتريت وحدة بـ 500000؟', 'اكتب تذكير سداد', 'تقدير الزكاة'].map(c => `<button onclick="ask('${c}')">${c}</button>`).join('')}</div><div class="chat-in"><input id="chatIn" placeholder="اكتب سؤالك…" onkeydown="if(event.key==='Enter')ask()"><button class="btn primary" onclick="ask()">إرسال</button></div></div>`;
  $('#chatLog').scrollTop = 1e9;
};
async function ask(q) {
  q = q || $('#chatIn').value.trim(); if (!q) return; $('#chatIn').value = '';
  chat.push({ role: 'user', content: q }); const log = $('#chatLog'); log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div><div class="msg bot" id="typing">…</div>`); log.scrollTop = 1e9;
  try { const r = await api('assistant', 'POST', { q, history: chat.slice(-8) }); chat.push({ role: 'assistant', content: r.answer }); $('#typing').outerHTML = `<div class="msg bot">${esc(r.answer)}${r.mode === 'local' ? '' : '<div class="small muted">☁️ Claude</div>'}</div>`; } catch (e) { $('#typing').textContent = 'تعذّر الرد.'; }
  log.scrollTop = 1e9;
}

/* ---------- الإعدادات ---------- */
VIEWS.settings = async () => {
  const s = cache.settings, h = await api('health');
  $('#view').innerHTML = `<div class="grid2"><div class="card" ${canR('settings') ? '' : 'style="display:none"'}><h3>الإعدادات العامة</h3><form id="setForm" onsubmit="return false"><div class="form">${field({ name: 'owner_name', label: 'اسم المالك / الجهة' }, s.owner_name)}${field({ name: 'cash', label: 'النقد المتاح (ر.س)', type: 'number' }, s.cash)}${field({ name: 'replacement_yield', label: 'حد العائد للاستبدال %', type: 'number', step: '0.1' }, s.replacement_yield)}${field({ name: 'expense_limit', label: 'حد المصروف الشهري للاستبدال', type: 'number' }, s.expense_limit)}${field({ name: 'late_fee_pct', label: 'غرامة التأخير % (للعرض)', type: 'number', step: '0.1' }, s.late_fee_pct)}</div><button class="btn primary" style="margin-top:10px" onclick="saveSettings()" ${canW('settings') ? '' : 'disabled'}>حفظ</button></form></div>
  <div class="card" ${canW('backup') ? '' : 'style="display:none"'}><h3>البيانات</h3><p class="small muted">قاعدة البيانات: <b>${h.driver === 'mysql' ? 'MySQL' : 'SQLite (ملف محلي على الخادم)'}</b> ${user.role === 'owner' ? `<button class="btn sm" onclick="connectMysql()">${h.driver === 'mysql' ? 'تغيير الاتصال' : 'ربط MySQL'}</button>` : ''}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="backup()">⬇️ نسخة احتياطية JSON</button><button class="btn" onclick="$('#restoreFile').click()">⬆️ استعادة نسخة</button><input id="restoreFile" type="file" accept="application/json" style="display:none" onchange="restore(event)"><button class="btn" onclick="$('#v2File').click()">📦 استيراد من النسخة V2 (localStorage JSON)</button><input id="v2File" type="file" accept="application/json" style="display:none" onchange="importV2(event)"></div><hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="seed()">🧪 تحميل بيانات تجريبية</button><button class="btn danger" onclick="wipe()">🗑️ مسح كل البيانات</button></div></div></div>
  <div class="card" style="margin-top:14px"><h3>حسابي</h3><form id="profForm" onsubmit="return false"><div class="form">${field({ name: 'name', label: 'الاسم' }, user.name)}${field({ name: 'phone', label: 'الجوال' }, user.phone)}<label>البريد<input value="${esc(user.email)}" disabled dir="ltr"></label><label>الدور<input value="${ROLE[user.role] || user.role}" disabled></label>${field({ name: 'password', label: 'كلمة المرور الحالية (لتغييرها فقط)', type: 'password' })}${field({ name: 'new_password', label: 'كلمة المرور الجديدة', type: 'password' })}</div><button class="btn primary" style="margin-top:10px" onclick="saveProfile()">حفظ</button> ${user.role === 'owner' ? `<button class="btn" onclick="onb.step=0;go('onboarding')">إعادة معالج الإعداد</button>` : ''}</form></div>
  <div class="card" style="margin-top:14px"><h3>المساعد الذكي السحابي (اختياري)</h3><p class="small">المساعد يعمل الآن محليًا بقواعد ذكية دون إنترنت. لتفعيل الذكاء الاصطناعي الكامل (Claude)، ضع مفتاح Anthropic API في الملف <code>api/config.php</code> في الحقل <code>anthropic_key</code>، أو عرّف متغير البيئة <code>ANTHROPIC_API_KEY</code>. لا يُخزَّن المفتاح في المتصفح.</p></div>
  <div class="card" style="margin-top:14px"><h3>الربط مع منصة إيجار</h3><p class="small">حاليًا: أدخل رقم عقد إيجار في كل عقد لربطه مرجعيًا. الربط البرمجي الكامل يتطلب موافقة إيجار على التكامل (انظر الخطة). النظام مهيأ لإضافة Ejar adapter دون تغيير البنية.</p></div>`;
};
async function saveProfile() { const o = Object.fromEntries(new FormData($('#profForm')).entries()); const r = await api('auth/profile', 'POST', o); user = r.user; $('#userName').textContent = user.name; toast('تم الحفظ'); }
async function connectMysql() { const cur = await api('setup'); openModal('ربط قاعدة بيانات MySQL', [{ name: 'host', label: 'الخادم (Host)', def: 'localhost' }, { name: 'dbname', label: 'اسم القاعدة', required: true }, { name: 'user', label: 'اسم المستخدم', required: true }, { name: 'pass', label: 'كلمة المرور', type: 'password' }, { name: 'copy_data', label: 'نقل البيانات الحالية إلى القاعدة الجديدة؟', type: 'select', options: ['نعم', 'لا'], full: true }], { host: cur.driver === 'mysql' ? cur.host : 'localhost', dbname: cur.driver === 'mysql' ? cur.dbname : '', user: cur.driver === 'mysql' ? cur.user : '' }, async o => { const r = await api('setup', 'POST', o); toast('تم الربط بقاعدة MySQL'); if (r.relogin) location.href = 'login.html'; else location.reload(); }); }
async function disableDemo() { if (!confirm('حذف كل الحسابات التجريبية وإخفاؤها من صفحة الدخول؟')) return; await api('users/disable_demo', 'POST', {}); toast('تم تعطيل الحسابات التجريبية'); go('users'); }
async function saveSettings() { const o = Object.fromEntries(new FormData($('#setForm')).entries()); await api('settings', 'POST', o); toast('تم الحفظ'); go(view); }
async function backup() { const d = await api('backup'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = `rp-backup-${today}.json`; a.click(); }
function restore(e) { const f = e.target.files[0]; if (!f) return; if (!confirm('ستُستبدل كل البيانات الحالية بالنسخة. متابعة؟')) return; const r = new FileReader(); r.onload = async () => { try { await api('backup', 'POST', JSON.parse(r.result)); toast('تمت الاستعادة'); go('dashboard'); } catch (_) { toast('ملف غير صالح'); } }; r.readAsText(f); }
function importV2(e) { const f = e.target.files[0]; if (!f) return; if (!confirm('سيتم استيراد بيانات V2 واستبدال الحالية. متابعة؟')) return; const r = new FileReader(); r.onload = async () => { try { await api('migrate_v2', 'POST', JSON.parse(r.result)); toast('تم الاستيراد'); go('dashboard'); } catch (_) { toast('ملف غير صالح'); } }; r.readAsText(f); }
async function seed() { if (!confirm('سيتم مسح البيانات الحالية وتحميل بيانات تجريبية. متابعة؟')) return; await api('seed', 'POST', {}); toast('تم تحميل البيانات التجريبية'); go('dashboard'); }
async function wipe() { if (!confirm('مسح كل البيانات نهائيًا؟') || !confirm('تأكيد أخير: لا يمكن التراجع.')) return; await api('wipe', 'POST', {}); toast('تم المسح'); go('dashboard'); }


/* ---------- بوابة المستأجر ---------- */
VIEWS.portal = async () => {
  let d; try { d = await api('portal'); } catch (e) { $('#view').innerHTML = `<div class="card"><h3>حسابك غير مرتبط بعد</h3><p>لم تربط الإدارة حسابك بسجل مستأجر. تواصل مع ${esc(cache.settings.owner_name || 'الإدارة')}.</p></div>`; return; }
  const c = d.contract, dl = c ? Math.floor((new Date(c.end_date) - Date.now()) / 864e5) : null;
  $('#view').innerHTML = `
  <div class="card" style="background:linear-gradient(135deg,#4a0d1b,#8b1a2f);color:#fff"><h2 style="margin:0 0 4px">أهلًا ${esc(d.tenant.name)} 👋</h2><div style="opacity:.85">${c ? `وحدتك: <b>${esc(c.property_name)}</b> — ${esc(c.city)} ${esc(c.district)} · عقد ${esc(c.frequency)} ينتهي ${c.end_date} (${dl} يوم)` : 'لا يوجد عقد ساري حاليًا'}</div></div>
  <div class="grid" style="margin-top:14px">${kpi('الإيجار الشهري', c ? money(c.rent) : '—')}${kpi('الاستحقاق القادم', d.next ? money(d.next.remaining) : '—', d.next && d.next.status === 'متأخر' ? 'bad' : '', d.next ? 'بتاريخ ' + d.next.due_date + ' · ' + d.next.status : 'لا مستحقات')}${kpi('المتأخرات', money(d.overdue), d.overdue > 0 ? 'bad' : 'good')}${kpi('إجمالي ما دفعته', money(d.total_paid), 'good')}</div>
  ${d.overdue > 0 ? `<div class="notice" style="background:#fde3e3;color:#9c2222;margin-top:12px">⚠️ لديك متأخرات بقيمة <b>${money(d.overdue)}</b>. يرجى السداد والتواصل مع ${esc(d.owner_name)} لإرسال الإيصال.</div>` : ''}
  <div class="grid2" style="margin-top:14px">
    <div class="card"><h3>استحقاقاتي</h3>${table(['الاستحقاق', 'المبلغ', 'المدفوع', 'الباقي', 'الحالة'], d.installments, i => `<tr><td>${i.due_date}</td><td class="num">${money(i.amount)}</td><td class="num">${money(i.paid)}</td><td class="num ${i.remaining > 0 ? 'neg' : ''}">${money(i.remaining)}</td><td>${badge(i.status)}</td></tr>`)}</div>
    <div class="card"><h3>دفعاتي</h3>${table(['التاريخ', 'المبلغ', 'الطريقة', 'المرجع'], d.collections, x => `<tr><td>${x.date}</td><td class="num pos">${money(x.amount)}</td><td>${esc(x.method)}</td><td>${esc(x.ref_no)}</td></tr>`, 'لا دفعات مسجلة')}</div>
  </div>
  <div class="grid2" style="margin-top:14px">
    <div class="card"><div class="toolbar"><h3 style="margin:0">بلاغات الصيانة</h3><span class="spacer"></span><button class="btn primary" onclick="portalMaint()">+ بلاغ جديد</button></div>${table(['التاريخ', 'البلاغ', 'الأولوية', 'الحالة'], d.maintenance, m => `<tr><td>${m.date}</td><td>${esc(m.issue)}</td><td>${badge(m.priority)}</td><td>${badge(m.status)}${m.closed_at ? `<div class="small muted">${m.closed_at}</div>` : ''}</td></tr>`, 'لا بلاغات')}</div>
    <div class="card"><h3>عقدي</h3>${c ? `<div class="kv"><span>الوحدة</span><b>${esc(c.property_name)} (${esc(c.type)})</b></div><div class="kv"><span>العنوان</span><b>${esc(c.city)} — ${esc(c.district)} ${esc(c.address)}</b></div><div class="kv"><span>المدة</span><b>${c.start_date} → ${c.end_date}</b></div><div class="kv"><span>الإيجار</span><b>${money(c.rent)} / شهر — ${esc(c.frequency)}</b></div><div class="kv"><span>التأمين</span><b>${money(c.deposit)}</b></div><div class="kv"><span>رقم عقد إيجار</span><b>${esc(c.ejar_no) || '—'}</b></div><div class="kv"><span>المؤجر</span><b>${esc(d.owner_name)}</b></div>` : '<div class="empty">لا يوجد عقد ساري</div>'}${d.contracts.length > 1 ? `<p class="small muted">عقود سابقة: ${d.contracts.length - 1}</p>` : ''}</div>
  </div>`;
};
function portalMaint() { openModal('بلاغ صيانة جديد', [{ name: 'issue', label: 'ما المشكلة؟', required: true, full: true }, { name: 'priority', label: 'الأولوية', type: 'select', options: ['متوسطة', 'عالية', 'منخفضة'] }, { name: 'note', label: 'تفاصيل إضافية', type: 'textarea', full: true }], null, async o => { await api('portal/maintenance', 'POST', o); toast('تم إرسال البلاغ للإدارة'); go('portal'); }); }

/* ---------- المستخدمون ---------- */
const USER_FIELDS = (isNew) => [{ name: 'name', label: 'الاسم', required: true }, { name: 'email', label: 'البريد الإلكتروني', type: 'email', required: isNew }, { name: 'phone', label: 'الجوال' }, { name: 'role', label: 'الدور', type: 'select', options: Object.entries(ROLE).map(([v, t]) => ({ v, t })) }, { name: 'tenant_id', label: 'ربط بسجل مستأجر (لدور المستأجر)', type: 'select', options: tenantOptions, placeholder: '— غير مرتبط —' }, { name: 'password', label: isNew ? 'كلمة المرور' : 'كلمة مرور جديدة (اتركها فارغة للإبقاء)', type: 'password', required: isNew }];
const ROLE_DESC = { owner: 'كل الصلاحيات: البيانات، الإعدادات، المستخدمون، النسخ الاحتياطي.', manager: 'إدارة الوحدات والمستأجرين والعقود والتحصيل والمصروفات والصيانة. يرى التمويل والتقارير دون تعديل.', accountant: 'التحصيل والمصروفات والتمويل والبيع/الشراء والتقارير. يرى الوحدات والعقود دون تعديل.', maintenance: 'بلاغات الصيانة فقط، مع عرض الوحدات والمستأجرين.', tenant: 'بوابة خاصة: عقده، استحقاقاته، دفعاته، وتقديم بلاغات صيانة لوحدته.' };
VIEWS.users = async () => {
  const rows = await api('users');
  $('#view').innerHTML = `<div class="grid">${Object.entries(ROLE).map(([k, v]) => kpi(v, rows.filter(r => r.role === k).length, '', ROLE_DESC[k])).join('')}</div>
  <div class="toolbar" style="margin-top:14px">${rows.some(r => r.email.endsWith('@demo.sa')) ? `<span class="muted small">كلمة مرور الحسابات التجريبية: <code>123456</code></span>${canW('users') ? ' <button class="btn sm danger" onclick="disableDemo()">تعطيل الحسابات التجريبية</button>' : ''}` : ''}<span class="spacer"></span>${canW('users') ? '<button class="btn primary" onclick="editUser()">+ مستخدم</button>' : ''}</div>
  ${table(['الاسم', 'البريد', 'الدور', 'مرتبط بـ', 'الحالة', 'آخر دخول', ''], rows, u => `<tr><td><b>${esc(u.name)}</b>${u.id === user.id ? ' <span class="badge info">أنت</span>' : ''}</td><td dir="ltr" style="text-align:right">${esc(u.email)}</td><td>${badge(u.role_label)}</td><td>${u.tenant_name ? esc(u.tenant_name) : '—'}</td><td>${+u.active ? badge('نشط') : badge('موقوف')}</td><td class="small muted">${u.last_login || '—'}</td><td class="actions">${canW('users') ? `<button class="btn sm" onclick='editUser(${JSON.stringify(u)})'>تعديل</button> ${u.id !== user.id ? `<button class="btn sm" onclick="toggleUser(${u.id},${+u.active ? 0 : 1})">${+u.active ? 'إيقاف' : 'تفعيل'}</button> <button class="btn sm danger" onclick="del('users',${u.id},'المستخدم')">حذف</button>` : ''}` : ''}</td></tr>`)}`;
};
function editUser(u) { openModal(u ? 'تعديل مستخدم' : 'مستخدم جديد', USER_FIELDS(!u), u, async o => { if (!o.password) delete o.password; await api(u ? `users/${u.id}` : 'users', u ? 'PUT' : 'POST', o); toast('تم الحفظ'); go('users'); }); }
async function toggleUser(id, active) { await api(`users/${id}`, 'PUT', { active }); go('users'); }

/* ---------- معالج الإعداد الأول ---------- */
let user = null, onb = { step: 0 };
const ROLE = { owner: 'المالك', manager: 'مدير عقارات', accountant: 'محاسب', maintenance: 'مشرف صيانة', tenant: 'مستأجر' };
async function logout() { await api('auth/logout', 'POST', {}); location.href = 'login.html'; }
function onbWrap(step, inner) { return `<div class="onb"><div class="prog">${[0, 1, 2, 3].map(i => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div><div class="card">${inner}</div></div>`; }
VIEWS.onboarding = async () => {
  $('#viewTitle').textContent = 'مرحبًا بك';
  const s = onb.step, v = $('#view');
  if (s === 0) v.innerHTML = onbWrap(0, `<h2>أهلًا ${esc(user.name)} 👋</h2><p class="lead">دعنا نجهّز محفظتك في 3 خطوات قصيرة. كيف تحب أن تبدأ؟</p><div class="choice">
    <button onclick="onbStart('manual')"><div class="ic">🏢</div><b>أدخل بياناتي</b><small>أضف أول وحدة الآن وابنِ محفظتك خطوة بخطوة</small></button>
    <button onclick="onbStart('demo')"><div class="ic">🧪</div><b>جرّب ببيانات تجريبية</b><small>24 وحدة وعقود ومتأخرات جاهزة لتستكشف النظام</small></button>
    <button onclick="onbStart('import')"><div class="ic">📦</div><b>استورد بياناتي</b><small>من نسخة احتياطية JSON أو من النسخة القديمة V2</small></button></div>`);
  if (s === 1) v.innerHTML = onbWrap(1, `<h2>بيانات المحفظة</h2><p class="lead">معلومات أساسية تُستخدم في التقارير والسندات والحسابات.</p><form id="onbF" onsubmit="return false"><div class="form">${field({ name: 'owner_name', label: 'اسم المالك / الجهة (يظهر في السندات)' }, cache.settings.owner_name || user.name)}${field({ name: 'cash', label: 'النقد المتاح للاستثمار (ر.س)', type: 'number' }, cache.settings.cash || 0)}${field({ name: 'replacement_yield', label: 'حد العائد الأدنى المقبول % (أقل منه = مرشح للبيع)', type: 'number', step: '0.1' }, cache.settings.replacement_yield || 5)}${field({ name: 'expense_limit', label: 'حد المصروف الشهري المقبول للوحدة (ر.س)', type: 'number' }, cache.settings.expense_limit || 500)}</div></form><div style="margin-top:16px;display:flex;gap:8px"><button class="btn primary" onclick="onbSaveSettings()">التالي ←</button><button class="btn" onclick="onb.step=0;go('onboarding')">رجوع</button></div>`);
  if (s === 2) v.innerHTML = onbWrap(2, `<h2>أول وحدة في محفظتك</h2><p class="lead">يمكنك إضافة الباقي لاحقًا من صفحة «الوحدات».</p><form id="onbF" onsubmit="return false"><div class="form">${PROP_FIELDS.filter(f => ['name', 'type', 'city', 'district', 'status', 'purchase_price', 'current_value', 'expected_rent', 'monthly_expense'].includes(f.name)).map(f => field(f)).join('')}</div></form><div style="margin-top:16px;display:flex;gap:8px"><button class="btn primary" onclick="onbSaveProperty()">حفظ والتالي ←</button><button class="btn" onclick="onbFinish()">تخطّي</button></div>`);
  if (s === 3) { const n = cache.properties.length; v.innerHTML = onbWrap(3, `<h2>كل شيء جاهز ✅</h2><p class="lead">لديك الآن ${n} وحدة في المحفظة. إليك ما ننصح به بعد ذلك:</p><div class="kv"><span>1. أضف المستأجرين ثم أنشئ العقود — ستتولّد الاستحقاقات تلقائيًا</span><button class="btn sm" onclick="onbFinish('tenants')">المستأجرون</button></div><div class="kv"><span>2. سجّل التمويل إن وُجد لتظهر مؤشرات LTV وDSCR</span><button class="btn sm" onclick="onbFinish('loans')">التمويل</button></div><div class="kv"><span>3. اسأل المساعد الذكي عن محفظتك في أي وقت</span><button class="btn sm" onclick="onbFinish('assistant')">المساعد</button></div><div style="margin-top:18px"><button class="btn primary" onclick="onbFinish('dashboard')">الذهاب إلى لوحة التحكم ←</button></div>`); }
};
async function onbStart(kind) {
  if (kind === 'demo') { await api('seed', 'POST', {}); toast('تم تحميل البيانات التجريبية'); await loadRefs(); onb.step = 3; return go('onboarding'); }
  if (kind === 'import') { await onbFinish('settings'); toast('استخدم أزرار الاستعادة أو استيراد V2'); return; }
  onb.step = 1; go('onboarding');
}
async function onbSaveSettings() { const o = Object.fromEntries(new FormData($('#onbF')).entries()); await api('settings', 'POST', o); await loadRefs(); onb.step = 2; go('onboarding'); }
async function onbSaveProperty() { const o = Object.fromEntries(new FormData($('#onbF')).entries()); if (!o.name) return toast('أدخل اسم الوحدة'); await api('properties', 'POST', o); await loadRefs(); toast('تمت إضافة الوحدة'); onb.step = 3; go('onboarding'); }
async function onbFinish(target = 'dashboard') { await api('auth/onboarded', 'POST', {}); user.onboarded = 1; go(target); }

/* ---------- بدء ---------- */
(async () => {
  $('#today').textContent = today;
  try { user = await api('auth/me'); } catch (e) { return; }
  $('#userName').textContent = user.name; $('#userRole').textContent = user.role_label || ROLE[user.role] || user.role; buildNav();
  try { const h = await api('health'); $('#dbBadge').textContent = h.driver === 'mysql' ? 'MySQL' : 'SQLite'; $('#dbBadge').className = 'badge ' + (h.driver === 'mysql' ? 'good' : 'warn'); } catch (e) { $('#dbBadge').textContent = 'غير متصل'; $('#dbBadge').className = 'badge bad'; }
  if (user.role !== 'owner') return go(user.pages[0]);
  const p = await api('properties').catch(() => []);
  if (!user.onboarded && !p.length) { go('onboarding'); } else { if (!user.onboarded) api('auth/onboarded', 'POST', {}); go('dashboard'); }
})();
