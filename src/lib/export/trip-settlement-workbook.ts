// Full "كشف الرحلة" workbook generator.
//
// Rebuilds the original two-sheet workbook exactly:
//   "#"          → reference / lookup database (pricing, dropdowns, reps)
//   "نموذج فاضي" → operational trip settlement sheet (live formulas)
//
// Every derived column is written as a real Excel formula (SUMIFS / VLOOKUP /
// INDEX+MATCH), so the downloaded file keeps recalculating exactly like the
// original template while being pre-filled with the site data.
import ExcelJS from "exceljs";

/* ------------------------------------------------------------------ types */

export const ROOM_ROWS = [
  "فردي",
  "ثنائي",
  "ثلاثي",
  "رباعي",
  "خماسي",
  "مشترك خماسي",
  "مشترك رباعي",
  "مشترك مشرف",
] as const;

export const TRANSFER_ROWS = ["ذهاب فقط", "ذهاب وعوده فقط", "ذهاب وعوده برحلة اخرى"] as const;

export const EXTENSION_ROW = "تمديد";

/** Room capacity used to convert people → rooms and cost → cost per person. */
export const ROOM_CAPACITY: Record<string, number> = {
  فردي: 1,
  ثنائي: 2,
  ثلاثي: 3,
  رباعي: 4,
  خماسي: 5,
  "مشترك خماسي": 5,
  "مشترك رباعي": 4,
  "مشترك مشرف": 4,
};

export const NATIONALITIES = [
  "السعودية",
  "مصر",
  "سوريا",
  "الجزائر",
  "المغرب",
  "تونس",
  "ليبيا",
  "السودان",
  "اليمن",
  "الأردن",
  "فلسطين",
  "العراق",
  "لبنان",
  "باكستان",
  "الهند",
  "بنجلاديش",
  "إندونيسيا",
  "نيجيريا",
  "مالي",
  "تشاد",
  "الصومال",
  "أخرى",
];

export const WEEK_DAYS = [
  "السبت",
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "رحله اخرى",
  "بدون",
];

export const PERIODS: Array<[number, string, number]> = [
  [180, "فجر", 360],
  [240, "ظهر", 240],
  [300, "عصر", 180],
  [360, "عشاء", 120],
];

export interface HotelPricing {
  hotel: string;
  /** sale price per room type (room label → price) */
  sale: Record<string, number>;
  /** real cost of the whole room per room type (room label → cost) */
  cost: Record<string, number>;
  /** sale price of one extension night */
  extensionSale: number;
  /** real cost of one extension night */
  extensionCost: number;
  /** transfer-only sale prices (ذهاب فقط ...) */
  transfer?: Partial<Record<(typeof TRANSFER_ROWS)[number], number>>;
}

export interface RepCommission {
  name: string;
  rate: number; // 0..1
}

export interface SettlementRow {
  rep: string;
  customer: string;
  idNumber: string;
  nationality: string;
  count: number;
  returnDay: string;
  hotel: string;
  roomType: string;
  roomNumber?: string;
  extensionNights?: number;
  notes?: string;
}

export interface SettlementHeader {
  departureLabel?: string;
  departureDay?: string;
  departureDate?: string;
  returnLabel?: string;
  returnDay?: string;
  returnDate?: string;
  capacity?: number;
  transportCompany?: string;
  vehicleType?: string;
  plate?: string;
  driverName?: string;
  driverId?: string;
  driverPhone?: string;
}

export interface SettlementExpenses {
  busRent: number;
  driverTip: number;
  supervisor: number;
  parking: number;
  other: number;
  bankTransfer: number;
}

export interface SettlementInput {
  header: SettlementHeader;
  rows: SettlementRow[];
  hotels: HotelPricing[];
  reps: RepCommission[];
  expenses: SettlementExpenses;
  transferPrices?: Partial<Record<(typeof TRANSFER_ROWS)[number], number>>;
}

/* --------------------------------------------------------------- helpers */

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
  bottom: { style: "thin" },
};

function styleCell(cell: ExcelJS.Cell, opts: { bold?: boolean; fill?: string; align?: ExcelJS.Alignment["horizontal"] } = {}) {
  cell.border = THIN;
  cell.font = { name: "Arial", size: 10, bold: opts.bold ?? false };
  cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", readingOrder: "rtl" };
  if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
}

const HEAD_FILL = "FFDBE5F1";
const TOTAL_FILL = "FFF2F2F2";
const ACCENT_FILL = "FFFFF2CC";

