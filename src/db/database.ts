import Dexie, { type Table } from "dexie";
import type { Category, Transaction, Budget, CategoryRule } from "../types";

export class FinanceDatabase extends Dexie {
  transactions!: Table<Transaction>;
  categories!: Table<Category>;
  budgets!: Table<Budget>;
  categoryRules!: Table<CategoryRule>;

  constructor() {
    super("FinanceDB");
    this.version(1).stores({
      transactions: "++id, type, categoryId, date",
      categories: "++id, name, type",
      budgets: "++id, categoryId, month",
    });
    this.version(2).stores({
      transactions: "++id, type, categoryId, date",
      categories: "++id, name, type",
      budgets: "++id, categoryId, month",
      categoryRules: "++id, pattern",
    });
  }
}

export const db = new FinanceDatabase();

// The 10 default categories — no duplicates, no extras
const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  { name: "Salary",          color: "#22c55e", icon: "💼", type: "income"  },
  { name: "Other Income",    color: "#16a34a", icon: "💰", type: "income"  },
  { name: "Food & Dining",   color: "#f97316", icon: "🍔", type: "expense" },
  { name: "Transport",       color: "#8b5cf6", icon: "🚗", type: "expense" },
  { name: "Housing",         color: "#3b82f6", icon: "🏠", type: "expense" },
  { name: "Shopping",        color: "#f59e0b", icon: "🛍️", type: "expense" },
  { name: "Entertainment",   color: "#ec4899", icon: "🎬", type: "expense" },
  { name: "Healthcare",      color: "#ef4444", icon: "🏥", type: "expense" },
  { name: "Utilities",       color: "#06b6d4", icon: "💡", type: "expense" },
  { name: "Other Expense",   color: "#64748b", icon: "📦", type: "expense" },
];

/**
 * Remove duplicate categories (same name, case-insensitive).
 * Keeps the first occurrence; remaps any transactions that referenced the removed ones.
 */
export async function cleanupDuplicateCategories() {
  const categories = await db.categories.toArray();
  const seen = new Map<string, number>();   // normalised name → kept id
  const remap = new Map<number, number>();  // duplicate id → kept id
  const toDelete: number[] = [];

  for (const cat of categories) {
    const key = cat.name.toLowerCase().trim();
    if (seen.has(key)) {
      toDelete.push(cat.id!);
      remap.set(cat.id!, seen.get(key)!);
    } else {
      seen.set(key, cat.id!);
    }
  }

  if (toDelete.length === 0) return;

  // Reassign transactions that pointed to a removed duplicate
  const txs = await db.transactions.toArray();
  await Promise.all(
    txs
      .filter((tx) => remap.has(tx.categoryId))
      .map((tx) => db.transactions.update(tx.id!, { categoryId: remap.get(tx.categoryId)! }))
  );

  await db.categories.bulkDelete(toDelete);
}

/** Seed the 10 default categories on first load (skips any that already exist by name). */
export async function seedDefaultCategories() {
  // First, clean up any duplicates left from previous versions
  await cleanupDuplicateCategories();

  const existing = await db.categories.toArray();
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase().trim()));

  const toAdd = DEFAULT_CATEGORIES.filter(
    (c) => !existingNames.has(c.name.toLowerCase().trim())
  );

  if (toAdd.length > 0) {
    await db.categories.bulkAdd(toAdd);
  }
}
