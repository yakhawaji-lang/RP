<?php
// إعدادات الاتصال
// محليًا (XAMPP): القيم الافتراضية أدناه تعمل مباشرة.
// على الاستضافة (Hostinger): أنشئ ملف api/config.local.php بنفس الشكل وضع فيه بيانات قاعدة البيانات من hPanel — لا يُرفع إلى Git.
$cfg = [
  'driver' => 'mysql',          // mysql أو sqlite (احتياطي)
  'host' => '127.0.0.1',
  'port' => 3306,
  'dbname' => 'rp_portfolio',
  'user' => 'root',
  'pass' => '',
  'sqlite_path' => __DIR__ . '/../data/rp.sqlite',
  // مفتاح Anthropic API اختياري لتفعيل المساعد الذكي السحابي (يُترك فارغًا للمساعد المحلي)
  'anthropic_key' => getenv('ANTHROPIC_API_KEY') ?: '',
  'anthropic_model' => 'claude-sonnet-4-5',
];
if (file_exists(__DIR__ . '/config.local.php')) $cfg = array_merge($cfg, require __DIR__ . '/config.local.php');
foreach (['DB_HOST' => 'host', 'DB_NAME' => 'dbname', 'DB_USER' => 'user', 'DB_PASS' => 'pass'] as $env => $k) if (getenv($env) !== false) $cfg[$k] = getenv($env);
return $cfg;
