<?php
// منطق الأعمال: الاستحقاقات، التحصيل، الإحصائيات، التقارير، البيانات التجريبية

function freq_months(string $f): int { return ['شهري' => 1, 'ربع سنوي' => 3, 'نصف سنوي' => 6, 'سنوي' => 12][$f] ?? 1; }

function list_entity(string $res, array $q): array {
  $pdo = db(); $where = []; $args = [];
  foreach (['property_id', 'tenant_id', 'contract_id', 'loan_id', 'status', 'type', 'category', 'city'] as $f)
    if (isset($q[$f]) && $q[$f] !== '') { $where[] = "t.`$f`=?"; $args[] = $q[$f]; }
  if (!empty($q['from'])) { $col = in_array($res, ['installments']) ? 'due_date' : (in_array($res, ['contracts']) ? 'start_date' : 'date'); $where[] = "t.`$col`>=?"; $args[] = $q['from']; }
  if (!empty($q['to'])) { $col = in_array($res, ['installments']) ? 'due_date' : (in_array($res, ['contracts']) ? 'start_date' : 'date'); $where[] = "t.`$col`<=?"; $args[] = $q['to']; }
  if (!empty($q['search'])) {
    $cols = ['properties' => ['name', 'city', 'district', 'address'], 'tenants' => ['name', 'phone', 'national_id'], 'maintenance' => ['issue', 'vendor'], 'expenses' => ['vendor', 'note', 'category'], 'loans' => ['bank']][$res] ?? [];
    if ($cols) { $where[] = '(' . implode(' OR ', array_map(fn($c) => "t.`$c` LIKE ?", $cols)) . ')'; foreach ($cols as $c) $args[] = '%' . $q['search'] . '%'; }
  }
  $order = ['properties' => 't.id', 'tenants' => 't.name', 'installments' => 't.due_date', 'loans' => 't.id DESC', 'documents' => 't.id DESC'][$res] ?? 't.date DESC, t.id DESC';
  if ($res === 'contracts') $order = 't.end_date DESC';
  $sql = "SELECT t.* FROM `$res` t" . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order";
  $st = $pdo->prepare($sql); $st->execute($args);
  return enrich($res, $st->fetchAll());
}

function names(string $table): array { static $c = []; if (!isset($c[$table])) $c[$table] = db()->query("SELECT id, name FROM `$table`")->fetchAll(PDO::FETCH_KEY_PAIR); return $c[$table]; }

function enrich(string $res, array $rows): array {
  $p = names('properties'); $t = names('tenants'); $today = date('Y-m-d');
  foreach ($rows as &$r) {
    if (isset($r['property_id'])) $r['property_name'] = $p[$r['property_id']] ?? '—';
    if (isset($r['tenant_id'])) $r['tenant_name'] = $t[$r['tenant_id']] ?? '—';
    if ($res === 'properties') {
      $pr = (float)$r['purchase_price']; $rent = (float)$r['expected_rent']; $exp = (float)$r['monthly_expense'];
      $r['gross_yield'] = $pr > 0 ? round($rent * 12 / $pr * 100, 2) : 0;
      $r['net_yield'] = $pr > 0 ? round(($rent - $exp) * 12 / $pr * 100, 2) : 0;
    }
    if ($res === 'contracts') {
      $r['days_left'] = (int)floor((strtotime($r['end_date']) - strtotime($today)) / 86400);
      $s = db()->prepare("SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(paid),0) p, SUM(CASE WHEN status='متأخر' THEN amount-paid ELSE 0 END) l FROM installments WHERE contract_id=?"); $s->execute([$r['id']]); $x = $s->fetch();
      $r['total_due'] = (float)$x['a']; $r['total_paid'] = (float)$x['p']; $r['overdue'] = (float)($x['l'] ?? 0);
    }
    if ($res === 'installments') {
      $c = db()->prepare("SELECT c.property_id, c.tenant_id FROM contracts c WHERE c.id=?"); $c->execute([$r['contract_id']]); $cc = $c->fetch();
      $r['property_name'] = $p[$cc['property_id'] ?? 0] ?? '—'; $r['tenant_name'] = $t[$cc['tenant_id'] ?? 0] ?? '—';
      $r['remaining'] = (float)$r['amount'] - (float)$r['paid'];
    }
    if ($res === 'tenants') {
      $s = db()->prepare("SELECT COALESCE(SUM(i.amount-i.paid),0) a FROM installments i JOIN contracts c ON c.id=i.contract_id WHERE c.tenant_id=? AND i.status='متأخر'"); $s->execute([$r['id']]); $r['arrears'] = (float)$s->fetch()['a'];
      $s = db()->prepare("SELECT p.name FROM contracts c JOIN properties p ON p.id=c.property_id WHERE c.tenant_id=? AND c.status='ساري' LIMIT 1"); $s->execute([$r['id']]); $r['unit'] = $s->fetchColumn() ?: '—';
    }
    if ($res === 'loans') { $r['paid_total'] = (float)$r['principal'] - (float)$r['balance']; }
  }
  return $rows;
}

