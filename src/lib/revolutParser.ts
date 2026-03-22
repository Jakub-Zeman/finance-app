import Papa from "papaparse";
import type { Transaction, Category } from "../types";

export interface RevolutRow {
  Type: string;
  Product: string;
  "Started Date": string;
  "Completed Date": string;
  Description: string;
  Amount: string;
  Fee: string;
  Currency: string;
  State: string;
  Balance: string;
}

// Keyword map: description keyword (lowercase) → category name (must match seeded categories)
const CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  {
    keywords: [
      "kaufland", "albert", "billa", "lidl", "tesco", "globus", "jip",
      "potraviny", "mcdonald", "kebab", "freshmenu", "foodora", "pizza",
      "spar", "penny", "coop", "interspar", "supermarket", "grocery",
    ],
    category: "Food & Dining",
  },
  {
    keywords: [
      "bolt", "regiojet", "dopravní systém", "dopravni system", "parkování",
      "parkovani", "parking", "uber", "taxi", "metro", "tram", "bus",
      "train", "flixbus", "leoexpress", "studentagency", "cd.cz",
    ],
    category: "Transport",
  },
  {
    keywords: [
      "gym", "lékárna", "lekarna", "dr.max", "benu", "pharmacy",
      "hospital", "dentist", "zdraví", "zdravi", "clinic",
    ],
    category: "Healthcare",
  },
  {
    keywords: [
      "ikea", "martinus", "alza", "mall", "czc", "datart", "electro",
      "amazon", "h&m", "zara", "primark", "prazeno", "drogerie",
    ],
    category: "Shopping",
  },
  {
    keywords: [
      "sazka", "nebe", "industra", "coffee", "café", "cafe", "bar",
      "netflix", "spotify", "steam", "cinema", "kino", "divadlo",
      "restaurant", "restaurace", "bistro",
    ],
    category: "Entertainment",
  },
  {
    keywords: ["transfer from", "přijatá platba"],
    category: "Other Income",
  },
  {
    keywords: ["exchanged to czk", "exchange"],
    category: "Other Income",
  },
  {
    keywords: ["salary", "payroll", "mzda", "výplata", "vyplata"],
    category: "Salary",
  },
];

export function detectCategory(description: string, type: string, amount: number): string {
  const lower = description.toLowerCase();

  // Income shortcuts
  if (amount > 0) {
    if (lower.includes("salary") || lower.includes("mzda") || lower.includes("výplata")) {
      return "Salary";
    }
    if (lower.includes("transfer from") || lower.includes("přijatá platba")) {
      return "Other Income";
    }
    if (lower.includes("exchange") || type.toLowerCase() === "exchange") {
      return "Other Income";
    }
    return "Other Income";
  }

  // Expense matching
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.category;
    }
  }

  return "Other Expense";
}

export function isRevolutFormat(headers: string[]): boolean {
  const required = ["Type", "Started Date", "Description", "Amount", "Currency", "State"];
  return required.every((h) => headers.includes(h));
}

export function parseRevolutCSV(file: File): Promise<RevolutRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RevolutRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

export interface ParsedRevolutTransaction {
  raw: RevolutRow;
  transaction: Omit<Transaction, "id">;
  suggestedCategory: string;
  skipped: boolean;
  skipReason?: string;
}

export function processRevolutRows(
  rows: RevolutRow[],
  categories: Category[]
): ParsedRevolutTransaction[] {
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  function findCategoryId(name: string): number {
    const cat = catByName.get(name.toLowerCase());
    if (cat?.id) return cat.id;
    // Fallback to "Other Expense" or "Other Income"
    const fallback = catByName.get("other expense") || catByName.get("other income");
    return fallback?.id || categories[0]?.id || 1;
  }

  return rows.map((row) => {
    // Skip non-completed
    if (row.State?.toUpperCase() !== "COMPLETED") {
      return {
        raw: row,
        transaction: {} as Omit<Transaction, "id">,
        suggestedCategory: "",
        skipped: true,
        skipReason: `State: ${row.State}`,
      };
    }

    const amount = parseFloat(row.Amount);
    if (isNaN(amount) || amount === 0) {
      return {
        raw: row,
        transaction: {} as Omit<Transaction, "id">,
        suggestedCategory: "",
        skipped: true,
        skipReason: "Zero or invalid amount",
      };
    }

    const type: "income" | "expense" = amount > 0 ? "income" : "expense";
    const absAmount = Math.abs(amount);
    const fee = parseFloat(row.Fee) || 0;

    // Use Completed Date if available, otherwise Started Date
    const dateStr = (row["Completed Date"] || row["Started Date"] || "").slice(0, 10);

    const suggestedCategory = detectCategory(row.Description, row.Type, amount);
    const categoryId = findCategoryId(suggestedCategory);

    const tags: string[] = [];
    if (row.Type) tags.push(row.Type.toLowerCase().replace(/\s+/g, "-"));
    if (row.Currency && row.Currency !== "CZK") tags.push(row.Currency);

    return {
      raw: row,
      suggestedCategory,
      skipped: false,
      transaction: {
        type,
        amount: absAmount,
        categoryId,
        description: row.Description,
        date: dateStr,
        tags,
        notes: fee > 0 ? `Fee: ${fee} ${row.Currency}` : "",
      },
    };
  });
}
