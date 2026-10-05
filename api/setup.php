<?php
// ربط قاعدة بيانات MySQL من داخل النظام (للمالك فقط) — يكتب api/config.local.php
function setup_route(string $method, array $b, array $FIELDS): array {
  global $CFG; require_can('setup', $method !== 'GET');
  $local = __DIR__ . '/config.local.php';
  if ($method === 'GET') return ['driver' => $GLOBALS['DB_DRIVER'], 'has_local_config' => file_exists($local), 'host' => $CFG['host'], 'dbname' => $CFG['dbname'], 'user' => $CFG['user'], 'writable' => is_writable(__DIR__)];
  $host = trim($b['host'] ?? 'localhost'); $name = trim($b['dbname'] ?? ''); $user = trim($b['user'] ?? ''); $pass = (string)($b['pass'] ?? '');
  if ($name === '' || $user === '') return ['error' => 'أدخل اسم القاعدة واسم المستخدم', '_code' => 400];
  try { $new = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); }
  catch (Throwable $e) { return ['error' => 'تعذّر الاتصال: ' . $e->getMessage(), '_code' => 400]; }
  if (!is_writable(__DIR__)) return ['error' => 'مجلد api غير قابل للكتابة — أنشئ config.local.php يدويًا', '_code' => 500];
  // انسخ البيانات الحالية إلى القاعدة الجديدة إن طُلب
  $copy = ($b['copy_data'] ?? 'نعم') !== 'لا'; $dump = null;
  if ($copy) { $old = db(); $dump = ['settings' => $old->query("SELECT k,v FROM settings")->fetchAll(PDO::FETCH_KEY_PAIR), 'users' => $old->query("SELECT * FROM users")->fetchAll()]; foreach (array_keys($FIELDS) as $t) $dump[$t] = $old->query("SELECT * FROM `$t`")->fetchAll(); }
  $GLOBALS['DB_DRIVER'] = 'mysql'; $GLOBALS['PDO_OVERRIDE'] = $new; install($new, 'mysql'); auth_install(true);
  if ($dump) {
    restore_backup($dump, $FIELDS); $new->exec("DELETE FROM users");
    foreach ($dump['users'] as $u) { $cols = implode(',', array_map(fn($k) => "`$k`", array_keys($u))); $new->prepare("INSERT INTO users ($cols) VALUES (" . implode(',', array_fill(0, count($u), '?')) . ")")->execute(array_values($u)); }
  }
  $ok = file_put_contents($local, "<?php\nreturn " . var_export(['driver' => 'mysql', 'host' => $host, 'dbname' => $name, 'user' => $user, 'pass' => $pass], true) . ";\n");
  if ($ok === false) return ['error' => 'تعذّرت كتابة ملف الإعداد', '_code' => 500];
  @chmod($local, 0640); audit('update', 'settings', 0, 'ربط قاعدة MySQL');
  return ['ok' => true, 'copied' => (bool)$dump, 'relogin' => !$dump];
}
