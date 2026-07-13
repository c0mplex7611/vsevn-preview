/**
 * Колонки таблицы «Объявления скомпонованные».
 * Точные значения из Figma-макета (артборд «Активно перносить и Свернуть все», база 1920px).
 * x — абсолютная позиция от левого края карточки (карточка начинается на 19px от края экрана).
 */
window.FIGMA_COLUMNS = (function () {
  const C = window.FIGMA_COLORS || {};
  return [
    {
      key: "num",
      width: 78,
      titleLines: [
        { t: "№", sort: "num", c: C.textPrimary },
        { t: "ID", sort: "id", c: C.link },
        {
          t: "ТИП ОБЪЯВ.",
          c: C.adType,
          wrap: true,
          h: 58,
          lines: ["ТИП", "ОБЪЯ."],
        },
      ],
      search: [{ key: "id", placeholder: "Id" }],
    },
    {
      key: "contact",
      width: 143,
      titleLines: [
        { t: "ТЕЛЕФОН(Ы)", c: C.textPrimary },
        { t: "EMAIL", c: C.link },
        { t: "СТАТУС", c: C.muted },
      ],
      search: [
        { key: "phone", placeholder: "По телеф." },
        { key: "email", placeholder: "По email" },
      ],
    },
    {
      key: "vacancy",
      width: 390,
      titleLines: [
        {
          t: "НАЗВАНИЕ ВАКАНСИИ ИЗ ОБЪЯВЛЕНИЯ",
          sort: "vacancy",
          c: C.textPrimary,
          wrap: true,
          h: 58,
        },
        {
          t: "ФИО ОТКЛИКНУВШЕГОСЯ СОИСКАТЕЛЯ",
          sort: "fio",
          c: C.fio,
          wrap: true,
          h: 58,
        },
      ],
      search: [
        { key: "vacancy", placeholder: "По названию вакансии" },
        { key: "fio", placeholder: "По ФИО соискателя" },
      ],
    },
    {
      key: "date1",
      width: 94,
      titleLines: [
        {
          t: "ДАТА ПУБЛИКАЦИИ ИЗ XML",
          c: C.muted,
          wrap: true,
          h: 116,
          lines: ["ДАТА", "ПУБЛИ-", "КАЦИИ", "ИЗ XML"],
        },
      ],
      search: [],
    },
    {
      key: "date2",
      width: 94,
      titleLines: [
        {
          t: "ДАТА ПУБЛИКАЦИИ ФАКТИ.",
          c: C.link,
          wrap: true,
          h: 116,
          lines: ["ДАТА", "ПУБЛИ-", "КАЦИИ", "ФАКТИ."],
        },
      ],
      search: [],
    },
    {
      key: "date3",
      width: 94,
      titleLines: [
        {
          t: "ДАТА ДЕПУБЛИКАЦ. ИЗ XML",
          c: C.date3,
          wrap: true,
          h: 116,
          lines: ["ДАТА", "ДЕПУБ-", "ЛИКАЦ.", "ИЗ XML"],
        },
      ],
      search: [],
    },
    {
      key: "date4",
      width: 94,
      titleLines: [
        {
          t: "ДАТА ДЕПУБЛИКАЦ. ФАКТИ.",
          c: C.date4,
          wrap: true,
          h: 116,
          lines: ["ДАТА", "ДЕПУБ-", "ЛИКАЦ.", "ФАКТИ."],
        },
      ],
      search: [],
    },
    {
      key: "date5",
      width: 94,
      titleLines: [
        {
          t: "ДАТА ДЕПУБ. РАНЬШЕ СРОКА",
          c: C.date5,
          wrap: true,
          h: 116,
          lines: ["ДАТА", "ДЕПУБ.", "РАНЬШЕ", "СРОКА"],
        },
      ],
      search: [],
    },
    {
      key: "time",
      width: 79,
      titleLines: [
        {
          t: "TIME КОЛ. ДНЕЙ ОКОН.",
          c: C.textPrimary,
          wrap: true,
          h: 116,
          lines: ["TIME", "КОЛ.", "ДНЕЙ", "ОКОН."],
        },
      ],
      search: [],
    },
    {
      key: "company",
      width: 289,
      titleLines: [
        { t: "НОМЕР И ДАТА СЧЁТА", sort: "invoice", c: C.textPrimary },
        { t: "ИНН КОМПАНИИ", sort: "inn", c: C.textPrimary },
        { t: "НАЗВАНИЕ КОМПАНИИ", sort: "company", c: C.textPrimary },
      ],
      search: [
        { key: "invoice", placeholder: "По номеру счета" },
        { key: "innName", placeholder: "По ИНН или по названию" },
      ],
    },
    {
      key: "text",
      width: 400,
      titleLines: [
        { t: "ИСТОЧНИК", c: C.textPrimary },
        {
          t: "ТЕКСТ ОБЪЯВЛЕНИЯ ИЗ ТЕГОВ DOPINFORMSOBYZANOSTI, DOPINFORMSTREBOVANIY, DOPINFORMSUSLOVIY",
          c: C.textPrimary,
          wrap: true,
          h: 87,
          lines: [
            "ТЕКСТ ОБЪЯВЛЕНИЯ ИЗ ТЕГОВ DOPIN-",
            "FORMSOBYZANOSTI, DOPINFORMST-",
            "REBOVANIY,  DOPINFORMSUSLOVIY",
          ],
        },
      ],
      search: [],
    },
  ];
})();

window.FIGMA_LAYOUT = {
  designWidth: 1920,
  card: { x: 19, y: 77, width: 1881, paddingLeft: 18, paddingRight: 12 },
  header: { height: 60 },
  rowHeight: 571,
  rowHeightCollapsed: 116,
  headerTitleHeight: 127,
  searchRowHeight: 100,
  searchFieldHeight: 50,
  fontSizeTitle: 21,
  fontSizeCell: 20,
  colors: window.FIGMA_COLORS || {
    pageBg: "#FFFCEC",
    headerBg: "#FED839",
    textPrimary: "#62560E",
    textActive: "#FF0303",
    link: "#0087FC",
    zebra: "#FFFEFB",
    white: "#FFFFFF",
    border: "rgba(98, 86, 14, 0.3)",
    placeholder: "#B0AB87",
    searchPlaceholder: "#B0AB87",
  },
};

window.FIGMA_RADIO = [
  "Все",
  "Ещё не опубликованные",
  "Активные",
  "Завершенные",
  "Просроченные",
];

window.FIGMA_LEGEND = [
  "ОБОЗНАЧЕНИЕ ПО ДАТАМ: Дата №1 Дата публикации из xml Дата №2 Дата публикации",
  "ОБОЗНАЧЕНИЕ ПО ДАТАМ: Дата №3 Дата депубликации из xml Дата №4 Фактическая дата завершения Дата №5 Депубликации раньше срока на сайте",
];
