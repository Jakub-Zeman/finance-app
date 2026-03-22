import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore } from "../../stores/useAccountStore";
import { useTransactionStore } from "../../stores/useTransactionStore";
import type { Account } from "../../types";
import { formatCurrency } from "../../lib/utils";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Plus, Pencil, Trash2, ArrowLeftRight } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#22c55e", "#06b6d4", "#3b82f6",
  "#64748b", "#f59e0b",
];
const PRESET_ICONS = ["🏦", "💳", "💵", "💰", "🏧", "💎", "🪙", "📊"];
const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF"];

const BANK_PRESETS: Record<string, { icon: string; color: string }> = {
  revolut:            { icon: "💳", color: "#6366f1" },
  "česká spořitelna": { icon: "🏦", color: "#22c55e" },
  csas:               { icon: "🏦", color: "#22c55e" },
  moneta:             { icon: "🏦", color: "#ef4444" },
  "komerční banka":   { icon: "🏦", color: "#f97316" },
  kb:                 { icon: "🏦", color: "#f97316" },
  cash:               { icon: "💵", color: "#22c55e" },
  hotovost:           { icon: "💵", color: "#22c55e" },
  wise:               { icon: "💳", color: "#06b6d4" },
  airbank:            { icon: "🏦", color: "#3b82f6" },
};

function getPreset(name: string) {
  const lower = name.toLowerCase();
  for (const [key, preset] of Object.entries(BANK_PRESETS)) {
    if (lower.includes(key)) return preset;
  }
  return null;
}

const EMPTY: Omit<Account, "id"> = {
  name: "", bank: "", color: "#6366f1", icon: "🏦", currency: "CZK",
};

export function AccountsPage() {
  const navigate = useNavigate();
  const { accounts, fetchAccounts, addAccount, updateAccount, deleteAccount } = useAccountStore();
  const { transactions, fetchTransactions } = useTransactionStore();

  const [formOpen, setFormOpen]       = useState(false);
  const [editing, setEditing]         = useState<Account | null>(null);
  const [form, setForm]               = useState<Omit<Account, "id">>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  useEffect(() => {
    fetchAccounts();
    fetchTransactions();
  }, []);

  const accountStats = useMemo(() => {
    const map = new Map<number, { balance: number; count: number }>();
    for (const tx of transactions) {
      if (tx.accountId == null) continue;
      const prev = map.get(tx.accountId) ?? { balance: 0, count: 0 };
      map.set(tx.accountId, {
        balance: prev.balance + (tx.type === "income" ? tx.amount : -tx.amount),
        count:   prev.count + 1,
      });
    }
    return map;
  }, [transactions]);

  const unlinkedCount = useMemo(
    () => transactions.filter((tx) => tx.accountId == null).length,
    [transactions]
  );

  const totalBalance = useMemo(() => {
    return transactions.reduce(
      (s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount),
      0
    );
  }, [transactions]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({ name: account.name, bank: account.bank, color: account.color, icon: account.icon, currency: account.currency });
    setFormOpen(true);
  }

  function handleNameChange(name: string) {
    const preset = getPreset(name);
    setForm((prev) => ({
      ...prev,
      name,
      ...(preset && !editing ? { icon: preset.icon, color: preset.color } : {}),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editing?.id) {
      await updateAccount(editing.id, form);
    } else {
      await addAccount(form);
    }
    setFormOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    await deleteAccount(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground text-sm">{accounts.length} account{accounts.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Total balance across all accounts */}
      {accounts.length > 0 && (
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total Balance (all accounts)</p>
            <p className={`text-2xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <span className="text-4xl">💼</span>
        </div>
      )}

      {/* Accounts grid */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <p className="text-5xl">🏦</p>
          <p className="font-medium text-foreground">No accounts yet</p>
          <p className="text-sm max-w-xs mx-auto">
            Add your bank accounts to track balances and filter transactions per account.
          </p>
          <Button onClick={openAdd} variant="outline" className="gap-2 mt-2">
            <Plus className="h-4 w-4" /> Add your first account
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const stats = accountStats.get(account.id!) ?? { balance: 0, count: 0 };
            return (
              <Card
                key={account.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => navigate("/transactions", { state: { accountId: account.id } })}
              >
                <div className="h-1.5" style={{ backgroundColor: account.color }} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl shrink-0">{account.icon}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{account.name}</p>
                        {account.bank && (
                          <p className="text-xs text-muted-foreground truncate">{account.bank}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{account.currency}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                         onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(account)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(account)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${stats.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(stats.balance, account.currency)}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <ArrowLeftRight className="h-3 w-3" />
                    {stats.count} transaction{stats.count !== 1 ? "s" : ""}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Unlinked card */}
          {unlinkedCount > 0 && (
            <Card
              className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-dashed"
              onClick={() => navigate("/transactions", { state: { accountId: "none" } })}
            >
              <div className="h-1.5 bg-muted" />
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-semibold text-sm text-muted-foreground">Unlinked</p>
                    <p className="text-xs text-muted-foreground">No account assigned</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeftRight className="h-3 w-3" />
                  {unlinkedCount} transaction{unlinkedCount !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Account Name *</Label>
              <Input
                placeholder="e.g. My Revolut, ČS Běžný účet, Cash"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Bank (optional)</Label>
              <Input
                placeholder="e.g. Revolut, Česká spořitelna"
                value={form.bank}
                onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Currency</Label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon }))}
                    className={`text-xl p-1.5 rounded-md border-2 transition-colors ${
                      form.icon === icon
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.color === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg border overflow-hidden">
              <div className="h-1" style={{ backgroundColor: form.color }} />
              <div className="p-3 flex items-center gap-2">
                <span className="text-xl">{form.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{form.name || "Account name"}</p>
                  {form.bank && <p className="text-xs text-muted-foreground">{form.bank}</p>}
                  <p className="text-xs text-muted-foreground">{form.currency}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={!form.name.trim()}>
                {editing ? "Save Changes" : "Add Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The account will be deleted. Transactions from this account will still exist but won't be linked to any account."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