function insert_entity(string $res, array $data): int {
  $pdo = db(); if (!$data) throw new Exception('لا بيانات');
  $cols = implode(',', array_map(fn($k) => "`$k`", array_keys($data))); $ph = implode(',', array_fill(0, count($data), '?'));
  $pdo->prepare("INSERT INTO `$res` ($cols) VALUES ($ph)")->execute(array_values($data));
  return (int)$pdo->lastInsertId();
}

function refresh_installment_statuses(): void {
  $today = date('Y-m-d');
  db()->exec("UPDATE installments SET status = CASE WHEN paid >= amount THEN 'مدفوع' WHEN paid > 0 THEN 'جزئي' WHEN due_date < '$today' THEN 'متأخر' ELSE 'مستحق' END");
  db()->exec("UPDATE contracts SET status='منتهي' WHERE status='ساري' AND end_date < '$today'");
}

function generate_installments(int $contractId): void {
  $pdo = db(); $c = $pdo->query("SELECT * FROM contracts WHERE id=$contractId")->fetch(); if (!$c) return;
  $pdo->prepare("DELETE FROM installments WHERE contract_id=? AND paid=0")->execute([$contractId]);
  $step = freq_months($c['frequency']); $start = new DateTime($c['start_date']); $end = new DateTime($c['end_date']);
  $months = max(1, ($end->format('Y') - $start->format('Y')) * 12 + ($end->format('n') - $start->format('n')) + 1);
  $count = (int)ceil($months / $step); $amount = round((float)$c['rent'] * $step, 2);
  $existing = $pdo->query("SELECT due_date FROM installments WHERE contract_id=$contractId")->fetchAll(PDO::FETCH_COLUMN);
  $ins = $pdo->prepare("INSERT INTO installments (contract_id, due_date, amount, status) VALUES (?,?,?,'مستحق')");
  for ($i = 0; $i < $count; $i++) { $d = (clone $start)->modify("+" . ($i * $step) . " months")->format('Y-m-d'); if (!in_array($d, $existing)) $ins->execute([$contractId, $d, $amount]); }
  refresh_installment_statuses();
}

function apply_collection(int $colId): void {
  $pdo = db(); $c = $pdo->query("SELECT * FROM collections WHERE id=$colId")->fetch(); if (!$c) return;
  $remaining = (float)$c['amount'];
  if ($c['installment_id']) { $pdo->prepare("UPDATE installments SET paid = paid + ? WHERE id=?")->execute([$remaining, $c['installment_id']]); }
  elseif ($c['contract_id']) {
    // توزيع المبلغ على أقدم الاستحقاقات غير المدفوعة
    $rows = $pdo->query("SELECT id, amount, paid FROM installments WHERE contract_id={$c['contract_id']} AND paid < amount ORDER BY due_date")->fetchAll();
    foreach ($rows as $r) { if ($remaining <= 0) break; $need = (float)$r['amount'] - (float)$r['paid']; $pay = min($need, $remaining); $pdo->prepare("UPDATE installments SET paid=paid+? WHERE id=?")->execute([$pay, $r['id']]); $remaining -= $pay; }
  }
  if ($c['contract_id'] && (!$c['property_id'] || !$c['tenant_id'])) $pdo->exec("UPDATE collections SET property_id=(SELECT property_id FROM contracts WHERE id={$c['contract_id']}), tenant_id=(SELECT tenant_id FROM contracts WHERE id={$c['contract_id']}) WHERE id=$colId");
  refresh_installment_statuses();
}

function adjust_cash(float $delta): void { set_setting('cash', (string)((float)setting('cash', 0) + $delta)); }

