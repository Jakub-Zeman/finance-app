import Papa from "papaparse";
import type { Transaction, Category } from "../types";

export interface CsasRow {
  [key: string]: string;
}

// Map Czech Spořitelna categories → app category names
const CSAS_CATEGORY_MAP: Record<string, string> = {
  "potraviny": "Food & Dining",
  "restaurace": "Food & Dining",
  "fastfood": "Food & Dining",
  "mhd, veřejná doprava": "Transport",
  "mhd": "Transport",
  "taxi": "Transport",
  "pohonné hmoty": "Transport",
  "pohonne hmoty": "Transport",
  "on-line nákupy": "Shopping",
  "on-line nakupy": "Shopping",
  "elektronika": "Shopping",
  "trafika": "Shopping",
  "webové služby": "Entertainment",
  "webove sluzby": "Entertainment",
  "telefon": "Utilities",
  "poplatky": "Other Expense",
  "servis": "Other Expense",
  "neznámé pojištění": "Other Expense",
  "nezname pojisteni": "Other Expense",
  "nezatříděné výdaje": "Other Expense",
  "nezatridene vydaje": "Other Expense",
  "ostatní výdaje": "Other Expense",
  "ostatni vydaje": "Other Expense",
  "inkaso z kreditní karty": "Other Expense",
  "výplata": "Salary",
  "vyplata": "Salary",
  "ostatní příjmy": "Other Income",
  "ostatni prijmy": "Other Income",
};

function mapCsasCategory(csasCategory: string): string {
  const lower = csasCategory.toLowerCase().trim();
  return CSAS_CATEGORY_MAP[lower] || "Other Expense";
}

// Parse Czech number format: "-1 234,56" or "-1234,56" → -1234.56
function parseCzechAmount(str: string): number {
  if (!str) return 0;
  const cleaned = str
    .replace(/\s/g, "")     // remove spaces (thousands separator)
    .replace(/\./g, "")     // remove dots (thousands separator)
    .replace(",", ".");     // comma → dot for decimals
  return parseFloat(cleaned) || 0;
}

// Parse Czech date: "28.02.2026" → "2026-02-28"
function parseCzechDate(str: string): string {
  const match = str?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return str;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// Detect if file is Česká spořitelna format by checking content
export async function parseCsasFile(file: File): Promise<CsasRow[]> {
  // Read as ArrayBuffer to handle UTF-16 encoding
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  // Detect encoding: UTF-16 LE starts with BOM FF FE, or has null bytes pattern
  let text: string;
  if (uint8[0] === 0xFF && uint8[1] === 0xFE) {
    // UTF-16 LE with BOM
    text = new TextDecoder("utf-16le").decode(buffer);
  } else if (uint8[1] === 0x00 && uint8[3] === 0x00) {
    // UTF-16 LE without BOM (null bytes at odd positions)
    text = new TextDecoder("utf-16le").decode(buffer);
  } else {
    // Assume UTF-8
    text = new TextDecoder("utf-8").decode(buffer);
  }

  // Remove BOM if present
  text = text.replace(/^\uFEFF/, "");

  return new Promise((resolve, reject) => {
    Papa.parse<CsasRow>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: (e: Error) => reject(e),
    });
  });
}

// Detect Česká spořitelna format from headers
export function isCsasFormat(headers: string[]): boolean {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  return (
    normalized.some((h) => h.includes("číslo účtu") || h.includes("cislo uctu") || h.includes("číslo")) &&
    normalized.some((h) => h.includes("částka") || h.includes("castka")) &&
    normalized.some((h) => h.includes("kategorie"))
  );
}

export interface ParsedCsasTransaction {
  raw: CsasRow;
  transaction: Omit<Transaction, "id">;
  suggestedCategory: string;
  skipped: boolean;
  skipReason?: string;
}

export function processCsasRows(
  rows: CsasRow[],
  categories: Category[]
): ParsedCsasTransaction[] {
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  function findCategoryId(name: string): number {
    const cat = catByName.get(name.toLowerCase());
    if (cat?.id) return cat.id;
    const fallback = catByName.get("other expense") || catByName.get("other income");
    return fallback?.id || categories[0]?.id || 1;
  }

  // Find column keys (headers may vary slightly)
  function findKey(row: CsasRow, ...candidates: string[]): string {
    for (const key of Object.keys(row)) {
      const kl = key.toLowerCase().trim();
      if (candidates.some((c) => kl.includes(c))) return key;
    }
    return "";
  }

  return rows.map((row) => {
    const amountKey = findKey(row, "částka", "castka", "amount");
    const dateKey = findKey(row, "datum", "date");
    const descKey = findKey(row, "název protiúčtu", "nazev protiuctu", "popis", "description");
    const catKey = findKey(row, "kategorie", "category");
    const currKey = findKey(row, "měna", "mena", "currency");

    const rawAmount = row[amountKey] || "";
    const amount = parseCzechAmount(rawAmount);

    if (amount === 0) {
      return {
        raw: row,
        transaction: {} as Omit<Transaction, "id">,
        suggestedCategory: "",
        skipped: true,
        skipReason: "Zero amount",
      };
    }

    const type: "income" | "expense" = amount > 0 ? "income" : "expense";
    const absAmount = Math.abs(amount);
    const rawDate = row[dateKey] || "";
    const date = parseCzechDate(rawDate);
    const description = row[descKey] || "Unknown";
    const csasCategory = row[catKey] || "";
    const currency = row[currKey] || "CZK";

    const suggestedCategory = type === "income"
      ? (csasCategory.toLowerCase().includes("výplata") || csasCategory.toLowerCase().includes("vyplata") ? "Salary" : "Other Income")
      : mapCsasCategory(csasCategory);

    const categoryId = findCategoryId(suggestedCategory);

    const tags: string[] = ["česká-spořitelna"];
    if (currency !== "CZK") tags.push(currency);

    return {
      raw: row,
      suggestedCategory,
      skipped: false,
      transaction: {
        type,
        amount: absAmount,
        categoryId,
        description,
        date,
        tags,
        notes: csasCategory || "",
      },
    };
  });
}
