import { useEffect, useRef, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useCategoryStore } from "../../stores/useCategoryStore";
import { useTransactionStore } from "../../stores/useTransactionStore";
import type { Transaction } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { RefreshCw } from "lucide-react";

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Amount is required"),
  categoryId: z.string().min(1, "Select a category"),
  description: z.string().min(1, "Description is required"),
  date: z.string().min(1, "Date is required"),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
}

export function TransactionForm({ open, onClose, editing }: Props) {
  const { categories } = useCategoryStore();
  const { addTransaction, updateTransaction, transactions, applyCategoryToMatching } = useTransactionStore();

  const originalCategoryId = useRef<string>("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [saveRule, setSaveRule] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "expense",
      date: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const selectedType = watch("type");
  const watchCategoryId = watch("categoryId");
  const watchDescription = watch("description");

  useEffect(() => {
    if (editing) {
      originalCategoryId.current = editing.categoryId.toString();
      reset({
        type: editing.type,
        amount: editing.amount.toString(),
        categoryId: editing.categoryId.toString(),
        description: editing.description,
        date: editing.date,
        tags: editing.tags.join(", "),
        notes: editing.notes || "",
      });
    } else {
      originalCategoryId.current = "";
      reset({ type: "expense", date: format(new Date(), "yyyy-MM-dd"), amount: "", categoryId: "" });
    }
    setApplyToAll(false);
    setSaveRule(false);
  }, [editing, open]);

  const filteredCategories = categories.filter(
    (c) => c.type === selectedType || c.type === "both"
  );

  const categoryChanged =
    !!editing && !!watchCategoryId && watchCategoryId !== originalCategoryId.current;

  const matchingCount = useMemo(() => {
    if (!editing || !watchDescription) return 0;
    return transactions.filter(
      (tx) =>
        tx.id !== editing.id &&
        tx.description.toLowerCase() === watchDescription.toLowerCase()
    ).length;
  }, [editing, transactions, watchDescription]);

  const newCategoryName = useMemo(() => {
    if (!watchCategoryId) return "";
    return categories.find((c) => c.id?.toString() === watchCategoryId)?.name ?? "";
  }, [watchCategoryId, categories]);

  async function onSubmit(data: FormValues) {
    const amountNum = parseFloat(data.amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    const tx = {
      type: data.type,
      amount: amountNum,
      categoryId: Number(data.categoryId),
      description: data.description,
      date: data.date,
      tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      notes: data.notes || "",
    };
    if (editing?.id) {
      await updateTransaction(editing.id, tx);
      if (categoryChanged && (applyToAll || saveRule)) {
        await applyCategoryToMatching(data.description, Number(data.categoryId), saveRule);
      }
    } else {
      await addTransaction(tx);
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setValue("type", t); setValue("categoryId", ""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedType === t
                    ? t === "income"
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-red-500 text-white border-red-500"
                    : "bg-background border-input hover:bg-accent"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" placeholder="0.00" {...register("amount")} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input placeholder="e.g. Monthly salary" {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select
              value={watchCategoryId}
              onValueChange={(v) => setValue("categoryId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id!.toString()}>
                    {cat.icon} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
          </div>

          {/* Apply-to-all panel — only shown when editing and category was changed */}
          {categoryChanged && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                <RefreshCw className="h-3.5 w-3.5" />
                Category changed to "{newCategoryName}"
              </div>
              {matchingCount > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Apply to all {matchingCount} other transaction(s) with this name
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveRule}
                  onChange={(e) => setSaveRule(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Remember: auto-categorize "{watchDescription}" as "{newCategoryName}" on import
              </label>
            </div>
          )}

          <div className="space-y-1">
            <Label>Tags (comma separated)</Label>
            <Input placeholder="e.g. groceries, weekly" {...register("tags")} />
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea placeholder="Optional notes..." {...register("notes")} rows={2} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {editing ? "Update" : "Add"} Transaction
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
