<?php
// إعدادات الاتصال — إعدادات XAMPP الافتراضية
return [
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
