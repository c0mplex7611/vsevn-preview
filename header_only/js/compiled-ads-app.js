"use strict";

(function () {
  const C = window.FIGMA_COLORS || {};
  const DEFAULT_ROWS = 500;
  const HL = "search-highlight";
  const COLUMNS = window.FIGMA_COLUMNS || [];
  const RADIO = window.FIGMA_RADIO || [];

  const appState = {
    rowsPerPage: DEFAULT_ROWS,
    currentPage: 1,
    dateFrom: "12.05.2023",
    dateTo: "12.05.2023",
    dateFilterActive: false,
    status: "Активные",
    responsesOnly: false,
    withoutTags: false,
    wrapText: true,
    collapseAll: false,
    earlyDepub: false,
    changedDepub: false,
    xmlFile: "",
    group: "",
    quickSearch: {},
    sort: { key: null, direction: "asc" },
    processedAds: [],
  };

  let legalForms = [];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return pad(p[2]) + "." + pad(p[1]) + "." + p[0];
  }

  /* Ячейки дат в таблице: ДД.ММ.ГГ. (как в макете) */
  function formatAdDateCell(str) {
    const s = String(str || "").trim();
    if (!s) return "";
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\.?$/);
    if (!m) return s.endsWith(".") ? s : s + ".";
    const yy = m[3].length === 4 ? m[3].slice(-2) : pad(+m[3]);
    return pad(+m[1]) + "." + pad(+m[2]) + "." + yy + ".";
  }

  function parseRuDate(str) {
    const m = String(str || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }

  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeSearchText(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[«»"'`\-–—.,;:!?()[\]{}\\/|@#$%^&*+=~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getWords(str) {
    return normalizeSearchText(str).split(" ").filter(Boolean);
  }

  function matchesPrefixSearch(text, query) {
    if (!query) return true;
    const q = normalizeSearchText(query);
    if (!q) return true;
    return getWords(text).some(function (w) {
      return w.indexOf(q) === 0;
    });
  }

  /* +7 904 058-4798 → 89040584798 */
  function formatPhoneDisplay(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return String(phone || "").trim();
    if (digits.length === 11 && digits.charAt(0) === "7") {
      return "8" + digits.slice(1);
    }
    return digits;
  }

  function matchesPhoneSearch(phones, query) {
    if (!query) return true;
    const qDigits = String(query || "").replace(/\D/g, "");
    if (!qDigits) return true;
    return (phones || []).some(function (p) {
      return formatPhoneDisplay(p).indexOf(qDigits) === 0;
    });
  }

  function highlightPhoneText(phone, query) {
    const display = formatPhoneDisplay(phone);
    if (!query) return escHtml(display);
    const qDigits = String(query || "").replace(/\D/g, "");
    if (!qDigits || display.indexOf(qDigits) !== 0) return escHtml(display);
    return (
      '<span class="' +
      HL +
      '">' +
      escHtml(display.slice(0, qDigits.length)) +
      "</span>" +
      escHtml(display.slice(qDigits.length))
    );
  }

  function matchesInnNameSearch(ad, query) {
    if (!query) return true;
    return (
      matchesPrefixSearch(ad.inn, query) ||
      matchesPrefixSearch(ad.companySearch, query)
    );
  }

  function getInvoiceNumberFromLine(invoiceLine) {
    const s = String(invoiceLine || "");
    const idx = s.toLowerCase().indexOf(" от ");
    return (idx >= 0 ? s.slice(0, idx) : s).trim();
  }

  function parseInvoiceQuery(query) {
    const s = normalizeSearchText(query).replace(/\s/g, "");
    const m = s.match(/^([\p{L}]*)(\d*)$/u);
    if (!m) return { letters: "", digits: s };
    const digitsRaw = m[2];
    const digits = digitsRaw ? digitsRaw.replace(/^0+/, "") || "0" : "";
    return { letters: m[1], digits: digits };
  }

  function normalizeInvoiceNumber(invoiceNumber) {
    const s = normalizeSearchText(invoiceNumber).replace(/\s/g, "");
    const m = s.match(/^([\p{L}]+)(\d+)$/u);
    if (!m) return s;
    const digits = m[2].replace(/^0+/, "") || "0";
    return m[1] + digits;
  }

  /* Номер счёта: без учёта регистра, нули после букв игнорируются (П00000006574 → п6574) */
  function matchesInvoiceSearch(invoiceLine, query) {
    if (!query) return true;
    const q = parseInvoiceQuery(query);
    if (!q.letters && !q.digits) return true;

    const normalized = normalizeInvoiceNumber(
      getInvoiceNumberFromLine(invoiceLine),
    );
    const nMatch = normalized.match(/^([\p{L}]*)(\d+)$/u);
    const nDigits = nMatch ? nMatch[2] : normalized;

    if (q.letters) {
      return normalized.indexOf(q.letters + q.digits) === 0;
    }
    if (!q.digits) return true;
    return nDigits.indexOf(q.digits) === 0;
  }

  function findInvoiceHighlightRange(invoiceNumber, query) {
    const q = parseInvoiceQuery(query);
    if (!q.letters && !q.digits) return null;
    if (!matchesInvoiceSearch(invoiceNumber, query)) return null;

    const num = String(invoiceNumber || "");
    const lower = num.toLowerCase();
    let i = 0;
    while (i < lower.length && /\p{L}/u.test(lower[i])) i += 1;
    let sigStart = i;
    while (sigStart < num.length && num[sigStart] === "0") sigStart += 1;

    if (q.letters) {
      return { start: 0, end: sigStart + q.digits.length };
    }
    return { start: sigStart, end: sigStart + q.digits.length };
  }

  function highlightInvoiceLine(invoiceLine, query) {
    if (!query || !invoiceLine) return escHtml(invoiceLine);
    const q = parseInvoiceQuery(query);
    if (!q.letters && !q.digits) return escHtml(invoiceLine);

    const line = String(invoiceLine);
    const sepIdx = line.toLowerCase().indexOf(" от ");
    const numPart = sepIdx >= 0 ? line.slice(0, sepIdx) : line;
    const restPart = sepIdx >= 0 ? line.slice(sepIdx) : "";
    const range = findInvoiceHighlightRange(numPart, query);
    if (!range) return escHtml(invoiceLine);

    return (
      escHtml(numPart.slice(0, range.start)) +
      '<span class="' +
      HL +
      '">' +
      escHtml(numPart.slice(range.start, range.end)) +
      "</span>" +
      escHtml(numPart.slice(range.end)) +
      escHtml(restPart)
    );
  }

  function highlightText(text, query) {
    if (!query || !text) return escHtml(text);
    const q = normalizeSearchText(query);
    if (!q) return escHtml(text);
    const sep = /[\s«»"'`\-–—.,;:!?()[\]{}\\/|@#$%^&*+=~]/;
    let result = "";
    const raw = String(text);
    let i = 0;
    while (i < raw.length) {
      if (sep.test(raw[i])) {
        result += escHtml(raw[i]);
        i += 1;
        continue;
      }
      let word = "",
        j = i;
      while (j < raw.length && !sep.test(raw[j])) {
        word += raw[j];
        j += 1;
      }
      if (normalizeSearchText(word).indexOf(q) === 0) {
        const hlLen = Math.min(word.length, q.length);
        result +=
          '<span class="' +
          HL +
          '">' +
          escHtml(word.slice(0, hlLen)) +
          "</span>" +
          escHtml(word.slice(hlLen));
      } else {
        result += escHtml(word);
      }
      i = j;
    }
    return result;
  }

  function unixToRuTime(ts) {
    const n = Number(ts);
    if (!n) return "";
    const d = new Date(n * 1000);
    if (isNaN(d.getTime())) return "";
    const pad = function (x) {
      return String(x).padStart(2, "0");
    };
    return (
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
    );
  }

  function normalizeSpaces(str) {
    return String(str || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatCompanyName(raw, legalFormShort) {
    let name = normalizeSpaces(raw)
      .replace(/[–—]/g, "-")
      .replace(/\s*\.\s*$/, "");
    const quoteCount = (name.match(/[«»"]/g) || []).length;
    if (quoteCount === 2) name = name.replace(/[«»"]/g, "");
    else if (quoteCount >= 3) name = name.replace(/^["«]/, "");

    let detectedShort = normalizeSpaces(legalFormShort || "");
    const shorts = [];
    legalForms.forEach(function (lf) {
      if (lf.short) shorts.push(lf.short);
    });
    ["ГБУЗ НО", "ПАО", "ЗАО", "ООО", "АО", "ИП", "ГБУЗ"].forEach(function (sf) {
      if (shorts.indexOf(sf) === -1) shorts.push(sf);
    });
    shorts.sort(function (a, b) {
      return b.length - a.length;
    });

    for (let si = 0; si < shorts.length; si += 1) {
      const sf = shorts[si];
      const prefix = sf.toLowerCase() + " ";
      if (name.toLowerCase().indexOf(prefix) === 0) {
        name = normalizeSpaces(name.slice(sf.length));
        detectedShort = sf;
        break;
      }
    }

    legalForms.forEach(function (lf) {
      if (name.toLowerCase().indexOf(lf.full.toLowerCase()) !== -1) {
        name = normalizeSpaces(
          name.replace(
            new RegExp(lf.full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
            "",
          ),
        );
        if (lf.short) detectedShort = lf.short;
      }
    });

    shorts.forEach(function (sf) {
      const re = new RegExp(
        "(^|\\s)" + sf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)",
        "ig",
      );
      if (re.test(name)) {
        name = normalizeSpaces(name.replace(re, " "));
        if (!detectedShort) detectedShort = sf;
      }
    });

    name = normalizeSpaces(name);
    const display = detectedShort ? name + ", " + detectedShort : name;
    return { name: name, legalForm: detectedShort, display: display };
  }

  function formatSchetDate(raw) {
    const m = String(raw || "")
      .trim()
      .match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
    if (!m) return String(raw || "");
    let year = m[3];
    if (year.length === 2) year = (Number(year) >= 70 ? "19" : "20") + year;
    return m[1] + "." + m[2] + "." + year;
  }

  function renderCompanyLine(ad, query) {
    const nameHtml = highlightText(ad.companyName, query);
    if (!ad.companyLegalForm) return nameHtml;
    return (
      nameHtml +
      ', <span class="ads-company-form">' +
      escHtml(ad.companyLegalForm) +
      "</span>"
    );
  }

  function getCompanySearchText(formatted) {
    const parts = formatted.split(",");
    return parts[0] ? parts[0].trim() : formatted;
  }

  // Категории статусов и типов объявлений по макету Figma
  const STATUS_CYCLE = [
    "Активно",
    "Завершено",
    "Просрочено",
    "Не опубликовано",
  ];
  const AD_TYPES = ["ГАЗЕТА", "ИНТЕРНЕТ", "РАДИО", "ТВ", "СМИ", "ДОСКА"];
  const DEMO_STATUSES = ["Активно", "Модерация", "Завершено"];

  function getDemoStatus(ad, globalIdx) {
    if (globalIdx < 6) return DEMO_STATUSES[globalIdx % DEMO_STATUSES.length];
    return ad.status || "Активно";
  }

  function isModerationStatus(status) {
    return /^(на )?модерац/i.test(String(status || "").trim());
  }

  function getStatusBadgeClass(status) {
    if (/^актив/i.test(status)) return "ads-status-badge--active";
    if (isModerationStatus(status)) return "ads-status-badge--moderation";
    if (/^заверш/i.test(status)) return "ads-status-badge--done";
    return "ads-status-badge--active";
  }

  function renderStatusBadge(status) {
    const text = formatStatusDisplay(status);
    return (
      '<div class="ads-cell-line ads-status-line">' +
      '<span class="ads-status-badge ' +
      getStatusBadgeClass(status) +
      '"><span class="ads-status-text" data-text="' +
      escHtml(text) +
      '">' +
      escHtml(text) +
      "</span></span></div>"
    );
  }

  function formatStatusDisplay(status) {
    if (/^актив/i.test(status)) return "Активное";
    if (isModerationStatus(status)) return "Модерация";
    if (/^заверш/i.test(status)) return "Завершено";
    if (/^просроч/i.test(status)) return "Просрочено";
    if (/^не опубл/i.test(status)) return "Не опубликовано";
    return String(status || "");
  }

  function pickOption(key, id) {
    const list = (window.SELECT_OPTIONS && window.SELECT_OPTIONS[key]) || [];
    const real = list.filter(function (o) {
      return o.value;
    });
    if (!real.length) return "";
    return real[id % real.length].value;
  }

  function processAdsData() {
    legalForms = window.parseLegalForms
      ? window.parseLegalForms(window.LEGAL_FORMS_RAW)
      : [];
    appState.processedAds = (window.ADS_DATA || []).map(function (ad) {
      const company = formatCompanyName(ad.companyRaw, ad.legalForm);
      const invoiceDate = ad.invoiceDateRaw || ad.invoiceDate || "";
      const date4FromXml = (ad.date4 && String(ad.date4).trim()) || "";
      const date5FromXml = (ad.date5 && String(ad.date5).trim()) || "";
      return {
        id: ad.id,
        mergedCount: ad.mergedCount || null,
        phones: ad.phones || [],
        email: ad.email || "",
        status: ad.status || "",
        xmlFile: ad.xmlFile || "",
        groupOk: ad.groupOk || "",
        adType: ad.adType || "",
        vacancy: ad.vacancy || "",
        applicantFio: ad.applicantFio || "",
        source: ad.source || "",
        invoiceLine: ad.invoiceNumber + " от " + formatSchetDate(invoiceDate),
        inn: ad.inn || "",
        companyDisplay: company.display,
        companyName: company.name,
        companyLegalForm: company.legalForm,
        companySearch: getCompanySearchText(company.display),
        address: ad.address || ad.city || "",
        timeLabel: ad.timeLabel || "",
        daysLeft: (ad.daysLeft && String(ad.daysLeft).trim()) || "30",
        depubTime:
          ad.depubTime ||
          unixToRuTime(ad.publOffRaw) ||
          unixToRuTime(ad.publOnRaw) ||
          "",
        date1: ad.date1 || "",
        date2: ad.date2 || "",
        date3: ad.date3 || "",
        date4FromXml: date4FromXml,
        date5FromXml: date5FromXml,
        date4: date4FromXml,
        date5: date5FromXml || ad.date2 || "",
        responseDate: ad.responseDate || "",
        mergedLink: ad.mergedLink || ad.vacancyLink || ad.link || "",
        vacancyLink: ad.vacancyLink || ad.link || "",
        resumeLink: ad.resumeLink || "",
        link: ad.vacancyLink || ad.link || "",
        dutiesHtml: ad.dutiesHtml || "",
        requirementsHtml: ad.requirementsHtml || "",
        conditionsHtml: ad.conditionsHtml || "",
        dutiesPlain: normalizePlainItems(ad.dutiesPlain || []),
        requirementsPlain: normalizePlainItems(ad.requirementsPlain || []),
        conditionsPlain: normalizePlainItems(ad.conditionsPlain || []),
        publishedDate: ad.publishedDate,
        hasResponse: !!(ad.applicantFio && ad.applicantFio.trim()),
        mergedSources: ad.mergedSources || null,
      };
    });
  }

  function statusMatch(ad) {
    switch (appState.status) {
      case "Все":
        return true;
      case "Активные":
        return /^актив/i.test(ad.status);
      case "Завершенные":
        return /^заверш/i.test(ad.status);
      case "Просроченные":
        return /^просроч/i.test(ad.status);
      case "Ещё не опубликованные":
        return /^не опубл/i.test(ad.status);
      default:
        return true;
    }
  }

  /* ТЗ п.16: счётчик = количество записей после всех фильтров (селект, поиск, календарь и др.) */
  function getFilteredAds() {
    const qs = appState.quickSearch;
    const from = parseRuDate(appState.dateFrom);
    const to = parseRuDate(appState.dateTo);

    return appState.processedAds.filter(function (ad) {
      if (appState.responsesOnly && !ad.hasResponse) return false;
      if (!statusMatch(ad)) return false;
      if (appState.xmlFile && ad.xmlFile !== appState.xmlFile) return false;
      if (appState.group && ad.groupOk !== appState.group) return false;
      if (appState.earlyDepub && !ad.date5FromXml) return false;
      if (
        appState.changedDepub &&
        !(ad.date4FromXml && ad.date4FromXml !== ad.date3)
      )
        return false;

      if (appState.dateFilterActive && (from || to)) {
        const pd = ad.publishedDate ? new Date(ad.publishedDate) : null;
        if (pd) {
          if (from && pd < from) return false;
          if (to && pd > to) return false;
        }
      }

      const checks = {
        id: String(ad.id),
        email: ad.email,
        vacancy: ad.vacancy,
        fio: ad.applicantFio,
        invoice: ad.invoiceLine,
      };
      for (const key in checks) {
        const q = qs[key];
        if (!q) continue;
        if (key === "invoice") {
          if (!matchesInvoiceSearch(checks[key], q)) return false;
        } else if (key === "phone") {
          if (!matchesPhoneSearch(ad.phones, q)) return false;
        } else if (!matchesPrefixSearch(checks[key], q)) {
          return false;
        }
      }
      if (qs.innName && !matchesInnNameSearch(ad, qs.innName)) return false;
      return true;
    });
  }

  function sortValue(ad, key) {
    switch (key) {
      case "num":
        return Number(ad.id) || 0;
      case "id":
        return Number(ad.id) || 0;
      case "vacancy":
        return (ad.vacancy || "").toLowerCase();
      case "fio":
        return (ad.applicantFio || "").toLowerCase();
      case "invoice":
        return (ad.invoiceLine || "").toLowerCase();
      case "inn":
        return String(ad.inn || "")
          .replace(/\D/g, "")
          .padStart(20, "0");
      case "company":
        return (ad.companyDisplay || "").toLowerCase();
      default:
        return "";
    }
  }

  function toggleSort(key) {
    hideAdsTip();
    if (appState.sort.key === key) {
      appState.sort.direction =
        appState.sort.direction === "asc" ? "desc" : "asc";
    } else {
      appState.sort.key = key;
      appState.sort.direction = "asc";
    }
    updateSortIcons();
    renderTable();
  }

  function sortAds(ads) {
    const s = appState.sort;
    if (!s.key) return ads.slice();
    const dir = s.direction === "desc" ? -1 : 1;
    return ads.slice().sort(function (a, b) {
      const av = sortValue(a, s.key),
        bv = sortValue(b, s.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function getPagedAds() {
    const filtered = sortAds(getFilteredAds());
    const total = filtered.length;
    const perPage = appState.rowsPerPage;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (appState.currentPage > totalPages) appState.currentPage = totalPages;
    if (appState.currentPage < 1) appState.currentPage = 1;
    const start = (appState.currentPage - 1) * perPage;
    return {
      items: filtered.slice(start, start + perPage),
      total: total,
      totalPages: totalPages,
    };
  }

  /* ---------- Текстовая ячейка (ТЗ п.21: Обязанности / Требования / Условия) ---------- */
  const LIST_MARKER_PREFIX_RE =
    /^[\s\u25A0\u25A1\u25AA\u25AB\u25AC\u25AD\u25AE\u25AF■□●○◆♦►▪▫◾◽⯏◈⟐◊◘⁎⁕—\-–\u00A0]+/i;

  function stripListMarker(text) {
    return String(text || "")
      .replace(LIST_MARKER_PREFIX_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePlainItems(items) {
    return (items || []).map(stripListMarker).filter(Boolean);
  }

  /* Режим с тегами (ТЗ п.21): на экране видны &lt;BR/&gt;, &#x25A0; — как в макете */
  function htmlToVisibleTagMarkup(html) {
    return String(html || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&amp;lt;")
      .replace(/>/g, "&amp;gt;")
      .replace(/\u25A0\u00A0/g, "&amp;#x25A0;&amp;#xA0;")
      .replace(/\u25A0 /g, "&amp;#x25A0;&amp;#xA0;")
      .replace(/\u25A0/g, "&amp;#x25A0;")
      .replace(/\u00A0/g, "&amp;#xA0;");
  }

  function extractConditionsHtmlOnly(html) {
    const m = String(html || "").match(/<b>\s*Условия\s*:<\/b>[\s\S]*$/i);
    return m ? m[0] : html;
  }

  function htmlToPlainItems(html) {
    if (!html) return [];
    const items = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(String(html))) !== null) {
      const item = stripListMarker(m[1].replace(/<[^>]+>/g, ""));
      if (item) items.push(item);
    }
    return items;
  }

  function extractSectionPlain(html, title) {
    if (!html) return [];
    const re = new RegExp(
      "<b>\\s*" +
        title +
        "\\s*:</b>([\\s\\S]*?)(?=<b>\\s*(?:Обязанности|Требования|Условия)\\s*:</b>|$)",
      "i",
    );
    const m = String(html).match(re);
    return htmlToPlainItems(m ? m[1] : "");
  }

  function getSectionPlain(ad, title) {
    const plainKey =
      title === "Обязанности"
        ? "dutiesPlain"
        : title === "Требования"
          ? "requirementsPlain"
          : "conditionsPlain";
    if (ad[plainKey] && ad[plainKey].length)
      return normalizePlainItems(ad[plainKey]);
    const htmlKey =
      title === "Обязанности"
        ? "dutiesHtml"
        : title === "Требования"
          ? "requirementsHtml"
          : "conditionsHtml";
    let items = htmlToPlainItems(ad[htmlKey] || "");
    if (!items.length) items = extractSectionPlain(getAdTextHtml(ad), title);
    return normalizePlainItems(items);
  }

  function getAdTextHtml(ad) {
    const d = ad.dutiesHtml || "";
    const r = ad.requirementsHtml || "";
    const c = ad.conditionsHtml || "";
    /* conditionsHtml иногда содержит весь DOPINFORMS — не дублируем обязанности/требования */
    if (d && r && c && /<b>\s*Обязанности\s*:/i.test(c)) {
      return d + r + extractConditionsHtmlOnly(c);
    }
    return d + r + c;
  }

  function buildPlainSection(title, items) {
    if (!items || !items.length) return "";
    let html =
      '<div class="text-section"><div class="text-section-title">' +
      escHtml(title) +
      ":</div>";
    items.forEach(function (item) {
      const line = stripListMarker(item);
      if (!line) return;
      html +=
        '<div class="text-section-item"><span class="text-marker" aria-hidden="true"></span><span class="text-section-text">' +
        escHtml(line) +
        "</span></div>";
    });
    return html + "</div>";
  }

  const adTextHtmlSource = {};

  function buildTextCell(ad) {
    const sourceHtml = getAdTextHtml(ad);
    if (appState.withoutTags) {
      return (
        '<div class="ads-text-plain">' +
        buildPlainSection("Обязанности", getSectionPlain(ad, "Обязанности")) +
        buildPlainSection("Требования", getSectionPlain(ad, "Требования")) +
        buildPlainSection("Условия", getSectionPlain(ad, "Условия")) +
        "</div>"
      );
    }
    /* По умолчанию (ТЗ п.21): теги и маркеры видны как в xml — &lt;BR/&gt;&lt;B&gt;… &#x25A0; */
    if (!sourceHtml) return "";
    adTextHtmlSource[ad.id] = sourceHtml;
    return (
      '<div class="ads-text-html" data-ad-id="' +
      ad.id +
      '">' +
      htmlToVisibleTagMarkup(sourceHtml) +
      "</div>"
    );
  }

  function getSelectionHtml(sel) {
    if (!sel || !sel.rangeCount) return "";
    const range = sel.getRangeAt(0);
    const box = document.createElement("div");
    box.appendChild(range.cloneContents());
    return box.innerHTML;
  }

  function buildPlainClipboardHtml(plainEl) {
    const clone = plainEl.cloneNode(true);
    clone.querySelectorAll(".text-marker").forEach(function (m) {
      m.setAttribute(
        "style",
        "display:inline-block;width:7px;height:7px;background:" +
          (C.muted || "#4D4343") +
          ";box-shadow:inset 0 0 0 2px #fff;margin-right:6px;vertical-align:middle;flex-shrink:0;",
      );
    });
    clone.querySelectorAll(".text-section-title").forEach(function (t) {
      const label = document.createElement("div");
      label.innerHTML =
        '<b style="font-weight:400;color:' +
        (C.textPrimary || "#62560E") +
        ';">' +
        escHtml(t.textContent) +
        "</b>";
      t.replaceWith(label.firstChild);
    });
    clone.querySelectorAll(".text-section-text").forEach(function (t) {
      t.setAttribute(
        "style",
        "font-weight:300;color:" + (C.muted || "#4D4343") + ";",
      );
    });
    return clone.innerHTML;
  }

  function setClipboardData(e, html, text) {
    if (e.clipboardData) {
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", text);
      return;
    }
    if (navigator.clipboard && window.ClipboardItem) {
      e.preventDefault();
      navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    }
  }

  function initTextCellCopy() {
    const tbody = document.getElementById("adsTableBody");
    if (!tbody || tbody.dataset.textCopyBound) return;
    tbody.dataset.textCopyBound = "1";
    tbody.addEventListener("copy", function (e) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const node = sel.anchorNode;
      const root = node && (node.nodeType === 1 ? node : node.parentElement);
      const content = root && root.closest(".ads-text-content");
      if (!content) return;

      const plainEl = content.querySelector(".ads-text-plain");
      const htmlEl = content.querySelector(".ads-text-html");
      e.preventDefault();

      if (plainEl) {
        const text = sel.toString() || plainEl.innerText;
        const html = buildPlainClipboardHtml(plainEl);
        setClipboardData(e, html, text);
        return;
      }
      if (htmlEl) {
        const raw = adTextHtmlSource[htmlEl.dataset.adId] || "";
        const selected = sel.toString();
        const full = htmlEl.textContent || "";
        if (!selected || selected === full.trim()) {
          setClipboardData(e, raw, raw);
        } else {
          setClipboardData(e, selected, selected);
        }
      }
    });
  }

  const COPY_ICON_V = "5";

  function copyBtn(text, variant) {
    variant = variant || "link";
    const isLink = /^https?:\/\//i.test(text);
    const label = isLink ? "Скопировать ссылку" : "Скопировать";
    const base = variant === "purple" ? "copy-purple" : "copy";
    const v = "?v=" + COPY_ICON_V;
    return (
      '<button type="button" class="ads-copy-ico ads-copy-ico--' +
      variant +
      '" tabindex="0" aria-label="' +
      escHtml(label) +
      '" data-copy="' +
      escHtml(text) +
      '">' +
      '<img class="ads-copy-ico-idle" src="icons/compiled-ads/' +
      base +
      ".svg" +
      v +
      '" width="20" height="20" alt="" />' +
      '<img class="ads-copy-ico-active" src="icons/compiled-ads/' +
      base +
      "-hover.svg" +
      v +
      '" width="20" height="20" alt="" />' +
      "</button>"
    );
  }

  function linkTipText(url) {
    return /resume/i.test(url)
      ? "Открыть резюме на сайте hh.ru"
      : "Открыть объявление на сайте";
  }

  function vacancyCountTipText() {
    return "Посмотреть все отклики";
  }

  function getResumeUrl(ad) {
    if (ad.resumeLink && String(ad.resumeLink).trim())
      return String(ad.resumeLink).trim();
    if (ad.applicantFio && String(ad.applicantFio).trim())
      return "https://nn.hh.ru/resume/" + String(ad.id).padStart(8, "0");
    return "";
  }

  function resumeIcoBtn(url) {
    return (
      '<a class="ads-resume-ico ads-cell-link" href="' +
      escHtml(url) +
      '" target="_blank" rel="noopener noreferrer" data-tip="' +
      escHtml("Открыть карточку резюме") +
      '" aria-label="Открыть карточку резюме">' +
      '<svg class="ads-resume-ico-svg" width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path class="ads-resume-ico-path" d="M7.11246 19.9913H2.1624C1.56318 19.9913 1.02475 19.7482 0.633956 19.3574C0.234477 18.9666 0 18.4282 0 17.8289V5.11509C0 4.95009 0.0694746 4.80245 0.173686 4.68956C0.286583 4.58534 0.434216 4.51587 0.599218 4.51587H5.17586V5.24535H0.720799V17.8203C0.720799 18.2197 0.885801 18.5758 1.14633 18.8363C1.40686 19.0968 1.76292 19.2619 2.1624 19.2619H7.11246V19.9913Z"/>' +
      '<path class="ads-resume-ico-path" d="M6.01819 0H15.7533C17.056 0 18.237 0.538428 19.0968 1.38949C19.9565 2.24056 20.4863 3.43031 20.4863 4.73296V17.0473C20.4863 17.855 20.1476 18.5931 19.6178 19.1316C19.0794 19.67 18.3412 20 17.5336 20H6.6261C6.15714 20 5.72293 19.8089 5.41897 19.4963C5.10634 19.1924 4.91528 18.7581 4.91528 18.2892V1.10291C4.91528 0.798958 5.03686 0.52106 5.24529 0.32132C5.42766 0.130265 5.70556 0 6.01819 0ZM15.7533 0.729483H6.01819C5.91398 0.729483 5.81845 0.772905 5.74898 0.84238C5.6795 0.911854 5.63608 1.00738 5.63608 1.10291V18.2718C5.63608 18.541 5.74898 18.7929 5.92267 18.9666C6.10504 19.1489 6.3482 19.2531 6.61741 19.2531H17.5336C18.1502 19.2531 18.6973 19.01 19.1055 18.6018C19.5049 18.2023 19.7568 17.6465 19.7568 17.0386V4.73296C19.7568 3.63873 19.3052 2.63135 18.5757 1.91055C17.8549 1.18107 16.8562 0.729483 15.7533 0.729483Z"/>' +
      '<path class="ads-resume-ico-path" d="M7.89404 5.72289C7.6943 5.72289 7.5293 5.55789 7.5293 5.35815C7.5293 5.15841 7.6943 4.99341 7.89404 4.99341H15.8836C16.0834 4.99341 16.2484 5.15841 16.2484 5.35815C16.2484 5.55789 16.0834 5.72289 15.8836 5.72289H7.89404Z"/>' +
      '<path class="ads-resume-ico-path" d="M7.89404 10.2475C7.6943 10.2475 7.5293 10.0825 7.5293 9.88281C7.5293 9.68307 7.6943 9.51807 7.89404 9.51807H12.5662C12.7659 9.51807 12.9309 9.68307 12.9309 9.88281C12.9309 10.0912 12.7659 10.2475 12.5662 10.2475H7.89404Z"/>' +
      '<path class="ads-resume-ico-path" d="M7.89404 14.5376C7.6943 14.5376 7.5293 14.3726 7.5293 14.1728C7.5293 13.9731 7.6943 13.8081 7.89404 13.8081H12.5662C12.7659 13.8081 12.9309 13.9731 12.9309 14.1728C12.9309 14.3813 12.7659 14.5376 12.5662 14.5376H7.89404Z"/>' +
      '<path class="ads-resume-ico-path" d="M17.6553 14.2423C17.6553 14.4507 17.4903 14.607 17.2905 14.607C17.0908 14.607 16.9258 14.442 16.9258 14.2423V6.25268C16.9258 6.04426 17.0908 5.88794 17.2905 5.88794C17.4903 5.88794 17.6553 6.05294 17.6553 6.25268V14.2423Z"/>' +
      "</svg></a>"
    );
  }

  function fioLineInner(fioText, query, resumeUrl, withActions) {
    const url = resumeUrl || "";
    let html =
      '<a class="ads-fio-link ads-cell-link" href="' +
      escHtml(url) +
      '" target="_blank" rel="noopener noreferrer" data-tip="' +
      escHtml("Открыть резюме на сайте hh.ru") +
      '">' +
      highlightText(fioText, query) +
      "</a>";
    if (withActions && url) {
      html += copyBtn(url, "link");
      html += resumeIcoBtn(url);
    }
    return html;
  }

  const SOURCE_LINK_SUFFIXES = ["", "(ов)", "(ос)"];

  /* ТЗ п.25: ссылка + иконка копирования сразу после неё */
  function linkLine(url, withCopy, suffix) {
    const disp = String(url || "").trim();
    const suffixText = suffix ? String(suffix).trim() : "";
    const suffixHtml = suffixText
      ? '<span class="ads-source-suffix">' + escHtml(suffixText) + "</span>"
      : "";
    const wrapAttrs =
      appState.wrapText &&
      !(
        document.getElementById("adsTable") &&
        document.getElementById("adsTable").classList.contains("no-wrap")
      )
        ? ' data-wrap-src="' +
          escHtml(disp) +
          '" data-wrap-kind="source-link" data-wrap-url="' +
          escHtml(url) +
          '" data-wrap-no-hyphen="true"'
        : "";
    return (
      '<div class="ads-cell-line is-link"' +
      wrapAttrs +
      ">" +
      '<a class="ads-cell-link" href="' +
      escHtml(url) +
      '" target="_blank" rel="noopener noreferrer" data-tip="' +
      escHtml(linkTipText(url)) +
      '">' +
      escHtml(disp) +
      "</a>" +
      suffixHtml +
      (withCopy ? copyBtn(url, "link") : "") +
      "</div>"
    );
  }

  function line(content, cls) {
    return (
      '<div class="ads-cell-line' +
      (cls ? " " + cls : "") +
      '">' +
      content +
      "</div>"
    );
  }

  /* Даты, номера, чистые цифры — перенос без дефиса (ТЗ: не syllable-hyphen для цифр) */
  function isNoHyphenToken(token) {
    const core = splitWordPunct(String(token || "")).core;
    if (!core) return false;
    if (/^\d{1,2}\.\d{1,2}\.\d{2,4}\.?$/.test(core)) return true;
    if (/^[A-Za-zА-Яа-яЁё]?\d+$/.test(core)) return true;
    if (/^\d+[A-Za-zА-Яа-яЁё]?$/.test(core)) return true;
    if (/^[\d.\-+/:()]+$/.test(core)) return true;
    return false;
  }

  function isNoHyphenWrapText(text) {
    const parts = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return false;
    return parts.every(isNoHyphenToken);
  }

  function dateLine(content, cls) {
    return (
      '<div class="ads-cell-line ads-cell-line--no-hyphen' +
      (cls ? " " + cls : "") +
      '" data-wrap-no-hyphen="true">' +
      content +
      "</div>"
    );
  }

  /* Объединённые отклики: у каждой ссылки — свои даты и daysLeft */
  function getMergedSourceEntries(ad) {
    if (ad.mergedSources && ad.mergedSources.length > 1)
      return ad.mergedSources;
    if (
      ad.applicantFio &&
      ad.applicantFio.trim() &&
      ad.mergedCount &&
      Number(ad.mergedCount) > 1
    ) {
      const count = Math.min(Number(ad.mergedCount), 3);
      const entries = [];
      for (let i = 0; i < count; i += 1) {
        entries.push({
          link: ad.vacancyLink || ad.link || "",
          suffix: SOURCE_LINK_SUFFIXES[i] || "",
          date1: ad.date1,
          date2: ad.date2,
          date3: ad.date3,
          date4: ad.date4FromXml || ad.date4 || ad.date3 || ad.date2 || "",
          daysLeft: ad.daysLeft,
        });
      }
      return entries;
    }
    return null;
  }

  function getSourceDateValue(entry, field) {
    const val = entry[field];
    if (val && String(val).trim()) return val;
    if (field === "date4") return entry.date3 || entry.date2 || "";
    return "";
  }

  function renderSourceDateLines(entries, field, cls) {
    return entries
      .map(function (entry) {
        return dateLine(
          escHtml(formatAdDateCell(getSourceDateValue(entry, field))),
          cls,
        );
      })
      .join("");
  }

  function getSourceLinkReserveWidth(el, scale) {
    let reserve = 0;
    const gap = 9;
    const suffixEl = el.querySelector(".ads-source-suffix");
    const copyEl = el.querySelector(".ads-copy-ico");
    if (suffixEl) {
      reserve +=
        Math.ceil(suffixEl.getBoundingClientRect().width / scale) + gap;
    }
    if (copyEl) {
      reserve += Math.ceil(copyEl.getBoundingClientRect().width / scale) + gap;
    }
    return reserve;
  }

  function applySourceLinkTruncate(el, td) {
    const src = el.getAttribute("data-wrap-src");
    const url = el.getAttribute("data-wrap-url") || "";
    if (!src || typeof truncateTextToWidth !== "function") return;
    const linkEl = el.querySelector(".ads-cell-link");
    if (!linkEl) return;
    const scale = getPageScale();
    const maxW = Math.max(
      20,
      getTdContentWidth(td) - getSourceLinkReserveWidth(el, scale),
    );
    const result = truncateTextToWidth(
      src,
      ADS_WRAP_FONT,
      ADS_WRAP_WEIGHT,
      maxW,
    );
    linkEl.textContent = result.text;
    if (url) linkEl.setAttribute("href", url);
  }

  const ADS_WRAP_FONT = 20;
  const ADS_WRAP_WEIGHT = 300;
  const ADS_WRAP_EDGE = 1;

  let adsWrapMeasureContext = null;
  function wrapTextWidth(text, size, weight) {
    if (!adsWrapMeasureContext) {
      const canvas = document.createElement("canvas");
      adsWrapMeasureContext = canvas.getContext("2d");
    }
    const ctx = adsWrapMeasureContext;
    if (!ctx) return String(text || "").length * Number(size || 0) * 0.55;
    const family =
      typeof STATIC_TEXT_FAMILY !== "undefined"
        ? STATIC_TEXT_FAMILY
        : "Roboto, sans-serif";
    ctx.font = weight + " " + size + "px " + family;
    return Math.ceil(ctx.measureText(String(text || "")).width);
  }

  function wrapTextFits(text, maxWidth, size, weight) {
    if (!text) return true;
    return wrapTextWidth(text, size, weight) <= maxWidth;
  }

  function fillTextFits(text, maxWidth, size, weight, plain) {
    if (plain) return wrapTextFits(text, maxWidth, size, weight);
    if (typeof measureTextWidth !== "function") return true;
    return measureTextWidth(text, size, weight) <= maxWidth;
  }

  function fillTextWidth(text, size, weight, plain) {
    if (plain) return wrapTextWidth(text, size, weight);
    if (typeof measureTextWidth === "function")
      return measureTextWidth(text, size, weight);
    return wrapTextWidth(text, size, weight);
  }

  function isRuVowel(ch) {
    return "аеёиоуыэюяАЕЁИОУЫЭЮЯ".indexOf(ch) >= 0;
  }

  function hasRuVowel(str) {
    for (let i = 0; i < str.length; i += 1) {
      if (isRuVowel(str[i])) return true;
    }
    return false;
  }

  function splitWordPunct(word) {
    const m = String(word || "").match(/^(.+?)([,.;:!?…]*)$/);
    return { core: m ? m[1] : String(word || ""), punct: m ? m[2] : "" };
  }

  /* Перенос по слогам (рус.): V C|C V, один согласный — к следующему слогу */
  function getRuHyphenPoints(token) {
    token = String(token || "");
    if (token.length < 4 || !hasRuVowel(token)) return [];
    const lower = token.toLowerCase();
    const vowelIdx = [];
    for (let i = 0; i < token.length; i += 1) {
      if (isRuVowel(lower[i])) vowelIdx.push(i);
    }
    if (vowelIdx.length < 2) return [];
    const points = [];
    const minBefore = 2;
    const minAfter = 2;
    for (let v = 0; v < vowelIdx.length - 1; v += 1) {
      const cur = vowelIdx[v];
      const next = vowelIdx[v + 1];
      const betweenLen = next - cur - 1;
      if (betweenLen <= 0) continue;
      let breakAt;
      if (betweenLen === 1) breakAt = cur + 1;
      else if (betweenLen === 2) breakAt = cur + 2;
      else breakAt = cur + 1 + Math.floor(betweenLen / 2);
      if (breakAt >= minBefore && breakAt <= token.length - minAfter) {
        points.push(breakAt);
      }
    }
    return points;
  }

  function getHyphenPoints(word, plain) {
    if (plain) return [];
    const { core } = splitWordPunct(word);
    if (isNoHyphenToken(core)) return [];
    const ru = getRuHyphenPoints(core);
    if (ru.length) return ru;
    const points = [];
    for (let i = 2; i <= core.length - 2; i += 1) points.push(i);
    return points;
  }

  function maxSyllableFitLength(text, maxWidth, size, weight, plain) {
    const points = getHyphenPoints(text, plain);
    if (!points.length) return 0;
    let best = 0;
    points.forEach(function (cut) {
      const sample = text.slice(0, cut) + "-";
      if (fillTextFits(sample, maxWidth, size, weight, plain)) best = cut;
    });
    return best;
  }

  function maxFitLength(text, maxWidth, size, weight, withHyphen, plain) {
    text = String(text || "");
    if (!text) return 0;
    if (fillTextFits(text, maxWidth, size, weight, plain)) return text.length;
    if (withHyphen && !plain) {
      const syllableCut = maxSyllableFitLength(
        text,
        maxWidth,
        size,
        weight,
        plain,
      );
      if (syllableCut > 0) return syllableCut;
    }
    let lo = 1;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const sample =
        withHyphen && mid < text.length
          ? text.slice(0, mid) + "-"
          : text.slice(0, mid);
      if (fillTextFits(sample, maxWidth, size, weight, plain)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function getPageScale() {
    if (typeof getCurrentPageScale === "function") return getCurrentPageScale();
    const px = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--px"),
    );
    return px > 0 ? px : 1;
  }

  function getTdContentWidth(td) {
    const rect = td.getBoundingClientRect();
    const scale = getPageScale();
    const st = window.getComputedStyle(td);
    const pl = parseFloat(st.paddingLeft) || 0;
    const pr = parseFloat(st.paddingRight) || 0;
    const designW = Math.floor((rect.width - pl - pr) / scale) - ADS_WRAP_EDGE;
    return Math.max(20, designW);
  }

  function splitLongToken(token, maxWidth, size, weight, noHyphen) {
    const plain = !!noHyphen;
    const parts = [];
    let rest = String(token || "");
    while (rest) {
      if (fillTextFits(rest, maxWidth, size, weight, plain)) {
        parts.push(rest);
        break;
      }
      const lo = maxFitLength(rest, maxWidth, size, weight, !noHyphen, plain);
      if (lo <= 0) break;
      if (lo < rest.length) {
        parts.push(noHyphen ? rest.slice(0, lo) : rest.slice(0, lo) + "-");
        rest = rest.slice(lo);
      } else {
        parts.push(rest);
        rest = "";
      }
    }
    return parts;
  }

  /* Телефон/email: перенос без дефиса, до края (1–2px); только если не помещается */
  function wrapTextPlain(text, maxWidth, size, weight, maxLines) {
    maxLines = maxLines || 999;
    text = String(text || "").trim();
    if (!text || typeof measureTextWidth !== "function") return [text];
    if (wrapTextFits(text, maxWidth, size, weight)) return [text];

    const lines = [];
    let rest = text;

    while (rest && lines.length < maxLines) {
      if (wrapTextFits(rest, maxWidth, size, weight)) {
        lines.push(rest);
        rest = "";
        break;
      }
      let cut = maxFitLength(rest, maxWidth, size, weight, false, true);
      if (cut <= 0) break;
      const piece = rest.slice(0, cut);
      lines.push(piece);
      rest = rest.slice(cut);
    }

    if (rest) {
      if (lines.length < maxLines) lines.push(rest);
      else if (typeof truncateTextToWidth === "function") {
        lines[lines.length - 1] = truncateTextToWidth(
          lines[lines.length - 1] + rest,
          size,
          weight,
          maxWidth,
        ).text;
      }
    }
    return lines.length ? lines : [text];
  }

  const TH_HYPHEN_MIN_REST = 4;

  function isBadRuHyphenBreak(token, cut) {
    if (cut <= 0 || cut >= token.length) return true;
    const before = token[cut - 1];
    const after = token[cut];
    if ("ЪъЬь".indexOf(before) >= 0) return true;
    if ("ЪъЬь".indexOf(after) >= 0) return true;
    return false;
  }

  function pickThHyphenSplit(word, prefix, line1MaxW, line2MaxW, size, weight) {
    const parts = splitWordPunct(word);
    const core = parts.core;
    const punct = parts.punct;
    const prefixText = prefix || "";
    const points = getHyphenPoints(word, false)
      .filter(function (cut) {
        return !isBadRuHyphenBreak(core, cut);
      })
      .sort(function (a, b) {
        return b - a;
      });
    let fallback = null;
    for (let pi = 0; pi < points.length; pi += 1) {
      const cut = points[pi];
      const trialLine = prefixText + core.slice(0, cut) + "-";
      const rest = core.slice(cut) + punct;
      if (
        !fillTextFits(trialLine, line1MaxW, size, weight, false) ||
        !fillTextFits(rest, line2MaxW, size, weight, false)
      ) {
        continue;
      }
      if (!fallback) fallback = { line: trialLine, rest: rest };
      if (rest.replace(/[,.;:!?…]/g, "").length >= TH_HYPHEN_MIN_REST) {
        return { line: trialLine, rest: rest };
      }
    }
    return fallback;
  }

  function tryAppendWordWithHyphenEarly(
    line,
    word,
    line1MaxW,
    line2MaxW,
    size,
    weight,
  ) {
    if (!line || !word) return null;
    const full = line + " " + word;
    if (fillTextFits(full, line1MaxW, size, weight, false)) {
      return { line: full, rest: "" };
    }
    const split = pickThHyphenSplit(
      word,
      line + " ",
      line1MaxW,
      line2MaxW,
      size,
      weight,
    );
    if (split) return split;
    return tryAppendWordWithHyphen(line, word, line1MaxW, size, weight);
  }

  function splitLongTokenEarly(token, line1MaxW, line2MaxW, size, weight) {
    token = String(token || "");
    if (!token) return [""];
    if (fillTextFits(token, line1MaxW, size, weight, false)) return [token];
    const split = pickThHyphenSplit(
      token,
      "",
      line1MaxW,
      line2MaxW,
      size,
      weight,
    );
    if (split) return [split.line, split.rest];
    return splitLongToken(token, line1MaxW, size, weight, false);
  }

  function tryAppendWordWithHyphen(line, word, maxWidth, size, weight) {
    if (!line || !word) return null;
    if (isNoHyphenToken(word)) return null;
    const sepW = fillTextWidth(" ", size, weight, false);
    const baseW = fillTextWidth(line, size, weight, false);
    const remW = maxWidth - baseW - sepW;
    if (remW <= 2) return null;
    const full = line + " " + word;
    if (fillTextFits(full, maxWidth, size, weight, false)) {
      return { line: full, rest: "" };
    }
    const parts = splitWordPunct(word);
    const core = parts.core;
    const punct = parts.punct;
    const points = getHyphenPoints(word, false);
    let best = 0;
    points.forEach(function (cut) {
      if (cut <= 0 || cut >= core.length) return;
      const trial = core.slice(0, cut) + "-";
      if (fillTextWidth(trial, size, weight, false) <= remW) best = cut;
    });
    if (best > 0 && best < core.length) {
      return {
        line: line + " " + core.slice(0, best) + "-",
        rest: core.slice(best) + punct,
      };
    }
    let lo = 1;
    let hi = core.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const trial = core.slice(0, mid) + "-";
      if (fillTextWidth(trial, size, weight, false) <= remW) lo = mid;
      else hi = mid - 1;
    }
    if (lo > 0 && lo < core.length) {
      return {
        line: line + " " + core.slice(0, lo) + "-",
        rest: core.slice(lo) + punct,
      };
    }
    return null;
  }

  /* ТЗ п.24: до края; дефис для текста; телефон/email — wrapTextPlain без дефиса */
  function wrapTextToFillWidth(
    text,
    maxWidth,
    size,
    weight,
    maxLines,
    noHyphen,
  ) {
    if (noHyphen || isNoHyphenWrapText(text))
      return wrapTextPlain(text, maxWidth, size, weight, maxLines);
    maxLines = maxLines || 999;
    text = String(text || "").trim();
    if (!text || typeof measureTextWidth !== "function") return [text];
    if (fillTextFits(text, maxWidth, size, weight, false)) return [text];

    const lines = [];
    let line = "";
    const words = text.split(/\s+/);

    function pushLine(next) {
      if (line) lines.push(line);
      line = next || "";
    }

    for (let wi = 0; wi < words.length; wi += 1) {
      if (lines.length >= maxLines) break;
      const word = words[wi];
      const candidate = line ? line + " " + word : word;
      if (fillTextFits(candidate, maxWidth, size, weight, false)) {
        line = candidate;
        continue;
      }
      if (line) {
        const partial = tryAppendWordWithHyphen(
          line,
          word,
          maxWidth,
          size,
          weight,
        );
        if (partial && partial.rest) {
          lines.push(partial.line);
          line = "";
          words[wi] = partial.rest;
          wi -= 1;
          continue;
        }
        pushLine("");
        wi -= 1;
        continue;
      }
      if (fillTextFits(word, maxWidth, size, weight, false)) {
        line = word;
        continue;
      }
      const parts = splitLongToken(
        word,
        maxWidth,
        size,
        weight,
        noHyphen || isNoHyphenToken(word),
      );
      for (let pi = 0; pi < parts.length; pi += 1) {
        if (lines.length >= maxLines) {
          const tail = parts.slice(pi).join("").replace(/-/g, "");
          const rest = words.slice(wi + 1).join(" ");
          const joined = (
            parts[pi].replace(/-$/, "") +
            tail +
            (rest ? " " + rest : "")
          ).trim();
          if (typeof truncateTextToWidth === "function") {
            lines[lines.length - 1] =
              truncateTextToWidth(joined, size, weight, maxWidth).text ||
              lines[lines.length - 1];
          }
          return lines;
        }
        if (pi === parts.length - 1) line = parts[pi];
        else lines.push(parts[pi]);
      }
    }

    if (line) {
      if (lines.length < maxLines) lines.push(line);
      else if (typeof truncateTextToWidth === "function") {
        lines[lines.length - 1] = truncateTextToWidth(
          lines[lines.length - 1] + " " + line,
          size,
          weight,
          maxWidth,
        ).text;
      }
    }
    return lines.length ? lines : [text];
  }

  function wrapLine(content, cls, opts) {
    opts = opts || {};
    if (!appState.wrapText || opts.noWrap) return line(content, cls);
    const src = opts.src != null ? String(opts.src) : "";
    if (!src) return line(content, cls);
    let attrs =
      ' data-wrap-src="' +
      escHtml(src) +
      '" data-wrap-q="' +
      escHtml(opts.qKey || "") +
      '"';
    if (opts.kind) attrs += ' data-wrap-kind="' + escHtml(opts.kind) + '"';
    if (opts.legalForm)
      attrs += ' data-wrap-form="' + escHtml(opts.legalForm) + '"';
    if (opts.fullText)
      attrs += ' data-full-text="' + escHtml(opts.fullText) + '"';
    if (opts.noHyphen) attrs += ' data-wrap-no-hyphen="true"';
    return (
      '<div class="ads-cell-line' +
      (cls ? " " + cls : "") +
      '"' +
      attrs +
      ">" +
      content +
      "</div>"
    );
  }

  function formatWrappedCompanyLine(ln, query, legalForm, isLast) {
    if (!legalForm || !isLast) return highlightText(ln, query);
    const suffix = ", " + legalForm;
    if (!ln.endsWith(suffix)) return highlightText(ln, query);
    return (
      highlightText(ln.slice(0, -suffix.length), query) +
      ', <span class="ads-company-form">' +
      escHtml(legalForm) +
      "</span>"
    );
  }

  function removeWrapSiblings(el) {
    let next = el.nextElementSibling;
    while (next && next.classList.contains("ads-wrap-line")) {
      const rem = next;
      next = next.nextElementSibling;
      rem.remove();
    }
  }

  function renderWrapLineContent(ln, idx, lineCount, ctx) {
    let inner;
    if (ctx.kind === "company") {
      inner = formatWrappedCompanyLine(
        ln,
        ctx.q,
        ctx.legalForm,
        idx === lineCount - 1,
      );
    } else if (ctx.kind === "fio") {
      inner = fioLineInner(ln, ctx.q, ctx.resumeUrl, idx === 0);
    } else if (ctx.kind === "inn") {
      inner = "<b>" + highlightText(ln, ctx.q) + "</b>";
    } else if (ctx.kind === "invoice") {
      inner = highlightInvoiceLine(ln, ctx.q);
    } else {
      inner = highlightText(ln, ctx.q);
    }
    if (idx === lineCount - 1 && ctx.suffixHtml) inner += ctx.suffixHtml;
    return inner;
  }

  function getWrapSuffixWidth(el, scale) {
    const suffixEl = el.querySelector(
      ".ads-vacancy-count, a.ads-vacancy-count",
    );
    if (!suffixEl) return 0;
    const ml = parseFloat(window.getComputedStyle(suffixEl).marginLeft) || 0;
    return Math.ceil((suffixEl.getBoundingClientRect().width + ml) / scale);
  }

  function wrapContactCellLine(el, td, maxLines) {
    const src = el.getAttribute("data-wrap-src");
    if (!src || !el.isConnected) return 0;
    removeWrapSiblings(el);
    const maxW = getTdContentWidth(td);
    const noHyphen = el.getAttribute("data-wrap-no-hyphen") === "true";
    const kind = el.getAttribute("data-wrap-kind") || "";
    const suffixEl = el.querySelector(
      ".ads-vacancy-count, a.ads-vacancy-count",
    );
    const suffixHtml = suffixEl ? suffixEl.outerHTML : "";
    const scale = getPageScale();
    let wrapMaxW = maxW;
    let lines = wrapTextToFillWidth(
      src,
      wrapMaxW,
      ADS_WRAP_FONT,
      ADS_WRAP_WEIGHT,
      maxLines,
      noHyphen,
    );
    while (
      lines.length > 1 &&
      wrapLinesOverflow(
        lines,
        wrapMaxW,
        ADS_WRAP_FONT,
        ADS_WRAP_WEIGHT,
        noHyphen,
      ) &&
      wrapMaxW > 40
    ) {
      wrapMaxW -= 2;
      lines = wrapTextToFillWidth(
        src,
        wrapMaxW,
        ADS_WRAP_FONT,
        ADS_WRAP_WEIGHT,
        maxLines,
        noHyphen,
      );
    }

    const q = el.getAttribute("data-wrap-q") || "";
    const legalForm = el.getAttribute("data-wrap-form") || "";
    const fullText = el.getAttribute("data-full-text") || src;
    const ctx = {
      q: q,
      kind: kind,
      legalForm: legalForm,
      resumeUrl: el.getAttribute("data-resume-url") || "",
      suffixHtml: suffixHtml,
    };

    if (lines.length <= 1) {
      el.innerHTML = renderWrapLineContent(lines[0] || src, 0, 1, ctx);
      return 1;
    }

    const baseCls = el.className.replace(/\sads-wrap-line\b/g, "").trim();
    const rows = [];
    lines.forEach(function (ln, idx) {
      const row = document.createElement("div");
      row.className = baseCls + (idx ? " ads-wrap-line" : "");
      if (idx === 0) {
        row.setAttribute("data-wrap-src", src);
        row.setAttribute("data-wrap-q", q);
        if (kind) row.setAttribute("data-wrap-kind", kind);
        if (legalForm) row.setAttribute("data-wrap-form", legalForm);
        if (fullText) row.setAttribute("data-full-text", fullText);
        if (el.getAttribute("data-wrap-no-hyphen") === "true")
          row.setAttribute("data-wrap-no-hyphen", "true");
        if (el.getAttribute("data-resume-url"))
          row.setAttribute(
            "data-resume-url",
            el.getAttribute("data-resume-url"),
          );
      } else if (el.getAttribute("data-wrap-no-hyphen") === "true") {
        row.setAttribute("data-wrap-no-hyphen", "true");
      }
      row.innerHTML = renderWrapLineContent(ln, idx, lines.length, ctx);
      rows.push(row);
    });
    el.replaceWith.apply(el, rows);
    return lines.length;
  }

  function applyContactTableCellWrap() {
    if (
      !appState.wrapText ||
      !appState.collapseAll ||
      typeof measureTextWidth !== "function"
    )
      return;
    const table = document.getElementById("adsTable");
    if (!table || table.classList.contains("no-wrap")) return;
    const maxLines = 3;
    table
      .querySelectorAll("#adsTableBody td.col-contact")
      .forEach(function (td) {
        const body = td.querySelector(".ads-contact-body");
        if (!body) return;
        let remaining = maxLines;
        body
          .querySelectorAll("[data-wrap-src]:not(.ads-wrap-line)")
          .forEach(function (el) {
            if (remaining <= 0) {
              el.style.display = "none";
              removeWrapSiblings(el);
              return;
            }
            el.style.display = "";
            remaining -= wrapContactCellLine(el, td, remaining);
          });
      });
  }

  function afterTableCellLayout() {
    applyTableCellWrap();
    applyContactTableCellWrap();
    stabilizeStatusBadges();
    bindRowInteractions();
  }

  window.__afterTableCellLayout = afterTableCellLayout;

  function wrapLinesOverflow(lines, maxWidth, size, weight, noHyphen) {
    const plain = !!noHyphen;
    for (let i = 0; i < lines.length; i += 1) {
      if (!fillTextFits(lines[i], maxWidth, size, weight, plain)) return true;
    }
    return false;
  }

  function applyTableCellWrap(colKey) {
    if (!appState.wrapText || typeof measureTextWidth !== "function") return;
    const table = document.getElementById("adsTable");
    if (!table || table.classList.contains("no-wrap")) return;
    const maxLines = appState.collapseAll ? 4 : 999;
    let selector = "#adsTableBody [data-wrap-src]:not(.ads-wrap-line)";
    if (colKey) {
      selector =
        "#adsTableBody td.col-" +
        colKey +
        " [data-wrap-src]:not(.ads-wrap-line)";
    }
    const nodes = table.querySelectorAll(selector);
    nodes.forEach(function (el) {
      const src = el.getAttribute("data-wrap-src");
      if (!src || !el.isConnected) return;
      const td = el.closest("td");
      if (!td) return;
      if (appState.collapseAll && td.classList.contains("col-contact")) return;
      const kindEarly = el.getAttribute("data-wrap-kind") || "";
      if (kindEarly === "source-link") {
        applySourceLinkTruncate(el, td);
        return;
      }
      removeWrapSiblings(el);
      const maxW = getTdContentWidth(td);
      const noHyphen = el.getAttribute("data-wrap-no-hyphen") === "true";
      const kind = el.getAttribute("data-wrap-kind") || "";
      const suffixEl = el.querySelector(
        ".ads-vacancy-count, a.ads-vacancy-count",
      );
      const suffixHtml = suffixEl ? suffixEl.outerHTML : "";
      const scale = getPageScale();
      let wrapMaxW =
        kind === "vacancy" && suffixHtml
          ? Math.max(20, maxW - getWrapSuffixWidth(el, scale))
          : kind === "company"
            ? maxW + 8
            : maxW;
      let lines = wrapTextToFillWidth(
        src,
        wrapMaxW,
        ADS_WRAP_FONT,
        ADS_WRAP_WEIGHT,
        maxLines,
        noHyphen,
      );
      while (
        lines.length > 1 &&
        wrapLinesOverflow(
          lines,
          wrapMaxW,
          ADS_WRAP_FONT,
          ADS_WRAP_WEIGHT,
          noHyphen,
        ) &&
        wrapMaxW > 40
      ) {
        wrapMaxW -= 2;
        lines = wrapTextToFillWidth(
          src,
          wrapMaxW,
          ADS_WRAP_FONT,
          ADS_WRAP_WEIGHT,
          maxLines,
          noHyphen,
        );
      }

      const q = el.getAttribute("data-wrap-q") || "";
      const legalForm = el.getAttribute("data-wrap-form") || "";
      const fullText = el.getAttribute("data-full-text") || src;
      const ctx = {
        q: q,
        kind: kind,
        legalForm: legalForm,
        resumeUrl: el.getAttribute("data-resume-url") || "",
        suffixHtml: suffixHtml,
      };

      if (lines.length <= 1) {
        el.innerHTML = renderWrapLineContent(lines[0] || src, 0, 1, ctx);
        return;
      }

      const baseCls = el.className.replace(/\sads-wrap-line\b/g, "").trim();
      const rows = [];
      lines.forEach(function (ln, idx) {
        const row = document.createElement("div");
        row.className = baseCls + (idx ? " ads-wrap-line" : "");
        if (idx === 0) {
          row.setAttribute("data-wrap-src", src);
          row.setAttribute("data-wrap-q", q);
          if (kind) row.setAttribute("data-wrap-kind", kind);
          if (legalForm) row.setAttribute("data-wrap-form", legalForm);
          if (fullText) row.setAttribute("data-full-text", fullText);
          if (el.getAttribute("data-wrap-no-hyphen") === "true")
            row.setAttribute("data-wrap-no-hyphen", "true");
          if (el.getAttribute("data-resume-url"))
            row.setAttribute(
              "data-resume-url",
              el.getAttribute("data-resume-url"),
            );
        } else if (el.getAttribute("data-wrap-no-hyphen") === "true") {
          row.setAttribute("data-wrap-no-hyphen", "true");
        }
        row.innerHTML = renderWrapLineContent(ln, idx, lines.length, ctx);
        rows.push(row);
      });
      el.replaceWith(...rows);
    });
  }

  function timeLine(content, cls) {
    return (
      '<div class="ads-cell-line ads-cell-line--time' +
      (cls ? " " + cls : "") +
      '">' +
      content +
      "</div>"
    );
  }

  function renderCell(ad, col, rowNum, globalIdx) {
    const qs = appState.quickSearch;
    switch (col.key) {
      case "num":
        return (
          line(String(rowNum)) +
          wrapLine(highlightText(String(ad.id), qs.id), "c-blue", {
            src: String(ad.id),
            qKey: qs.id,
            noWrap: true,
          }) +
          line(
            String(ad.adType || "").toUpperCase(),
            "c-green ads-ad-type-text",
          )
        );
      case "contact": {
        let body = "";
        ad.phones.forEach(function (p) {
          const displayPhone = formatPhoneDisplay(p);
          body += wrapLine(highlightPhoneText(p, qs.phone), "", {
            src: displayPhone,
            qKey: qs.phone,
            noHyphen: true,
          });
        });
        body += wrapLine(highlightText(ad.email, qs.email), "c-blue", {
          src: ad.email,
          qKey: qs.email,
          noHyphen: true,
        });
        return (
          '<div class="ads-contact-body">' +
          body +
          renderStatusBadge(getDemoStatus(ad, globalIdx)) +
          "</div>"
        );
      }
      case "vacancy": {
        const countUrl = ad.vacancyLink || ad.link || "";
        const hasApplicant = !!(ad.applicantFio && ad.applicantFio.trim());
        let countHtml = "";
        if (ad.mergedCount) {
          const countLink = ad.mergedLink || countUrl;
          const tip = escHtml(vacancyCountTipText());
          countHtml = countLink
            ? '<a class="ads-vacancy-count" href="' +
              escHtml(countLink) +
              '" target="_blank" rel="noopener noreferrer" data-tip="' +
              tip +
              '">(' +
              escHtml(String(ad.mergedCount)) +
              ")</a>"
            : '<span class="ads-vacancy-count" data-tip="' +
              tip +
              '">(' +
              escHtml(String(ad.mergedCount)) +
              ")</span>";
        }
        let html = wrapLine(
          highlightText(ad.vacancy, qs.vacancy) + countHtml,
          "",
          {
            src: ad.vacancy,
            qKey: qs.vacancy,
            kind: "vacancy",
          },
        );
        if (hasApplicant) {
          html +=
            '<div class="ads-cell-line c-purple ads-cell-line--copy" data-wrap-src="' +
            escHtml(ad.applicantFio) +
            '" data-wrap-q="' +
            escHtml(qs.fio) +
            '" data-wrap-kind="fio" data-resume-url="' +
            escHtml(getResumeUrl(ad)) +
            '">' +
            fioLineInner(ad.applicantFio, qs.fio, getResumeUrl(ad), true) +
            "</div>";
          html +=
            '<div class="ads-cell-line ads-response-date ads-cell-line--no-hyphen" data-wrap-no-hyphen="true">' +
            '<span class="ads-response-text">Дата отклика ' +
            escHtml(ad.responseDate) +
            "</span>" +
            "</div>";
        }
        return html;
      }
      case "date1": {
        const sources = getMergedSourceEntries(ad);
        if (sources) return renderSourceDateLines(sources, "date1", "c-gray");
        return dateLine(escHtml(formatAdDateCell(ad.date1)), "c-gray");
      }
      case "date2": {
        const sources = getMergedSourceEntries(ad);
        if (sources) return renderSourceDateLines(sources, "date2", "c-blue");
        return dateLine(escHtml(formatAdDateCell(ad.date2)), "c-blue");
      }
      case "date3": {
        const sources = getMergedSourceEntries(ad);
        if (sources) return renderSourceDateLines(sources, "date3", "c-d3");
        return dateLine(escHtml(formatAdDateCell(ad.date3)), "c-d3");
      }
      case "date4": {
        const sources = getMergedSourceEntries(ad);
        if (sources) return renderSourceDateLines(sources, "date4", "c-d4");
        return ad.date4FromXml
          ? dateLine(escHtml(formatAdDateCell(ad.date4)), "c-d4")
          : "";
      }
      case "date5": {
        const d5 = ad.date5 || ad.date5FromXml || "";
        return d5 ? dateLine(escHtml(formatAdDateCell(d5)), "c-d5") : "";
      }
      case "time": {
        const sources = getMergedSourceEntries(ad);
        if (sources) {
          return sources
            .map(function (entry) {
              return dateLine(escHtml(entry.daysLeft || ad.daysLeft));
            })
            .join("");
        }
        return dateLine(escHtml(ad.daysLeft));
      }
      case "company":
        return (
          wrapLine(
            highlightInvoiceLine(ad.invoiceLine, qs.invoice),
            "is-invoice c-gray",
            {
              src: ad.invoiceLine,
              qKey: qs.invoice,
              kind: "invoice",
              noHyphen: true,
            },
          ) +
          wrapLine(
            "<b>" + highlightText(ad.inn, qs.innName) + "</b>",
            "is-inn",
            {
              src: ad.inn,
              qKey: qs.innName,
              kind: "inn",
              noHyphen: true,
            },
          ) +
          wrapLine(renderCompanyLine(ad, qs.innName), "is-company", {
            src: ad.companyDisplay,
            qKey: qs.innName,
            kind: "company",
            legalForm: ad.companyLegalForm || "",
            fullText: ad.companyDisplay,
          })
        );
      case "text": {
        const sources = getMergedSourceEntries(ad);
        let html = "";
        if (sources) {
          sources.forEach(function (entry, idx) {
            if (!entry.link) return;
            const suffix =
              entry.suffix != null
                ? entry.suffix
                : SOURCE_LINK_SUFFIXES[idx] || "";
            html += linkLine(entry.link, true, suffix);
          });
        } else if (ad.vacancyLink) {
          html += linkLine(ad.vacancyLink, true);
        }
        html += '<div class="ads-text-content">' + buildTextCell(ad) + "</div>";
        return html;
      }
      default:
        return "";
    }
  }

  function renderRowCells(ad, rowNum, globalIdx) {
    return COLUMNS.map(function (col) {
      return (
        '<td class="col-' +
        col.key +
        '"><div class="ads-cell-inner">' +
        renderCell(ad, col, rowNum, globalIdx) +
        "</div></td>"
      );
    }).join("");
  }

  /* ---------- Заголовок таблицы ---------- */
  const TH_LINE_TOP = 6;
  const TH_LINE_STEP = 29;
  const TH_SIDE_PAD = 10;
  const TH_TEXT_PAD = 8;
  const TH_SORT_RESERVE = 24;

  function buildColgroup() {
    const cg = document.getElementById("adsColgroup");
    if (!cg) return;
    cg.innerHTML = COLUMNS.map(function (col) {
      // При --dpx=1/dpr целые design-px ложатся на целые физические пиксели сами;
      // CSS-округление тут не нужно (и вредно на дробном масштабе).
      return '<col style="width:calc(' + col.width + ' * var(--px))">';
    }).join("");
  }

  function renderThTextContent(ln) {
    if (ln.lines && ln.lines.length) {
      return ln.lines
        .map(function (line) {
          return '<span class="ads-th-text-line">' + escHtml(line) + "</span>";
        })
        .join("");
    }
    return escHtml(ln.t);
  }

  function buildTableHead() {
    const thead = document.getElementById("adsTableHead");
    if (!thead || !COLUMNS.length) return;

    const titleRow = COLUMNS.map(function (col) {
      let lineY = TH_LINE_TOP;
      const lines = (col.titleLines || [])
        .map(function (ln) {
          const rawTop = ln.y !== undefined ? ln.y : lineY;
          const rawHeight = ln.h || TH_LINE_STEP;
          const top =
            TH_LINE_TOP +
            Math.round((rawTop - TH_LINE_TOP) / TH_LINE_STEP) * TH_LINE_STEP;
          const h = Math.max(
            TH_LINE_STEP,
            Math.round(rawHeight / TH_LINE_STEP) * TH_LINE_STEP,
          );
          lineY = top + h;
          const sortBtn = ln.sort
            ? '<button type="button" class="ads-sort-btn" data-sort="' +
              ln.sort +
              '" aria-label="Сортировка А-Я"></button>'
            : "";
          const sortAttr = ln.sort
            ? ' is-sortable" data-sort="' + ln.sort + ""
            : "";
          const colorAttr = ln.c
            ? ' data-color="' + ln.c + '" style="color:' + ln.c + '"'
            : "";
          const wrapAttr = ln.wrap ? ' data-wrap="true"' : "";
          const linesAttr =
            ln.lines && ln.lines.length
              ? ' data-lines="' + escHtml(JSON.stringify(ln.lines)) + '"'
              : "";
          return (
            '<span class="ads-th-line' +
            sortAttr +
            '" style="top:calc(' +
            top +
            " * var(--px));height:calc(" +
            h +
            ' * var(--px))">' +
            '<span class="ads-th-text" data-text="' +
            escHtml(ln.t) +
            '"' +
            colorAttr +
            wrapAttr +
            linesAttr +
            ">" +
            renderThTextContent(ln) +
            "</span>" +
            sortBtn +
            "</span>"
          );
        })
        .join("");
      return (
        '<th class="th-title col-' +
        col.key +
        '" data-w="' +
        col.width +
        '">' +
        lines +
        "</th>"
      );
    }).join("");

    const searchRow = COLUMNS.map(function (col) {
      const fields = (col.search || [])
        .map(function (f) {
          return (
            '<div class="ads-search-field"' +
            (f.key === "phone" || f.key === "salary"
              ? ' data-ctrl-mode="phone"'
              : "") +
            ' data-key="' +
            f.key +
            '">' +
            '<span class="ads-search-ico" aria-hidden="true"></span>' +
            '<div class="ads-search-slot">' +
            '<span class="ads-search-ph ads-static" data-static-kind="placeholder" data-text="' +
            escHtml(f.placeholder) +
            '">' +
            escHtml(f.placeholder) +
            "</span>" +
            '<input type="text" data-search-key="' +
            f.key +
            '" autocomplete="off" spellcheck="false" />' +
            "</div>" +
            '<button type="button" class="ads-search-clear" aria-label="Очистить"><i class="vi vi-clear" aria-hidden="true"></i></button>' +
            "</div>"
          );
        })
        .join("");
      return '<th class="th-search col-' + col.key + '">' + fields + "</th>";
    }).join("");

    thead.innerHTML = "<tr>" + titleRow + "</tr><tr>" + searchRow + "</tr>";
  }

  /* ---------- Рендер ---------- */
  let initialPageRevealed = false;
  let initialRevealScheduled = false;

  function scheduleAfterTableLayout() {
    if (initialPageRevealed) {
      window.requestAnimationFrame(afterTableCellLayout);
      return;
    }
    if (initialRevealScheduled) return;
    initialRevealScheduled = true;

    const fontsReady =
      document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(function () {})
        : Promise.resolve();

    fontsReady.then(function () {
      window.requestAnimationFrame(function () {
        afterTableCellLayout();
        applyAdsStatic();
        initialPageRevealed = true;
        document.documentElement.classList.add("ads-app-ready");
        if (typeof window.__revealAdsApp === "function") {
          window.__revealAdsApp();
        }
      });
    });
  }

  function renderTable() {
    hideAdsTip();
    const tbody = document.getElementById("adsTableBody");
    const table = document.getElementById("adsTable");
    if (!tbody) return;
    const page = getPagedAds();

    if (table) {
      table.classList.toggle("no-wrap", !appState.wrapText);
      table.classList.toggle("collapsed", appState.collapseAll);
    }

    const start = (appState.currentPage - 1) * appState.rowsPerPage;
    tbody.innerHTML = page.items
      .map(function (ad, idx) {
        const globalIdx = start + idx;
        return (
          '<tr data-id="' +
          ad.id +
          '">' +
          renderRowCells(ad, globalIdx + 1, globalIdx) +
          "</tr>"
        );
      })
      .join("");

    updateCount(page.total);
    renderPagination(page.totalPages);
    bindRowInteractions();
    scheduleAfterTableLayout();
  }

  function getFilteredCount() {
    return getFilteredAds().length;
  }

  function updateCount(total) {
    const el = document.getElementById("adsCountNum");
    if (!el) return;
    const n = total == null ? getFilteredCount() : total;
    el.textContent = String(n);
    el.dataset.text = String(n);
  }

  let lastTotalPages = 1;

  function renderPagination(totalPages) {
    const container = document.getElementById("pagination");
    if (!container) return;
    lastTotalPages = totalPages;
    const cur = appState.currentPage;

    function btn(label, page, cls, disabled, tip) {
      return (
        '<button type="button" class="' +
        (cls || "") +
        (page === cur && !cls ? " active" : "") +
        '" data-page="' +
        page +
        '"' +
        (disabled ? " disabled" : "") +
        (tip ? ' data-tip="' + escHtml(tip) + '"' : "") +
        ">" +
        '<span class="ads-page-label">' + label + "</span>" +
        "</button>"
      );
    }

    function edgeBtn(label, page, disabled, tip, extraCls) {
      return btn(
        label,
        page,
        "is-edge" + (extraCls || "") + (!disabled ? " is-active-edge" : ""),
        disabled,
        tip,
      );
    }

    let html = edgeBtn(
      "First",
      1,
      cur <= 1,
      "Переключить на первую вкладку",
      " is-edge-first",
    );
    html += edgeBtn(
      "&lt;&lt;",
      Math.max(1, cur - 1),
      cur <= 1,
      "Переключить на предыдущую вкладку",
      " is-edge-prev",
    );

    const pages = [];
    if (totalPages <= 8) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (cur <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    } else if (cur >= totalPages - 2) {
      pages.push(1);
      pages.push("...");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("...");
      for (let i = cur - 1; i <= cur + 1; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    }
    pages.forEach(function (p) {
      html +=
        p === "..."
          ? '<button type="button" class="ellipsis" data-skip="1" data-tip="Перескочить на 5 страниц вперед">...</button>'
          : btn(String(p), p, "", false, "Переключить на вкладку " + p);
    });

    html += edgeBtn(
      "Next",
      Math.min(totalPages, cur + 1),
      cur >= totalPages,
      "Переключить на следующую вкладку",
      " is-edge-last",
    );
    container.innerHTML = html;

    container
      .querySelectorAll("button[data-page], button[data-skip]")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          if (b.disabled) return;
          hidePageTip();
          if (b.dataset.skip) {
            appState.currentPage = Math.min(totalPages, cur + 5);
          } else {
            appState.currentPage = parseInt(b.dataset.page, 10) || 1;
          }
          renderTable();
        });
        if (b.dataset.tip && !b.disabled) {
          b.addEventListener("mouseenter", function () {
            showPageTip(b, b.dataset.tip);
          });
          b.addEventListener("mouseleave", hidePageTip);
        }
      });
  }

  /* ---------- Подсказки (ТЗ п.4, макет Figma) ---------- */
  let adsTipEl = null;
  let adsTipTimer = null;
  let adsTipAnchor = null;

  function getZoomFrameScale(frame) {
    if (!frame) return 1;
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !frame.offsetWidth) return 1;
    return rect.width / frame.offsetWidth;
  }

  function positionAdsTipElement() {
    if (!adsTipEl || !adsTipAnchor) return;

    const anchor = adsTipAnchor;
    const frame = document.getElementById("zoomFrame");
    const gap = 8;
    const pad = 8;

    if (!frame) {
      const rect = anchor.getBoundingClientRect();
      const tipW = adsTipEl.offsetWidth;
      const tipH = adsTipEl.offsetHeight;
      let left = rect.left + rect.width / 2 - tipW / 2;
      let top = rect.bottom + gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - tipW - pad));
      if (top + tipH > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - tipH - gap);
      }
      adsTipEl.style.position = "fixed";
      adsTipEl.style.left = left + "px";
      adsTipEl.style.top = top + "px";
      return;
    }

    const scale = getZoomFrameScale(frame);
    const anchorRect = anchor.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const anchorLeft = (anchorRect.left - frameRect.left) / scale;
    const anchorTop = (anchorRect.top - frameRect.top) / scale;
    const anchorWidth = anchorRect.width / scale;
    const anchorHeight = anchorRect.height / scale;
    const tipW = adsTipEl.offsetWidth;
    const tipH = adsTipEl.offsetHeight;
    const frameW = frame.offsetWidth;
    const frameH = frame.offsetHeight;

    let left = anchorLeft + anchorWidth / 2 - tipW / 2;
    let top = anchorTop + anchorHeight + gap;
    left = Math.max(pad, Math.min(left, frameW - tipW - pad));
    if (top + tipH > frameH - pad) {
      top = Math.max(pad, anchorTop - tipH - gap);
    }

    adsTipEl.style.position = "absolute";
    adsTipEl.style.left = left + "px";
    adsTipEl.style.top = top + "px";
  }

  function showAdsTip(anchor, text, opts) {
    hideAdsTip();
    if (!text || !anchor) return;
    opts = opts || {};
    const tip = document.createElement("div");
    tip.className = "ads-tip" + (opts.multiline ? " is-wrapped" : "");
    tip.textContent = text;

    const host = document.getElementById("zoomFrame") || document.body;
    host.appendChild(tip);
    adsTipEl = tip;
    adsTipAnchor = anchor;
    positionAdsTipElement();
  }

  function hideAdsTip() {
    if (adsTipTimer) {
      clearTimeout(adsTipTimer);
      adsTipTimer = null;
    }
    adsTipAnchor = null;
    if (adsTipEl) {
      adsTipEl.remove();
      adsTipEl = null;
    }
  }

  function initAdsTipViewportSync() {
    function syncAdsTipPosition() {
      if (adsTipEl && adsTipAnchor) positionAdsTipElement();
    }
    window.addEventListener("resize", syncAdsTipPosition);
    window.addEventListener("scroll", syncAdsTipPosition, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncAdsTipPosition);
      window.visualViewport.addEventListener("scroll", syncAdsTipPosition);
    }
  }

  function needsTruncationTooltip() {
    return !appState.wrapText || appState.collapseAll;
  }

  function isTruncated(el) {
    if (!el) return false;
    return (
      el.scrollWidth > el.clientWidth + 1 ||
      el.scrollHeight > el.clientHeight + 1
    );
  }

  function showTimedAdsTip(anchor, text, ms) {
    showAdsTip(anchor, text);
    if (adsTipTimer) clearTimeout(adsTipTimer);
    adsTipTimer = setTimeout(hideAdsTip, ms || 5000);
  }

  function bindTip(el, text, opts) {
    if (!el || el.dataset.tipBound) return;
    el.dataset.tipBound = "1";
    opts = opts || {};
    el.addEventListener("mouseenter", function () {
      if (el.dataset.tipLocked) return;
      showAdsTip(el, typeof text === "function" ? text() : text, opts);
    });
    el.addEventListener("mouseleave", function () {
      if (el.dataset.tipLocked) return;
      hideAdsTip();
    });
  }

  function bindCopyIco(el) {
    if (!el || el.dataset.copyBound) return;
    el.dataset.copyBound = "1";
    el.addEventListener("mouseenter", function () {
      if (el.dataset.tipLocked) return;
      const txt = el.dataset.copy || "";
      const isLink = /^https?:\/\//i.test(txt);
      showAdsTip(el, isLink ? "Скопировать ссылку" : "Скопировать");
    });
    el.addEventListener("mouseleave", function () {
      if (el.dataset.tipLocked) return;
      hideAdsTip();
    });
    el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const txt = el.dataset.copy;
      if (!txt) return;
      const isLink = /^https?:\/\//i.test(txt);
      const done = function () {
        el.dataset.tipLocked = "1";
        el.classList.add("is-copied");
        showAdsTip(el, isLink ? "Ссылка скопирована" : "Скопировано");
        setTimeout(function () {
          hideAdsTip();
          delete el.dataset.tipLocked;
          el.classList.remove("is-copied");
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(txt)
          .then(done)
          .catch(function () {
            copyFallback(txt, done);
          });
      } else {
        copyFallback(txt, done);
      }
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  }

  function copyFallback(txt, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch (err) {
      /* ignore */
    }
  }

  function getSortTip(key) {
    if (appState.sort.key !== key) return "Сортировка А-Я";
    return appState.sort.direction === "asc"
      ? "Сортировка Я-А"
      : "Сортировка А-Я";
  }

  function bindSortTooltips() {
    document.querySelectorAll(".ads-sort-btn").forEach(function (btn) {
      bindTip(btn, function () {
        return getSortTip(btn.dataset.sort);
      });
    });
  }

  function bindControlTooltips() {
    bindTip(
      document.getElementById("adsDeleteBtn"),
      "Удалить за выбранный период весь контент",
      { multiline: true },
    );
    bindTip(
      document.getElementById("adsExportBtn"),
      "Экспортировать объявления в XML",
    );
    document.querySelectorAll(".ads-dropdown-clear").forEach(function (btn) {
      bindTip(btn, "Очистить");
    });
    document.querySelectorAll(".ads-search-clear").forEach(function (btn) {
      bindTip(btn, "Очистить поле");
    });
  }

  /* Подсказка пагинации — тот же стиль, что у иконок */
  function showPageTip(anchor, text) {
    showAdsTip(anchor, text);
  }
  function hidePageTip() {
    hideAdsTip();
  }

  /* ---------- Быстрый поиск ---------- */
  function initQuickSearch() {
    document.querySelectorAll(".ads-search-field").forEach(function (field) {
      if (field.dataset.fieldBound) return;
      field.dataset.fieldBound = "1";
      const input = field.querySelector("input");
      if (!input) return;
      field.addEventListener("click", function (e) {
        if (e.target.closest(".ads-search-clear")) return;
        input.focus();
      });
    });

    document
      .querySelectorAll(".ads-search-field input")
      .forEach(function (input) {
        if (input.dataset.bound) return;
        input.dataset.bound = "1";
        const key = input.dataset.searchKey;
        const field = input.closest(".ads-search-field");
        const clearBtn = field && field.querySelector(".ads-search-clear");

        function sync() {
          const val = input.value.trim();
          if (val) appState.quickSearch[key] = val;
          else delete appState.quickSearch[key];
          appState.currentPage = 1;
          if (field) field.classList.toggle("has-value", !!val);
          renderTable();
        }
        input.addEventListener("input", sync);
        input.addEventListener("focus", function () {
          if (field) field.classList.add("is-focused");
        });
        input.addEventListener("blur", function () {
          if (field) field.classList.remove("is-focused");
        });
        if (clearBtn)
          clearBtn.addEventListener("click", function (e) {
            e.preventDefault();
            input.value = "";
            input.focus();
            sync();
          });
      });
  }

  /* ---------- Сортировка (ТЗ п.10) ---------- */
  function initSorting() {
    document
      .querySelectorAll(".ads-th-line.is-sortable")
      .forEach(function (el) {
        const key = el.dataset.sort;
        if (!key || el.dataset.sortBound) return;
        el.dataset.sortBound = "1";
        el.addEventListener("click", function (e) {
          const onBtn = e.target.closest(".ads-sort-btn");
          const onText = e.target.closest(".ads-th-text");
          if (!onBtn && !onText) return;
          e.preventDefault();
          e.stopPropagation();
          toggleSort(key);
        });
      });
  }

  function updateSortIcons() {
    document.querySelectorAll(".ads-sort-btn").forEach(function (b) {
      const key = b.dataset.sort;
      const active = key && key === appState.sort.key;
      b.classList.toggle("is-active", active);
      b.classList.remove("is-asc", "is-desc");
      if (active)
        b.classList.add(
          appState.sort.direction === "asc" ? "is-asc" : "is-desc",
        );
      if (key) b.setAttribute("aria-label", getSortTip(key));
    });
  }

  function getColKeyFromTh(th) {
    if (!th || !th.classList) return "";
    for (let i = 0; i < th.classList.length; i += 1) {
      const cls = th.classList[i];
      if (cls.indexOf("col-") === 0) return cls.slice(4);
    }
    return "";
  }

  /* ---------- Изменение ширины колонок (ТЗ п.12) ---------- */
  function initColumnResize() {
    const heads = document.querySelectorAll("#adsTableHead .th-title");
    let resizing = null;
    const HIT = 10;

    function finishResize() {
      if (!resizing) return;
      const colKey = getColKeyFromTh(resizing.th);
      const w = Math.max(
        40,
        Math.round(resizing.col.getBoundingClientRect().width),
      );
      resizing.col.style.width = w + "px";
      resizing.th.dataset.w = String(w);
      resizing.th.style.cursor = "";
      resizing = null;
      document.body.classList.remove("ads-col-resizing");
      document.body.style.userSelect = "";
      if (typeof window.__applyAdsStatic === "function")
        window.__applyAdsStatic();
      applyTableCellWrap(colKey);
    }

    heads.forEach(function (th) {
      th.addEventListener("mousemove", function (e) {
        if (resizing) return;
        const rect = th.getBoundingClientRect();
        th.style.cursor = rect.right - e.clientX < HIT ? "col-resize" : "";
      });
      th.addEventListener("mouseleave", function () {
        if (!resizing) th.style.cursor = "";
      });
      th.addEventListener("mousedown", function (e) {
        const rect = th.getBoundingClientRect();
        if (rect.right - e.clientX >= HIT) return;
        e.preventDefault();
        const idx = Array.prototype.indexOf.call(th.parentNode.children, th);
        const col = document.querySelectorAll("#adsColgroup col")[idx];
        if (!col) return;
        resizing = {
          col: col,
          th: th,
          startX: e.clientX,
          startW: th.offsetWidth,
        };
        document.body.classList.add("ads-col-resizing");
        document.body.style.userSelect = "none";
      });
    });

    if (!document.body.dataset.resizeBound) {
      document.body.dataset.resizeBound = "1";
      document.addEventListener("mousemove", function (e) {
        if (!resizing) return;
        const w = Math.max(40, resizing.startW + e.clientX - resizing.startX);
        resizing.col.style.width = w + "px";
      });
      document.addEventListener("mouseup", finishResize);
    }
  }

  /* ---------- Чекбоксы ---------- */
  function initCheckboxes() {
    const map = [
      ["chkWithoutTags", "withoutTags"],
      ["chkResponsesOnly", "responsesOnly"],
      ["chkWrapText", "wrapText"],
      ["chkCollapseAll", "collapseAll"],
      ["chkEarlyDepub", "earlyDepub"],
      ["chkChangedDepub", "changedDepub"],
    ];
    map.forEach(function (pair) {
      const el = document.getElementById(pair[0]);
      if (!el) return;
      appState[pair[1]] = el.checked;
      const lbl0 = el.nextElementSibling;
      if (lbl0) lbl0.classList.toggle("is-checked", el.checked);
      el.addEventListener("change", function () {
        appState[pair[1]] = el.checked;
        const lbl = el.nextElementSibling;
        if (lbl) lbl.classList.toggle("is-checked", el.checked);
        appState.currentPage = 1;
        renderTable();
      });
    });
  }

  /* ---------- Радиокнопки ---------- */
  function initRadio() {
    const row = document.getElementById("adsRadioRow");
    if (!row) return;
    row.innerHTML = RADIO.map(function (label) {
      return (
        '<label class="ads-radio' +
        (label === appState.status ? " is-active" : "") +
        '" data-status="' +
        escHtml(label) +
        '">' +
        '<span class="ads-radio-dot"></span><span class="ads-radio-text" data-text="' +
        escHtml(label) +
        '">' +
        escHtml(label) +
        "</span></label>"
      );
    }).join("");
    row.querySelectorAll(".ads-radio").forEach(function (r) {
      r.addEventListener("click", function () {
        appState.status = r.dataset.status;
        row.querySelectorAll(".ads-radio").forEach(function (x) {
          x.classList.toggle("is-active", x === r);
        });
        appState.currentPage = 1;
        renderTable();
      });
    });
  }

  /* ---------- Выпадающие списки «Все файлы xml» / «Все группы ОК» (ТЗ п.17) ---------- */
  function closeAllDropdowns(except) {
    document.querySelectorAll(".ads-dropdown.is-open").forEach(function (d) {
      if (d === except) return;
      d.classList.remove("is-open");
      const m = d.querySelector(".ads-dropdown-menu");
      if (m) m.hidden = true;
    });
  }

  function initDropdowns() {
    document.querySelectorAll(".ads-dropdown").forEach(function (dd) {
      if (dd.dataset.ddBound) return;
      dd.dataset.ddBound = "1";
      const key = dd.dataset.dropdown;
      const stateKey =
        key === "xmlFiles"
          ? "xmlFile"
          : key === "groups"
            ? "group"
            : key === "rowsPerPage"
              ? "rowsPerPage"
              : "";
      const defText = dd.dataset.default || "";
      const textEl = dd.querySelector(".ads-dropdown-text");
      const clearBtn = dd.querySelector(".ads-dropdown-clear");
      const menu = dd.querySelector(".ads-dropdown-menu");
      const options =
        (window.SELECT_OPTIONS && window.SELECT_OPTIONS[key]) || [];

      function applyValue(val, label, isValue) {
        if (key === "rowsPerPage") {
          appState.rowsPerPage = parseInt(val, 10) || DEFAULT_ROWS;
          setText(label || String(appState.rowsPerPage), true);
          appState.currentPage = 1;
          renderTable();
          return;
        }
        if (stateKey) appState[stateKey] = val;
        setText(isValue ? label || val : defText, isValue);
        appState.currentPage = 1;
        renderTable();
      }

      function setText(txt, isValue) {
        textEl.textContent = txt;
        textEl.dataset.text = txt;
        const selected = !!isValue;
        dd.classList.toggle("has-value", selected);
        if (clearBtn) clearBtn.hidden = !selected;
      }

      function renderMenu() {
        menu.innerHTML = options
          .map(function (o) {
            let sel;
            if (key === "rowsPerPage") {
              sel = String(appState.rowsPerPage) === o.value;
            } else if (stateKey) {
              sel = (appState[stateKey] || "") === o.value;
            } else {
              sel = false;
            }
            return (
              '<div class="ads-dropdown-option' +
              (sel ? " is-selected" : "") +
              '" data-value="' +
              escHtml(o.value) +
              '">' +
              escHtml(o.label) +
              "</div>"
            );
          })
          .join("");
        menu.querySelectorAll(".ads-dropdown-option").forEach(function (opt) {
          opt.dataset.text = opt.textContent.trim();
          opt.addEventListener("click", function (e) {
            e.stopPropagation();
            const pickedValue = opt.dataset.value;
            const pickedLabel = opt.textContent.trim();
            const hasVal = key === "rowsPerPage" ? true : !!pickedValue;
            applyValue(pickedValue, pickedLabel, hasVal);
            close();
          });
        });
      }

      function open() {
        closeAllDropdowns(dd);
        renderMenu();
        dd.classList.add("is-open");
        menu.hidden = false;
      }
      function close() {
        dd.classList.remove("is-open");
        menu.hidden = true;
      }

      dd.addEventListener("click", function (e) {
        if (e.target.closest(".ads-dropdown-clear")) return;
        if (dd.classList.contains("is-open")) close();
        else open();
      });

      if (clearBtn)
        clearBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (key === "rowsPerPage") return;
          applyValue("", defText, false);
          close();
        });

      if (key === "rowsPerPage") {
        setText(String(appState.rowsPerPage), true);
      } else {
        setText(defText, false);
      }
    });

    if (!document.body.dataset.ddOutsideBound) {
      document.body.dataset.ddOutsideBound = "1";
      document.addEventListener("click", function (e) {
        if (!e.target.closest(".ads-dropdown")) closeAllDropdowns();
      });
    }
  }

  /* ---------- Кнопка delete: переход на последнюю вкладку таблицы (ТЗ п.14) ---------- */
  function initDeleteButton() {
    const btn = document.getElementById("adsDeleteBtn");
    function goLast() {
      appState.currentPage = Math.max(1, lastTotalPages);
      renderTable();
    }
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", goLast);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Delete") return;
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      goLast();
    });
  }

  /* ---------- Экспорт в XML ---------- */
  function initExportButton() {
    const btn = document.getElementById("adsExportBtn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      const ads = getFilteredAds();
      function tag(name, value) {
        return "    <" + name + ">" + escHtml(value) + "</" + name + ">";
      }
      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n<ads>\n' +
        ads
          .map(function (ad) {
            return (
              "  <ad>\n" +
              [
                tag("id", ad.id),
                tag("status", ad.status),
                tag("vacancy", ad.vacancy),
                tag("company", ad.companyDisplay),
                tag("inn", ad.inn),
                tag("email", ad.email),
                tag("phones", ad.phones.join(", ")),
                tag("link", ad.link),
              ].join("\n") +
              "\n  </ad>"
            );
          })
          .join("\n") +
        "\n</ads>\n";
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "compiled-ads-export.xml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 1000);
    });
  }

  /* ---------- Даты ---------- */
  function renderDateText(role) {
    const id = role === "from" ? "dateFromRender" : "dateToRender";
    const inputId = role === "from" ? "dateFromInput" : "dateToInput";
    const el = document.getElementById(id);
    const inp = document.getElementById(inputId);
    if (el && inp) {
      el.dataset.text = inp.value || "";
      el.textContent = inp.value || "";
    }
  }

  function initDateFilters() {
    ["from", "to"].forEach(function (role) {
      renderDateText(role);
    });
    document.querySelectorAll(".ads-date-field").forEach(function (field) {
      const role = field.dataset.dateRole;
      const input = field.querySelector(".ads-date-input");
      if (!input) return;
      input.addEventListener("change", function () {
        if (role === "from") appState.dateFrom = input.value || "";
        if (role === "to") appState.dateTo = input.value || "";
        appState.dateFilterActive = true;
        renderDateText(role);
        appState.currentPage = 1;
        renderTable();
      });
    });
  }

  function initVacancyCountTips() {
    const tbody = document.getElementById("adsTableBody");
    if (!tbody || tbody.dataset.vacancyTipBound) return;
    tbody.dataset.vacancyTipBound = "1";
    let activeCount = null;
    tbody.addEventListener("mouseover", function (e) {
      const el = e.target.closest(".ads-vacancy-count");
      if (!el || !tbody.contains(el)) return;
      if (activeCount === el) return;
      activeCount = el;
      showAdsTip(el, vacancyCountTipText());
    });
    tbody.addEventListener("mouseout", function (e) {
      const el = e.target.closest(".ads-vacancy-count");
      if (!el || activeCount !== el) return;
      const related = e.relatedTarget;
      if (related && el.contains(related)) return;
      activeCount = null;
      hideAdsTip();
    });
  }

  /* ---------- Взаимодействия со строками (копирование, подсказки) ---------- */
  function bindRowInteractions() {
    document.querySelectorAll(".ads-copy-ico").forEach(bindCopyIco);

    document.querySelectorAll("a.ads-cell-link[href]").forEach(function (el) {
      if (el.dataset.linkTipBound) return;
      el.dataset.linkTipBound = "1";
      el.addEventListener("mouseenter", function () {
        showAdsTip(
          el,
          el.dataset.tip || linkTipText(el.getAttribute("href") || ""),
        );
      });
      el.addEventListener("mouseleave", hideAdsTip);
    });

    if (!needsTruncationTooltip()) return;

    const targets =
      "#adsTableBody .ads-cell-inner, #adsTableBody .ads-cell-line, #adsTableBody .ads-text-content, #adsTableBody .ads-text-html, #adsTableBody .ads-text-plain";
    document.querySelectorAll(targets).forEach(function (el) {
      if (el.dataset.ttBound) return;
      el.dataset.ttBound = "1";
      el.addEventListener("mouseenter", function (e) {
        if (e.target.closest && e.target.closest(".ads-vacancy-count")) return;
        if (!needsTruncationTooltip()) return;
        if (!isTruncated(el)) return;
        const text = (el.dataset.fullText || el.textContent || "").trim();
        if (!text) return;
        showAdsTip(el, text, { multiline: true });
      });
      el.addEventListener("mouseleave", hideAdsTip);
    });

    document.querySelectorAll("#adsTableBody td").forEach(function (td) {
      if (td.dataset.ttBound) return;
      td.dataset.ttBound = "1";
      td.addEventListener("mouseenter", function () {
        if (!needsTruncationTooltip()) return;
        if (!isTruncated(td)) return;
        const nested = td.querySelector(targets);
        if (nested && isTruncated(nested)) return;
        const text = td.textContent.trim();
        if (!text) return;
        showAdsTip(td, text, { multiline: true });
      });
      td.addEventListener("mouseleave", hideAdsTip);
    });
  }

  /* ---------- Статический рендер UI-текста (движок масок) ----------
     Применяется ко всему НЕ-выделяемому тексту интерфейса, чтобы при
     ctrl+/- и Firefox «Только текст» не было дёрганья (ТЗ п.5, п.6).
     Ячейки данных остаются живым текстом — их требуется выделять/копировать
     (ТЗ п.2, п.9), а текст-картинку мышью выделить нельзя. */
  function staticAvailable() {
    return (
      typeof renderElementText === "function" &&
      typeof measureTextWidth === "function"
    );
  }

  // Перенос по словам с пиксельной шириной (длинные одиночные слова режутся по символам)
  function wordWrap(text, size, weight, maxW, maxLines) {
    if (typeof measureTextWidth !== "function") return [text];
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    let line = "";
    function fits(s) {
      return measureTextWidth(s, size, weight) <= maxW;
    }
    words.forEach(function (word) {
      let candidate = line ? line + " " + word : word;
      if (fits(candidate) || !line) {
        if (fits(candidate)) {
          line = candidate;
          return;
        }
        // одиночное слово шире колонки — режем по символам
        let chunk = "";
        for (let i = 0; i < word.length; i++) {
          if (fits(chunk + word[i])) {
            chunk += word[i];
          } else {
            if (chunk) lines.push(chunk);
            chunk = word[i];
          }
        }
        line = chunk;
        return;
      }
      lines.push(line);
      line = word;
      if (!fits(word)) {
        let chunk = "";
        for (let i = 0; i < word.length; i++) {
          if (fits(chunk + word[i])) {
            chunk += word[i];
          } else {
            if (chunk) lines.push(chunk);
            chunk = word[i];
          }
        }
        line = chunk;
      }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      lines.length = maxLines;
    }
    return lines.length ? lines : [""];
  }

  const ADS_TITLE_TEXT_Y = 29;

  function getCtrlLayout(key) {
    if (
      typeof window.__formCtrlLayouts === "object" &&
      window.__formCtrlLayouts[key]
    ) {
      return window.__formCtrlLayouts[key];
    }
    if (typeof getFormControlVerticalLayout === "function") {
      const presets = {
        "216-lc": { fontSize: 21.6, weight: 300, mode: "lowercase" },
        "216-dg": { fontSize: 21.6, weight: 300, mode: "digits" },
        "21-lc": { fontSize: 21, weight: 200, mode: "lowercase" },
        "20-lc": { fontSize: 20, weight: 300, mode: "lowercase" },
        "20-cap": { fontSize: 20, weight: 300, mode: "cap" },
        "216-lc-28": {
          fontSize: 21.6,
          weight: 300,
          mode: "lowercase",
          boxHeight: 28,
        },
      };
      if (presets[key]) return getFormControlVerticalLayout(presets[key]);
    }
    return null;
  }

  function wrapThTitleText(
    text,
    maxW,
    lastLineReserve,
    size,
    weight,
    maxLines,
  ) {
    maxLines = Math.max(1, maxLines || 2);
    if (maxLines === 1 || !lastLineReserve) {
      return wrapTextToFillWidth(text, maxW, size, weight, maxLines, false);
    }

    const lastMaxW = Math.max(24, maxW - lastLineReserve);
    const words = String(text || "")
      .trim()
      .split(/\s+/);
    let line1 = "";
    let i = 0;

    while (i < words.length) {
      const word = words[i];
      const candidate = line1 ? line1 + " " + word : word;
      if (fillTextFits(candidate, maxW, size, weight, false)) {
        line1 = candidate;
        i += 1;
        continue;
      }
      if (line1) {
        const partial = tryAppendWordWithHyphenEarly(
          line1,
          word,
          maxW,
          lastMaxW,
          size,
          weight,
        );
        if (partial) {
          line1 = partial.line;
          if (partial.rest) words[i] = partial.rest;
          else i += 1;
        }
        break;
      }
      const chunks = splitLongTokenEarly(word, maxW, lastMaxW, size, weight);
      line1 = chunks[0];
      if (chunks.length > 1) {
        words[i] = chunks.slice(1).join("").replace(/^-/, "");
      } else {
        i += 1;
      }
      break;
    }

    const rest = words.slice(i).join(" ").trim();
    if (!rest) return line1 ? [line1] : [""];
    const tail = wrapTextToFillWidth(
      rest,
      lastMaxW,
      size,
      weight,
      maxLines - 1,
      false,
    );
    return [line1].concat(tail);
  }

  function renderThTextLines(el, lines) {
    el.innerHTML = lines
      .map(function (line) {
        return (
          '<span class="ads-th-text-line">' + escHtml(line) + "</span>"
        );
      })
      .join("");
  }

  function layoutThSortLastRow(line, textEl, lines, color, maxW) {
    if (!line || !textEl || lines.length < 2) return false;
    const btn = line.querySelector(".ads-sort-btn");
    const headLines = lines.slice(0, -1);
    const lastLine = lines[lines.length - 1];

    line.classList.add("is-wrapped-sort");

    let lastRow = line.querySelector(".ads-th-last-row");
    if (!lastRow) {
      lastRow = document.createElement("span");
      lastRow.className = "ads-th-last-row";
      line.appendChild(lastRow);
    }

    let lastText = lastRow.querySelector(".ads-th-text-last");
    if (!lastText) {
      lastText = document.createElement("span");
      lastText.className = "ads-th-text-last";
      lastRow.appendChild(lastText);
    }
    lastText.textContent = lastLine;
    lastText.style.color = color;

    if (btn && btn.parentElement !== lastRow) lastRow.appendChild(btn);

    renderThTextLines(textEl, headLines);
    return true;
  }

  function maskTableHeaderText(el) {
    const th = el.closest("th");
    const line = el.closest(".ads-th-line");
    const colW = th ? parseInt(th.dataset.w, 10) || 200 : 200;
    const hasSort = line && line.classList.contains("is-sortable");
    const sortReserve = hasSort ? TH_SORT_RESERVE : 0;
    const maxW = Math.max(40, colW - TH_SIDE_PAD * 2);
    const lineH = line
      ? parseInt((line.style.height || "").replace(/[^\d]/g, ""), 10) || 29
      : 29;
    const c = el.dataset.color || C.textPrimary || "#62560E";
    const text = (el.dataset.text || el.textContent || "").trim();
    if (!text) return;
    el.style.color = c;
    let presetLines = null;
    if (el.dataset.lines) {
      try {
        presetLines = JSON.parse(el.dataset.lines);
      } catch (e) {
        presetLines = null;
      }
    }
    const wrap =
      el.dataset.wrap === "true" ||
      lineH > TH_LINE_STEP ||
      (presetLines && presetLines.length > 1);
    if (wrap) {
      const maxLines = presetLines
        ? presetLines.length
        : Math.max(1, Math.floor(lineH / TH_LINE_STEP));
      const lines =
        presetLines && presetLines.length
          ? presetLines
          : wrapThTitleText(text, maxW, sortReserve, 21, 300, maxLines);
      if (hasSort && lines.length > 1) {
        layoutThSortLastRow(line, el, lines, c, maxW);
        return;
      }
      line.classList.remove("is-wrapped-sort");
      const strayRow = line && line.querySelector(".ads-th-last-row");
      if (strayRow) strayRow.remove();
      renderThTextLines(el, lines);
      return;
    }
    line.classList.remove("is-wrapped-sort");
    const strayRow = line && line.querySelector(".ads-th-last-row");
    if (strayRow) strayRow.remove();
    el.textContent = text;
  }

  function maskEl(el, o) {
    if (!el || !staticAvailable()) return;
    const text = (el.dataset.text || el.textContent || "").trim();
    if (!text) return;
    const size = o.size;
    const weight = o.weight || 300;
    const ctrl = o.ctrlLayout ? getCtrlLayout(o.ctrlLayout) : null;
    let yDefault =
      o.y !== undefined
        ? o.y
        : ctrl
          ? ctrl.bitmapBaselineY
          : Math.round(size * 0.82);
    let maskH = o.height || (ctrl ? ctrl.maskHeight : Math.round(size * 1.4));
    if (o.lineBandCenter && ctrl) {
      maskH = size;
      yDefault = Math.round(
        ctrl.bitmapBaselineY - (ctrl.maskHeight - size) / 2,
      );
    }
    if (o.multiline) {
      const maxW = Math.max(40, o.fallbackW || 300);
      const lines =
        o.presetLines && o.presetLines.length
          ? o.presetLines
          : wordWrap(text, size, weight, maxW, o.maxLines || 8);
      const lineHeight = o.lineHeight || Math.round(size * 1.2);
      const width =
        typeof getMeasuredLineWidth === "function"
          ? getMeasuredLineWidth(lines, size, weight, maxW)
          : maxW;
      renderElementText(el, {
        text: text,
        lines: lines,
        size: size,
        width: width,
        height: lines.length * lineHeight + 2,
        y: yDefault,
        lineHeight: lineHeight,
        weight: weight,
        color: o.color,
        anchor: o.anchor || "start",
      });
    } else {
      const pad = o.textPad !== undefined ? o.textPad : 2;
      const width = Math.min(
        o.maxW || 800,
        measureTextWidth(text, size, weight) + pad,
      );
      renderElementText(el, {
        text: text,
        size: size,
        width: width,
        height: maskH,
        y: yDefault,
        weight: weight,
        color: o.color,
        anchor: o.anchor || "start",
        preserveAspectYMin: Boolean(o.lineBandCenter),
      });
    }
  }

  function stabilizeStatusBadges() {
    if (!staticAvailable()) return;
    document.querySelectorAll(".ads-status-text").forEach(function (label) {
      const text = label.dataset.text || label.textContent.trim();
      if (!text) return;
      renderElementText(label, {
        text: text,
        size: 20,
        width: 130,
        height: 23,
        y: 18,
        weight: 400,
        color: "currentColor",
        anchor: "middle",
      });
    });
  }

  function applyLegendColors() {
    document.querySelectorAll(".ads-legend-row").forEach(function (el) {
      if (el.dataset.color) el.style.color = el.dataset.color;
    });
  }

  function maskLegendRows() {
    if (!staticAvailable()) return;
    document.querySelectorAll(".ads-legend-row").forEach(function (el) {
      const block = el.closest(".ads-legend-block");
      const maxW = block && block.matches(":last-child") ? 478 : 335;
      maskEl(el, {
        size: 21.6,
        weight: 300,
        color: el.dataset.color || C.textPrimary || "#62560E",
        maxW: maxW,
        y: 18,
        height: 22,
      });
    });
  }

  function applyAdsStatic() {
    applyLegendColors();
    document.querySelectorAll(".ads-th-text").forEach(maskTableHeaderText);
    if (!staticAvailable()) return;
    stabilizeStatusBadges();
    maskLegendRows();
    const T = C.textPrimary || "#62560E";
    const title = document.querySelector(".ads-title");
    if (title) {
      maskEl(title, {
        size: 27,
        weight: 400,
        color: T,
        y: ADS_TITLE_TEXT_Y,
        height: 37,
        maxW: 400,
      });
    }
    /* Заголовки колонок — живой текст для выделения/копирования (замечание заказчика п.5) */
    document.querySelectorAll(".ads-search-ph").forEach(function (el) {
      maskEl(el, {
        size: 24,
        weight: 300,
        color: C.placeholder || "#B0AB87",
        maxW: 260,
        ctrlLayout: "216-lc",
        lineBandCenter: true,
      });
    });
  }

  window.__applyAdsStatic = applyAdsStatic;

  function fixNavHeader() {
    const companiesLink = document.querySelector(
      '.nav-link[data-tab="companies"] .nav-text',
    );
    if (companiesLink) {
      companiesLink.textContent = "ГРУППЫ ОК";
      companiesLink.dataset.text = "ГРУППЫ ОК";
    }
    document.querySelectorAll(".nav-link").forEach(function (link) {
      link.classList.toggle("active", link.dataset.tab === "letters");
    });
    if (typeof renderNavText === "function") {
      document.querySelectorAll(".nav-link").forEach(renderNavText);
    }
    if (typeof renderNavIcon === "function") {
      document.querySelectorAll(".nav-link").forEach(renderNavIcon);
    }
  }

  function syncDesignViewportUnit() {
    const root = document.documentElement;
    const dpr =
      typeof window.getEffectiveDevicePixelRatio === "function"
        ? window.getEffectiveDevicePixelRatio()
        : Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
          ? window.devicePixelRatio
          : 1;
    const nextFvw = 19.2 / dpr + "px";
    root.dataset.lastFvw = nextFvw;
    root.style.setProperty("--fvw", nextFvw);
  }

  window.syncDesignViewportUnit = syncDesignViewportUnit;

  function init() {
    if (typeof window.markViewportChanging === "function") {
      window.markViewportChanging();
    } else {
      syncDesignViewportUnit();
      if (typeof applyFormControlVerticalCssVars === "function") {
        applyFormControlVerticalCssVars(document.querySelector(".ads-page"));
      }
    }
    window.addEventListener("resize", function () {
      if (typeof window.markViewportChanging === "function") {
        window.markViewportChanging();
        return;
      }
      syncDesignViewportUnit();
      if (typeof applyFormControlVerticalCssVars === "function") {
        applyFormControlVerticalCssVars(document.querySelector(".ads-page"));
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        if (typeof window.markViewportChanging === "function") {
          window.markViewportChanging();
          return;
        }
        syncDesignViewportUnit();
        if (typeof applyFormControlVerticalCssVars === "function") {
          applyFormControlVerticalCssVars(document.querySelector(".ads-page"));
        }
      });
    }
    processAdsData();
    fixNavHeader();
    buildColgroup();
    buildTableHead();
    initQuickSearch();
    initSorting();
    updateSortIcons();
    initColumnResize();
    initCheckboxes();
    initRadio();
    initDropdowns();
    initDeleteButton();
    initExportButton();
    initDateFilters();
    bindControlTooltips();
    bindSortTooltips();
    initAdsTipViewportSync();
    initTextCellCopy();
    initVacancyCountTips();
    renderTable();
    applyLegendColors();

    document.documentElement.style.overflowY = "scroll";

    if (typeof renderStaticText === "function") renderStaticText();
    /* Initial static pass and reveal are handled by scheduleAfterTableLayout(). */
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("adsTable")) return;
    init();
  });
})();
