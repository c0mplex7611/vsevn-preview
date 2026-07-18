window.LEGAL_FORMS_RAW = `Общество с ограниченной ответственностью*ООО
Акционерное общество*АО
Публичное акционерное общество*ПАО
Закрытое акционерное общество*ЗАО
Индивидуальный предприниматель*ИП
Государственное бюджетное учреждение здравоохранения*ГБУЗ
ГБУЗ НО*ГБУЗ НО
ГБУЗ*ГБУЗ`;

window.parseLegalForms = function parseLegalForms(raw) {
  return String(raw || '')
    .split('\n')
    .map(function (line) { return line.trim(); })
    .filter(Boolean)
    .map(function (line) {
      const parts = line.split('*');
      return { full: parts[0].trim(), short: (parts[1] || '').trim() };
    })
    .sort(function (a, b) {
      const byFull = b.full.length - a.full.length;
      if (byFull !== 0) return byFull;
      return b.short.length - a.short.length;
    });
};
