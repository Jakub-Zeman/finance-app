import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfTransaction {
  date: string;         // YYYY-MM-DD
  description: string;  // merchant name or transfer description
  amount: number;       // negative = expense, positive = income
  rawText: string;      // full block text for debugging
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function extractPdfTransactions(file: File): Promise<PdfTransaction[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  // Extract text rows from all pages
  const allRows: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: { str: string; x: number; y: number }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const ti = item as { str: string; transform: number[]; width: number };
      items.push({
        str: ti.str.trim(),
        x: Math.round(ti.transform[4]),
        y: Math.round(viewport.height - ti.transform[5]),
      });
    }

    // Group into rows by y-coordinate (tolerance 4px)
    items.sort((a, b) => a.y - b.y || a.x - b.x);

    let currentItems: typeof items = [];
    let lastY = -999;

    for (const item of items) {
      if (currentItems.length > 0 && Math.abs(item.y - lastY) > 4) {
        currentItems.sort((a, b) => a.x - b.x);
        allRows.push(currentItems.map((i) => i.str).join(" "));
        currentItems = [];
      }
      currentItems.push(item);
      lastY = item.y;
    }
    if (currentItems.length > 0) {
      currentItems.sort((a, b) => a.x - b.x);
      allRows.push(currentItems.map((i) => i.str).join(" "));
    }
  }

  return parseRows(allRows);
}

// ── Row parsing ─────────────────────────────────────────────────────────────

// Lines to skip — headers, footers, page chrome
const SKIP_PATTERNS = [
  /Pokračování na další/i,
  /^strana\s+\d/i,
  /Česká spořitelna/i,
  /^SBVYN/,
  /^SBVPLEV/,
  /Výpis z účtu/i,
  /Plus účet/i,
  /Číslo účtu/i,
  /^Období/i,
  /^Zaúčtováno/i,
  /^Provedeno/i,
  /^Položka/i,
  /Částka obratu/i,
  /Variabilní symbol/i,
  /Konstantní symbol/i,
  /Specifický symbol/i,
  /Číslo protiúčtu/i,
  /Název protiúčtu/i,
  /Kurz měny/i,
  /ZÁKLADNÍ ÚDAJE/i,
  /PŘEHLED POHYBŮ/i,
  /Počáteční zůstatek/i,
  /Celkem přišlo/i,
  /Celkem odešlo/i,
  /Konečný zůstatek/i,
  /Disponibilní zůstatek/i,
  /Rezervace prostředků/i,
  /SLUŽBY K ÚČTU/i,
  /PŘEDEM SCHVÁLENÉ/i,
  /Majitel účtu/i,
  /Měna účtu/i,
  /^Pro úhrady/i,
  /IBAN/i,
  /^Kód banky \(BIC\)/i,
  /DIGITÁLNÍ PODPIS/i,
  /Vážíme si/i,
  /Potřebujete se/i,
  /K dispozici/i,
  /Vklad na tomto/i,
  /Pokud nebudete/i,
  /^Tip: Chcete/i,
  /Půjčka na cokoli/i,
  /zapsaná v obchodním/i,
  /Číslo výpisu/i,
];

function shouldSkip(line: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(line));
}

// Date at start: DD.MM.YYYY
const DATE_START = /^(\d{2}\.\d{2}\.\d{4})\s/;

// Amount at end of line: [+/-]digits[space-separated thousands].dd
// ČS PDFs use DOT as decimal separator, sign is always present for non-zero amounts
const AMOUNT_END = /([+-]\s?\d[\d \u00a0]*\.\d{2})\s*$/;

