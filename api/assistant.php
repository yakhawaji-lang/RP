<?php
// المساعد الذكي: يعمل محليًا بقواعد عربية، ويستخدم Anthropic API إن وُجد مفتاح

function fmt($n): string { return number_format((float)$n, 0) . ' ر.س'; }

function portfolio_context(): array {
  $s = stats(); unset($s['series']);
  $pdo = db();
  $s['top_weak_units'] = $pdo->query("SELECT name, expected_rent, purchase_price, monthly_expense, status, CASE WHEN purchase_price>0 THEN ROUND(expected_rent*12/purchase_price*100,2) ELSE 0 END y FROM properties WHERE status<>'مباعة' ORDER BY y ASC LIMIT 5")->fetchAll();
  $s['top_units'] = $pdo->query("SELECT name, expected_rent, purchase_price, CASE WHEN purchase_price>0 THEN ROUND(expected_rent*12/purchase_price*100,2) ELSE 0 END y FROM properties WHERE status<>'مباعة' ORDER BY y DESC LIMIT 5")->fetchAll();
  $s['arrears'] = report('arrears', [])['rows'];
  $s['expiring'] = array_slice(report('expiring', [])['rows'], 0, 8);
  $s['open_maintenance_list'] = $pdo->query("SELECT m.issue, m.priority, m.status, m.cost, p.name FROM maintenance m JOIN properties p ON p.id=m.property_id WHERE m.status<>'مغلق'")->fetchAll();
  $s['vacant_list'] = $pdo->query("SELECT name, expected_rent, city FROM properties WHERE status='شاغرة'")->fetchAll();
  return $s;
}

function assistant(string $q, array $history = []): array {
  $q = trim($q); if ($q === '') return ['answer' => 'اسألني عن محفظتك: المتأخرات، الشاغر، أضعف الوحدات، العقود المنتهية، التدفق النقدي، أو اطلب توصية.'];
  global $CFG;
  if (!empty($CFG['anthropic_key'])) { $r = assistant_cloud($q, $history); if ($r) return ['answer' => $r, 'mode' => 'cloud']; }
  return ['answer' => assistant_local($q), 'mode' => 'local'];
}

function has(string $q, array $words): bool { foreach ($words as $w) if (mb_stripos($q, $w) !== false) return true; return false; }

