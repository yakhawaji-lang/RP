<?php
// الحسابات والجلسات والأدوار والصلاحيات

const ROLES = [
  'owner' => 'المالك', 'manager' => 'مدير عقارات', 'accountant' => 'محاسب', 'maintenance' => 'مشرف صيانة', 'tenant' => 'مستأجر',
];
// الصلاحيات: المورد => rw (قراءة وكتابة) أو r (قراءة فقط)
const PERMS = [
  'owner' => ['*' => 'rw'],
  'manager' => ['properties' => 'rw', 'tenants' => 'rw', 'contracts' => 'rw', 'installments' => 'rw', 'collections' => 'rw', 'expenses' => 'rw', 'maintenance' => 'rw', 'loans' => 'r', 'loan_payments' => 'r', 'transactions' => 'r', 'stats' => 'r', 'alerts' => 'r', 'reports' => 'r', 'assistant' => 'rw', 'settings' => 'r', 'audit' => 'r', 'users' => 'r'],
  'accountant' => ['properties' => 'r', 'tenants' => 'r', 'contracts' => 'r', 'installments' => 'rw', 'collections' => 'rw', 'expenses' => 'rw', 'maintenance' => 'r', 'loans' => 'rw', 'loan_payments' => 'rw', 'transactions' => 'rw', 'stats' => 'r', 'alerts' => 'r', 'reports' => 'r', 'assistant' => 'rw', 'settings' => 'r', 'audit' => 'r', 'backup' => 'r'],
  'maintenance' => ['properties' => 'r', 'tenants' => 'r', 'maintenance' => 'rw', 'expenses' => 'r', 'alerts' => 'r', 'stats' => 'r'],
  'tenant' => ['portal' => 'rw', 'maintenance' => 'rw'],
];
// الصفحات التي يراها كل دور في الواجهة
const ROLE_PAGES = [
  'owner' => ['dashboard', 'properties', 'tenants', 'contracts', 'collections', 'expenses', 'maintenance', 'loans', 'growth', 'reports', 'assistant', 'users', 'settings'],
  'manager' => ['dashboard', 'properties', 'tenants', 'contracts', 'collections', 'expenses', 'maintenance', 'reports', 'assistant', 'settings'],
  'accountant' => ['dashboard', 'collections', 'expenses', 'loans', 'growth', 'reports', 'assistant', 'settings'],
  'maintenance' => ['maintenance', 'properties', 'settings'],
  'tenant' => ['portal', 'settings'],
];
const DEMO_USERS = [
  ['name' => 'عبدالرحمن المالك', 'email' => 'owner@demo.sa', 'role' => 'owner'],
  ['name' => 'سارة — مديرة العقارات', 'email' => 'manager@demo.sa', 'role' => 'manager'],
  ['name' => 'فهد — المحاسب', 'email' => 'accountant@demo.sa', 'role' => 'accountant'],
  ['name' => 'أبو خالد — مشرف الصيانة', 'email' => 'maintenance@demo.sa', 'role' => 'maintenance'],
  ['name' => 'أحمد العلي — مستأجر', 'email' => 'tenant@demo.sa', 'role' => 'tenant', 'tenant_id' => 1],
];
const DEMO_PASSWORD = '123456';

