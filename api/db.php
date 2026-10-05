<?php
// طبقة قاعدة البيانات مع تثبيت تلقائي للجداول
$CFG = require __DIR__ . '/config.php';

function db(): PDO {
  static $pdo = null;
  global $CFG;
  if ($pdo) return $pdo;
  $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
  $driver = $CFG['driver'];
  if ($driver === 'mysql') {
    try {
      $root = new PDO("mysql:host={$CFG['host']};port={$CFG['port']};charset=utf8mb4", $CFG['user'], $CFG['pass'], $opts);
      $root->exec("CREATE DATABASE IF NOT EXISTS `{$CFG['dbname']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      $pdo = new PDO("mysql:host={$CFG['host']};port={$CFG['port']};dbname={$CFG['dbname']};charset=utf8mb4", $CFG['user'], $CFG['pass'], $opts);
    } catch (Throwable $e) {
      $driver = 'sqlite'; // احتياطي إذا لم تعمل MySQL
    }
  }
  if ($driver === 'sqlite') {
    @mkdir(dirname($CFG['sqlite_path']), 0777, true);
    $pdo = new PDO('sqlite:' . $CFG['sqlite_path'], null, null, $opts);
    $pdo->exec('PRAGMA foreign_keys=ON');
  }
  $GLOBALS['DB_DRIVER'] = $driver;
  install($pdo, $driver);
  return $pdo;
}

function install(PDO $pdo, string $driver): void {
  $id = $driver === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  $tail = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
  $tables = [
    "settings" => "(k VARCHAR(64) PRIMARY KEY, v TEXT)",
    "properties" => "(id $id, name VARCHAR(120) NOT NULL, type VARCHAR(40) DEFAULT 'شقة', city VARCHAR(80) DEFAULT 'الدمام', district VARCHAR(80) DEFAULT '', address VARCHAR(200) DEFAULT '', deed_no VARCHAR(60) DEFAULT '', area DECIMAL(10,2) DEFAULT 0, rooms INT DEFAULT 0, status VARCHAR(20) DEFAULT 'شاغرة', purchase_price DECIMAL(14,2) DEFAULT 0, purchase_date DATE NULL, current_value DECIMAL(14,2) DEFAULT 0, expected_rent DECIMAL(12,2) DEFAULT 0, monthly_expense DECIMAL(12,2) DEFAULT 0, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "tenants" => "(id $id, name VARCHAR(120) NOT NULL, phone VARCHAR(30) DEFAULT '', national_id VARCHAR(30) DEFAULT '', email VARCHAR(120) DEFAULT '', nationality VARCHAR(60) DEFAULT '', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "contracts" => "(id $id, property_id INT NOT NULL, tenant_id INT NOT NULL, ejar_no VARCHAR(60) DEFAULT '', start_date DATE NOT NULL, end_date DATE NOT NULL, rent DECIMAL(12,2) NOT NULL, frequency VARCHAR(20) DEFAULT 'شهري', deposit DECIMAL(12,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'ساري', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "installments" => "(id $id, contract_id INT NOT NULL, due_date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL, paid DECIMAL(12,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'مستحق')",
    "collections" => "(id $id, installment_id INT NULL, contract_id INT NULL, property_id INT NULL, tenant_id INT NULL, date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL, method VARCHAR(30) DEFAULT 'تحويل', ref_no VARCHAR(60) DEFAULT '', note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "expenses" => "(id $id, property_id INT NULL, date DATE NOT NULL, category VARCHAR(40) DEFAULT 'صيانة', amount DECIMAL(12,2) NOT NULL, vendor VARCHAR(120) DEFAULT '', note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "maintenance" => "(id $id, property_id INT NOT NULL, date DATE NOT NULL, issue VARCHAR(200) NOT NULL, priority VARCHAR(20) DEFAULT 'متوسطة', vendor VARCHAR(120) DEFAULT '', cost DECIMAL(12,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'مفتوح', closed_at DATE NULL, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "loans" => "(id $id, property_id INT NULL, bank VARCHAR(120) NOT NULL, principal DECIMAL(14,2) NOT NULL, balance DECIMAL(14,2) NOT NULL, payment DECIMAL(12,2) NOT NULL, rate DECIMAL(6,2) DEFAULT 0, start_date DATE NULL, months INT DEFAULT 0, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "loan_payments" => "(id $id, loan_id INT NOT NULL, date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL, note TEXT)",
    "transactions" => "(id $id, property_id INT NULL, type VARCHAR(10) NOT NULL, date DATE NOT NULL, amount DECIMAL(14,2) NOT NULL, fees DECIMAL(12,2) DEFAULT 0, counterparty VARCHAR(120) DEFAULT '', note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "documents" => "(id $id, entity VARCHAR(30) NOT NULL, entity_id INT NOT NULL, title VARCHAR(160) NOT NULL, filename VARCHAR(200) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "audit_log" => "(id $id, at DATETIME DEFAULT CURRENT_TIMESTAMP, action VARCHAR(20), entity VARCHAR(30), entity_id INT, summary TEXT)",
  ];
  foreach ($tables as $name => $def) $pdo->exec("CREATE TABLE IF NOT EXISTS `$name` $def$tail");
  // إعدادات افتراضية
  $defaults = ['cash' => '500000', 'replacement_yield' => '5', 'expense_limit' => '500', 'late_fee_pct' => '0', 'owner_name' => 'المالك', 'currency' => 'ر.س'];
  $has = $pdo->query("SELECT COUNT(*) c FROM settings")->fetch()['c'];
  if (!$has) {
    $st = $pdo->prepare("INSERT INTO settings (k, v) VALUES (?, ?)");
    foreach ($defaults as $k => $v) $st->execute([$k, $v]);
  }
}

function setting(string $k, $default = null) {
  $st = db()->prepare("SELECT v FROM settings WHERE k=?"); $st->execute([$k]);
  $r = $st->fetch(); return $r ? $r['v'] : $default;
}
function set_setting(string $k, $v): void {
  $pdo = db();
  if ($GLOBALS['DB_DRIVER'] === 'mysql') $pdo->prepare("INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$k, $v]);
  else $pdo->prepare("INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")->execute([$k, $v]);
}
function audit(string $action, string $entity, $id, string $summary = ''): void {
  db()->prepare("INSERT INTO audit_log (action, entity, entity_id, summary) VALUES (?,?,?,?)")->execute([$action, $entity, (int)$id, $summary]);
}
