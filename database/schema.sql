-- محفظتي العقارية — مخطط قاعدة البيانات (MySQL / MariaDB)
-- يُستورد من phpMyAdmin داخل قاعدة موجودة. الاستيراد اختياري: النظام ينشئ هذه الجداول تلقائيًا عند أول تشغيل.
-- الحسابات التجريبية والبيانات التجريبية تُنشأ من التطبيق نفسه، لا من هذا الملف.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `settings` (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `properties` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(40) DEFAULT 'شقة',
  city VARCHAR(80) DEFAULT 'الدمام',
  district VARCHAR(80) DEFAULT '',
  address VARCHAR(200) DEFAULT '',
  deed_no VARCHAR(60) DEFAULT '',
  area DECIMAL(10,2) DEFAULT 0,
  rooms INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'شاغرة',
  purchase_price DECIMAL(14,2) DEFAULT 0,
  purchase_date DATE NULL,
  current_value DECIMAL(14,2) DEFAULT 0,
  expected_rent DECIMAL(12,2) DEFAULT 0,
  monthly_expense DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenants` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) DEFAULT '',
  national_id VARCHAR(30) DEFAULT '',
  email VARCHAR(120) DEFAULT '',
  nationality VARCHAR(60) DEFAULT '',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contracts` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  tenant_id INT NOT NULL,
  ejar_no VARCHAR(60) DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent DECIMAL(12,2) NOT NULL,
  frequency VARCHAR(20) DEFAULT 'شهري',
  deposit DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ساري',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `installments` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'مستحق'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collections` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  installment_id INT NULL,
  contract_id INT NULL,
  property_id INT NULL,
  tenant_id INT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(30) DEFAULT 'تحويل',
  ref_no VARCHAR(60) DEFAULT '',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expenses` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NULL,
  date DATE NOT NULL,
  category VARCHAR(40) DEFAULT 'صيانة',
  amount DECIMAL(12,2) NOT NULL,
  vendor VARCHAR(120) DEFAULT '',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  date DATE NOT NULL,
  issue VARCHAR(200) NOT NULL,
  priority VARCHAR(20) DEFAULT 'متوسطة',
  vendor VARCHAR(120) DEFAULT '',
  cost DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'مفتوح',
  closed_at DATE NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `loans` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NULL,
  bank VARCHAR(120) NOT NULL,
  principal DECIMAL(14,2) NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  payment DECIMAL(12,2) NOT NULL,
  rate DECIMAL(6,2) DEFAULT 0,
  start_date DATE NULL,
  months INT DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `loan_payments` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_id INT NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NULL,
  type VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  fees DECIMAL(12,2) DEFAULT 0,
  counterparty VARCHAR(120) DEFAULT '',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(30) NOT NULL,
  entity_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  filename VARCHAR(200) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_log` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at DATETIME DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(20),
  entity VARCHAR(30),
  entity_id INT,
  summary TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(30) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'owner',
  tenant_id INT NULL,
  active TINYINT DEFAULT 1,
  onboarded TINYINT DEFAULT 0,
  last_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- الإعدادات الافتراضية
INSERT IGNORE INTO `settings` (`k`, `v`) VALUES
  ('cash', '500000'),
  ('replacement_yield', '5'),
  ('expense_limit', '500'),
  ('late_fee_pct', '0'),
  ('owner_name', 'المالك'),
  ('currency', 'ر.س');
