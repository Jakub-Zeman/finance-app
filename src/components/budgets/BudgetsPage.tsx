import { useEffect, useState } from "react";
import { useBudgetStore } from "../../stores/useBudgetStore";
import { useCategoryStore } from "../../stores/useCategoryStore";
import { useTransactionStore } from "../../stores/useTransactionStore";
import { formatCurrency, getLast6Months, getMonthLabel } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Card, CardContent } from "../ui/card";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

export function BudgetsPage() {
  const { budgets, selectedMonth, setSelectedMonth, fetchBudgets, addBudget, updateBudget, deleteBudget } =
    useBudgetStore();
  const { categories, fetchCategories } = useCategoryStore();
  const { fetchTransactions } = useTransactionStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formAmount, setFormAmount] = useState<string>("");

  const months = getLast6Months();

  useEffect(() => {
    fetchCategories();
    fetchTransactions();
    fetchBudgets();
  }, []);

  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");

  function handleOpenAdd() {
    setEditingId(null);
    setFormCategoryId("");
    setFormAmount("");
    setFormOpen(true);
  }

  function handleOpenEdit(id: number, categoryId: number, amount: number) {
    setEditingId(id);
    setFormCategoryId(categoryId.toString());
    setFormAmount(amount.toString());
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formCategoryId || !formAmount) return;
    if (editingId) {
      await updateBudget(editingId, { amount: parseFloat(formAmount), categoryId: Number(formCategoryId) });
    } else {
      await addBudget({ categoryId: Number(formCategoryId), amount: parseFloat(formAmount), month: selectedMonth });
    }
    setFormOpen(false);
  }

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-muted-foreground text-sm">Set monthly spending limits</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{getMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleOpenAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Budget
          </Button>
        </div>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Budgeted</p>
            <p className="text-xl font-bold">{formatCurrency(totalBudgeted)}</p>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className={`text-xl font-bold ${totalSpent > totalBudgeted ? "text-red-600" : ""}`}>
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-xl font-bold ${totalBudgeted - totalSpent < 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(totalBudgeted - totalSpent)}
            </p>
          </div>
        </div>
      )}

      {/* Budget Cards */}
      {budgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">No budgets set for {getMonthLabel(selectedMonth)}</p>
            <Button variant="link" onClick={handleOpenAdd} className="mt-2">Create your first budget</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {budgets.map((budget) => {
            const pct = Math.min((budget.spent / budget.amount) * 100, 100);
            const overBudget = budget.spent > budget.amount;
            return (
              <Card key={budget.id} className={overBudget ? "border-red-300" : ""}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{budget.category?.icon}</span>
                      <span className="font-medium text-sm">{budget.category?.name}</span>
                      {overBudget && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenEdit(budget.id!, budget.categoryId, budget.amount)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => budget.id && deleteBudget(budget.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Spent</span>
                      <span className={overBudget ? "text-red-600 font-semibold" : "font-medium"}>
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : pct > 80 ? "bg-orange-400" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{pct.toFixed(0)}% used</span>
                      <span>{formatCurrency(Math.max(0, budget.amount - budget.spent))} left</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Budget" : "Add Budget"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id!.toString()}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Monthly Budget ($)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={!formCategoryId || !formAmount}>
                {editingId ? "Update" : "Add"} Budget
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