/* --------------------------------------------------------- "#" reference */

interface RefLayout {
  /** first / last row of the A:C pricing table */
  priceFirst: number;
  priceLast: number;
  /** row of a given (hotel, roomType) inside the pricing table */
  rowOf: (hotel: string, room: string) => number | undefined;
}

function buildReferenceSheet(wb: ExcelJS.Workbook, input: SettlementInput): RefLayout {
  const ws = wb.addWorksheet("#", { views: [{ rightToLeft: true }] });

  ws.getColumn("A").width = 20;
  ws.getColumn("B").width = 20;
  ws.getColumn("C").width = 10;
  ws.getColumn("E").width = 6;
  ws.getColumn("F").width = 6;
  ws.getColumn("G").width = 18;
  ws.getColumn("H").width = 18;
  ws.getColumn("I").width = 14;
  ws.getColumn("J").width = 20;
  ws.getColumn("K").width = 10;
  ws.getColumn("L").width = 6;
  ws.getColumn("M").width = 8;
  ws.getColumn("N").width = 10;
  ws.getColumn("O").width = 8;
  ws.getColumn("P").width = 16;
  ws.getColumn("R").width = 12;
  ws.getColumn("S").width = 42;

  // --- headers
  const heads: Array<[string, string]> = [
    ["A1", "الفندق"],
    ["B1", "نوع الغرفه / الرحله"],
    ["C1", "السعر"],
    ["E1", "#"],
    ["F1", "اليوم"],
    ["G1", "الفندق (قائمة)"],
    ["H1", "نوع الغرفه (قائمة)"],
    ["I1", "الأيام"],
    ["J1", "المندوب"],
    ["K1", "النسبه"],
    ["L1", "العدد"],
    ["M1", "من"],
    ["N1", "الفتره"],
    ["O1", "إلى"],
    ["P1", "الجنسيه"],
    ["R1", "المركبه"],
    ["S1", "شركة النقل"],
  ];
  for (const [addr, text] of heads) {
    ws.getCell(addr).value = text;
    styleCell(ws.getCell(addr), { bold: true, fill: HEAD_FILL });
  }

  // --- A:C pricing table (transfer-only rows first, then hotel × room rows)
  const index = new Map<string, number>();
  let r = 2;
  const priceFirst = r;
  for (const t of TRANSFER_ROWS) {
    ws.getCell(`A${r}`).value = "توصيل فقط";
    ws.getCell(`B${r}`).value = t;
    ws.getCell(`C${r}`).value = Number(input.transferPrices?.[t] ?? 0);
    [`A${r}`, `B${r}`, `C${r}`].forEach((a) => styleCell(ws.getCell(a), { align: "right" }));
    index.set(`توصيل فقط|${t}`, r);
    r++;
  }
  for (const h of input.hotels) {
    for (const room of ROOM_ROWS) {
      ws.getCell(`A${r}`).value = h.hotel;
      ws.getCell(`B${r}`).value = room;
      ws.getCell(`C${r}`).value = Number(h.sale[room] ?? 0);
      [`A${r}`, `B${r}`, `C${r}`].forEach((a) => styleCell(ws.getCell(a), { align: "right" }));
      index.set(`${h.hotel}|${room}`, r);
      r++;
    }
    for (const t of TRANSFER_ROWS) {
      ws.getCell(`A${r}`).value = h.hotel;
      ws.getCell(`B${r}`).value = t;
      ws.getCell(`C${r}`).value = Number(h.transfer?.[t] ?? input.transferPrices?.[t] ?? 0);
      [`A${r}`, `B${r}`, `C${r}`].forEach((a) => styleCell(ws.getCell(a), { align: "right" }));
      index.set(`${h.hotel}|${t}`, r);
      r++;
    }
    ws.getCell(`A${r}`).value = h.hotel;
    ws.getCell(`B${r}`).value = EXTENSION_ROW;
    ws.getCell(`C${r}`).value = Number(h.extensionSale ?? 0);
    [`A${r}`, `B${r}`, `C${r}`].forEach((a) => styleCell(ws.getCell(a), { align: "right" }));
    index.set(`${h.hotel}|${EXTENSION_ROW}`, r);
    r++;
  }
  const priceLast = r - 1;

  // --- E:F day numbers (1..29)
  for (let i = 1; i <= 29; i++) {
    ws.getCell(`E${i + 1}`).value = i;
    ws.getCell(`F${i + 1}`).value = i;
    styleCell(ws.getCell(`E${i + 1}`));
    styleCell(ws.getCell(`F${i + 1}`));
  }

  // --- G:H dropdown sources
  const hotelList = ["توصيل فقط", ...input.hotels.map((h) => h.hotel)];
  hotelList.forEach((h, i) => {
    ws.getCell(`G${i + 2}`).value = h;
    styleCell(ws.getCell(`G${i + 2}`), { align: "right" });
  });
  [...ROOM_ROWS, ...TRANSFER_ROWS, EXTENSION_ROW].forEach((rt, i) => {
    ws.getCell(`H${i + 2}`).value = rt;
    styleCell(ws.getCell(`H${i + 2}`), { align: "right" });
  });

  // --- I days
  WEEK_DAYS.forEach((d, i) => {
    ws.getCell(`I${i + 2}`).value = d;
    styleCell(ws.getCell(`I${i + 2}`), { align: "right" });
  });

  // --- J:K reps + commission
  const reps: RepCommission[] = [...input.reps];
  if (!reps.some((x) => x.name === "رحله مجانيه")) reps.push({ name: "رحله مجانيه", rate: 0 });
  reps.forEach((rep, i) => {
    ws.getCell(`J${i + 2}`).value = rep.name;
    ws.getCell(`K${i + 2}`).value = Number(rep.rate) || 0;
    styleCell(ws.getCell(`J${i + 2}`), { align: "right" });
    styleCell(ws.getCell(`K${i + 2}`));
    ws.getCell(`K${i + 2}`).numFmt = "0%";
  });

  // --- L counts 1..15
  for (let i = 1; i <= 15; i++) {
    ws.getCell(`L${i + 1}`).value = i;
    styleCell(ws.getCell(`L${i + 1}`));
  }

  // --- M:O periods
  PERIODS.forEach(([from, name, to], i) => {
    ws.getCell(`M${i + 2}`).value = from;
    ws.getCell(`N${i + 2}`).value = name;
    ws.getCell(`O${i + 2}`).value = to;
    styleCell(ws.getCell(`M${i + 2}`));
    styleCell(ws.getCell(`N${i + 2}`), { align: "right" });
    styleCell(ws.getCell(`O${i + 2}`));
  });

  // --- P nationalities
  NATIONALITIES.forEach((n, i) => {
    ws.getCell(`P${i + 2}`).value = n;
    styleCell(ws.getCell(`P${i + 2}`), { align: "right" });
  });

  // --- R vehicles / S transport company
  ["باص", "H1"].forEach((v, i) => {
    ws.getCell(`R${i + 2}`).value = v;
    styleCell(ws.getCell(`R${i + 2}`));
  });
  ws.getCell("S2").value = input.header.transportCompany || "شركة مزايا النقل لخدمات الزوار والمعتمرين";
  styleCell(ws.getCell("S2"), { align: "right" });

  return {
    priceFirst,
    priceLast,
    rowOf: (hotel, room) => index.get(`${hotel}|${room}`),
  };
}

