/* ============================================================================
   vsevn.ru — «Объявления скомпонованные» v2. Ванильный JS, без библиотек.
   Макет: «Объявления скомпанованное общее 1.fig», артборд «Если выбрать hh».
   ----------------------------------------------------------------------------
   Разделы:
     1. Масштаб кадра (единый transform:scale, замороженные единицы)
     2. Подсказки (гейт: только после реального движения мыши)
     3. Данные и состояние
     4. Вкладки источников (сайты/соцсети)
     5. Рендер таблицы / пагинации
     6. Контролы (поиск, радио-как-чекбоксы, чекбоксы, селекты, календарь)
     7. Экспорт в XML / XLS
   ============================================================================ */
(function () {
  "use strict";

  var DESIGN_W = 1920;
  var frame = document.getElementById("appShell");
  var appScroll = document.getElementById("appScroll");

  /* ==========================================================
     1. Масштаб кадра
     ========================================================== */
  function currentScale() {
    return window.AppViewport ? window.AppViewport.getScale() : 1;
  }

  /* ==========================================================
     2. Подсказки — единый менеджер (таблица + интерфейс).
     Показ только после реального движения указателя.
     ========================================================== */
  var tipEl = document.createElement("div");
  tipEl.className = "tip";
  tipEl.hidden = true;
  frame.appendChild(tipEl);

  var tipArmed = false;
  var tipLastXY = null;
  var tipTarget = null;

  function tipInvalidate() {
    tipArmed = false;
    tipLastXY = null;
    hideTip();
  }
  function hideTip() {
    tipEl.hidden = true;
    tipTarget = null;
  }
  function showTip(target, clientX, clientY) {
    var text = target.getAttribute("data-tip");
    if (!text) return;
    tipTarget = target;
    tipEl.textContent = text;
    tipEl.classList.toggle("is-wrapped", text.length > 55);
    tipEl.hidden = false;
    var fr = frame.getBoundingClientRect();
    var scale = currentScale();
    var x = (clientX - fr.left) / scale + 16;
    var y = (clientY - fr.top) / scale + 24;
    var maxX = DESIGN_W - tipEl.offsetWidth - 8;
    if (x > maxX) x = maxX;
    tipEl.style.left = x + "px";
    tipEl.style.top = y + "px";
  }

  document.addEventListener("mousemove", function (e) {
    if (tipLastXY && (tipLastXY[0] !== e.clientX || tipLastXY[1] !== e.clientY)) {
      tipArmed = true;
    }
    tipLastXY = [e.clientX, e.clientY];
    if (!tipArmed) return;
    var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) showTip(t, e.clientX, e.clientY);
    else if (tipTarget) hideTip();
  });
  document.addEventListener("mouseleave", hideTip);
  appScroll.addEventListener("scroll", tipInvalidate, { passive: true });
  window.addEventListener("wheel", function (e) { if (e.ctrlKey) tipInvalidate(); }, { passive: true });

  /* ==========================================================
     3. Данные и состояние
     ========================================================== */
  var OPTIONS = {
    rowsPerPage: ["25", "50", "100", "250", "500", "1000"],
    xmlFiles: ["vacancies_2024_05.xml", "vacancies_2024_06.xml", "vacancies_2024_07.xml", "zarplata_perenos_adres.xml", "ok_compiled_export.xml"],
    social: {
      vk: ["Работа в Нижнем Новгороде", "Вакансии Москва и МО", "Работа Казань", "Вакансии Волгоград"],
      ok: ["Работа в Нижнем Новгороде", "Вакансии Москва и МО", "Работа Казань", "Вакансии Волгоград", "Работа для всех — ОК"],
      tg: ["Вакансии НН — канал", "Работа 52 — канал", "Подработка НН"],
      max: ["Чат вакансий НН", "Чат подработки"]
    }
  };
  var DEMO_STATUSES = ["Активно", "Модерация", "Завершено", "Просрочено", "Не опубликовано", "Заблокировано"];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function shortDate(s) {
    // «26.01.2026» → «26.01.26.» (двузначный год + точка, как в макете)
    var m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
    if (!m) return s ? String(s) : "";
    return m[1] + "." + m[2] + "." + m[3].slice(-2) + ".";
  }
  function phoneDisplay(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "7") d = "8" + d.slice(1);
    return d;
  }
  function companyParts(raw, form) {
    var name = String(raw || "");
    if (form && name.toUpperCase().indexOf(form.toUpperCase()) === 0) {
      name = name.slice(form.length).replace(/^[\s,«"]+/, "").replace(/[»"]+$/, "");
    }
    name = name.replace(/\s+/g, " ").replace(/—/g, "-").trim();
    return { name: name, form: form || "" };
  }
  function statusDisplay(s) {
    if (/^актив/i.test(s)) return "Активное";
    if (/^(на )?модерац/i.test(s)) return "Модерация";
    if (/^заверш/i.test(s)) return "Завершено";
    if (/^просроч/i.test(s)) return "Просрочено";
    if (/^не опубл/i.test(s)) return "Не опубликовано";
    if (/^заблокир/i.test(s)) return "Заблокировано";
    return String(s || "");
  }
  function statusCat(s) {
    if (/^актив/i.test(s)) return "active";
    if (/^(на )?модерац/i.test(s)) return "moderation";
    if (/^заверш/i.test(s)) return "done";
    if (/^просроч/i.test(s)) return "expired";
    if (/^не опубл/i.test(s)) return "unpublished";
    if (/^заблокир/i.test(s)) return "blocked";
    return "active";
  }
  function statusClass(s) {
    var c = statusCat(s);
    if (c === "moderation") return "status-badge--moderation";
    if (c === "unpublished") return "status-badge--unpublished";
    if (c === "active") return "status-badge--active";
    return "status-badge--done";
  }

  /* Нормализация для поиска (ТЗ п.8): без регистра, дефисов, кавычек,
     пробелов-дублей и знаков препинания; поиск с начала слова. */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[-–—«»"'’.,;:!?()\/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function wordStartMatch(text, q) {
    var nq = norm(q);
    if (!nq) return true;
    return (" " + norm(text) + " ").indexOf(" " + nq) !== -1;
  }
  /* Номер счёта (ТЗ п.28): игнорировать нули после букв. */
  function invoiceKey(s) {
    var m = String(s || "").toLowerCase().match(/^([а-яёa-z]*)0*(\d*)/i);
    return { letters: (m && m[1]) || "", digits: (m && m[2]) || "" };
  }
  function invoiceMatch(invoiceNumber, q) {
    var qq = String(q || "").trim();
    if (!qq) return true;
    if (String(invoiceNumber).toLowerCase().indexOf(qq.toLowerCase()) === 0) return true;
    var k = invoiceKey(invoiceNumber), kq = invoiceKey(qq);
    if (!kq.letters && !kq.digits) return false;
    if (kq.letters && k.letters.indexOf(kq.letters) !== 0) return false;
    if (kq.digits && k.digits.indexOf(kq.digits) !== 0) return false;
    return true;
  }

  var ads = (window.ADS_DATA || []).map(function (ad, i) {
    var c = companyParts(ad.companyRaw, ad.legalForm);
    var status = i < 12 ? DEMO_STATUSES[i % DEMO_STATUSES.length] : (ad.status || "Активно");
    var sources = ad.mergedSources && ad.mergedSources.length
      ? ad.mergedSources
      : [{ link: ad.vacancyLink || ad.link || "", suffix: "", date1: ad.date1, date2: ad.date2, date3: ad.date3, date4: ad.date4, daysLeft: ad.daysLeft }];
    var srcKeys = ["trudvsem", "hh", "zp", "rabota", "vk", "ok", "tg", "max"];
    return {
      id: ad.id,
      phones: (ad.phones || []).map(phoneDisplay),
      email: ad.email || "",
      status: status,
      adType: ad.adType || "",
      vacancy: ad.vacancy || "",
      fio: ad.applicantFio || "",
      hasResponse: !!(ad.applicantFio && ad.applicantFio.trim()),
      responseDate: ad.responseDate || "",
      mergedCount: ad.mergedCount || 0,
      mergedLink: ad.mergedLink || ad.vacancyLink || "",
      resumeLink: ad.resumeLink || "",
      sources: sources,
      date5xml: (ad.date5 && String(ad.date5).trim()) || "",
      date5show: (ad.date5 && String(ad.date5).trim()) || ad.date2 || "",
      invoiceNumber: ad.invoiceNumber || "",
      invoiceLine: (ad.invoiceNumber || "") + " от " + shortDate(ad.invoiceDateRaw),
      inn: ad.inn || "",
      companyName: c.name,
      companyForm: c.form,
      textHtml: (ad.dutiesHtml || "") + (ad.requirementsHtml || "") + (ad.conditionsHtml || ""),
      duties: ad.dutiesPlain || [],
      requirements: ad.requirementsPlain || [],
      conditions: ad.conditionsPlain || [],
      xmlFile: OPTIONS.xmlFiles[(ad.id || i) % OPTIONS.xmlFiles.length],
      srcTab: srcKeys[(ad.id || i) % srcKeys.length],
      socialGroup: null, // заполняется по вкладке при фильтрации
      date1parsed: parseDate((sources[0] || {}).date1)
    };
  });
  // демо-распределение по группам соцсетей
  ads.forEach(function (a, i) {
    a.socialGroups = {};
    Object.keys(OPTIONS.social).forEach(function (k) {
      var list = OPTIONS.social[k];
      a.socialGroups[k] = list[(a.id || i) % list.length];
    });
  });

  function parseDate(s) {
    var m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : NaN;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function today() {
    var d = new Date();
    return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear();
  }
  function yearStart() {
    return "01.01." + new Date().getFullYear();
  }

  var ALL_CATS = ["unpublished", "moderation", "blocked", "active", "done", "expired"];
  var SITE_CATS = ALL_CATS;
  var SOCIAL_CATS = ["unpublished", "active", "done", "expired"];

  var state = {
    srcTab: "hh",
    mode: "site",              // site | social
    sortKey: null,
    sortDir: 1,
    page: 1,
    perPage: 500,
    cats: new Set(ALL_CATS),   // радио-как-чекбоксы
    earlyDepub: false,
    responsesOnly: false,
    changedDepub: false,
    xmlFile: "",
    socialGroup: "",
    dateFrom: yearStart(),     // ТЗ п.20
    dateTo: today(),
    search: {},
    wrap: true,
    collapsed: false,
    noTags: false
  };

  function activeCats() {
    return state.mode === "social" ? SOCIAL_CATS : SITE_CATS;
  }

  function getFiltered() {
    var q = state.search;
    var from = parseDate(state.dateFrom);
    var to = parseDate(state.dateTo);
    return ads.filter(function (a) {
      if (!state.cats.has(statusCat(a.status))) return false;
      // на соцвкладках скрытые категории не фильтруют
      if (state.mode === "social" && (statusCat(a.status) === "moderation" || statusCat(a.status) === "blocked")) return false;
      if (state.earlyDepub && !a.date5xml) return false;
      if (state.responsesOnly && !a.hasResponse) return false;
      if (state.changedDepub) {
        var s0 = a.sources[0] || {};
        if (!(s0.date3 && s0.date4 && s0.date3 !== s0.date4)) return false;
      }
      if (state.xmlFile && a.xmlFile !== state.xmlFile) return false;
      if (state.mode === "social" && state.socialGroup && a.socialGroups[state.srcTab] !== state.socialGroup) return false;
      if (!isNaN(from) && !isNaN(to) && !isNaN(a.date1parsed)) {
        if (a.date1parsed < from || a.date1parsed > to) return false;
      }
      if (q.id && String(a.id).indexOf(String(q.id).trim()) !== 0) return false;
      if (q.phone) {
        var pq = String(q.phone).replace(/\D/g, "");
        if (!pq || !a.phones.some(function (p) { return p.indexOf(pq) === 0; })) return false;
      }
      if (q.email && !wordStartMatch(a.email.replace(/[@.]/g, " "), q.email) && norm(a.email).indexOf(norm(q.email)) !== 0) return false;
      if (q.vacancy && !wordStartMatch(a.vacancy, q.vacancy)) return false;
      if (q.fio && !wordStartMatch(a.fio, q.fio)) return false;
      if (q.invoice && !invoiceMatch(a.invoiceNumber, q.invoice)) return false;
      if (q.innName) {
        var v = String(q.innName).trim();
        var okInn = a.inn.indexOf(v) === 0;
        var okName = wordStartMatch(a.companyName, v); // юр. форма не участвует
        if (!okInn && !okName) return false;
      }
      return true;
    });
  }

  function getSorted(list) {
    if (!state.sortKey) return list;
    var dir = state.sortDir;
    var val = {
      num: function (a) { return a.id; },
      id: function (a) { return a.id; },
      vacancy: function (a) { return a.vacancy; },
      fio: function (a) { return a.fio; },
      invoice: function (a) { return a.invoiceLine; },
      inn: function (a) { return a.inn; },
      company: function (a) { return a.companyName; }
    }[state.sortKey];
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "ru") * dir;
    });
  }

  /* ==========================================================
     4. Вкладки источников
     ========================================================== */
  var srcTabsNav = document.getElementById("srcTabs");
  var srcUnderline = document.getElementById("srcUnderline");
  var ddSocialApi = null; // задаётся ниже

  function setSrcTab(tabEl) {
    srcTabsNav.querySelectorAll(".src-tab").forEach(function (t) { t.classList.remove("active"); });
    tabEl.classList.add("active");
    state.srcTab = tabEl.getAttribute("data-src");
    state.mode = tabEl.getAttribute("data-kind") === "social" ? "social" : "site";
    frame.classList.toggle("mode-social", state.mode === "social");
    // категории радио по режиму
    state.cats = new Set(activeCats());
    syncRadios();
    // второй селект для соцсетей
    if (state.mode === "social") {
      var label = tabEl.getAttribute("data-social-label") || "Все сообщества";
      ddSocialApi.setPlaceholder(label, OPTIONS.social[state.srcTab] || []);
    }
    state.socialGroup = "";
    state.page = 1;
    positionUnderline();
    render();
  }
  function positionUnderline() {
    var act = srcTabsNav.querySelector(".src-tab.active");
    if (!act) { srcUnderline.style.width = "0"; return; }
    var left = 57 + act.offsetLeft + 1;
    srcUnderline.style.left = left + "px";
    srcUnderline.style.width = (act.offsetWidth - 2) + "px";
  }
  srcTabsNav.addEventListener("click", function (e) {
    var t = e.target.closest(".src-tab");
    if (!t) return;
    e.preventDefault();
    if (!t.classList.contains("active")) setSrcTab(t);
  });

  /* ==========================================================
     5. Рендер
     ========================================================== */
  var tbody = document.getElementById("tbody");
  var countNum = document.getElementById("countNum");
  var pagination = document.getElementById("pagination");
  var table = document.getElementById("adsTable");

  var RESUME_SVG = '<svg viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7.11246 19.9913H2.1624C1.56318 19.9913 1.02475 19.7482 0.633956 19.3574C0.234477 18.9666 0 18.4282 0 17.8289V5.11509C0 4.95009 0.0694746 4.80245 0.173686 4.68956C0.286583 4.58534 0.434216 4.51587 0.599218 4.51587H5.17586V5.24535H0.720799V17.8203C0.720799 18.2197 0.885801 18.5758 1.14633 18.8363C1.40686 19.0968 1.76292 19.2619 2.1624 19.2619H7.11246V19.9913Z"/><path d="M6.01819 0H15.7533C17.056 0 18.237 0.538428 19.0968 1.38949C19.9565 2.24056 20.4863 3.43031 20.4863 4.73296V17.0473C20.4863 17.855 20.1476 18.5931 19.6178 19.1316C19.0794 19.67 18.3412 20 17.5336 20H6.6261C6.15714 20 5.72293 19.8089 5.41897 19.4963C5.10634 19.1924 4.91528 18.7581 4.91528 18.2892V1.10291C4.91528 0.798958 5.03686 0.52106 5.24529 0.32132C5.42766 0.130265 5.70556 0 6.01819 0ZM15.7533 0.729483H6.01819C5.91398 0.729483 5.81845 0.772905 5.74898 0.84238C5.6795 0.911854 5.63608 1.00738 5.63608 1.10291V18.2718C5.63608 18.541 5.74898 18.7929 5.92267 18.9666C6.10504 19.1489 6.3482 19.2531 6.61741 19.2531H17.5336C18.1502 19.2531 18.6973 19.01 19.1055 18.6018C19.5049 18.2023 19.7568 17.6465 19.7568 17.0386V4.73296C19.7568 3.63873 19.3052 2.63135 18.5757 1.91055C17.8549 1.18107 16.8562 0.729483 15.7533 0.729483Z"/><path d="M7.89404 5.72289C7.6943 5.72289 7.5293 5.55789 7.5293 5.35815C7.5293 5.15841 7.6943 4.99341 7.89404 4.99341H15.8836C16.0834 4.99341 16.2484 5.15841 16.2484 5.35815C16.2484 5.55789 16.0834 5.72289 15.8836 5.72289H7.89404Z"/><path d="M7.89404 10.2475C7.6943 10.2475 7.5293 10.0825 7.5293 9.88281C7.5293 9.68307 7.6943 9.51807 7.89404 9.51807H12.5662C12.7659 9.51807 12.9309 9.68307 12.9309 9.88281C12.9309 10.0912 12.7659 10.2475 12.5662 10.2475H7.89404Z"/><path d="M7.89404 14.5376C7.6943 14.5376 7.5293 14.3726 7.5293 14.1728C7.5293 13.9731 7.6943 13.8081 7.89404 13.8081H12.5662C12.7659 13.8081 12.9309 13.9731 12.9309 14.1728C12.9309 14.3813 12.7659 14.5376 12.5662 14.5376H7.89404Z"/><path d="M17.6553 14.2423C17.6553 14.4507 17.4903 14.607 17.2905 14.607C17.0908 14.607 16.9258 14.442 16.9258 14.2423V6.25268C16.9258 6.04426 17.0908 5.88794 17.2905 5.88794C17.4903 5.88794 17.6553 6.05294 17.6553 6.25268C17.6553 6.25268 17.6553 14.2423 17.6553 14.2423Z"/></svg>';

  /* подсветка совпадения с начала слова */
  function highlight(text, query) {
    var t = String(text == null ? "" : text);
    var q = String(query || "").trim();
    if (!q) return esc(t);
    var lower = t.toLowerCase(), lq = q.toLowerCase();
    var idx = -1;
    var pos = lower.indexOf(lq);
    while (pos !== -1) {
      var prev = pos === 0 ? " " : lower.charAt(pos - 1);
      if (/[\s"«(\-–—.,;:]/.test(prev) || pos === 0) { idx = pos; break; }
      pos = lower.indexOf(lq, pos + 1);
    }
    if (idx === -1) return esc(t);
    return esc(t.slice(0, idx)) + '<span class="search-highlight">' + esc(t.slice(idx, idx + q.length)) + "</span>" + esc(t.slice(idx + q.length));
  }
  function copyBtn(url) {
    return '<button type="button" class="copy-btn" data-copy="' + esc(url) + '" aria-label="Скопировать ссылку" data-tip="Скопировать ссылку">' +
      '<img class="ico-idle" src="icons/copy.svg" alt="" /><img class="ico-hover" src="icons/copy-hover.svg" alt="" /></button>';
  }

  function renderRow(a, num) {
    var q = state.search;
    var h = '<tr data-id="' + a.id + '">';

    // № / ID
    h += '<td class="col-num"><div class="cell">' +
      '<div class="cell-line">' + num + "</div>" +
      '<div class="cell-line c-blue" style="color:#0087fc">' + highlight(a.id, q.id) + "</div>" +
      "</div></td>";

    // Телефоны / email / статус / тип
    h += '<td class="col-contact"><div class="cell">';
    a.phones.forEach(function (p) {
      h += '<div class="cell-line">' + highlight(p, q.phone && String(q.phone).replace(/\D/g, "")) + "</div>";
    });
    h += '<div class="cell-line is-ellipsis" style="color:#0087fc">' + highlight(a.email, q.email) + "</div>";
    h += '<div class="cell-line" style="color:#0087fc">' + esc(statusDisplay(a.status).toUpperCase()) + "</div>";
    h += '<div class="cell-line" style="color:#0087fc">' + esc(a.adType) + "</div>";
    h += '<div class="cell-line status-line"><span class="status-badge ' + statusClass(a.status) + '"><span class="status-text">' + esc(statusDisplay(a.status)) + "</span></span></div>";
    h += "</div></td>";

    // Вакансия / ФИО / дата отклика
    h += '<td class="col-vacancy"><div class="cell">';
    h += '<div class="cell-line wrap-hyphen">' + highlight(a.vacancy, q.vacancy);
    if (a.mergedCount) {
      h += '<a class="vacancy-count" href="' + esc(a.mergedLink) + '" target="_blank" rel="noopener noreferrer" data-tip="Посмотреть все объединённые объявления">(' + a.mergedCount + ")</a>";
    }
    h += "</div>";
    if (a.fio) {
      h += '<div class="cell-line line-link">' +
        '<a class="fio-link cell-link" href="' + esc(a.resumeLink) + '" target="_blank" rel="noopener noreferrer" data-tip="Открыть резюме на сайте hh.ru">' + highlight(a.fio, q.fio) + "</a>" +
        copyBtn(a.resumeLink) +
        '<a class="resume-ico" href="' + esc(a.resumeLink) + '" target="_blank" rel="noopener noreferrer" data-tip="Открыть карточку резюме" aria-label="Открыть карточку резюме">' + RESUME_SVG + "</a>" +
        "</div>";
    }
    if (a.responseDate) {
      h += '<div class="cell-line response-date">Дата отклика ' + esc(a.responseDate) + "</div>";
    }
    h += "</div></td>";

    // Даты 1–4 по объединённым источникам
    ["date1", "date2", "date3", "date4"].forEach(function (dk, di) {
      h += '<td class="col-date' + (di + 1) + '"><div class="cell">';
      a.sources.forEach(function (s) {
        h += '<div class="cell-line">' + esc(shortDate(s[dk])) + "</div>";
      });
      h += "</div></td>";
    });

    // Дата 5 — одна строка
    h += '<td class="col-date5"><div class="cell"><div class="cell-line">' + esc(shortDate(a.date5show)) + "</div></div></td>";

    // TIME
    h += '<td class="col-time"><div class="cell">';
    a.sources.forEach(function (s) {
      h += '<div class="cell-line">' + esc(s.daysLeft || "") + "</div>";
    });
    h += "</div></td>";

    // Счёт / ИНН / компания
    h += '<td class="col-company"><div class="cell">' +
      '<div class="cell-line line-invoice">' + highlight(a.invoiceLine, q.invoice) + "</div>" +
      '<div class="cell-line line-inn"><b>' + highlight(a.inn, q.innName) + "</b></div>" +
      '<div class="cell-line wrap-hyphen">' + highlight(a.companyName, q.innName) + ', <span class="company-form">' + esc(a.companyForm) + "</span></div>" +
      "</div></td>";

    // Источник: ссылки + текст объявления
    h += '<td class="col-text"><div class="cell">';
    a.sources.forEach(function (s) {
      if (!s.link) return;
      h += '<div class="cell-line line-link">' +
        '<a class="cell-link" href="' + esc(s.link) + '" target="_blank" rel="noopener noreferrer" data-tip="Открыть объявление на сайте">' + esc(s.link) + "</a>" +
        (s.suffix ? '<span class="src-suffix">' + esc(s.suffix) + "</span>" : "") +
        copyBtn(s.link) +
        "</div>";
    });
    if (state.noTags) {
      h += '<div class="text-plain">';
      [["Обязанности:", a.duties], ["Требования:", a.requirements], ["Условия:", a.conditions]].forEach(function (sec) {
        if (!sec[1] || !sec[1].length) return;
        h += '<div class="text-section"><span class="text-section-title">' + sec[0] + "</span>";
        sec[1].forEach(function (item) {
          h += '<div class="text-item"><span class="text-marker"></span><span class="text-item-text">' + esc(item) + "</span></div>";
        });
        h += "</div>";
      });
      h += "</div>";
    } else {
      h += '<div class="text-html">' + esc(a.textHtml) + "</div>";
    }
    h += "</div></td></tr>";
    return h;
  }

  var lastPages = 1;

  function render() {
    var filtered = getSorted(getFiltered());
    countNum.textContent = filtered.length;

    var pages = Math.max(1, Math.ceil(filtered.length / state.perPage));
    lastPages = pages;
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.perPage;
    var pageRows = filtered.slice(start, start + state.perPage);

    table.classList.toggle("no-wrap", !state.wrap);
    table.classList.toggle("collapsed", state.collapsed);

    tbody.innerHTML = pageRows.map(function (a, i) { return renderRow(a, start + i + 1); }).join("");
    renderPagination(pages);
  }

  /* Пагинация: First / страницы / «...» (+5 страниц, ТЗ п.14) / xlsx / Next */
  function renderPagination(pages) {
    var h = "";
    function btn(label, cls, page, disabled, tip) {
      return '<button type="button" class="' + cls + '"' +
        (disabled ? " disabled" : "") +
        (page != null ? ' data-page="' + page + '"' : "") +
        (tip ? ' data-tip="' + esc(tip) + '"' : "") + ">" + label + "</button>";
    }
    h += btn("First", "is-edge", 1, state.page === 1, "На первую страницу");
    var list = pageList(pages, state.page);
    list.forEach(function (p) {
      if (p === "…") h += btn("...", "ellipsis", Math.min(pages, state.page + 5), false, "Вперёд на 5 страниц");
      else h += btn(p, p === state.page ? "active" : "", p, false);
    });
    h += '<button type="button" class="xlsx-btn" data-xlsx="1" data-tip="Выгрузить страницу в XLSX"><span class="xlsx-ico"></span></button>';
    h += btn("Next", "is-edge", state.page + 1, state.page === pages, "На следующую страницу");
    pagination.innerHTML = h;
  }
  function pageList(pages, cur) {
    if (pages <= 6) {
      var r = [];
      for (var i = 1; i <= pages; i++) r.push(i);
      return r;
    }
    var out = [];
    var a = Math.max(1, cur - 2), b = Math.min(pages, a + 4);
    for (var j = a; j <= b; j++) out.push(j);
    if (b < pages) out.push("…");
    return out;
  }

  pagination.addEventListener("click", function (e) {
    var x = e.target.closest("button[data-xlsx]");
    if (x) { exportXlsx(); return; }
    var b = e.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    var p = +b.getAttribute("data-page");
    if (p >= 1) {
      state.page = Math.min(p, lastPages);
      render();
    }
  });

  /* ==========================================================
     6. Контролы
     ========================================================== */

  // --- Сортировка: клик по названию колонки или иконке (ТЗ п.10) ---
  document.querySelectorAll(".th-line.is-sortable").forEach(function (line) {
    line.addEventListener("click", function () {
      var k = line.getAttribute("data-sort");
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else { state.sortKey = k; state.sortDir = 1; }
      document.querySelectorAll(".th-line.is-sortable").forEach(function (l) {
        var btn2 = l.querySelector(".sort-btn");
        var isCur = l.getAttribute("data-sort") === state.sortKey;
        var desc = isCur && state.sortDir === -1;
        btn2.classList.toggle("is-active", isCur);
        btn2.classList.toggle("is-desc", desc);
        l.setAttribute("data-tip", desc ? "Сортировать А-Я" : "Сортировать Я-А");
      });
      render();
    });
  });

  // --- Ручное изменение ширины колонок (ТЗ п.12) ---
  (function initColResize() {
    var cols = Array.prototype.slice.call(document.querySelectorAll("#adsTable colgroup col"));
    var headRow = document.querySelector(".ads-table thead tr");
    var ths = Array.prototype.slice.call(headRow.children);
    ths.forEach(function (th, i) {
      if (i === ths.length - 1) return; // за последней границей не тянем
      var grip = document.createElement("span");
      grip.className = "col-grip";
      th.appendChild(grip);
      var startX = 0, startW = 0;
      function move(e) {
        var dx = (e.clientX - startX) / scale;
        var w = Math.max(40, startW + dx);
        cols[i].style.width = "calc(" + w.toFixed(1) + " * var(--px))";
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.classList.remove("col-resizing");
      }
      grip.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = cols[i].getBoundingClientRect().width / scale;
        document.body.classList.add("col-resizing");
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    });
  })();

  // --- Быстрый поиск ---
  var searchTimer = null;
  document.querySelectorAll(".search-field").forEach(function (f) {
    var key = f.getAttribute("data-key");
    var input = f.querySelector("input");
    var clear = f.querySelector(".search-clear");
    input.addEventListener("focus", function () { f.classList.add("is-focused"); });
    input.addEventListener("blur", function () { f.classList.remove("is-focused"); });
    input.addEventListener("input", function () {
      f.classList.toggle("has-value", !!input.value);
      state.search[key] = input.value;
      state.page = 1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 120);
    });
    clear.addEventListener("click", function () {
      input.value = "";
      f.classList.remove("has-value");
      state.search[key] = "";
      state.page = 1;
      render();
      input.focus();
    });
  });

  // --- Радио-как-чекбоксы (ТЗ п.33) ---
  function syncRadios() {
    var cats = activeCats();
    var allOn = cats.every(function (c) { return state.cats.has(c); });
    document.querySelectorAll(".radio").forEach(function (r) {
      var c = r.getAttribute("data-cat");
      if (c === "all") r.classList.toggle("is-active", allOn);
      else r.classList.toggle("is-active", state.cats.has(c));
    });
  }
  document.getElementById("radioRow").addEventListener("click", function (e) {
    var r = e.target.closest(".radio");
    if (!r) return;
    var c = r.getAttribute("data-cat");
    var cats = activeCats();
    if (c === "all") {
      var allOn = cats.every(function (x) { return state.cats.has(x); });
      state.cats = new Set(allOn ? [] : cats);
    } else {
      if (state.cats.has(c)) state.cats.delete(c);
      else state.cats.add(c);
    }
    syncRadios();
    state.page = 1;
    render();
  });

  // --- Чекбоксы ---
  function bindCheck(id, fn) {
    var el = document.getElementById(id);
    el.addEventListener("change", function () { fn(el.checked); state.page = 1; render(); });
  }
  bindCheck("chkEarlyDepub", function (v) { state.earlyDepub = v; });
  bindCheck("chkResponsesOnly", function (v) { state.responsesOnly = v; });
  bindCheck("chkChangedDepub", function (v) { state.changedDepub = v; });
  bindCheck("chkWrapText", function (v) { state.wrap = v; });
  bindCheck("chkCollapseAll", function (v) { state.collapsed = v; });
  bindCheck("chkWithoutTags", function (v) { state.noTags = v; });

  // --- Выпадающие списки ---
  function makeDropdown(rootId, textId, menuId, values, opts) {
    var root = document.getElementById(rootId);
    var text = document.getElementById(textId);
    var menu = document.getElementById(menuId);
    var current = opts.initial || "";
    var list = values.slice();
    var placeholder = opts.placeholder || "";

    function renderMenu() {
      menu.innerHTML = list.map(function (v) {
        return '<div class="dd-option' + (v === current ? " is-selected" : "") + '" data-value="' + esc(v) + '">' + esc(v) + "</div>";
      }).join("");
    }
    function setValue(v, silent) {
      current = v;
      if (v) {
        text.textContent = v;
        root.classList.add("has-value");
      } else {
        text.textContent = placeholder;
        root.classList.toggle("has-value", !!opts.alwaysValue);
      }
      renderMenu();
      if (!silent) opts.onChange(v);
    }
    root.addEventListener("click", function (e) {
      if (e.target.closest(".dd-clear")) { setValue(""); return; }
      if (e.target.closest(".dd-option")) {
        setValue(e.target.closest(".dd-option").getAttribute("data-value"));
        root.classList.remove("is-open");
        return;
      }
      var open = root.classList.contains("is-open");
      closeAllDropdowns();
      root.classList.toggle("is-open", !open);
    });
    renderMenu();
    if (opts.initial) setValue(opts.initial, true);
    else text.textContent = placeholder;
    return {
      setValue: setValue,
      setPlaceholder: function (ph, newList) {
        placeholder = ph;
        if (newList) list = newList.slice();
        current = "";
        text.textContent = placeholder;
        root.classList.remove("has-value");
        renderMenu();
      }
    };
  }
  function closeAllDropdowns() {
    document.querySelectorAll(".dd.is-open").forEach(function (d) { d.classList.remove("is-open"); });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".dd")) closeAllDropdowns();
    if (!e.target.closest(".calendar") && !e.target.closest(".date-field")) closeCalendar();
  });

  makeDropdown("ddRows", "ddRowsText", "ddRowsMenu", OPTIONS.rowsPerPage, {
    initial: "500",
    alwaysValue: true,
    onChange: function (v) {
      state.perPage = +v || 500;
      state.page = 1;
      render();
    }
  });
  makeDropdown("ddXml", "ddXmlText", "ddXmlMenu", OPTIONS.xmlFiles, {
    placeholder: "Все файлы xml",
    onChange: function (v) { state.xmlFile = v; state.page = 1; render(); }
  });
  ddSocialApi = makeDropdown("ddSocial", "ddSocialText", "ddSocialMenu", OPTIONS.social.vk, {
    placeholder: "Все сообщества",
    onChange: function (v) { state.socialGroup = v; state.page = 1; render(); }
  });

  // --- Календарь ---
  var MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  var WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
  var calendar = document.getElementById("calendar");
  var calGrid = document.getElementById("calGrid");
  var calMonthText = document.getElementById("calMonthText");
  var calYearText = document.getElementById("calYearText");
  var calState = { field: null, month: new Date().getMonth(), year: new Date().getFullYear() };

  function parseFieldDate(s) {
    var m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? { d: +m[1], m: +m[2] - 1, y: +m[3] } : null;
  }

  function openCalendar(fieldId) {
    var field = document.getElementById(fieldId);
    var valueEl = field.querySelector(".date-value");
    var cur = parseFieldDate(valueEl.textContent);
    calState.field = fieldId;
    if (cur) { calState.month = cur.m; calState.year = cur.y; }
    document.querySelectorAll(".date-field").forEach(function (f) { f.classList.remove("is-open"); });
    field.classList.add("is-open");
    calendar.hidden = false;
    calendar.style.left = field.offsetLeft + "px";
    calendar.style.top = field.offsetTop + field.offsetHeight + 2 + "px";
    renderCalendar();
  }
  function closeCalendar() {
    calendar.hidden = true;
    calState.field = null;
    document.querySelectorAll(".date-field").forEach(function (f) { f.classList.remove("is-open"); });
    document.getElementById("calMonthMenu").hidden = true;
    document.getElementById("calYearMenu").hidden = true;
  }
  function renderCalendar() {
    calMonthText.textContent = MONTHS[calState.month];
    calYearText.textContent = calState.year;
    var sel = calState.field ? parseFieldDate(document.getElementById(calState.field).querySelector(".date-value").textContent) : null;
    var h = WEEKDAYS.map(function (w) { return '<span class="cal-wd">' + w + "</span>"; }).join("");
    var first = new Date(calState.year, calState.month, 1);
    var startShift = (first.getDay() + 6) % 7;
    var daysIn = new Date(calState.year, calState.month + 1, 0).getDate();
    var prevDays = new Date(calState.year, calState.month, 0).getDate();
    for (var i = 0; i < startShift; i++) {
      h += '<button type="button" class="cal-day is-out" data-shift="-1" data-day="' + (prevDays - startShift + 1 + i) + '">' + (prevDays - startShift + 1 + i) + "</button>";
    }
    for (var d = 1; d <= daysIn; d++) {
      var isSel = sel && sel.d === d && sel.m === calState.month && sel.y === calState.year;
      h += '<button type="button" class="cal-day' + (isSel ? " is-selected" : "") + '" data-day="' + d + '">' + d + "</button>";
    }
    var tail = (7 - (startShift + daysIn) % 7) % 7;
    for (var t = 1; t <= tail; t++) {
      h += '<button type="button" class="cal-day is-out" data-shift="1" data-day="' + t + '">' + t + "</button>";
    }
    calGrid.innerHTML = h;
  }
  document.getElementById("dateFrom").addEventListener("click", function () {
    if (calState.field === "dateFrom") closeCalendar(); else openCalendar("dateFrom");
  });
  document.getElementById("dateTo").addEventListener("click", function () {
    if (calState.field === "dateTo") closeCalendar(); else openCalendar("dateTo");
  });
  calendar.addEventListener("click", function (e) { e.stopPropagation(); });
  document.getElementById("calPrev").addEventListener("click", function () {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", function () {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalendar();
  });
  calGrid.addEventListener("click", function (e) {
    var b = e.target.closest(".cal-day");
    if (!b || !calState.field) return;
    var shift = +(b.getAttribute("data-shift") || 0);
    var m = calState.month + shift, y = calState.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    var val = pad2(+b.getAttribute("data-day")) + "." + pad2(m + 1) + "." + y;
    var field = document.getElementById(calState.field);
    field.querySelector(".date-value").textContent = val;
    field.classList.add("has-value");
    state[calState.field === "dateFrom" ? "dateFrom" : "dateTo"] = val;
    state.page = 1;
    closeCalendar();
    render();
  });
  function makeCalMenu(selId, menuId, items, get, set) {
    var selEl = document.getElementById(selId);
    var menu = document.getElementById(menuId);
    selEl.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !menu.hidden;
      document.getElementById("calMonthMenu").hidden = true;
      document.getElementById("calYearMenu").hidden = true;
      if (open) return;
      menu.innerHTML = items().map(function (it) {
        return '<button type="button" data-v="' + it.v + '"' + (it.v === get() ? ' class="is-selected"' : "") + ">" + it.label + "</button>";
      }).join("");
      menu.hidden = false;
      menu.addEventListener("click", function h2(ev) {
        var b = ev.target.closest("button[data-v]");
        if (!b) return;
        ev.stopPropagation();
        set(+b.getAttribute("data-v"));
        menu.hidden = true;
        menu.removeEventListener("click", h2);
        renderCalendar();
      });
    });
  }
  makeCalMenu("calMonthSel", "calMonthMenu",
    function () { return MONTHS.map(function (m, i) { return { v: i, label: m }; }); },
    function () { return calState.month; },
    function (v) { calState.month = v; });
  makeCalMenu("calYearSel", "calYearMenu",
    function () {
      var out = [];
      for (var y = 2020; y <= 2030; y++) out.push({ v: y, label: y });
      return out;
    },
    function () { return calState.year; },
    function (v) { calState.year = v; });

  // --- Delete: переход на последнюю страницу (ТЗ п.14) ---
  document.getElementById("deleteBtn").addEventListener("click", function () {
    state.page = lastPages;
    render();
  });

  // --- Копирование ссылок ---
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".copy-btn");
    if (!b) return;
    e.preventDefault();
    var url = b.getAttribute("data-copy") || "";
    function done() {
      b.classList.add("is-copied");
      setTimeout(function () { b.classList.remove("is-copied"); }, 900);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta);
      done();
    }
  });

  /* ==========================================================
     7. Экспорт
     ========================================================== */
  function download(blobParts, type, name) {
    var blob = new Blob(blobParts, { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  document.getElementById("exportBtn").addEventListener("click", function () {
    var rows = getSorted(getFiltered());
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<ads count="' + rows.length + '">\n';
    rows.forEach(function (a) {
      x += '  <ad id="' + a.id + '">\n';
      x += "    <status>" + xmlEsc(a.status) + "</status>\n";
      x += "    <adType>" + xmlEsc(a.adType) + "</adType>\n";
      x += "    <vacancy>" + xmlEsc(a.vacancy) + "</vacancy>\n";
      a.phones.forEach(function (p) { x += "    <phone>" + xmlEsc(p) + "</phone>\n"; });
      x += "    <email>" + xmlEsc(a.email) + "</email>\n";
      x += "    <invoice>" + xmlEsc(a.invoiceLine) + "</invoice>\n";
      x += "    <inn>" + xmlEsc(a.inn) + "</inn>\n";
      x += "    <company>" + xmlEsc(a.companyName + (a.companyForm ? ", " + a.companyForm : "")) + "</company>\n";
      a.sources.forEach(function (s) {
        x += '    <source link="' + xmlEsc(s.link) + '" date1="' + xmlEsc(s.date1) + '" date2="' + xmlEsc(s.date2) + '" date3="' + xmlEsc(s.date3) + '" date4="' + xmlEsc(s.date4) + '" daysLeft="' + xmlEsc(s.daysLeft) + '"/>\n';
      });
      x += "  </ad>\n";
    });
    x += "</ads>\n";
    download([x], "application/xml;charset=utf-8", "ads-export.xml");
  });

  function exportXlsx() {
    var filtered = getSorted(getFiltered());
    var start = (state.page - 1) * state.perPage;
    var rows = filtered.slice(start, start + state.perPage);
    var h = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1">';
    h += "<tr><th>№</th><th>ID</th><th>Телефоны</th><th>Email</th><th>Статус</th><th>Вакансия</th><th>Счёт</th><th>ИНН</th><th>Компания</th></tr>";
    rows.forEach(function (a, i) {
      h += "<tr><td>" + (start + i + 1) + "</td><td>" + a.id + "</td><td>" + esc(a.phones.join(", ")) + "</td><td>" + esc(a.email) + "</td><td>" + esc(statusDisplay(a.status)) + "</td><td>" + esc(a.vacancy) + "</td><td>" + esc(a.invoiceLine) + "</td><td>" + esc(a.inn) + "</td><td>" + esc(a.companyName + ", " + a.companyForm) + "</td></tr>";
    });
    h += "</table></body></html>";
    download(["﻿", h], "application/vnd.ms-excel", "ads-page-" + state.page + ".xls");
  }

  /* ==========================================================
     Старт: шрифты должны быть готовы до первого показа кадра.
     ========================================================== */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    syncRadios();
    render();
    positionUnderline();
    if (window.AppViewport) window.AppViewport.init();
  }
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([
    fontsReady,
    new Promise(function (resolve) { setTimeout(resolve, 1500); })
  ]).then(boot, boot);
})();