function after_insert(string $res, int $id, array $data): void {
  $pdo = db();
  if ($res === 'contracts') { generate_installments($id); if (($data['status'] ?? 'ساري') === 'ساري') $pdo->prepare("UPDATE properties SET status='مؤجرة' WHERE id=?")->execute([$data['property_id']]); }
  if ($res === 'collections') apply_collection($id);
  if ($res === 'loan_payments') $pdo->prepare("UPDATE loans SET balance = balance - ? WHERE id=?")->execute([$data['amount'], $data['loan_id']]);
  if ($res === 'transactions') {
    $amt = (float)$data['amount']; $fees = (float)($data['fees'] ?? 0);
    if ($data['type'] === 'بيع') { adjust_cash($amt - $fees); if (!empty($data['property_id'])) $pdo->prepare("UPDATE properties SET status='مباعة', current_value=? WHERE id=?")->execute([$amt, $data['property_id']]); }
    if ($data['type'] === 'شراء') { adjust_cash(-($amt + $fees)); if (!empty($data['property_id'])) $pdo->prepare("UPDATE properties SET purchase_price=?, purchase_date=?, status=CASE WHEN status='مباعة' THEN 'شاغرة' ELSE status END WHERE id=?")->execute([$amt, $data['date'], $data['property_id']]); }
  }
  if ($res === 'expenses' && !empty($data['amount'])) adjust_cash(-(float)$data['amount']);
  if ($res === 'collections' && !empty($data['amount'])) adjust_cash((float)$data['amount']);
}

function after_update(string $res, int $id, array $data): void {
  if ($res === 'contracts' && array_intersect(array_keys($data), ['start_date', 'end_date', 'rent', 'frequency'])) generate_installments($id);
  if ($res === 'installments') refresh_installment_statuses();
}

function delete_entity(string $res, int $id): void {
  $pdo = db();
  if ($res === 'properties') { foreach (['contracts', 'expenses', 'maintenance', 'collections', 'transactions'] as $t) $pdo->exec("DELETE FROM `$t` WHERE property_id=$id"); $pdo->exec("DELETE FROM installments WHERE contract_id NOT IN (SELECT id FROM contracts)"); }
  if ($res === 'contracts') $pdo->exec("DELETE FROM installments WHERE contract_id=$id");
  if ($res === 'loans') $pdo->exec("DELETE FROM loan_payments WHERE loan_id=$id");
  if ($res === 'collections') { $c = $pdo->query("SELECT * FROM collections WHERE id=$id")->fetch(); if ($c && $c['installment_id']) { $paid = (float)$pdo->query("SELECT paid FROM installments WHERE id={$c['installment_id']}")->fetchColumn(); $pdo->prepare("UPDATE installments SET paid=? WHERE id=?")->execute([max(0, $paid - (float)$c['amount']), $c['installment_id']]); } if ($c) adjust_cash(-(float)$c['amount']); }
  if ($res === 'expenses') { $e = $pdo->query("SELECT amount FROM expenses WHERE id=$id")->fetch(); if ($e) adjust_cash((float)$e['amount']); }
  $pdo->exec("DELETE FROM `$res` WHERE id=$id");
  refresh_installment_statuses();
}

function renew_contract(int $id, array $b): int {
  $pdo = db(); $c = $pdo->query("SELECT * FROM contracts WHERE id=$id")->fetch(); if (!$c) throw new Exception('العقد غير موجود');
  $pdo->exec("UPDATE contracts SET status='منتهي' WHERE id=$id");
  $start = (new DateTime($c['end_date']))->modify('+1 day'); $months = (int)($b['months'] ?? 12);
  $end = (clone $start)->modify("+$months months")->modify('-1 day');
  $data = ['property_id' => $c['property_id'], 'tenant_id' => $c['tenant_id'], 'ejar_no' => $b['ejar_no'] ?? '', 'start_date' => $start->format('Y-m-d'), 'end_date' => $end->format('Y-m-d'), 'rent' => $b['rent'] ?? $c['rent'], 'frequency' => $c['frequency'], 'deposit' => $c['deposit'], 'status' => 'ساري', 'notes' => 'تجديد للعقد #' . $id];
  $nid = insert_entity('contracts', $data); generate_installments($nid); audit('renew', 'contracts', $id, 'تجديد → #' . $nid); return $nid;
}
function terminate_contract(int $id): void {
  $pdo = db(); $c = $pdo->query("SELECT * FROM contracts WHERE id=$id")->fetch(); if (!$c) return;
  $pdo->exec("UPDATE contracts SET status='منتهي', end_date='" . date('Y-m-d') . "' WHERE id=$id");
  $pdo->exec("DELETE FROM installments WHERE contract_id=$id AND paid=0 AND due_date > '" . date('Y-m-d') . "'");
  $pdo->exec("UPDATE properties SET status='شاغرة' WHERE id={$c['property_id']} AND NOT EXISTS (SELECT 1 FROM contracts WHERE property_id={$c['property_id']} AND status='ساري')");
  audit('terminate', 'contracts', $id, '');
}