function assistant_local(string $q): string {
  $c = portfolio_context(); $s = $c;
  if (has($q, ['متأخر', 'متأخرات', 'لم يدفع', 'ما دفع'])) {
    if (!$c['arrears']) return 'لا توجد متأخرات حاليًا. نسبة التحصيل هذا الشهر ' . $s['collection_rate'] . '%.';
    $lines = array_map(fn($r) => "• {$r['tenant_name']} — {$r['property_name']}: " . fmt($r['remaining']) . " (استحق {$r['due_date']})", array_slice($c['arrears'], 0, 10));
    return "إجمالي المتأخرات " . fmt($s['overdue']) . " على {$s['overdue_n']} استحقاقًا:\n" . implode("\n", $lines) . "\n\nاقتراح: أرسل تذكيرًا للمتأخرين أكثر من 15 يومًا، وفعّل غرامة التأخير من الإعدادات إن أردت.";
  }
  if (has($q, ['شاغر', 'فاضي', 'فارغ', 'إشغال', 'اشغال'])) {
    $l = array_map(fn($r) => "• {$r['name']} ({$r['city']}) — إيجار متوقع " . fmt($r['expected_rent']), $c['vacant_list']);
    $lost = array_sum(array_column($c['vacant_list'], 'expected_rent'));
    return "نسبة الإشغال {$s['occupancy']}% ({$s['rented']} من {$s['units']}). الشاغر {$s['vacant']} وحدات بتكلفة شغور " . fmt($lost) . " شهريًا:\n" . implode("\n", $l) . "\n\nاقتراح: راجع سعر الإيجار المتوقع للوحدات الشاغرة أكثر من شهرين؛ خفض 5% غالبًا أرخص من شهر شغور إضافي.";
  }
  if (has($q, ['أضعف', 'اضعف', 'الأسوأ', 'ضعيف', 'استبدال', 'أبيع', 'ابيع', 'بيع'])) {
    $l = array_map(fn($r) => "• {$r['name']}: عائد {$r['y']}% — إيجار " . fmt($r['expected_rent']) . " / شراء " . fmt($r['purchase_price']) . " / مصروف " . fmt($r['monthly_expense']), $c['top_weak_units']);
    $rep = array_map(fn($r) => "• {$r['name']}: " . implode('، ', $r['reasons']), $s['replacement']);
    return "أضعف 5 وحدات بالعائد الإجمالي:\n" . implode("\n", $l) . "\n\nمرشحة للاستبدال وفق قاعدتك (" . count($s['replacement']) . "):\n" . ($rep ? implode("\n", $rep) : 'لا شيء') . "\n\nتوصية: بيع الوحدة الأضعف وإعادة توجيه المبلغ لوحدة بعائد ≥ " . setting('replacement_yield', 5) . "% يرفع صافي المحفظة دون زيادة رأس المال.";
  }
  if (has($q, ['أفضل', 'افضل', 'أقوى', 'الأعلى'])) {
    $l = array_map(fn($r) => "• {$r['name']}: عائد {$r['y']}% — إيجار " . fmt($r['expected_rent']), $c['top_units']);
    return "أفضل 5 وحدات بالعائد:\n" . implode("\n", $l);
  }
  if (has($q, ['عقد', 'عقود', 'تنتهي', 'ينتهي', 'تجديد'])) {
    $l = array_map(fn($r) => "• {$r['property_name']} — {$r['tenant_name']}: ينتهي {$r['end_date']} (إيجار " . fmt($r['rent']) . ")", $c['expiring']);
    return "عقود تنتهي خلال 60 يومًا: {$s['expiring_60']}.\nأقرب العقود انتهاءً:\n" . implode("\n", $l) . "\n\nاقتراح: ابدأ التفاوض على التجديد قبل 60 يومًا، واقترح زيادة لا تتجاوز 5% للمستأجر الملتزم بالسداد.";
  }
  if (has($q, ['صيانة', 'بلاغ', 'عطل'])) {
    $l = array_map(fn($r) => "• {$r['name']}: {$r['issue']} — أولوية {$r['priority']} — {$r['status']} — تقدير " . fmt($r['cost']), $c['open_maintenance_list']);
    return "بلاغات الصيانة المفتوحة: {$s['open_maintenance']}\n" . ($l ? implode("\n", $l) : 'لا توجد بلاغات مفتوحة.');
  }
  if (has($q, ['تمويل', 'قرض', 'دين', 'بنك', 'قسط'])) {
    $d = $s['dscr'] === null ? 'لا يوجد تمويل' : $s['dscr'];
    return "الدين القائم " . fmt($s['loan_balance']) . "، الأقساط الشهرية " . fmt($s['install_month']) . ".\nنسبة الدين إلى القيمة (LTV) {$s['ltv']}% — تغطية خدمة الدين (DSCR) {$d}.\n" . ($s['dscr'] !== null && $s['dscr'] < 1.2 ? "تنبيه: DSCR أقل من 1.2 يعني هامش أمان ضيق؛ فكّر في تسديد جزئي أو رفع الإيجارات." : "الوضع التمويلي مريح (DSCR ≥ 1.2).");
  }
  if (has($q, ['تدفق', 'نقد', 'كاش', 'سيولة', 'رأس المال', 'راس المال'])) {
    return "النقد المتاح " . fmt($s['cash']) . ".\nالتدفق النقدي السنوي المتوقع بعد الأقساط: " . fmt($s['cashflow_year']) . " (NOI " . fmt($s['noi_year']) . " − أقساط " . fmt($s['install_month'] * 12) . ").\nهذا الشهر: مستحق " . fmt($s['due_month']) . "، محصّل " . fmt($s['paid_month']) . " ({$s['collection_rate']}%).";
  }
  if (has($q, ['ملخص', 'وضع', 'كيف', 'تقرير', 'لمحة', 'حال'])) {
    $r = [];
    $r[] = "المحفظة: {$s['units']} وحدة، إشغال {$s['occupancy']}%، قيمة " . fmt($s['value_total']) . "، حقوق ملكية " . fmt($s['equity']) . ".";
    $r[] = "الدخل: إيجار شهري " . fmt($s['rent_month']) . " — NOI سنوي " . fmt($s['noi_year']) . " — Cap Rate {$s['cap_rate']}%.";
    $r[] = "التحصيل هذا الشهر {$s['collection_rate']}% — متأخرات " . fmt($s['overdue']) . ".";
    $r[] = "يحتاج انتباهك: {$s['expiring_60']} عقود تنتهي قريبًا، {$s['open_maintenance']} بلاغات مفتوحة، {$s['vacant']} وحدات شاغرة، " . count($s['replacement']) . " مرشحة للاستبدال.";
    $r[] = $s['overdue'] > 0 ? "أول قرار: متابعة المتأخرات (" . fmt($s['overdue']) . ")." : ($s['vacant'] > 0 ? "أول قرار: تأجير الشاغر." : "الوضع ممتاز، ركّز على التوسع.");
    return implode("\n", $r);
  }
  if (has($q, ['ماذا لو', 'لو اشتريت', 'لو بعت', 'سيناريو', 'محاكاة'])) {
    preg_match('/(\d[\d,\.]*)/u', $q, $m); $amt = (float)str_replace(',', '', $m[1] ?? '400000');
    $yield = (float)setting('replacement_yield', 5) / 100; $rent = $amt * $yield / 12;
    return "محاكاة شراء وحدة بـ " . fmt($amt) . " بعائد " . ($yield * 100) . "%:\n• إيجار شهري متوقع " . fmt($rent) . "\n• نقدًا: يبقى لديك " . fmt($s['cash'] - $amt) . "، ويرتفع NOI السنوي إلى " . fmt($s['noi_year'] + $rent * 12) . ".\n• بتمويل 70% بفائدة 5% على 15 سنة: قسط ≈ " . fmt($amt * 0.7 * 0.0079) . " شهريًا، صافي الوحدة ≈ " . fmt($rent - $amt * 0.7 * 0.0079) . " شهريًا.\n(تقديرات مبسطة؛ أضف الرسوم والشغور.)";
  }
  if (has($q, ['زكاة'])) { $z = report('zakat', []); return "تقدير الزكاة: الوعاء " . fmt($z['base']) . " (نقد + مستحقات) → الزكاة ≈ " . fmt($z['zakat']) . ".\n" . $z['note']; }
  if (has($q, ['رسالة', 'تذكير', 'صيغ', 'اكتب'])) {
    $t = $c['arrears'][0] ?? null; $n = $t ? $t['tenant_name'] : 'المستأجر الكريم'; $a = $t ? fmt($t['remaining']) : '—'; $u = $t ? $t['property_name'] : 'الوحدة';
    return "نموذج تذكير سداد:\n\n«السلام عليكم {$n}،\nنود تذكيركم بأن إيجار {$u} بمبلغ {$a} قد استحق ولم يُسدد حتى الآن. نرجو التكرم بالسداد خلال 3 أيام عبر التحويل البنكي، وإرسال صورة الإيصال.\nشاكرين تعاونكم — إدارة العقارات»";
  }
  return "لم أفهم السؤال تمامًا. جرّب: «ملخص المحفظة»، «ما المتأخرات؟»، «الشاغر»، «أضعف الوحدات»، «العقود التي تنتهي»، «الصيانة»، «التمويل»، «التدفق النقدي»، «ماذا لو اشتريت وحدة بـ 500000»، «اكتب تذكير سداد».";
}

