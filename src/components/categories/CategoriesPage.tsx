import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCategoryStore } from "../../stores/useCategoryStore";
import type { Category } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#06b6d4",
];

const PRESET_ICONS = ["💼", "💻", "📈", "💰", "🏠", "🍔", "🚗", "💡", "🏥", "🎬", "🛍️", "📚", "✈️", "📦", "🎮", "🏋️", "🐾", "🎵", "💊", "🍷"];

export function CategoriesPage() {
  const navigate = useNavigate();
  const { categories, fetchCategories, addCategory, updateCategory, deleteCategory } = useCategoryStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [icon, setIcon] = useState("📦");
  const [type, setType] = useState<"income" | "expense" | "both">("expense");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  function handleOpenAdd() {
    setEditing(null);
    setName("");
    setColor("#3b82f6");
    setIcon("📦");
    setType("expense");
    setNameError(null);
    setFormOpen(true);
  }

  function handleOpenEdit(cat: Category, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(cat);
    setName(cat.name);
    setColor(cat.color);
    setIcon(cat.icon);
    setType(cat.type as "income" | "expense" | "both");
    setNameError(null);
    setFormOpen(true);
  }

  function handleDelete(cat: Category, e: React.MouseEvent) {
    e.stopPropagation();
    if (cat.id) deleteCategory(cat.id);
  }

  function handleCategoryClick(cat: Category) {
    navigate("/transactions", { state: { categoryId: cat.id } });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setNameError(null);
    let error: string | null;
    if (editing?.id) {
      error = await updateCategory(editing.id, { name, color, icon, type });
    } else {
      error = await addCategory({ name, color, icon, type });
    }
    if (error) {
      setNameError(error);
    } else {
      setFormOpen(false);
    }
  }

  const income = categories.filter((c) => c.type === "income" || c.type === "both");
  const expense = categories.filter((c) => c.type === "expense" || c.type === "both");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground text-sm">{categories.length} categories · click a card to view transactions</p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">Expense ({expense.length})</TabsTrigger>
          <TabsTrigger value="income">Income ({income.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <CategoryGrid
            categories={expense}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            onClick={handleCategoryClick}
          />
        </TabsContent>
        <TabsContent value="income">
          <CategoryGrid
            categories={income}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            onClick={handleCategoryClick}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="Category name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(null); }}
                className={nameError ? "border-destructive" : ""}
              />
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`text-xl p-1.5 rounded-lg border-2 transition-colors ${icon === i ? "border-primary bg-primary/10" : "border-transparent hover:border-muted-foreground/30"}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={!name.trim()}>
                {editing ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryGrid({
  categories,
  onEdit,
  onDelete,
  onClick,
}: {
  categories: Category[];
  onEdit: (cat: Category, e: React.MouseEvent) => void;
  onDelete: (cat: Category, e: React.MouseEvent) => void;
  onClick: (cat: Category) => void;
}) {
  if (categories.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No categories yet
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-4">
      {categories.map((cat) => (
        <Card
          key={cat.id}
          className="group relative cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onClick(cat)}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
              style={{ backgroundColor: cat.color + "22" }}
            >
              {cat.icon}
            </div>
            <p className="text-sm font-medium text-center">{cat.name}</p>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />

            {/* View transactions hint */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="h-3 w-3" />
              View transactions
            </div>

            {/* Edit / Delete buttons */}
            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => onEdit(cat, e)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => onDelete(cat, e)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
