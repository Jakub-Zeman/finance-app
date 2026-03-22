import { create } from "zustand";
import { db, seedDefaultCategories } from "../db/database";
import type { Category } from "../types";

interface CategoryStore {
  categories: Category[];
  loading: boolean;
  fetchCategories: () => Promise<void>;
  /** Returns null on success, or an error string if name is a duplicate */
  addCategory: (category: Omit<Category, "id">) => Promise<string | null>;
  /** Returns null on success, or an error string if name is a duplicate */
  updateCategory: (id: number, category: Partial<Category>) => Promise<string | null>;
  deleteCategory: (id: number) => Promise<void>;
}

function nameKey(name: string) {
  return name.toLowerCase().trim();
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  loading: false,

  fetchCategories: async () => {
    set({ loading: true });
    await seedDefaultCategories();
    const categories = await db.categories.toArray();
    set({ categories, loading: false });
  },

  addCategory: async (category) => {
    const existing = get().categories;
    const duplicate = existing.find(
      (c) => nameKey(c.name) === nameKey(category.name)
    );
    if (duplicate) {
      return `A category named "${duplicate.name}" already exists.`;
    }
    await db.categories.add(category);
    const categories = await db.categories.toArray();
    set({ categories });
    return null;
  },

  updateCategory: async (id, category) => {
    if (category.name) {
      const existing = get().categories;
      const duplicate = existing.find(
        (c) => c.id !== id && nameKey(c.name) === nameKey(category.name!)
      );
      if (duplicate) {
        return `A category named "${duplicate.name}" already exists.`;
      }
    }
    await db.categories.update(id, category);
    const categories = await db.categories.toArray();
    set({ categories });
    return null;
  },

  deleteCategory: async (id) => {
    await db.categories.delete(id);
    const categories = await db.categories.toArray();
    set({ categories });
  },
}));