function demo_enabled(): bool { return setting('demo_enabled', '1') === '1'; }
function auth_install(bool $force = false): void {
  static $done = false; if ($done && !$force) return; $done = true;
  $driver = $GLOBALS['DB_DRIVER']; $pdo = db();
  $id = $driver === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  $tail = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
  $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (id $id, name VARCHAR(120) NOT NULL, email VARCHAR(160) NOT NULL UNIQUE, phone VARCHAR(30) DEFAULT '', password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) DEFAULT 'owner', tenant_id INT NULL, active TINYINT DEFAULT 1, onboarded TINYINT DEFAULT 0, last_login DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)$tail");
  // ترقية جداول قديمة
  $cols = $driver === 'mysql' ? array_column($pdo->query("SHOW COLUMNS FROM users")->fetchAll(), 'Field') : array_column($pdo->query("PRAGMA table_info(users)")->fetchAll(), 'name');
  if (!in_array('tenant_id', $cols)) $pdo->exec("ALTER TABLE users ADD COLUMN tenant_id INT NULL");
  if (!in_array('active', $cols)) $pdo->exec("ALTER TABLE users ADD COLUMN active TINYINT DEFAULT 1");
  if (users_count() === 0 && demo_enabled()) seed_demo_users();
}
function seed_demo_users(): void {
  $pdo = db(); $st = $pdo->prepare("INSERT INTO users (name, email, password_hash, role, tenant_id, onboarded) VALUES (?,?,?,?,?,1)");
  foreach (DEMO_USERS as $u) { $chk = $pdo->prepare("SELECT id FROM users WHERE email=?"); $chk->execute([$u['email']]); if ($chk->fetch()) continue; $st->execute([$u['name'], $u['email'], password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT), $u['role'], $u['tenant_id'] ?? null]); }
}
function session_boot(): void { if (session_status() === PHP_SESSION_NONE) { session_name('rp_session'); session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']); session_start(); } }
function current_user(): ?array {
  static $u = false; if ($u !== false) return $u;
  session_boot(); if (empty($_SESSION['uid'])) return $u = null;
  $st = db()->prepare("SELECT id, name, email, phone, role, tenant_id, active, onboarded, created_at, last_login FROM users WHERE id=? AND active=1"); $st->execute([$_SESSION['uid']]);
  $u = $st->fetch() ?: null; if ($u) { $u['role_label'] = ROLES[$u['role']] ?? $u['role']; $u['pages'] = ROLE_PAGES[$u['role']] ?? []; $u['perms'] = PERMS[$u['role']] ?? []; }
  return $u;
}
function users_count(): int { return (int)db()->query("SELECT COUNT(*) FROM users")->fetchColumn(); }
function can(string $res, bool $write = false): bool {
  $u = current_user(); if (!$u) return false; $p = PERMS[$u['role']] ?? [];
  $lvl = $p['*'] ?? $p[$res] ?? null; if (!$lvl) return false; return $write ? $lvl === 'rw' : true;
}
function require_can(string $res, bool $write = false): void { if (!can($res, $write)) { http_response_code(403); echo json_encode(['error' => 'ليس لديك صلاحية لهذا الإجراء', 'forbidden' => true], JSON_UNESCAPED_UNICODE); exit; } }

function auth_route(string $action, string $method, array $b): array {
  auth_install(); session_boot(); $pdo = db();
  switch ($action) {
    case 'status': return ['has_users' => users_count() > 0, 'user' => current_user(), 'demo' => demo_enabled() ? array_map(fn($d) => ['email' => $d['email'], 'role' => $d['role'], 'label' => ROLES[$d['role']], 'name' => $d['name']], DEMO_USERS) : [], 'demo_password' => demo_enabled() ? DEMO_PASSWORD : '', 'roles' => ROLES];
    case 'me': $u = current_user(); if (!$u) return ['error' => 'غير مسجل الدخول', 'auth' => false, '_code' => 401]; return $u;
    case 'register':
      $name = trim($b['name'] ?? ''); $email = mb_strtolower(trim($b['email'] ?? '')); $pass = (string)($b['password'] ?? '');
      if (mb_strlen($name) < 2) return ['error' => 'أدخل الاسم', '_code' => 400];
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['error' => 'البريد غير صالح', '_code' => 400];
      if (strlen($pass) < 6) return ['error' => 'كلمة المرور 6 أحرف على الأقل', '_code' => 400];
      $st = $pdo->prepare("SELECT id FROM users WHERE email=?"); $st->execute([$email]); if ($st->fetch()) return ['error' => 'البريد مسجل مسبقًا — سجّل الدخول', '_code' => 409];
      $hasOwner = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='owner' AND email NOT LIKE '%@demo.sa'")->fetchColumn();
      $role = $hasOwner ? 'manager' : 'owner';
      $pdo->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)")->execute([$name, $email, trim($b['phone'] ?? ''), password_hash($pass, PASSWORD_DEFAULT), $role]);
      $_SESSION['uid'] = (int)$pdo->lastInsertId(); session_regenerate_id(true);
      if ($role === 'owner') set_setting('owner_name', $name);
      audit('register', 'users', $_SESSION['uid'], $email);
      return ['ok' => true, 'user' => current_user()];
    case 'login':
      $email = mb_strtolower(trim($b['email'] ?? '')); $pass = (string)($b['password'] ?? '');
      $st = $pdo->prepare("SELECT * FROM users WHERE email=?"); $st->execute([$email]); $u = $st->fetch();
      if (!$u || !password_verify($pass, $u['password_hash'])) return ['error' => 'البريد أو كلمة المرور غير صحيحة', '_code' => 401];
      if (!(int)$u['active']) return ['error' => 'الحساب موقوف — تواصل مع المالك', '_code' => 403];
      $_SESSION['uid'] = (int)$u['id']; session_regenerate_id(true);
      $pdo->prepare("UPDATE users SET last_login=? WHERE id=?")->execute([date('Y-m-d H:i:s'), $u['id']]);
      return ['ok' => true, 'user' => current_user()];
    case 'logout': $_SESSION = []; session_destroy(); return ['ok' => true];
    case 'onboarded': $u = current_user(); if (!$u) return ['error' => 'غير مسجل', '_code' => 401]; $pdo->prepare("UPDATE users SET onboarded=1 WHERE id=?")->execute([$u['id']]); return ['ok' => true];
    case 'profile':
      $u = current_user(); if (!$u) return ['error' => 'غير مسجل', '_code' => 401];
      if (!empty($b['name'])) $pdo->prepare("UPDATE users SET name=?, phone=? WHERE id=?")->execute([trim($b['name']), trim($b['phone'] ?? ''), $u['id']]);
      if (!empty($b['new_password'])) { $st = $pdo->prepare("SELECT password_hash FROM users WHERE id=?"); $st->execute([$u['id']]); if (!password_verify((string)($b['password'] ?? ''), $st->fetchColumn())) return ['error' => 'كلمة المرور الحالية غير صحيحة', '_code' => 400]; if (strlen($b['new_password']) < 6) return ['error' => 'كلمة المرور الجديدة قصيرة', '_code' => 400]; $pdo->prepare("UPDATE users SET password_hash=? WHERE id=?")->execute([password_hash($b['new_password'], PASSWORD_DEFAULT), $u['id']]); }
      return ['ok' => true, 'user' => current_user()];
  }
  return ['error' => 'إجراء غير معروف', '_code' => 404];
}

// إدارة المستخدمين (المالك فقط للكتابة)
function users_route(?int $id, string $method, array $b, ?string $sub = null): array {
  $pdo = db();
  if ($method === 'POST' && $sub === 'disable_demo') {
    require_can('users', true); $me = current_user();
    if (str_ends_with($me['email'], '@demo.sa')) return ['error' => 'أنشئ حساب مالك حقيقي (ببريدك وكلمة مرور قوية) وسجّل الدخول به، ثم عطّل الحسابات التجريبية من هناك', '_code' => 400];
    $pdo->exec("DELETE FROM users WHERE email LIKE '%@demo.sa'"); set_setting('demo_enabled', '0');
    audit('update', 'users', 0, 'تعطيل الحسابات التجريبية'); return ['ok' => true];
  }
  if ($method === 'GET') { require_can('users'); $rows = $pdo->query("SELECT u.id, u.name, u.email, u.phone, u.role, u.tenant_id, u.active, u.last_login, u.created_at, t.name tenant_name FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id ORDER BY u.id")->fetchAll(); foreach ($rows as &$r) $r['role_label'] = ROLES[$r['role']] ?? $r['role']; return $rows; }
  require_can('users', true); $me = current_user();
  if ($method === 'POST' && !$id) {
    $email = mb_strtolower(trim($b['email'] ?? '')); if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['error' => 'البريد غير صالح', '_code' => 400];
    if (!isset(ROLES[$b['role'] ?? ''])) return ['error' => 'دور غير صالح', '_code' => 400];
    if (strlen($b['password'] ?? '') < 6) return ['error' => 'كلمة المرور 6 أحرف على الأقل', '_code' => 400];
    $st = $pdo->prepare("SELECT id FROM users WHERE email=?"); $st->execute([$email]); if ($st->fetch()) return ['error' => 'البريد مسجل مسبقًا', '_code' => 409];
    $pdo->prepare("INSERT INTO users (name, email, phone, password_hash, role, tenant_id, onboarded) VALUES (?,?,?,?,?,?,1)")->execute([trim($b['name'] ?? ''), $email, trim($b['phone'] ?? ''), password_hash($b['password'], PASSWORD_DEFAULT), $b['role'], $b['role'] === 'tenant' ? ((int)($b['tenant_id'] ?? 0) ?: null) : null]);
    $newId = (int)$pdo->lastInsertId(); audit('create', 'users', $newId, $email); return ['ok' => true, 'id' => $newId];
  }
  if (($method === 'PUT' || $method === 'POST') && $id) {
    if ($id === (int)$me['id'] && isset($b['role']) && $b['role'] !== 'owner') return ['error' => 'لا يمكنك تغيير دورك أنت', '_code' => 400];
    $sets = []; $args = [];
    foreach (['name', 'phone', 'role', 'tenant_id', 'active'] as $k) if (array_key_exists($k, $b)) { if ($k === 'role' && !isset(ROLES[$b[$k]])) continue; $sets[] = "`$k`=?"; $args[] = $k === 'tenant_id' ? ((int)$b[$k] ?: null) : $b[$k]; }
    if (!empty($b['password'])) { if (strlen($b['password']) < 6) return ['error' => 'كلمة المرور قصيرة', '_code' => 400]; $sets[] = 'password_hash=?'; $args[] = password_hash($b['password'], PASSWORD_DEFAULT); }
    if ($sets) { $args[] = $id; $pdo->prepare("UPDATE users SET " . implode(',', $sets) . " WHERE id=?")->execute($args); }
    audit('update', 'users', $id, ''); return ['ok' => true];
  }
  if ($method === 'DELETE' && $id) { if ($id === (int)$me['id']) return ['error' => 'لا يمكنك حذف حسابك', '_code' => 400]; $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]); audit('delete', 'users', $id, ''); return ['ok' => true]; }
  return ['error' => 'طلب غير صالح', '_code' => 400];
}