function assistant_cloud(string $q, array $history): ?string {
  global $CFG; $ctx = json_encode(portfolio_context(), JSON_UNESCAPED_UNICODE);
  $msgs = [];
  foreach (array_slice($history, -8) as $h) if (isset($h['role'], $h['content'])) $msgs[] = ['role' => $h['role'] === 'assistant' ? 'assistant' : 'user', 'content' => (string)$h['content']];
  $msgs[] = ['role' => 'user', 'content' => $q];
  $payload = ['model' => $CFG['anthropic_model'], 'max_tokens' => 1200, 'system' => "أنت مستشار إدارة محافظ عقارية سعودي. أجب بالعربية بإيجاز وبأرقام من بيانات المحفظة التالية فقط (JSON). المبالغ بالريال. قدّم توصية عملية واحدة في النهاية.\n\nبيانات المحفظة:\n$ctx", 'messages' => $msgs];
  $ch = curl_init('https://api.anthropic.com/v1/messages');
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_HTTPHEADER => ['content-type: application/json', 'x-api-key: ' . $CFG['anthropic_key'], 'anthropic-version: 2023-06-01'], CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)]);
  $res = curl_exec($ch); if (!$res) return null; $j = json_decode($res, true);
  return $j['content'][0]['text'] ?? null;
}
