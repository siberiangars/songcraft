"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  DollarSign,
  User,
  Building2,
  Calendar,
} from "lucide-react";

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stage: string;
  probability: number;
  contactId: string | null;
  companyId: string | null;
  contact?: { firstName: string; lastName: string };
  company?: { name: string };
  notes: string | null;
  expectedClose: string | null;
  createdAt: string;
}

interface DealFormData {
  title: string;
  value: string;
  currency: string;
  stage: string;
  probability: string;
  contactId: string;
  companyId: string;
  notes: string;
  expectedClose: string;
}

const stages = [
  { id: "new", label: "Новые", color: "bg-blue-500" },
  { id: "qualified", label: "Квалифицированы", color: "bg-purple-500" },
  { id: "proposal", label: "Предложения", color: "bg-yellow-500" },
  { id: "negotiation", label: "Переговоры", color: "bg-orange-500" },
  { id: "won", label: "Выиграны", color: "bg-green-500" },
  { id: "lost", label: "Проиграны", color: "bg-red-500" },
];

export default function DealsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<DealFormData>({
    title: "",
    value: "",
    currency: "RUB",
    stage: "new",
    probability: "50",
    contactId: "",
    companyId: "",
    notes: "",
    expectedClose: "",
  });

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const res = await fetch("/api/deals");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DealFormData) => {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      value: "",
      currency: "RUB",
      stage: "new",
      probability: "50",
      contactId: "",
      companyId: "",
      notes: "",
      expectedClose: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredDeals = deals.filter(
    (deal: Deal) =>
      deal.title.toLowerCase().includes(search.toLowerCase()) ||
      deal.company?.name.toLowerCase().includes(search.toLowerCase())
  );

  const getDealsByStage = (stage: string) =>
    filteredDeals.filter((deal: Deal) => deal.stage === stage);

  const getStageTotal = (stage: string) =>
    getDealsByStage(stage).reduce((sum: number, deal: Deal) => sum + deal.value, 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
  };

  const handleDrop = (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("dealId");
    if (dealId) {
      updateStageMutation.mutate({ id: dealId, stage: newStage });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Сделки</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Воронка продаж и управление сделками
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Новая сделка
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Новая сделка</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Название *</label>
                <Input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Название сделки"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Сумма *</label>
                  <Input
                    required
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="100000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Валюта</label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RUB">₽ Рубль</SelectItem>
                      <SelectItem value="USD">$ Доллар</SelectItem>
                      <SelectItem value="EUR">€ Евро</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Этап</label>
                  <Select
                    value={formData.stage}
                    onValueChange={(value) => setFormData({ ...formData, stage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.slice(0, 4).map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Вероятность (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Контакт</label>
                  <Select
                    value={formData.contactId}
                    onValueChange={(value) => setFormData({ ...formData, contactId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((contact: { id: string; firstName: string; lastName: string }) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.firstName} {contact.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Компания</label>
                  <Select
                    value={formData.companyId}
                    onValueChange={(value) => setFormData({ ...formData, companyId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company: { id: string; name: string }) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Ожидаемое закрытие</label>
                <Input
                  type="date"
                  value={formData.expectedClose}
                  onChange={(e) => setFormData({ ...formData, expectedClose: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Заметки</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md dark:bg-slate-700 dark:border-slate-600"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  Создать
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Поиск сделок..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-6 gap-4">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                <span className="font-medium text-sm">{stage.label}</span>
              </div>
              <Badge variant="outline">{getDealsByStage(stage.id).length}</Badge>
            </div>
            <div className="text-xs text-slate-500 px-3">
              {formatCurrency(getStageTotal(stage.id))}
            </div>
            <div className="space-y-2 min-h-[200px]">
              {getDealsByStage(stage.id).map((deal: Deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, deal.id)}
                  className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm cursor-move hover:shadow-md transition-shadow"
                >
                  <div className="font-medium text-sm mb-2">{deal.title}</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-2">
                    {formatCurrency(deal.value)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {deal.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {deal.company.name}
                      </span>
                    )}
                    {deal.contact && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {deal.contact.firstName}
                      </span>
                    )}
                  </div>
                  {deal.expectedClose && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(deal.expectedClose).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
