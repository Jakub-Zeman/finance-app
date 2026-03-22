import { useState, useRef } from "react";
import Papa from "papaparse";
import { useCategoryStore } from "../../stores/useCategoryStore";
import { useTransactionStore } from "../../stores/useTransactionStore";
import { useAccountStore } from "../../stores/useAccountStore";
import { db } from "../../db/database";
import {
  parseRevolutCSV,
  processRevolutRows,
  isRevolutFormat,
  type ParsedRevolutTransaction,
} from "../../lib/revolutParser";
import {
  parseCsasFile,
  processCsasRows,
  isCsasFormat,
  type ParsedCsasTransaction,
} from "../../lib/csasParser";
import {
  extractPdfTransactions,
  isPdfFile,
  type PdfTransaction,
} from "../../lib/pdfParser";
import { detectCategory } from "../../lib/revolutParser";
import type { Transaction, Category } from "../../types";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Upload, Download, CheckCircle, AlertCircle, Info, ChevronRight, ArrowLeft } from "lucide-react";
import { formatCurrency } from "../../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ParsedPdfTransaction {
  raw: PdfTransaction;
  transaction: Omit<Transaction, "id">;
  suggestedCategory: string;
  skipped: boolean;
  skipReason?: string;
}

type ParsedRow = ParsedRevolutTransaction | ParsedCsasTransaction | ParsedPdfTransaction;
type Step = "upload" | "review" | "preview" | "success" | "error";

// Categories that mean "we don't know what this is"
const FALLBACK_CATEGORIES = ["Other Expense", "Other Income"];

async function processPdfTransactions(
  rows: PdfTransaction[],
  categories: Category[]
): Promise<ParsedPdfTransaction[]> {
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  function findCategoryId(name: string): number {
    const cat = catByName.get(name.toLowerCase());
    if (cat?.id) return cat.id;
    const fallback = catByName.get("other expense") || catByName.get("other income");
    return fallback?.id || categories[0]?.id || 1;
  }

  // Load user-defined category rules
  const userRules = await db.categoryRules.toArray();

  return rows.map((row) => {
    const type: "income" | "expense" = row.amount >= 0 ? "income" : "expense";
    const absAmount = Math.abs(row.amount);

    if (absAmount === 0) {
      return {
        raw: row,
        transaction: {} as Omit<Transaction, "id">,
        suggestedCategory: "",
        skipped: true,
        skipReason: "Zero amount",
      };
    }

    // 1. Check user-defined rules first
    let suggestedCategory = "";
    const descLower = row.description.toLowerCase();
    for (const rule of userRules) {
      if (descLower.includes(rule.pattern.toLowerCase())) {
        const cat = categories.find((c) => c.id === rule.categoryId);
        if (cat) {
          suggestedCategory = cat.name;
          break;
        }
      }
    }

    // 2. Fall back to keyword detection (reuses Revolut parser logic)
    if (!suggestedCategory) {
      suggestedCategory = detectCategory(row.description, "", row.amount);
    }

    const categoryId = findCategoryId(suggestedCategory);

    return {
      raw: row,
      suggestedCategory,
      skipped: false,
      transaction: {
        type,
        amount: absAmount,
        categoryId,
        description: row.description,
        date: row.date,
        tags: ["česká-spořitelna", "pdf"],
        notes: row.balance !== undefined ? `Balance: ${row.balance}` : "",
      },
    };
  });
}

