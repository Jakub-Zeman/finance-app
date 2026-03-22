import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive for income, negative for expense
  balance?: number;
  rawText: string; // for debugging
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface TextRow {
  y: number;
  items: TextItem[];
}

// Czech header keywords that indicate a transaction table
const HEADER_KEYWORDS = [
  "datum",
  "popis",
  "částka",
  "castka",
  "zůstatek",
  "zustatek",
  "objem",
  "valuta",
];

// Parse Czech date: "28.02.2026" → "2026-02-28"
function parseCzechDate(str: string): string {
  const match = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

// Parse Czech amount: "-1 234,56" → -1234.56
function parseCzechAmount(str: string): number {
  if (!str) return NaN;
  // Normalize: remove spaces used as thousands separators, replace comma with dot
  let cleaned = str
    .replace(/\u00a0/g, " ") // non-breaking space → space
    .trim()
    .replace(/\s/g, "") // remove all whitespace (thousands sep)
    .replace(/\./g, "") // remove dots (thousands sep in some formats)
    .replace(",", "."); // comma → decimal point
  // Handle "- 123,45" patterns (space between minus and number)
  cleaned = cleaned.replace(/^-\s*/, "-");
  const val = parseFloat(cleaned);
  return isNaN(val) ? NaN : val;
}

// Check if a string looks like a Czech amount
function looksLikeAmount(str: string): boolean {
  // Matches patterns like: -1 234,56 or 1234,56 or -1234,56
  const cleaned = str.replace(/\u00a0/g, " ").trim();
  return /^-?\s*[\d\s.]+,\d{2}$/.test(cleaned);
}

// Check if a string contains a Czech date pattern
function containsCzechDate(str: string): boolean {
  return /\d{1,2}\.\d{1,2}\.\d{4}/.test(str);
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export async function extractPdfTransactions(
  file: File
): Promise<PdfTransaction[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allItems: TextItem[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const ti = item as { str: string; transform: number[]; width: number };
      allItems.push({
        str: ti.str,
        x: ti.transform[4],
        y: viewport.height - ti.transform[5], // flip y-axis
        width: ti.width,
      });
    }
  }

  // Group items into rows by y-coordinate (tolerance ~4px)
  const rows = groupIntoRows(allItems, 4);

  // Sort items within each row by x-coordinate
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  // Sort rows by y-coordinate (top to bottom)
  rows.sort((a, b) => a.y - b.y);

  // Try structured approach: find header row
  const transactions = extractWithHeaders(rows);
  if (transactions.length > 0) return transactions;

  // Fallback: scan for date patterns
  return extractFallback(rows);
}

function groupIntoRows(items: TextItem[], tolerance: number): TextRow[] {
  const rows: TextRow[] = [];

  for (const item of items) {
    let found = false;
    for (const row of rows) {
      if (Math.abs(row.y - item.y) <= tolerance) {
        row.items.push(item);
        // Update y to average
        row.y =
          (row.y * (row.items.length - 1) + item.y) / row.items.length;
        found = true;
        break;
      }
    }
    if (!found) {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows;
}

interface ColumnDef {
  name: string;
  x: number;
  width: number;
}

function extractWithHeaders(rows: TextRow[]): PdfTransaction[] {
  // Find header row
  let headerRowIndex = -1;
  let columns: ColumnDef[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].items.map((it) => it.str.toLowerCase()).join(" ");
    const matchCount = HEADER_KEYWORDS.filter((kw) =>
      rowText.includes(kw)
    ).length;
    if (matchCount >= 2) {
      headerRowIndex = i;
      columns = rows[i].items.map((it) => ({
        name: it.str.toLowerCase().trim(),
        x: it.x,
        width: it.width,
      }));
      break;
    }
  }

  if (headerRowIndex === -1) return [];

  // Identify column roles
  const dateCol = columns.find(
    (c) => c.name.includes("datum") || c.name.includes("valuta")
  );
  const descCol = columns.find(
    (c) => c.name.includes("popis") || c.name.includes("název") || c.name.includes("nazev")
  );
  const amountCol = columns.find(
    (c) =>
      c.name.includes("částka") ||
      c.name.includes("castka") ||
      c.name.includes("objem")
  );
  const balanceCol = columns.find(
    (c) =>
      c.name.includes("zůstatek") ||
      c.name.includes("zustatek") ||
      c.name.includes("balance")
  );

  if (!dateCol && !amountCol) return [];

  // Assign items to columns based on x-position proximity
  function assignToColumn(
    item: TextItem,
    cols: ColumnDef[]
  ): string | null {
    let bestCol: ColumnDef | null = null;
    let bestDist = Infinity;
    for (const col of cols) {
      // Check if item's x is within range of column
      const dist = Math.abs(item.x - col.x);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
      }
    }
    // Allow reasonable tolerance (half the page width divided by columns)
    if (bestCol && bestDist < 150) return bestCol.name;
    return null;
  }

  const transactions: PdfTransaction[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.items.map((it) => it.str).join(" ");

    // Skip rows that look like footers or headers
    if (
      rowText.toLowerCase().includes("celkem") ||
      rowText.toLowerCase().includes("strana") ||
      rowText.toLowerCase().includes("konečný zůstatek") ||
      rowText.toLowerCase().includes("konecny zustatek") ||
      rowText.toLowerCase().includes("počáteční") ||
      rowText.toLowerCase().includes("pocatecni")
    )
      continue;

    // Check if this row has a date
    const dateItem = row.items.find((it) => containsCzechDate(it.str));
    if (!dateItem) continue;

    const date = parseCzechDate(dateItem.str);
    if (!date) continue;

    // Collect description and amount from column positions
    let description = "";
    let amount = NaN;
    let balance: number | undefined;

    for (const item of row.items) {
      if (item === dateItem) continue;

      const col = assignToColumn(item, columns);

      if (col && amountCol && col === amountCol.name) {
        if (looksLikeAmount(item.str)) {
          amount = parseCzechAmount(item.str);
        }
      } else if (col && balanceCol && col === balanceCol.name) {
        if (looksLikeAmount(item.str)) {
          balance = parseCzechAmount(item.str);
        }
      } else if (col && descCol && col === descCol.name) {
        description += (description ? " " : "") + item.str;
      } else if (looksLikeAmount(item.str) && isNaN(amount)) {
        // If no column match but looks like amount, use it
        amount = parseCzechAmount(item.str);
      } else if (!containsCzechDate(item.str)) {
        // Accumulate as description
        description += (description ? " " : "") + item.str;
      }
    }

    if (isNaN(amount)) continue;

    transactions.push({
      date,
      description: description.trim() || "Unknown",
      amount,
      balance: balance !== undefined && !isNaN(balance) ? balance : undefined,
      rawText: rowText,
    });
  }

  return transactions;
}

function extractFallback(rows: TextRow[]): PdfTransaction[] {
  const transactions: PdfTransaction[] = [];

  for (const row of rows) {
    const rowText = row.items.map((it) => it.str).join(" ");

    // Look for a date pattern
    const dateItem = row.items.find((it) => containsCzechDate(it.str));
    if (!dateItem) continue;

    const date = parseCzechDate(dateItem.str);
    if (!date) continue;

    // Find amount-like items
    const amountItems = row.items.filter(
      (it) => it !== dateItem && looksLikeAmount(it.str)
    );
    if (amountItems.length === 0) continue;

    // Use the first amount found as the transaction amount
    const amount = parseCzechAmount(amountItems[0].str);
    if (isNaN(amount)) continue;

    // Balance is the second amount if present
    const balance =
      amountItems.length > 1 ? parseCzechAmount(amountItems[1].str) : undefined;

    // Everything else is description
    const descItems = row.items.filter(
      (it) =>
        it !== dateItem &&
        !amountItems.includes(it) &&
        !containsCzechDate(it.str)
    );
    const description = descItems.map((it) => it.str).join(" ").trim();

    transactions.push({
      date,
      description: description || "Unknown",
      amount,
      balance: balance !== undefined && !isNaN(balance) ? balance : undefined,
      rawText: rowText,
    });
  }

  return transactions;
}
