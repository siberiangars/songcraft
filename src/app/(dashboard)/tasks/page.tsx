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
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  User,
  Phone,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate: string | null;
  contactId: string | null;
  dealId: string | null;
  contact?: { firstName: string; lastName: string };
  completedAt: string | null;
  createdAt: string;
}

interface TaskFormData {
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: string;
  contactId: string;
  dealId: string;
}

const taskTypes = [
  { id: "call", label: "Звонок", icon: Phone },
  { id: "meeting", label: "Встреча", icon: User },
  { id: "email", label: "Email", icon: AlertCircle },
  { id: "task", label: "Задача", icon: CheckCircle2 },
];

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    type: "task",
    priority: "medium",
    dueDate: "",
    contactId: "",
    dealId: "",
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
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

  const createMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("Failed to complete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      type: "task",
      priority: "medium",
      dueDate: "",
      contactId: "",
      dealId: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredTasks = tasks.filter((task: Task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.description?.toLowerCase().includes(search.toLowerCase());
    
    if (filter === "all") return matchesSearch;
    if (filter === "pending") return matchesSearch && task.status === "pending";
    if (filter === "completed") return matchesSearch && task.status === "completed";
    if (filter === "overdue") {
      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
      return matchesSearch && isOverdue;
    }
    return matchesSearch;
  });

  const pendingTasks = tasks.filter((t: Task) => t.status === "pending").length;
  const completedToday = tasks.filter((t: Task) => {
    if (!t.completedAt) return false;
    const today = new Date().toDateString();
    return new Date(t.completedAt).toDateString() === today;
  }).length;

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    };
    const labels: Record<string, string> = {
      high: "Высокий",
      medium: "Средний",
      low: "Низкий",
    };
    return (
      <Badge className={styles[priority] || styles.medium}>
        {labels[priority] || priority}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    const icon = taskTypes.find((t) => t.id === type)?.icon || CheckCircle2;
    return icon;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Задачи</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Управление задачами и напоминаниями
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Новая задача
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Новая задача</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Название *</label>
                <Input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Название задачи"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Описание</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md dark:bg-slate-700 dark:border-slate-600"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Описание задачи..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Тип</label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Приоритет</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Высокий</SelectItem>
                      <SelectItem value="medium">Средний</SelectItem>
                      <SelectItem value="low">Низкий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Срок выполнения</label>
                <Input
                  type="datetime-local"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Привязать к контакту</label>
                <Select
                  value={formData.contactId}
                  onValueChange={(value) => setFormData({ ...formData, contactId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите контакт" />
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Активных задач</p>
                <p className="text-2xl font-bold">{pendingTasks}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Выполнено сегодня</p>
                <p className="text-2xl font-bold">{completedToday}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Просрочено</p>
                <p className="text-2xl font-bold">
                  {tasks.filter((t: Task) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "completed").length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Поиск задач..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {[
            { id: "all", label: "Все" },
            { id: "pending", label: "Активные" },
            { id: "completed", label: "Выполненные" },
            { id: "overdue", label: "Просроченные" },
          ].map((f) => (
            <Button
              key={f.id}
              variant={filter === f.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tasks List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Загрузка...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Задач пока нет</p>
              <p className="text-sm">Создайте первую задачу</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredTasks.map((task: Task) => {
                const TypeIcon = getTypeIcon(task.type);
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
                
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      task.status === "completed" ? "opacity-60" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (task.status !== "completed") {
                          completeMutation.mutate(task.id);
                        }
                      }}
                      className="flex-shrink-0"
                    >
                      {task.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-300 hover:text-green-500" />
                      )}
                    </button>
                    <TypeIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${task.status === "completed" ? "line-through" : ""}`}>
                        {task.title}
                      </div>
                      {task.contact && (
                        <div className="text-sm text-slate-500">
                          {task.contact.firstName} {task.contact.lastName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {getPriorityBadge(task.priority)}
                      {task.dueDate && (
                        <div className={`flex items-center gap-1 text-sm ${isOverdue ? "text-red-500" : "text-slate-500"}`}>
                          <Calendar className="h-4 w-4" />
                          {new Date(task.dueDate).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Удалить задачу?")) {
                            deleteMutation.mutate(task.id);
                          }
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