export function CSVImport({ open, onClose }: Props) {
  const { categories } = useCategoryStore();
  const { bulkAddTransactions } = useTransactionStore();
  const { accounts } = useAccountStore();

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [detectedFormat, setDetectedFormat] = useState("");
  const [step, setStep] = useState<Step>("upload");
  const [errorMsg, setErrorMsg] = useState("");
  // index in toImport[] → override categoryId
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, number>>({});
  // indices of items the user wants to "remember" as a rule
  const [rememberSet, setRememberSet] = useState<Set<number>>(new Set());
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toImport = parsed.filter((p) => !p.skipped);
  const skipped  = parsed.filter((p) =>  p.skipped);

  // Transactions that fell into a fallback category — need user attention
  const reviewItems = toImport
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => FALLBACK_CATEGORIES.includes(p.suggestedCategory));

  // How many OTHER review items share the same description as item i
  function dupeReviewCount(desc: string, selfIndex: number) {
    return reviewItems.filter(({ p, i }) => i !== selfIndex && p.transaction.description === desc).length;
  }

  // ─── file parsing ───────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    setParsed([]);
    setCategoryOverrides({});
    setRememberSet(new Set());

    try {
      let result: ParsedRow[];
      let fmt: string;

      if (isPdfFile(file)) {
        // PDF bank statement
        const pdfRows = await extractPdfTransactions(file);
        if (pdfRows.length === 0) {
          setErrorMsg("No transactions found in PDF. Make sure it's a valid bank statement.");
          setStep("error");
          return;
        }
        result = await processPdfTransactions(pdfRows, categories);
        fmt = "PDF (Česká spořitelna)";
      } else {
        // CSV handling
        const buffer = await file.arrayBuffer();
        const uint8  = new Uint8Array(buffer);
        const isUtf16 =
          (uint8[0] === 0xFF && uint8[1] === 0xFE) ||
          (uint8[1] === 0x00 && uint8[3] === 0x00);

        if (isUtf16) {
          const rows    = await parseCsasFile(file);
          const headers = Object.keys(rows[0] || {});
          if (!isCsasFormat(headers)) {
            setErrorMsg("UTF-16 file detected but format not recognised.");
            setStep("error");
            return;
          }
          result = processCsasRows(rows, categories);
          fmt    = "Česká spořitelna";
        } else {
          const headerRow = await new Promise<string[]>((resolve) => {
            Papa.parse<string[]>(file, {
              preview: 1,
              header: false,
              complete: (r) => resolve((r.data[0] as string[]) || []),
            });
          });

          if (isRevolutFormat(headerRow)) {
            result = processRevolutRows(await parseRevolutCSV(file), categories);
            fmt    = "Revolut";
          } else if (isCsasFormat(headerRow)) {
            result = processCsasRows(await parseCsasFile(file), categories);
            fmt    = "Česká spořitelna";
          } else {
            setErrorMsg("Format not recognised. Supported: Revolut CSV, Česká spořitelna CSV/PDF.");
            setStep("error");
            return;
          }
        }
      }

      setParsed(result);
      setDetectedFormat(fmt);
      const needsReview = result.filter(
        (p) => !p.skipped && FALLBACK_CATEGORIES.includes(p.suggestedCategory)
      );
      setStep(needsReview.length > 0 ? "review" : "preview");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to parse file. Make sure it's a valid CSV or PDF export.");
      setStep("error");
    }
  }

  // ─── category change ─────────────────────────────────────────────────────────
  // When user picks a category for an item, auto-apply it to all OTHER review
  // items that share the same description (they're likely the same merchant).
  function handleCategoryChange(index: number, categoryId: number) {
    const desc = toImport[index].transaction.description;
    const updates: Record<number, number> = { [index]: categoryId };
    reviewItems.forEach(({ p, i }) => {
      if (i !== index && p.transaction.description === desc) {
        updates[i] = categoryId;
      }
    });
    setCategoryOverrides((prev) => ({ ...prev, ...updates }));
  }

  function toggleRemember(index: number) {
    setRememberSet((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  // ─── final import ────────────────────────────────────────────────────────────
  async function handleImport() {
    // Persist remembered rules (deduplicated by description)
    const savedPatterns = new Set<string>();
    for (const i of rememberSet) {
      const p          = toImport[i];
      const categoryId = categoryOverrides[i] ?? p.transaction.categoryId;
      const pattern    = p.transaction.description;
      if (savedPatterns.has(pattern)) continue;
      savedPatterns.add(pattern);
      const existing = await db.categoryRules.where("pattern").equalsIgnoreCase(pattern).first();
      if (existing?.id) {
        await db.categoryRules.update(existing.id, { categoryId });
      } else {
        await db.categoryRules.add({ pattern, categoryId });
      }
    }

    const transactions: Omit<Transaction, "id">[] = toImport.map((p, i) => ({
      ...p.transaction,
      categoryId: categoryOverrides[i] ?? p.transaction.categoryId,
      accountId: selectedAccountId ?? undefined,
    }));

    await bulkAddTransactions(transactions);
    setStep("success");
    setTimeout(() => handleClose(), 1800);
  }

  function handleClose() {
    setStep("upload");
    setParsed([]);
    setErrorMsg("");
    setCategoryOverrides({});
    setRememberSet(new Set());
    setSelectedAccountId(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  function resetFile() {
    setStep("upload");
    setParsed([]);
    setSelectedAccountId(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadRevolutTemplate() {
    const template = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "Card Payment,Current,2024-01-15 12:00:00,2024-01-16 10:00:00,Kaufland,-350.00,0.00,CZK,COMPLETED,1650.00",
      "Transfer,Current,2024-01-01 09:00:00,2024-01-01 09:00:00,Transfer from JAKUB ZEMAN,5000.00,0.00,CZK,COMPLETED,5000.00",
    ].join("\n");
    const blob = new Blob([template], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "revolut_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const totalIncome  = toImport.filter((p) => p.transaction.type === "income").reduce((s, p) => s + p.transaction.amount, 0);
  const totalExpense = toImport.filter((p) => p.transaction.type === "expense").reduce((s, p) => s + p.transaction.amount, 0);

  // How many review items still have a fallback category after user actions?
  const stillUncategorized = reviewItems.filter(({ i }) => {
    const catId = categoryOverrides[i] ?? toImport[i].transaction.categoryId;
    const cat   = categories.find((c) => c.id === catId);
    return FALLBACK_CATEGORIES.includes(cat?.name ?? "");
  }).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Bank Statement</DialogTitle>
          <DialogDescription>
            Auto-detects format · Supports Revolut CSV, Česká spořitelna CSV or PDF exports
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── UPLOAD ── */}
          {step === "upload" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Import to account (optional)</label>
                <select value={selectedAccountId ?? ""} onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">No account (import without linking)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
                {accounts.length === 0 && (
                  <p className="text-xs text-muted-foreground">No accounts yet. Create one in the Accounts page to link imports.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-blue-800">Revolut</p>
                    <p className="text-xs text-blue-600">App → Account → Statement → CSV</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <Info className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">Česká spořitelna</p>
                    <p className="text-xs text-green-600">Servis 24 → Výpisy → Export CSV or PDF</p>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={downloadRevolutTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Revolut template
              </Button>
              <div
                className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select your CSV or PDF file</p>
                <p className="text-xs text-muted-foreground mt-1">Format is detected automatically</p>
              </div>
            </>
          )}

          <input ref={fileRef} type="file" accept=".csv,.pdf" className="hidden" onChange={handleFile} />

          {/* ── ERROR ── */}
          {step === "error" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
              </div>
              <Button variant="outline" size="sm" onClick={resetFile}>Try another file</Button>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === "success" && (
            <div className="flex items-center gap-2 text-green-700 text-sm p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Import complete!</p>
                <p className="text-xs text-green-600">{toImport.length} transactions added successfully.</p>
              </div>
            </div>
          )}

          {/* ── REVIEW — uncategorized transactions ── */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Top bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-full font-medium">
                  ✓ {detectedFormat}
                </span>
                <span className="text-xs text-muted-foreground">{toImport.length} transactions found</span>
                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={resetFile}>
                  Change file
                </Button>
              </div>

              {/* Banner */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="font-semibold text-amber-900 text-sm">
                  ⚠️  {reviewItems.length} transaction{reviewItems.length !== 1 ? "s" : ""} couldn't be categorized automatically
                </p>
                <p className="text-xs text-amber-700">
                  Pick a category for each one. If you choose the same merchant regularly, check
                  <strong> "Remember"</strong> to apply it automatically on future imports.
                  Changing one item auto-fills all others with the same merchant name.
                </p>
              </div>

              {/* Review cards */}
              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                {reviewItems.map(({ p, i }) => {
                  const currentCatId = categoryOverrides[i] ?? p.transaction.categoryId;
                  const currentCat   = categories.find((c) => c.id === currentCatId);
                  const isStillOther = FALLBACK_CATEGORIES.includes(currentCat?.name ?? "");
                  const relevantCats = categories.filter(
                    (c) => c.type === p.transaction.type || c.type === "both"
                  );
                  const dupes = dupeReviewCount(p.transaction.description, i);

                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                        isStillOther ? "border-amber-200 bg-amber-50/40" : "border-green-200 bg-green-50/30"
                      }`}
                    >
                      {/* Row: description + amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.transaction.description}</p>
                          <p className="text-xs text-muted-foreground">{p.transaction.date}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-sm font-bold ${p.transaction.type === "income" ? "text-green-600" : "text-red-600"}`}>
                            {p.transaction.type === "income" ? "+" : "−"}{formatCurrency(p.transaction.amount)}
                          </span>
                          {dupes > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                              +{dupes} same merchant → will also update
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Category chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {relevantCats.map((cat) => {
                          const active = cat.id === currentCatId;
                          return (
                            <button
                              key={cat.id}
                              onClick={() => handleCategoryChange(i, cat.id!)}
                              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                              style={
                                active
                                  ? { backgroundColor: cat.color, borderColor: cat.color, color: "#fff" }
                                  : { backgroundColor: "transparent", borderColor: "#e2e8f0" }
                              }
                            >
                              {cat.icon} {cat.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Remember checkbox — only once a real category is chosen */}
                      {!isStillOther && currentCat && (
                        <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors select-none">
                          <input
                            type="checkbox"
                            checked={rememberSet.has(i)}
                            onChange={() => toggleRemember(i)}
                            className="rounded border-gray-300"
                          />
                          Remember: always categorize <em>"{p.transaction.description}"</em> as <strong>"{currentCat.name}"</strong>
                          {dupes > 0 && <span className="text-blue-600"> (saves rule for all {dupes + 1})</span>}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 text-muted-foreground text-sm"
                  onClick={() => setStep("preview")}
                >
                  Keep all as "Other"
                </Button>
                <Button className="flex-1 gap-1 text-sm" onClick={() => setStep("preview")}>
                  {stillUncategorized === 0
                    ? "All done — continue"
                    : `Continue (${stillUncategorized} as Other)`}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── PREVIEW — full transaction list ── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Top bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-full font-medium">
                  ✓ {detectedFormat}
                </span>
                <span className="text-xs text-muted-foreground">{parsed.length} rows processed</span>
                <div className="ml-auto flex gap-2">
                  {reviewItems.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setStep("review")}
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to review
                      {stillUncategorized > 0 && (
                        <span className="bg-amber-200 text-amber-800 rounded-full px-1.5 ml-0.5">
                          {stillUncategorized}
                        </span>
                      )}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={resetFile}>
                    Change file
                  </Button>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600">Income</p>
                  <p className="font-bold text-green-700 text-sm">{formatCurrency(totalIncome)}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-red-600">Expenses</p>
                  <p className="font-bold text-red-700 text-sm">{formatCurrency(totalExpense)}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Skipped</p>
                  <p className="font-bold text-sm">{skipped.length}</p>
                </div>
              </div>

              {/* Transaction preview table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Description</th>
                        <th className="text-left p-2 font-medium">Category</th>
                        <th className="text-right p-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toImport.map((p, i) => {
                        const catId    = categoryOverrides[i] ?? p.transaction.categoryId;
                        const cat      = categories.find((c) => c.id === catId);
                        const isOther  = FALLBACK_CATEGORIES.includes(cat?.name ?? "");
                        return (
                          <tr
                            key={i}
                            className={`border-t ${isOther ? "bg-amber-50/60" : "hover:bg-muted/30"}`}
                          >
                            <td className="p-2 whitespace-nowrap text-muted-foreground">{p.transaction.date}</td>
                            <td className="p-2 max-w-[160px] truncate">{p.transaction.description}</td>
                            <td className="p-2 whitespace-nowrap">
                              {isOther
                                ? <span className="text-amber-700">⚠️ {cat?.name}</span>
                                : <span>{cat?.icon} {cat?.name ?? "—"}</span>
                              }
                            </td>
                            <td className={`p-2 text-right font-semibold whitespace-nowrap ${p.transaction.type === "income" ? "text-green-600" : "text-red-600"}`}>
                              {p.transaction.type === "income" ? "+" : "−"}
                              {formatCurrency(p.transaction.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {skipped.length > 0 && (
                  <p className="text-xs text-muted-foreground p-2 border-t">
                    {skipped.length} rows skipped (zero amount / pending)
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                <Button className="flex-1" onClick={handleImport} disabled={toImport.length === 0}>
                  Import {toImport.length} transactions
                </Button>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
