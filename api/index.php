<?php
// REST API — محفظتي العقارية
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require __DIR__ . '/db.php';
require __DIR__ . '/logic.php';
require __DIR__ . '/assistant.php';
require __DIR__ . '/auth.php';

function out($data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function body(): array { $j = json_decode(file_get_contents('php://input') ?: '[]', true); return is_array($j) ? $j : []; }

$method = $_SERVER['REQUEST_METHOD'];
$path = trim($_GET['r'] ?? '', '/');
$parts = $path === '' ? [] : explode('/', $path);
$res = $parts[0] ?? '';
$id = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;
$sub = $parts[2] ?? ($id === null ? ($parts[1] ?? null) : null);

// الحقول المسموح بها لكل كيان
$FIELDS = [
  'properties' => ['name','type','city','district','address','deed_no','area','rooms','status','purchase_price','purchase_date','current_value','expected_rent','monthly_expense','notes'],
  'tenants' => ['name','phone','national_id','email','nationality','notes'],
  'contracts' => ['property_id','tenant_id','ejar_no','start_date','end_date','rent','frequency','deposit','status','notes'],
  'installments' => ['contract_id','due_date','amount','paid','status'],
  'collections' => ['installment_id','contract_id','property_id','tenant_id','date','amount','method','ref_no','note'],
  'expenses' => ['property_id','date','category','amount','vendor','note'],
  'maintenance' => ['property_id','date','issue','priority','vendor','cost','status','closed_at','note'],
  'loans' => ['property_id','bank','principal','balance','payment','rate','start_date','months','note'],
  'loan_payments' => ['loan_id','date','amount','note'],
  'transactions' => ['property_id','type','date','amount','fees','counterparty','note'],
];

try {
  $pdo = db();
  if ($res === 'auth') { $r = auth_route($sub ?? 'status', $method, body()); $code = $r['_code'] ?? 200; unset($r['_code']); out($r, $code); }
  if ($res === '' || $res === 'health') out(['ok' => true, 'driver' => $GLOBALS['DB_DRIVER'], 'time' => date('c')]);
  auth_install(); if (!current_user()) out(['error' => 'يلزم تسجيل الدخول', 'auth' => false], 401);
  $isWrite = $method !== 'GET';
  if ($res === 'users') { $r = users_route($id, $method, body()); $code = $r['_code'] ?? 200; unset($r['_code']); out($r, $code); }
  if ($res === 'portal') { $r = portal_route($method, body(), $sub); $code = $r['_code'] ?? 200; unset($r['_code']); out($r, $code); }
  // المستأجر لا يصل إلا لبوابته وبلاغات صيانته
  if (current_user()['role'] === 'tenant' && $res !== 'maintenance') require_can('portal');
  switch ($res) {
    case 'stats': require_can('stats'); out(stats());
    case 'alerts': require_can('alerts'); out(alerts());
    case 'reports': require_can('reports'); out(report($sub ?? 'summary', $_GET));
    case 'settings':
      require_can('settings', $isWrite);
      if ($method === 'GET') out($pdo->query("SELECT k, v FROM settings")->fetchAll(PDO::FETCH_KEY_PAIR));
      foreach (body() as $k => $v) set_setting((string)$k, (string)$v);
      audit('update', 'settings', 0, 'تحديث الإعدادات');
      out(['ok' => true]);
    case 'assistant': require_can('assistant'); out(assistant(body()['q'] ?? '', body()['history'] ?? []));
    case 'seed': require_can('seed', true); seed_demo(); out(['ok' => true]);
    case 'wipe': require_can('wipe', true); wipe_all(); out(['ok' => true]);
    case 'backup':
      require_can('backup', $isWrite);
      if ($method === 'GET') { $all = []; foreach (array_keys($FIELDS) as $t) $all[$t] = $pdo->query("SELECT * FROM `$t`")->fetchAll(); $all['settings'] = $pdo->query("SELECT k,v FROM settings")->fetchAll(PDO::FETCH_KEY_PAIR); out($all); }
      restore_backup(body(), $FIELDS); out(['ok' => true]);
    case 'audit': require_can('audit'); out($pdo->query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200")->fetchAll());
    case 'migrate_v2': require_can('migrate_v2', true); migrate_v2(body()); out(['ok' => true]);
  }
  if (!isset($FIELDS[$res])) out(['error' => 'مسار غير معروف'], 404);
  require_can($res, $isWrite);
  if (current_user()['role'] === 'tenant') { // المستأجر: بلاغات وحدته فقط عبر البوابة
    if ($res !== 'maintenance' || $method !== 'GET') out(['error' => 'استخدم بوابة المستأجر'], 403);
    $_GET['property_id'] = (int)$pdo->query("SELECT property_id FROM contracts WHERE tenant_id=" . (int)current_user()['tenant_id'] . " AND status='ساري' ORDER BY id DESC LIMIT 1")->fetchColumn();
  }

  if ($method === 'GET') {
    if ($id) { $st = $pdo->prepare("SELECT * FROM `$res` WHERE id=?"); $st->execute([$id]); $row = $st->fetch(); $row ? out(enrich($res, [$row])[0]) : out(['error' => 'غير موجود'], 404); }
    out(list_entity($res, $_GET));
  }
  $data = array_intersect_key(body(), array_flip($FIELDS[$res]));
  foreach ($data as $k => $v) if ($v === '') $data[$k] = null;

  if ($method === 'POST' && $id && $sub === 'close' && $res === 'maintenance') {
    $pdo->prepare("UPDATE maintenance SET status='مغلق', closed_at=? WHERE id=?")->execute([date('Y-m-d'), $id]);
    $m = $pdo->query("SELECT * FROM maintenance WHERE id=$id")->fetch();
    if ($m && (float)$m['cost'] > 0) $pdo->prepare("INSERT INTO expenses (property_id, date, category, amount, vendor, note) VALUES (?,?,?,?,?,?)")->execute([$m['property_id'], date('Y-m-d'), 'صيانة', $m['cost'], $m['vendor'], 'إغلاق بلاغ #' . $id . ': ' . $m['issue']]);
    audit('close', 'maintenance', $id, $m['issue'] ?? ''); out(['ok' => true]);
  }
  if ($method === 'POST' && $id && $sub === 'renew' && $res === 'contracts') { $nid = renew_contract($id, body()); out(['ok' => true, 'id' => $nid]); }
  if ($method === 'POST' && $id && $sub === 'terminate' && $res === 'contracts') { terminate_contract($id); out(['ok' => true]); }

  if ($method === 'POST' && !$id) {
    $newId = insert_entity($res, $data);
    after_insert($res, $newId, $data);
    audit('create', $res, $newId, $data['name'] ?? $data['issue'] ?? ($data['amount'] ?? ''));
    out(['ok' => true, 'id' => $newId], 201);
  }
  if (($method === 'PUT' || $method === 'POST') && $id) {
    if (!$data) out(['error' => 'لا بيانات'], 400);
    $set = implode(', ', array_map(fn($k) => "`$k`=?", array_keys($data)));
    $pdo->prepare("UPDATE `$res` SET $set WHERE id=?")->execute([...array_values($data), $id]);
    after_update($res, $id, $data);
    audit('update', $res, $id, '');
    out(['ok' => true]);
  }
  if ($method === 'DELETE' && $id) { delete_entity($res, $id); audit('delete', $res, $id, ''); out(['ok' => true]); }
  out(['error' => 'طلب غير صالح'], 400);
} catch (Throwable $e) {
  out(['error' => $e->getMessage()], 500);
}