function parseRows(rows: string[]): PdfTransaction[] {
  const transactions: PdfTransaction[] = [];
  let i = 0;

  while (i < rows.length) {
    const line = rows[i];

    if (shouldSkip(line)) {
      i++;
      continue;
    }

    // A transaction starts on a line with a date at the beginning AND an amount at the end
    const dateMatch = line.match(DATE_START);
    const amountMatch = line.match(AMOUNT_END);

    if (!dateMatch || !amountMatch) {
      i++;
      continue;
    }

    // Parse date DD.MM.YYYY → YYYY-MM-DD
    const [dd, mm, yyyy] = dateMatch[1].split(".");
    const date = `${yyyy}-${mm}-${dd}`;

    // Parse amount — remove spaces, parse as float
    const amountStr = amountMatch[1].replace(/[\s\u00a0]/g, "");
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount === 0) {
      i++;
      continue;
    }

    // Middle text: everything between date and amount
    const middleText = line
      .substring(dateMatch[0].length)
      .replace(AMOUNT_END, "")
      .trim();

    // Skip fee/service lines
    if (middleText.includes("Ceny za služby")) {
      i++;
      continue;
    }

    // Collect detail lines until the next transaction-start line
    const details: string[] = [];
    i++;
    while (i < rows.length) {
      const next = rows[i];
      // Stop if this line looks like the next transaction
      if (DATE_START.test(next) && AMOUNT_END.test(next)) break;
      if (!shouldSkip(next)) {
        details.push(next);
      }
      i++;
    }

    // Build a human-readable description
    const description = buildDescription(middleText, details);

    transactions.push({
      date,
      description,
      amount,
      rawText: [line, ...details].join("\n"),
    });
  }

  return transactions;
}

// ── Description extraction ──────────────────────────────────────────────────

const COUNTRY_CODES = "CZ|SK|DE|AT|IE|SE|EE|NL|HU|PL|GB|FR|IT|US|LU|FI|DK|NO|LT|LV|BE|PT|ES|RO|BG|HR|SI|CH";
const COUNTRY_RE = new RegExp(`\\b(${COUNTRY_CODES})\\s`);

// Detail lines that are just noise (card number, currency info, dates, etc.)
function isNoiseLine(line: string): boolean {
  return (
    /^\d{1,10}$/.test(line) ||            // Just numbers (1178, 4511610098)
    /^XXXXXXXXXXXX/.test(line) ||          // Masked card number line
    /^CZK\s/.test(line) ||                // CZK currency detail
    /^EUR\s/.test(line) ||                // EUR currency detail
    /^okamžitá$/i.test(line) ||           // Payment type modifier
    /^\d{2}\.\d{2}\.\d{4}$/.test(line) || // Standalone date
    /d\.zúč\./.test(line) ||              // Posting date detail
    /d\.tran\./.test(line) ||             // Transaction date detail
    /d\.přep\./.test(line) ||             // Conversion date detail
    /částka v Kč/i.test(line) ||          // "amount in CZK" line
    /kurz\s/i.test(line) ||              // Exchange rate line
    /^\d+\.\d{2}$/.test(line) ||         // Just an amount number
    line.length < 2
  );
}

function buildDescription(middleText: string, details: string[]): string {
  // ── Card payments: find merchant from the detail line with location ──
  // These lines look like: "XXXXXXXXXXXX0098 d.tran.DD.MM.YYYY CZ City MERCHANT"
  // or on a separate row: "CZ City MERCHANT"
  for (const line of details) {
    const countryIdx = line.search(COUNTRY_RE);
    if (countryIdx >= 0) {
      const locationMerchant = line.substring(countryIdx);
      // Remove the country code prefix to get "City MERCHANT"
      const cleaned = locationMerchant.replace(
        new RegExp(`^(${COUNTRY_CODES})\\s+`),
        ""
      );
      if (cleaned.length > 1) return cleaned.trim();
    }
  }

  // ── Bank transfers: find sender/receiver name or note ──
  for (const line of details) {
    if (isNoiseLine(line)) continue;
    // Skip lines that are just account numbers (contain / separator)
    if (/^\d[\d-]*\/\d{4}$/.test(line.trim())) continue;
    return line.trim();
  }

  // ── Fallback: extract transaction type from the middle text ──
  if (middleText.includes("Platba kartou")) return "Platba kartou";
  if (middleText.includes("Tuzemská odchozí úhrada")) {
    // Try to extract account number for context
    const acctMatch = middleText.match(/([\d-]+\/\d{4})/);
    return acctMatch ? `Odchozí úhrada ${acctMatch[1]}` : "Odchozí úhrada";
  }
  if (middleText.includes("Příchozí úhrada")) return "Příchozí úhrada";
  if (middleText.includes("Výběr z bankomatu")) return "Výběr z bankomatu";

  return middleText || "Transaction";
}
