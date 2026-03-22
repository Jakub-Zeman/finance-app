import { create } from "zustand";
import { db } from "../db/database";
import type { Transaction, TransactionWithCategory } from "../types";

interface TransactionStore {
  transactions: TransactionWithCategory[];
  loading: boolean;
  fetchTransactions: () => Promise<void>;
  addTransaction: (tx: Omit<Transaction, "id">) => Promise<void>;
  updateTransaction: (id: number, tx: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: number) => Promise<void>;
  deleteAllTransactions: () => Promise<void>;
  bulkAddTransactions: (txs: Omit<Transaction, "id">[]) => Promise<void>;
  bulkDeleteTransactions: (ids: number[]) => Promise<void>;
  applyCategoryToMatching: (description: string, categoryId: number, saveRule: boolean) => Promise<void>;
}

async function getTransactionsWithCategories(): Promise<TransactionWithCategory[]> {
  const txs = await db.transactions.orderBy("date").reverse().toArray();
  const cats = await db.categories.toArray();
  const catMap = new Map(cats.map((c) => [c.id!, c]));
  return txs.map((tx) => ({ ...tx, category: catMap.get(tx.categoryId) }));
}

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: [],
  loading: false,

  fetchTransactions: async () => {
    set({ loading: true });
    const transactions = await getTransactionsWithCategories();
    set({ transactions, loading: false });
  },

  addTransaction: async (tx) => {
    await db.transactions.add(tx);
    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },

  updateTransaction: async (id, tx) => {
    await db.transactions.update(id, tx);
    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },

  deleteTransaction: async (id) => {
    await db.transactions.delete(id);
    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },

  deleteAllTransactions: async () => {
    await db.transactions.clear();
    set({ transactions: [] });
  },

  bulkAddTransactions: async (txs) => {
    // Apply saved category rules to incoming transactions
    const rules = await db.categoryRules.toArray();
    const processed = rules.length > 0
      ? txs.map((tx) => {
          const rule = rules.find((r) =>
            tx.description.toLowerCase().includes(r.pattern.toLowerCase())
          );
          return rule ? { ...tx, categoryId: rule.categoryId } : tx;
        })
      : txs;
    await db.transactions.bulkAdd(processed);
    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },

  bulkDeleteTransactions: async (ids) => {
    await db.transactions.bulkDelete(ids);
    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },

  applyCategoryToMatching: async (description, categoryId, saveRule) => {
    // Update all transactions with same description
    const all = await db.transactions.toArray();
    const matching = all.filter(
      (tx) => tx.description.toLowerCase() === description.toLowerCase()
    );
    await Promise.all(matching.map((tx) => db.transactions.update(tx.id!, { categoryId })));

    // Save or update the rule
    if (saveRule) {
      const existing = await db.categoryRules.where("pattern").equalsIgnoreCase(description).first();
      if (existing?.id) {
        await db.categoryRules.update(existing.id, { categoryId });
      } else {
        await db.categoryRules.add({ pattern: description, categoryId });
      }
    }

    const transactions = await getTransactionsWithCategories();
    set({ transactions });
  },
}));