// بوابة المستأجر: بياناته فقط
function portal_route(string $method, array $b, ?string $sub): array {
  $u = current_user(); if (!$u || $u['role'] !== 'tenant') return ['error' => 'للمستأجرين فقط', '_code' => 403];
  $tid = (int)($u['tenant_id'] ?? 0); if (!$tid) return ['error' => 'حسابك غير مرتبط بسجل مستأجر بعد — تواصل مع الإدارة', '_code' => 400, 'unlinked' => true];
  $pdo = db(); refresh_installment_statuses();
  if ($method === 'POST' && $sub === 'maintenance') {
    $c = $pdo->query("SELECT property_id FROM contracts WHERE tenant_id=$tid AND status='ساري' ORDER BY id DESC LIMIT 1")->fetch(); if (!$c) return ['error' => 'لا يوجد عقد ساري', '_code' => 400];
    $pdo->prepare("INSERT INTO maintenance (property_id, date, issue, priority, status, note) VALUES (?,?,?,?,'مفتوح',?)")->execute([$c['property_id'], date('Y-m-d'), trim($b['issue'] ?? 'بلاغ'), in_array($b['priority'] ?? '', ['عالية', 'متوسطة', 'منخفضة']) ? $b['priority'] : 'متوسطة', 'بلاغ من المستأجر عبر البوابة: ' . trim($b['note'] ?? '')]);
    audit('create', 'maintenance', (int)$pdo->lastInsertId(), 'بلاغ مستأجر'); return ['ok' => true];
  }
  $tenant = $pdo->query("SELECT id, name, phone, email FROM tenants WHERE id=$tid")->fetch();
  $contracts = $pdo->query("SELECT c.*, p.name property_name, p.city, p.district, p.address, p.type FROM contracts c JOIN properties p ON p.id=c.property_id WHERE c.tenant_id=$tid ORDER BY c.status='ساري' DESC, c.end_date DESC")->fetchAll();
  $active = $contracts[0] ?? null; $pid = $active['property_id'] ?? 0;
  $inst = $pdo->query("SELECT i.*, (i.amount-i.paid) remaining FROM installments i JOIN contracts c ON c.id=i.contract_id WHERE c.tenant_id=$tid ORDER BY i.due_date")->fetchAll();
  $cols = $pdo->query("SELECT * FROM collections WHERE tenant_id=$tid ORDER BY date DESC")->fetchAll();
  $maint = $pid ? $pdo->query("SELECT id, date, issue, priority, status, closed_at FROM maintenance WHERE property_id=$pid ORDER BY id DESC")->fetchAll() : [];
  $overdue = array_sum(array_map(fn($i) => $i['status'] === 'متأخر' || $i['status'] === 'جزئي' ? (float)$i['remaining'] : 0, $inst));
  $next = null; foreach ($inst as $i) if ((float)$i['remaining'] > 0) { $next = $i; break; }
  return ['tenant' => $tenant, 'contract' => $active, 'contracts' => $contracts, 'installments' => $inst, 'collections' => $cols, 'maintenance' => $maint, 'overdue' => $overdue, 'next' => $next, 'total_paid' => array_sum(array_column($cols, 'amount')), 'owner_name' => setting('owner_name', 'الإدارة')];
}