function stats(): array {
  refresh_installment_statuses(); $pdo = db(); $today = date('Y-m-d'); $ym = date('Y-m');
  $p = $pdo->query("SELECT COUNT(*) n, SUM(status='مؤجرة') rented, SUM(status='شاغرة') vacant, SUM(status='للبيع') forsale, SUM(status='مباعة') sold, SUM(CASE WHEN status<>'مباعة' THEN purchase_price ELSE 0 END) purchase, SUM(CASE WHEN status<>'مباعة' THEN current_value ELSE 0 END) value, SUM(CASE WHEN status<>'مباعة' THEN monthly_expense ELSE 0 END) exp FROM properties")->fetch();
  $rent = (float)$pdo->query("SELECT COALESCE(SUM(rent),0) FROM contracts WHERE status='ساري'")->fetchColumn();
  $potential = (float)$pdo->query("SELECT COALESCE(SUM(expected_rent),0) FROM properties WHERE status<>'مباعة'")->fetchColumn();
  $loan = $pdo->query("SELECT COALESCE(SUM(balance),0) b, COALESCE(SUM(payment),0) p FROM loans")->fetch();
  $inst = $pdo->query("SELECT COALESCE(SUM(CASE WHEN status='متأخر' THEN amount-paid END),0) overdue, COUNT(CASE WHEN status='متأخر' THEN 1 END) overdue_n, COALESCE(SUM(CASE WHEN due_date LIKE '$ym%' THEN amount END),0) due_month, COALESCE(SUM(CASE WHEN due_date LIKE '$ym%' THEN paid END),0) paid_month FROM installments")->fetch();
  $colMonth = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM collections WHERE date LIKE '$ym%'")->fetchColumn();
  $expMonth = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date LIKE '$ym%'")->fetchColumn();
  $year = date('Y');
  $colYear = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM collections WHERE date LIKE '$year%'")->fetchColumn();
  $expYear = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date LIKE '$year%'")->fetchColumn();
  $openMaint = (int)$pdo->query("SELECT COUNT(*) FROM maintenance WHERE status<>'مغلق'")->fetchColumn();
  $expiring = (int)$pdo->query("SELECT COUNT(*) FROM contracts WHERE status='ساري' AND end_date BETWEEN '$today' AND '" . date('Y-m-d', strtotime('+60 days')) . "'")->fetchColumn();
  // سلسلة 12 شهر
  $series = [];
  for ($i = 11; $i >= 0; $i--) { $m = date('Y-m', strtotime("-$i months")); $series[] = ['month' => $m, 'collected' => (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM collections WHERE date LIKE '$m%'")->fetchColumn(), 'expenses' => (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date LIKE '$m%'")->fetchColumn(), 'due' => (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM installments WHERE due_date LIKE '$m%'")->fetchColumn()]; }
  $active = (int)$p['n'] - (int)$p['sold'];
  $noi = ($rent - (float)$p['exp']) * 12;
  $value = (float)$p['value'] ?: (float)$p['purchase'];
  return [
    'units' => $active, 'rented' => (int)$p['rented'], 'vacant' => (int)$p['vacant'], 'for_sale' => (int)$p['forsale'], 'sold' => (int)$p['sold'],
    'occupancy' => $active ? round((int)$p['rented'] / $active * 100, 1) : 0,
    'rent_month' => $rent, 'potential_rent' => $potential, 'expense_month' => (float)$p['exp'], 'install_month' => (float)$loan['p'],
    'noi_year' => $noi, 'cashflow_year' => $noi - (float)$loan['p'] * 12,
    'purchase_total' => (float)$p['purchase'], 'value_total' => $value, 'equity' => $value - (float)$loan['b'],
    'loan_balance' => (float)$loan['b'], 'ltv' => $value ? round((float)$loan['b'] / $value * 100, 1) : 0,
    'dscr' => (float)$loan['p'] > 0 ? round($noi / ((float)$loan['p'] * 12), 2) : null,
    'cap_rate' => $value ? round($noi / $value * 100, 2) : 0, 'gross_yield' => (float)$p['purchase'] ? round($rent * 12 / (float)$p['purchase'] * 100, 2) : 0,
    'overdue' => (float)$inst['overdue'], 'overdue_n' => (int)$inst['overdue_n'], 'due_month' => (float)$inst['due_month'], 'paid_month' => (float)$inst['paid_month'],
    'collection_rate' => (float)$inst['due_month'] ? round((float)$inst['paid_month'] / (float)$inst['due_month'] * 100, 1) : 0,
    'collected_month' => $colMonth, 'expenses_month' => $expMonth, 'collected_year' => $colYear, 'expenses_year' => $expYear,
    'open_maintenance' => $openMaint, 'expiring_60' => $expiring, 'cash' => (float)setting('cash', 0), 'series' => $series,
    'replacement' => replacement_candidates(),
  ];
}

function replacement_candidates(): array {
  $y = (float)setting('replacement_yield', 5); $lim = (float)setting('expense_limit', 500);
  $rows = db()->query("SELECT * FROM properties WHERE status<>'مباعة'")->fetchAll(); $out = [];
  foreach ($rows as $r) { $yield = (float)$r['purchase_price'] > 0 ? (float)$r['expected_rent'] * 12 / (float)$r['purchase_price'] * 100 : 0; $reasons = [];
    if ($yield < $y) $reasons[] = 'العائد ' . round($yield, 2) . '% أقل من ' . $y . '%';
    if ((float)$r['monthly_expense'] >= $lim) $reasons[] = 'المصروف الشهري ' . $r['monthly_expense'] . ' ≥ ' . $lim;
    $m = db()->query("SELECT COUNT(*) FROM maintenance WHERE property_id={$r['id']} AND date >= '" . date('Y-m-d', strtotime('-12 months')) . "'")->fetchColumn();
    if ($m >= 4) $reasons[] = "$m بلاغات صيانة خلال سنة";
    if ($reasons) $out[] = ['id' => $r['id'], 'name' => $r['name'], 'yield' => round($yield, 2), 'current_value' => (float)$r['current_value'], 'purchase_price' => (float)$r['purchase_price'], 'reasons' => $reasons]; }
  return $out;
}

function alerts(): array {
  refresh_installment_statuses(); $pdo = db(); $today = date('Y-m-d'); $a = [];
  foreach ($pdo->query("SELECT i.*, p.name pn, t.name tn FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN properties p ON p.id=c.property_id JOIN tenants t ON t.id=c.tenant_id WHERE i.status='متأخر' ORDER BY i.due_date LIMIT 50") as $r) $a[] = ['level' => 'bad', 'type' => 'متأخرات', 'text' => "{$r['tn']} — {$r['pn']}: " . number_format((float)$r['amount'] - (float)$r['paid']) . " ر.س مستحقة منذ {$r['due_date']}", 'link' => 'collections'];
  foreach ($pdo->query("SELECT c.*, p.name pn, t.name tn FROM contracts c JOIN properties p ON p.id=c.property_id JOIN tenants t ON t.id=c.tenant_id WHERE c.status='ساري' AND c.end_date BETWEEN '$today' AND '" . date('Y-m-d', strtotime('+60 days')) . "' ORDER BY c.end_date") as $r) $a[] = ['level' => 'warn', 'type' => 'عقد ينتهي', 'text' => "{$r['pn']} ({$r['tn']}) ينتهي في {$r['end_date']}", 'link' => 'contracts'];
  foreach ($pdo->query("SELECT m.*, p.name pn FROM maintenance m JOIN properties p ON p.id=m.property_id WHERE m.status<>'مغلق' ORDER BY m.date") as $r) $a[] = ['level' => $r['priority'] === 'عالية' ? 'bad' : 'warn', 'type' => 'صيانة مفتوحة', 'text' => "{$r['pn']}: {$r['issue']} ({$r['status']})", 'link' => 'maintenance'];
  foreach ($pdo->query("SELECT * FROM properties WHERE status='شاغرة'") as $r) $a[] = ['level' => 'info', 'type' => 'شاغرة', 'text' => "{$r['name']} شاغرة — إيجار متوقع " . number_format((float)$r['expected_rent']) . " ر.س", 'link' => 'properties'];
  foreach ($pdo->query("SELECT i.*, p.name pn, t.name tn FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN properties p ON p.id=c.property_id JOIN tenants t ON t.id=c.tenant_id WHERE i.status='مستحق' AND i.due_date BETWEEN '$today' AND '" . date('Y-m-d', strtotime('+7 days')) . "'") as $r) $a[] = ['level' => 'info', 'type' => 'استحقاق قريب', 'text' => "{$r['tn']} — {$r['pn']}: " . number_format((float)$r['amount']) . " ر.س في {$r['due_date']}", 'link' => 'collections'];
  return $a;
}

function report(string $kind, array $q): array {
  refresh_installment_statuses(); $pdo = db();
  $from = $q['from'] ?? date('Y-01-01'); $to = $q['to'] ?? date('Y-m-d');
  switch ($kind) {
    case 'pnl': // ربح وخسارة لكل وحدة
      $rows = [];
      foreach ($pdo->query("SELECT * FROM properties ORDER BY id") as $p) {
        $inc = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM collections WHERE property_id={$p['id']} AND date BETWEEN '$from' AND '$to'")->fetchColumn();
        $exp = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE property_id={$p['id']} AND date BETWEEN '$from' AND '$to'")->fetchColumn();
        $rows[] = ['id' => $p['id'], 'name' => $p['name'], 'status' => $p['status'], 'income' => $inc, 'expenses' => $exp, 'net' => $inc - $exp, 'purchase_price' => (float)$p['purchase_price'], 'roi' => (float)$p['purchase_price'] ? round(($inc - $exp) / (float)$p['purchase_price'] * 100, 2) : 0];
      }
      return ['from' => $from, 'to' => $to, 'rows' => $rows, 'total_income' => array_sum(array_column($rows, 'income')), 'total_expenses' => array_sum(array_column($rows, 'expenses'))];
    case 'arrears':
      return ['rows' => $pdo->query("SELECT i.id, i.due_date, i.amount, i.paid, (i.amount-i.paid) remaining, p.name property_name, t.name tenant_name, t.phone, c.id contract_id FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN properties p ON p.id=c.property_id JOIN tenants t ON t.id=c.tenant_id WHERE i.status IN ('متأخر','جزئي') AND i.due_date < '" . date('Y-m-d') . "' ORDER BY i.due_date")->fetchAll()];
    case 'tenant_statement':
      $tid = (int)($q['tenant_id'] ?? 0);
      $inst = $pdo->query("SELECT i.*, p.name property_name FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN properties p ON p.id=c.property_id WHERE c.tenant_id=$tid ORDER BY i.due_date")->fetchAll();
      $cols = $pdo->query("SELECT * FROM collections WHERE tenant_id=$tid ORDER BY date")->fetchAll();
      return ['installments' => $inst, 'collections' => $cols, 'total_due' => array_sum(array_column($inst, 'amount')), 'total_paid' => array_sum(array_column($cols, 'amount'))];
    case 'expiring':
      return ['rows' => $pdo->query("SELECT c.*, p.name property_name, t.name tenant_name, t.phone FROM contracts c JOIN properties p ON p.id=c.property_id JOIN tenants t ON t.id=c.tenant_id WHERE c.status='ساري' ORDER BY c.end_date LIMIT 100")->fetchAll()];
    case 'expenses':
      return ['by_category' => $pdo->query("SELECT category, COALESCE(SUM(amount),0) total, COUNT(*) n FROM expenses WHERE date BETWEEN '$from' AND '$to' GROUP BY category ORDER BY total DESC")->fetchAll(), 'by_property' => $pdo->query("SELECT p.name, COALESCE(SUM(e.amount),0) total FROM expenses e JOIN properties p ON p.id=e.property_id WHERE e.date BETWEEN '$from' AND '$to' GROUP BY p.id ORDER BY total DESC LIMIT 20")->fetchAll()];
    case 'cashflow':
      $rows = [];
      for ($i = 0; $i < 12; $i++) { $m = date('Y-m', strtotime("+$i months")); $rows[] = ['month' => $m, 'expected_in' => (float)$pdo->query("SELECT COALESCE(SUM(amount-paid),0) FROM installments WHERE due_date LIKE '$m%'")->fetchColumn(), 'loan_out' => (float)$pdo->query("SELECT COALESCE(SUM(payment),0) FROM loans WHERE balance>0")->fetchColumn(), 'expense_out' => (float)$pdo->query("SELECT COALESCE(SUM(monthly_expense),0) FROM properties WHERE status<>'مباعة'")->fetchColumn()]; }
      return ['rows' => $rows];
    case 'zakat':
      $s = stats(); $base = $s['cash'] + (float)$pdo->query("SELECT COALESCE(SUM(amount-paid),0) FROM installments WHERE status IN ('متأخر','جزئي')")->fetchColumn();
      return ['note' => 'تقدير مبسط: العقارات المؤجرة للاستغلال لا زكاة على أصلها، والزكاة على النقد وغلة الإيجار المتبقية (2.5%). راجع مختصًا.', 'cash' => $s['cash'], 'receivables' => $base - $s['cash'], 'base' => $base, 'zakat' => round($base * 0.025, 2)];
    default:
      return stats();
  }
}

function seed_demo(): void {
  wipe_all(); $pdo = db(); $cities = ['الدمام', 'الخبر', 'الظهران', 'الرياض', 'جدة']; $districts = ['الفيصلية', 'الشاطئ', 'العزيزية', 'الروضة', 'النزهة', 'الحمراء'];
  $types = ['شقة', 'شقة', 'شقة', 'فيلا', 'محل', 'دور'];
  $tenantNames = ['أحمد العلي', 'محمد السالم', 'خالد الدوسري', 'سعد القحطاني', 'فهد العتيبي', 'عبدالله الشمري', 'نواف الحربي', 'ياسر المطيري', 'سلطان الغامدي', 'تركي الزهراني', 'عمر الجهني', 'ماجد البلوي', 'بدر العنزي', 'راشد المالكي', 'طلال السبيعي', 'حسن الشهري', 'مشاري الرشيدي', 'زياد الخالدي', 'إبراهيم الحازمي', 'سامي العمري'];
  foreach ($tenantNames as $i => $n) insert_entity('tenants', ['name' => $n, 'phone' => '05' . str_pad((string)(50000000 + $i * 731), 8, '0', STR_PAD_LEFT), 'national_id' => '10' . str_pad((string)(12345678 + $i * 97), 8, '0', STR_PAD_LEFT), 'nationality' => 'سعودي']);
  mt_srand(7);
  for ($i = 1; $i <= 24; $i++) {
    $type = $types[$i % 6]; $price = $type === 'فيلا' ? 1200000 + mt_rand(0, 20) * 25000 : ($type === 'محل' ? 600000 + mt_rand(0, 10) * 20000 : 350000 + mt_rand(0, 12) * 15000);
    $rent = $type === 'فيلا' ? 5500 + mt_rand(0, 10) * 250 : ($type === 'محل' ? 4000 + mt_rand(0, 8) * 250 : 1800 + mt_rand(0, 10) * 100);
    $status = $i <= 19 ? 'مؤجرة' : ($i <= 22 ? 'شاغرة' : 'للبيع');
    $pid = insert_entity('properties', ['name' => $type . ' ' . $i, 'type' => $type, 'city' => $cities[$i % 5], 'district' => $districts[$i % 6], 'area' => $type === 'فيلا' ? 400 : 140, 'rooms' => $type === 'فيلا' ? 6 : 3, 'status' => $status, 'purchase_price' => $price, 'purchase_date' => date('Y-m-d', strtotime('-' . mt_rand(12, 60) . ' months')), 'current_value' => round($price * (1 + mt_rand(-5, 15) / 100)), 'expected_rent' => $rent, 'monthly_expense' => $i % 7 === 0 ? 650 : 200 + mt_rand(0, 6) * 50]);
    if ($status === 'مؤجرة') {
      $startAgo = mt_rand(1, 11); $start = date('Y-m-01', strtotime("-$startAgo months")); $end = date('Y-m-d', strtotime($start . ' +12 months -1 day'));
      $cid = insert_entity('contracts', ['property_id' => $pid, 'tenant_id' => (($i - 1) % 20) + 1, 'ejar_no' => 'EJ-' . (202500 + $i), 'start_date' => $start, 'end_date' => $end, 'rent' => $rent, 'frequency' => $i % 5 === 0 ? 'ربع سنوي' : 'شهري', 'deposit' => $rent, 'status' => 'ساري']);
      generate_installments($cid);
      // دفع الاستحقاقات السابقة (مع بعض التأخير)
      foreach ($pdo->query("SELECT * FROM installments WHERE contract_id=$cid AND due_date < '" . date('Y-m-d') . "' ORDER BY due_date") as $inst) {
        if ($i % 6 === 0 && $inst['due_date'] > date('Y-m-d', strtotime('-45 days'))) continue; // متأخر
        $c = insert_entity('collections', ['installment_id' => $inst['id'], 'contract_id' => $cid, 'property_id' => $pid, 'tenant_id' => (($i - 1) % 20) + 1, 'date' => date('Y-m-d', strtotime($inst['due_date'] . ' +' . mt_rand(0, 6) . ' days')), 'amount' => $inst['amount'], 'method' => ['تحويل', 'تحويل', 'نقد', 'سداد'][mt_rand(0, 3)], 'ref_no' => 'TR' . mt_rand(100000, 999999)]);
        apply_collection($c);
      }
    }
    if ($i % 3 === 0) insert_entity('expenses', ['property_id' => $pid, 'date' => date('Y-m-d', strtotime('-' . mt_rand(0, 90) . ' days')), 'category' => ['صيانة', 'كهرباء', 'رسوم بلدية', 'تأمين', 'عمولة'][mt_rand(0, 4)], 'amount' => mt_rand(3, 30) * 50, 'vendor' => 'مؤسسة الخدمات']);
    if ($i % 4 === 0) insert_entity('maintenance', ['property_id' => $pid, 'date' => date('Y-m-d', strtotime('-' . mt_rand(0, 20) . ' days')), 'issue' => ['تسريب مياه', 'عطل مكيف', 'كهرباء', 'سباكة', 'طلاء'][mt_rand(0, 4)], 'priority' => ['عالية', 'متوسطة', 'منخفضة'][mt_rand(0, 2)], 'vendor' => 'فني الصيانة', 'cost' => mt_rand(2, 20) * 50, 'status' => $i % 8 === 0 ? 'قيد التنفيذ' : 'مفتوح']);
  }
  insert_entity('loans', ['property_id' => 4, 'bank' => 'مصرف الراجحي', 'principal' => 900000, 'balance' => 640000, 'payment' => 7800, 'rate' => 4.5, 'start_date' => date('Y-m-d', strtotime('-36 months')), 'months' => 120]);
  insert_entity('loans', ['property_id' => null, 'bank' => 'البنك الأهلي', 'principal' => 1500000, 'balance' => 1250000, 'payment' => 12500, 'rate' => 5.2, 'start_date' => date('Y-m-d', strtotime('-18 months')), 'months' => 144]);
  set_setting('cash', '420000'); refresh_installment_statuses(); try { $pdo->exec("UPDATE users SET tenant_id=(SELECT MIN(id) FROM tenants) WHERE role='tenant' AND email='tenant@demo.sa'"); } catch (Throwable $e) {} audit('seed', 'all', 0, 'تحميل بيانات تجريبية');
}

function wipe_all(): void { foreach (['installments', 'collections', 'contracts', 'expenses', 'maintenance', 'loan_payments', 'loans', 'transactions', 'documents', 'tenants', 'properties', 'audit_log'] as $t) db()->exec("DELETE FROM `$t`"); }

function restore_backup(array $b, array $FIELDS): void {
  wipe_all(); $pdo = db();
  foreach (array_keys($FIELDS) as $t) foreach ($b[$t] ?? [] as $row) { $row = array_intersect_key($row, array_flip(array_merge(['id'], $FIELDS[$t]))); $cols = implode(',', array_map(fn($k) => "`$k`", array_keys($row))); $pdo->prepare("INSERT INTO `$t` ($cols) VALUES (" . implode(',', array_fill(0, count($row), '?')) . ")")->execute(array_values($row)); }
  foreach ($b['settings'] ?? [] as $k => $v) set_setting((string)$k, (string)$v);
}

// استيراد من نسخة V2 المحلية (JSON من localStorage)
function migrate_v2(array $v2): void {
  wipe_all(); $map = [];
  foreach ($v2['properties'] ?? [] as $p) $map[$p['id']] = insert_entity('properties', ['name' => $p['name'], 'city' => $p['location'] ?? '', 'status' => $p['status'] ?? 'شاغرة', 'purchase_price' => $p['purchase'] ?? 0, 'current_value' => $p['currentValue'] ?? 0, 'expected_rent' => $p['rent'] ?? 0, 'monthly_expense' => $p['expenses'] ?? 0]);
  $pnames = array_flip(names('properties'));
  $tmap = [];
  foreach ($v2['tenants'] ?? [] as $t) $tmap[$t['name']] = insert_entity('tenants', ['name' => $t['name'], 'phone' => $t['phone'] ?? '']);
  foreach ($v2['contracts'] ?? [] as $c) { $tid = $tmap[$c['tenant']] ?? ($tmap[$c['tenant']] = insert_entity('tenants', ['name' => $c['tenant']])); $pid = $pnames[$c['unit']] ?? null; if ($pid) { $cid = insert_entity('contracts', ['property_id' => $pid, 'tenant_id' => $tid, 'start_date' => $c['start'], 'end_date' => $c['end'], 'rent' => $c['rent'], 'status' => $c['status'] === 'منتهي' ? 'منتهي' : 'ساري']); generate_installments($cid); } }
  foreach ($v2['collections'] ?? [] as $c) { $pid = $pnames[$c['unit']] ?? null; $cid = insert_entity('collections', ['property_id' => $pid, 'date' => $c['date'], 'amount' => $c['amount'], 'method' => $c['method'] ?? 'تحويل', 'note' => $c['note'] ?? '']); }
  foreach ($v2['expenses'] ?? [] as $e) insert_entity('expenses', ['property_id' => $pnames[$e['unit']] ?? null, 'date' => $e['date'], 'category' => $e['type'] ?? 'أخرى', 'amount' => $e['amount'], 'note' => $e['note'] ?? '']);
  foreach ($v2['loans'] ?? [] as $l) insert_entity('loans', ['bank' => $l['bank'] ?? '', 'principal' => $l['principal'] ?? 0, 'balance' => $l['balance'] ?? 0, 'payment' => $l['payment'] ?? 0, 'rate' => $l['rate'] ?? 0]);
  foreach ($v2['maintenance'] ?? [] as $m) { $pid = $pnames[$m['unit']] ?? null; if ($pid) insert_entity('maintenance', ['property_id' => $pid, 'date' => $m['date'], 'issue' => $m['issue'], 'cost' => $m['cost'] ?? 0, 'status' => $m['status'] ?? 'مفتوح']); }
  if (isset($v2['settings']['cash'])) set_setting('cash', (string)$v2['settings']['cash']);
  refresh_installment_statuses();
}