/* --------------------------------------------------- settlement worksheet */

const FIRST_ROW = 13; // supervisor row
const LAST_ROW = 73;
const TOTALS_ROW = 74;
const STATS_TOP = 76;
const RULES_TOP = 107;
const RULES_BLOCK = 12; // rows per hotel in the cost-rules section

const RULE_ROOMS = [...ROOM_ROWS, ...TRANSFER_ROWS, EXTENSION_ROW];

function ruleBlock(i: number) {
  const start = RULES_TOP + i * RULES_BLOCK;
  return { start, end: start + RULES_BLOCK - 1 };
}

function buildSettlementSheet(wb: ExcelJS.Workbook, input: SettlementInput) {
  const ws = wb.addWorksheet("نموذج فاضي", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 12 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const widths: Record<string, number> = {
    A: 5, B: 14, C: 22, D: 14, E: 10, F: 6, G: 10, H: 12, I: 12, J: 8, K: 12,
    L: 8, M: 10, N: 12, O: 16, P: 10, Q: 12, R: 12, S: 10, T: 10, U: 10, V: 8, W: 10, X: 10,
  };
  Object.entries(widths).forEach(([c, w]) => (ws.getColumn(c).width = w));

  const h = input.header;
  const hotels = input.hotels;

  /* ---------------------------------------------------------- header 1:11 */
  const put = (addr: string, value: ExcelJS.CellValue, bold = false, fill?: string) => {
    ws.getCell(addr).value = value;
    styleCell(ws.getCell(addr), { bold, fill, align: "right" });
  };

  put("A2", "كشف رحله", true, ACCENT_FILL);
  put("C2", h.departureLabel || "ذهاب", true);
  put("D2", h.departureDay || "");
  put("B3", "التاريخ");
  put("C3", h.departureDate || "");
  put("C4", h.returnLabel || "عوده", true);
  put("D4", h.returnDay || "");
  put("B5", "التاريخ");
  put("C5", h.returnDate || "");
  put("B6", "بيان مركبه حموله", true);
  put("C6", h.vehicleType || "باص");
  put("D6", Number(h.capacity) || 0, true, ACCENT_FILL);
  put("A7", h.transportCompany || "شركة مزايا النقل لخدمات الزوار والمعتمرين", true);
  put("B8", "باص");
  put("C8", "لوحه");
  put("D8", h.plate || "");
  put("C9", "السائق");
  put("D9", h.driverName || "");
  put("C10", "هويته");
  put("D10", h.driverId || "");
  put("C11", "ت");
  put("D11", h.driverPhone || "");

  put("E10", "عدد الركاب", true, HEAD_FILL);
  ws.getCell("F10").value = { formula: `SUM(F${FIRST_ROW + 1}:F${LAST_ROW})` };
  styleCell(ws.getCell("F10"), { bold: true });
  put("G10", "متبقي", true, HEAD_FILL);
  ws.getCell("H10").value = { formula: `D6-(F10+F${FIRST_ROW})` };
  styleCell(ws.getCell("H10"), { bold: true });

  /* -------------------------------------------- main table headings row 12 */
  const cols = [
    ["A", "م"],
    ["B", "المندوب"],
    ["C", "العميل"],
    ["D", "الهويه"],
    ["E", "جنسيه"],
    ["F", "العدد"],
    ["G", "العوده"],
    ["H", "الفندق"],
    ["I", "نوع الغرفه"],
    ["J", "رقم الغرفه"],
    ["K", "اجمالي الباقه"],
    ["L", "ليالي التمديد"],
    ["M", "اجمالي التمديد"],
    ["N", "إجمالي"],
    ["O", "ملاحظات"],
    ["P", "باقة الفرد"],
    ["Q", "ت. الباقه/للفرد"],
    ["R", "ت. المجموعه"],
    ["S", "ت. التمديد"],
    ["T", "ربح التمديد"],
    ["U", "مجمل ربح"],
    ["V", "نسبة المندوب"],
    ["W", "حصة المندوب"],
    ["X", "حصة المؤسسه"],
  ] as const;
  for (const [c, label] of cols) {
    ws.getCell(`${c}12`).value = label;
    styleCell(ws.getCell(`${c}12`), { bold: true, fill: HEAD_FILL });
  }
  ws.getRow(12).height = 28;

  /* ------------------------------------------ Q formula (INDEX/MATCH cost) */
  const costFormula = (r: number, col: "I" | "F") => {
    // nested IF per hotel over the cost-rules blocks
    let f = "";
    hotels.forEach((ht, i) => {
      const { start, end } = ruleBlock(i);
      f += `IF(H${r}="${ht.hotel}",INDEX($${col}$${start}:$${col}$${end},MATCH(I${r},$C$${start}:$C$${end},0)),`;
    });
    f += `""` + ")".repeat(hotels.length);
    return f;
  };
  const extRow = (i: number) => ruleBlock(i).start + RULES_BLOCK - 1; // "تمديد" row of hotel i
  const extLookup = (r: number, col: "D" | "I") => {
    let f = "";
    hotels.forEach((ht, i) => {
      f += `IF(H${r}="${ht.hotel}",$${col}$${extRow(i)},`;
    });
    f += "0" + ")".repeat(hotels.length);
    return f;
  };

  /* -------------------------------------------- data rows 13..73 + formulas */
  // Row 13 is the supervisor seat (count = 1) exactly like the original sheet.
  ws.getCell(`A${FIRST_ROW}`).value = "م";
  ws.getCell(`C${FIRST_ROW}`).value = "مشرف الرحله";
  ws.getCell(`F${FIRST_ROW}`).value = 1;

  input.rows.forEach((row, i) => {
    const r = FIRST_ROW + 1 + i;
    if (r > LAST_ROW) return;
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = row.rep || "";
    ws.getCell(`C${r}`).value = row.customer || "";
    ws.getCell(`D${r}`).value = row.idNumber || "";
    ws.getCell(`E${r}`).value = row.nationality || "";
    ws.getCell(`F${r}`).value = Number(row.count) || 0;
    ws.getCell(`G${r}`).value = row.returnDay || "";
    ws.getCell(`H${r}`).value = row.hotel || "";
    ws.getCell(`I${r}`).value = row.roomType || "";
    ws.getCell(`J${r}`).value = row.roomNumber || "";
    ws.getCell(`L${r}`).value = Number(row.extensionNights) || 0;
    ws.getCell(`O${r}`).value = row.notes || "";
  });

  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    const lookupSale = `SUMIFS('#'!$C:$C,'#'!$A:$A,H${r},'#'!$B:$B,I${r})`;

    ws.getCell(`K${r}`).value = {
      formula: `IF(B${r}="رحله مجانيه",0,IF(OR(F${r}="",ISERROR(${lookupSale}*F${r})),"",${lookupSale}*F${r}))`,
    };
    ws.getCell(`M${r}`).value = {
      formula: `IFERROR(IF(OR(L${r}="",L${r}=0),"",(${extLookup(r, "D")})*L${r}),"")`,
    };
    ws.getCell(`N${r}`).value = { formula: `IFERROR(N(M${r}),0)+IFERROR(N(K${r}),0)` };
    ws.getCell(`P${r}`).value = { formula: `IFERROR(${lookupSale},"")` };
    ws.getCell(`Q${r}`).value = { formula: `IFERROR(${costFormula(r, "I")},"")` };
    ws.getCell(`R${r}`).value = { formula: `IF(ISERROR(N(Q${r})*F${r}),"",N(Q${r})*F${r})` };
    ws.getCell(`S${r}`).value = {
      formula: `IFERROR(IF(OR(L${r}="",L${r}=0),"",(${extLookup(r, "I")})*L${r}),"")`,
    };
    ws.getCell(`T${r}`).value = { formula: `IFERROR(N(M${r})-N(S${r}),"")` };
    ws.getCell(`U${r}`).value = {
      formula: `IF(N(N${r})-N(R${r})-N(S${r})=0,"",N(N${r})-N(R${r})-N(S${r}))`,
    };
    ws.getCell(`V${r}`).value = {
      formula: `IF(OR(B${r}="",B${r}=0),"",IFERROR(VLOOKUP(B${r},'#'!$J:$K,2,FALSE),""))`,
    };
    ws.getCell(`W${r}`).value = { formula: `IFERROR(IF(N(V${r})*N(U${r})=0,"",N(V${r})*N(U${r})),"")` };
    ws.getCell(`X${r}`).value = { formula: `IF(U${r}="","",N(U${r})-N(W${r}))` };

    for (const [c] of cols) {
      styleCell(ws.getCell(`${c}${r}`), { align: c === "C" || c === "O" ? "right" : "center" });
      if ("KMNPQRSTUWX".includes(c)) ws.getCell(`${c}${r}`).numFmt = "#,##0;(#,##0);-";
      if (c === "V") ws.getCell(`${c}${r}`).numFmt = "0%";
    }
  }

  /* --------------------------------------------------------- totals row 74 */
  const sumCols = ["F", "K", "M", "N", "Q", "R", "S", "T", "U", "W", "X"];
  for (const c of sumCols) {
    ws.getCell(`${c}${TOTALS_ROW}`).value = { formula: `SUM(${c}${FIRST_ROW}:${c}${LAST_ROW})` };
  }
  ws.getCell(`V${TOTALS_ROW}`).value = { formula: `IFERROR(AVERAGE(V${FIRST_ROW}:V${LAST_ROW}),0)` };
  ws.getCell(`A${TOTALS_ROW}`).value = "الإجمالي";
  ws.getCell(`C${TOTALS_ROW}`).value = { formula: `I${TOTALS_ROW}-H98` }; // net cash due
  ws.getCell(`B${TOTALS_ROW}`).value = "المطلوب كاش";
  ws.getCell(`H${TOTALS_ROW}`).value = "صافي المطلوب";
  ws.getCell(`I${TOTALS_ROW}`).value = { formula: `N${TOTALS_ROW}-N94` };
  for (const [c] of cols) {
    styleCell(ws.getCell(`${c}${TOTALS_ROW}`), { bold: true, fill: TOTAL_FILL });
    if ("CIKMNQRSTUWX".includes(c)) ws.getCell(`${c}${TOTALS_ROW}`).numFmt = "#,##0;(#,##0);-";
  }
  ws.getCell(`V${TOTALS_ROW}`).numFmt = "0%";

  /* -------------------------------------- rooming statistics rows 76..85 */
  const hotelCols = ["C", "D", "E", "F"]; // rooms table (max 4 hotels)
  const peopleCols = ["J", "K", "L", "M"]; // people table

  ws.getCell(`B${STATS_TOP}`).value = "الغرفه / الفندق";
  ws.getCell(`I${STATS_TOP}`).value = "الأفراد / الفندق";
  styleCell(ws.getCell(`B${STATS_TOP}`), { bold: true, fill: HEAD_FILL });
  styleCell(ws.getCell(`I${STATS_TOP}`), { bold: true, fill: HEAD_FILL });
  hotels.slice(0, 4).forEach((ht, i) => {
    ws.getCell(`${hotelCols[i]}${STATS_TOP}`).value = ht.hotel;
    ws.getCell(`${peopleCols[i]}${STATS_TOP}`).value = ht.hotel;
    styleCell(ws.getCell(`${hotelCols[i]}${STATS_TOP}`), { bold: true, fill: HEAD_FILL });
    styleCell(ws.getCell(`${peopleCols[i]}${STATS_TOP}`), { bold: true, fill: HEAD_FILL });
  });
  ws.getCell(`G${STATS_TOP}`).value = "اجمالي";
  ws.getCell(`N${STATS_TOP}`).value = "اجمالي";
  styleCell(ws.getCell(`G${STATS_TOP}`), { bold: true, fill: HEAD_FILL });
  styleCell(ws.getCell(`N${STATS_TOP}`), { bold: true, fill: HEAD_FILL });

  ROOM_ROWS.forEach((room, i) => {
    const r = STATS_TOP + 1 + i;
    ws.getCell(`B${r}`).value = room;
    ws.getCell(`I${r}`).value = room;
    styleCell(ws.getCell(`B${r}`), { align: "right" });
    styleCell(ws.getCell(`I${r}`), { align: "right" });
    hotels.slice(0, 4).forEach((ht, hi) => {
      const pc = peopleCols[hi];
      ws.getCell(`${pc}${r}`).value = {
        formula: `SUMIFS($F$${FIRST_ROW}:$F$${LAST_ROW},$H$${FIRST_ROW}:$H$${LAST_ROW},"${ht.hotel}",$I$${FIRST_ROW}:$I$${LAST_ROW},"${room}")`,
      };
      ws.getCell(`${hotelCols[hi]}${r}`).value = {
        formula: `ROUNDUP(${pc}${r}/${ROOM_CAPACITY[room] ?? 1},0)`,
      };
      styleCell(ws.getCell(`${pc}${r}`));
      styleCell(ws.getCell(`${hotelCols[hi]}${r}`));
    });
    ws.getCell(`G${r}`).value = { formula: `SUM(C${r}:F${r})` };
    ws.getCell(`N${r}`).value = { formula: `SUM(J${r}:M${r})` };
    styleCell(ws.getCell(`G${r}`), { bold: true });
    styleCell(ws.getCell(`N${r}`), { bold: true });
  });
  const statsLast = STATS_TOP + ROOM_ROWS.length; // 84
  const statsTotal = statsLast + 1; // 85
  ws.getCell(`B${statsTotal}`).value = "اجمالي";
  ws.getCell(`I${statsTotal}`).value = "اجمالي";
  styleCell(ws.getCell(`B${statsTotal}`), { bold: true, fill: TOTAL_FILL, align: "right" });
  styleCell(ws.getCell(`I${statsTotal}`), { bold: true, fill: TOTAL_FILL, align: "right" });
  for (const c of [...hotelCols, "G", ...peopleCols, "N"]) {
    ws.getCell(`${c}${statsTotal}`).value = { formula: `SUM(${c}${STATS_TOP + 1}:${c}${statsLast})` };
    styleCell(ws.getCell(`${c}${statsTotal}`), { bold: true, fill: TOTAL_FILL });
  }

  /* --- mirror box I2:O11 → summary of the rooming table (like the original) */
  for (let i = 0; i <= 9; i++) {
    const src = STATS_TOP + i;
    const dst = 2 + i;
    if (src > statsTotal) break;
    ws.getCell(`I${dst}`).value = { formula: `B${src}` };
    styleCell(ws.getCell(`I${dst}`), { align: "right", fill: i === 0 ? HEAD_FILL : undefined, bold: i === 0 });
    ["K", "L", "M", "N"].forEach((c, ci) => {
      const s = hotelCols[ci];
      ws.getCell(`${c}${dst}`).value = { formula: `${s}${src}` };
      styleCell(ws.getCell(`${c}${dst}`), { fill: i === 0 ? HEAD_FILL : undefined, bold: i === 0 });
    });
    ws.getCell(`O${dst}`).value = { formula: `G${src}` };
    styleCell(ws.getCell(`O${dst}`), { bold: true, fill: i === 0 ? HEAD_FILL : undefined });
  }

  /* ------------------------------------------- expenses block rows 87..94 */
  ws.getCell("B87").value = "مصروفات التسكين والتمديد";
  styleCell(ws.getCell("B87"), { bold: true, fill: HEAD_FILL, align: "right" });
  hotels.slice(0, 4).forEach((ht, i) => {
    ws.getCell(`${hotelCols[i]}88`).value = ht.hotel;
    styleCell(ws.getCell(`${hotelCols[i]}88`), { bold: true, fill: HEAD_FILL });
  });
  ws.getCell("G88").value = "اجمالي";
  styleCell(ws.getCell("G88"), { bold: true, fill: HEAD_FILL });

  ws.getCell("B89").value = "تسكين";
  ws.getCell("B90").value = "تمديد";
  styleCell(ws.getCell("B89"), { bold: true, align: "right" });
  styleCell(ws.getCell("B90"), { bold: true, align: "right" });
  hotels.slice(0, 4).forEach((ht, i) => {
    const c = hotelCols[i];
    // Automated (instead of the manual cells in the original workbook).
    ws.getCell(`${c}89`).value = {
      formula: `SUMIFS($R$${FIRST_ROW}:$R$${LAST_ROW},$H$${FIRST_ROW}:$H$${LAST_ROW},"${ht.hotel}")`,
    };
    ws.getCell(`${c}90`).value = {
      formula: `SUMIFS($S$${FIRST_ROW}:$S$${LAST_ROW},$H$${FIRST_ROW}:$H$${LAST_ROW},"${ht.hotel}")`,
    };
    styleCell(ws.getCell(`${c}89`));
    styleCell(ws.getCell(`${c}90`));
  });
  ws.getCell("G89").value = { formula: "SUM(C89:F89)" };
  ws.getCell("G90").value = { formula: "SUM(C90:F90)" };
  ws.getCell("B91").value = "اجمالي";
  ws.getCell("G91").value = { formula: "SUM(G89:G90)" };
  ["G89", "G90", "B91", "G91"].forEach((a) => styleCell(ws.getCell(a), { bold: true, fill: TOTAL_FILL }));
  for (const c of hotelCols) {
    ws.getCell(`${c}91`).value = { formula: `SUM(${c}89:${c}90)` };
    styleCell(ws.getCell(`${c}91`), { bold: true, fill: TOTAL_FILL });
  }

  const expenseHeads: Array<[string, string]> = [
    ["B93", "تسكين وتمديد"],
    ["C93", "ايجار الحافله"],
    ["D93", "اكراميه السائق"],
    ["E93", "مشرف الرحله"],
    ["F93", "رسوم مواقف"],
    ["G93", "أخرى"],
    ["N93", "اجمالي المصروف"],
  ];
  for (const [a, t] of expenseHeads) {
    ws.getCell(a).value = t;
    styleCell(ws.getCell(a), { bold: true, fill: HEAD_FILL });
  }
  ws.getCell("B94").value = { formula: "G91" };
  ws.getCell("C94").value = Number(input.expenses.busRent) || 0;
  ws.getCell("D94").value = Number(input.expenses.driverTip) || 0;
  ws.getCell("E94").value = Number(input.expenses.supervisor) || 0;
  ws.getCell("F94").value = Number(input.expenses.parking) || 0;
  ws.getCell("G94").value = Number(input.expenses.other) || 0;
  ws.getCell("N94").value = { formula: "SUM(B94:M94)" };
  ["B94", "C94", "D94", "E94", "F94", "G94", "N94"].forEach((a) => {
    styleCell(ws.getCell(a), { bold: a === "N94" });
    ws.getCell(a).numFmt = "#,##0;(#,##0);-";
  });

  /* --------------------------------------------- settlement rows 96..100 */
  const settle: Array<[string, string]> = [
    ["A99", "مجمل الإيراد"],
    ["C99", "مجمل المصروف"],
    ["E99", "مجمل الربح"],
    ["G98", "تحويل بنكي"],
    ["G100", "المتبقي كاش"],
  ];
  for (const [a, t] of settle) {
    ws.getCell(a).value = t;
    styleCell(ws.getCell(a), { bold: true, fill: HEAD_FILL, align: "right" });
  }
  ws.getCell("A100").value = { formula: `N${TOTALS_ROW}` };
  ws.getCell("C100").value = { formula: "N94" };
  ws.getCell("E100").value = { formula: "A100-C100" };
  ws.getCell("H98").value = Number(input.expenses.bankTransfer) || 0;
  ws.getCell("H100").value = { formula: "E100-H98" };
  ["A100", "C100", "E100", "H98", "H100"].forEach((a) => {
    styleCell(ws.getCell(a), { bold: true, fill: ACCENT_FILL });
    ws.getCell(a).numFmt = "#,##0;(#,##0);-";
  });

  /* ------------------------------- cost rules 103.. (per hotel × room type) */
  ws.getCell("A103").value = "هام جدا / قواعد الحسابات";
  styleCell(ws.getCell("A103"), { bold: true, fill: ACCENT_FILL, align: "right" });
  const ruleHeads: Array<[string, string]> = [
    ["B104", "تكلفة الحافله"],
    ["D104", "عدد الركاب"],
    ["F104", "تكلفة المقعد"],
    ["H104", "تكلفة الأسرّه الفاضيه"],
  ];
  for (const [a, t] of ruleHeads) {
    ws.getCell(a).value = t;
    styleCell(ws.getCell(a), { bold: true, fill: HEAD_FILL, align: "right" });
  }
  ws.getCell("C104").value = { formula: "N94" };
  ws.getCell("E104").value = { formula: "F10" };
  ws.getCell("G104").value = { formula: "IFERROR(C104/E104,0)" };
  const firstSupervisorBedRow = ruleBlock(0).start + ROOM_ROWS.indexOf("مشترك مشرف");
  ws.getCell("I104").value = { formula: `F${FIRST_ROW}*IFERROR(F${firstSupervisorBedRow},0)` };
  ["C104", "E104", "G104", "I104"].forEach((a) => styleCell(ws.getCell(a), { bold: true }));

  const ruleCols: Array<[string, string]> = [
    ["B", "الفندق"],
    ["C", "نوع الغرفه"],
    ["D", "سعر البيع"],
    ["E", "تكلفة الغرفه"],
    ["F", "تكلفة الفرد"],
    ["G", "نصيب مقعد الحافله"],
    ["H", "نصيب الأسرّه الفاضيه"],
    ["I", "إجمالي التكلفه"],
  ];
  for (const [c, t] of ruleCols) {
    ws.getCell(`${c}106`).value = t;
    styleCell(ws.getCell(`${c}106`), { bold: true, fill: HEAD_FILL });
  }

  hotels.forEach((ht, hi) => {
    const { start } = ruleBlock(hi);
    RULE_ROOMS.forEach((room, ri) => {
      const r = start + ri;
      const isExt = room === EXTENSION_ROW;
      const isTransfer = (TRANSFER_ROWS as readonly string[]).includes(room);
      const cap = ROOM_CAPACITY[room] ?? 1;

      ws.getCell(`B${r}`).value = ht.hotel;
      ws.getCell(`C${r}`).value = room;
      ws.getCell(`D${r}`).value = {
        formula: `SUMIFS('#'!$C:$C,'#'!$A:$A,B${r},'#'!$B:$B,C${r})`,
      };
      const roomCost = isExt ? Number(ht.extensionCost) || 0 : isTransfer ? 0 : Number(ht.cost[room] ?? 0);
      ws.getCell(`E${r}`).value = roomCost;
      ws.getCell(`F${r}`).value = isExt || isTransfer ? { formula: `E${r}` } : { formula: `IFERROR(E${r}/${cap},0)` };
      ws.getCell(`G${r}`).value = isExt || isTransfer ? 0 : { formula: "$G$104" };
      ws.getCell(`H${r}`).value = isTransfer ? 0 : { formula: "IFERROR($I$104/$F$10,0)" };
      ws.getCell(`I${r}`).value = { formula: `SUM(F${r}:H${r})` };

      for (const [c] of ruleCols) {
        styleCell(ws.getCell(`${c}${r}`), { align: c === "B" || c === "C" ? "right" : "center" });
        if ("DEFGHI".includes(c)) ws.getCell(`${c}${r}`).numFmt = "#,##0.00;(#,##0.00);-";
      }
    });
  });

  return ws;
}

/* ------------------------------------------------------------- entrypoint */

export async function buildTripSettlementWorkbook(input: SettlementInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Umrah Booking System";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  buildReferenceSheet(wb, input);
  buildSettlementSheet(wb, input);

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
