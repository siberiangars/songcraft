"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Handshake, 
  Phone, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  CheckCircle2,
  DollarSign,
  Target,
  Activity,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const router = useRouter();
  const { data: contactsData } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: dealsData } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const res = await fetch("/api/deals");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: leadsData } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const contacts = contactsData || [];
  const companies = companiesData || [];
  const deals = dealsData || [];
  const tasks = tasksData || [];
  const leads = leadsData || [];

  const totalDeals = deals.length;
  const wonDeals = deals.filter((d: any) => d.stage === "WON" || d.stage === "won").length;
  const totalRevenue = deals.reduce((sum: number, d: any) => sum + (d.amount || d.value || 0), 0);
  const pendingTasks = tasks.filter((t: any) => t.status !== "DONE" && t.status !== "done").length;
  const newLeads = leads.filter((l: any) => l.stage === "INIT" || l.stage === "ENGAGE").length;
  const qualifiedLeads = leads.filter((l: any) => l.stage === "OFFER" || l.stage === "CLOSING").length;

  const stats = [
    { title: "Контакты", value: contacts.length, change: "+12%", trend: "up", icon: Users, color: "text-blue-500" },
    { title: "Компании", value: companies.length, change: "+8%", trend: "up", icon: Handshake, color: "text-purple-500" },
    { title: "Сделки", value: totalDeals, change: "+5%", trend: "up", icon: Target, color: "text-green-500" },
    { title: "Выручка", value: `${(totalRevenue / 1000).toFixed(0)}к₽`, change: "+15%", trend: "up", icon: DollarSign, color: "text-yellow-500" },
  ];

  const pipelineStages = [
    { stage: "Новые", count: deals.filter((d: any) => d.stage === "NEW" || d.stage === "new").length, color: "bg-blue-500" },
    { stage: "Квалиф.", count: deals.filter((d: any) => d.stage === "QUALIFIED" || d.stage === "qualified").length, color: "bg-purple-500" },
    { stage: "Предлож.", count: deals.filter((d: any) => d.stage === "PROPOSAL" || d.stage === "proposal").length, color: "bg-yellow-500" },
    { stage: "Перегов.", count: deals.filter((d: any) => d.stage === "NEGOTIATION" || d.stage === "negotiation").length, color: "bg-orange-500" },
    { stage: "Выиграны", count: wonDeals, color: "bg-green-500" },
  ];

  const maxStage = Math.max(...pipelineStages.map(s => s.count), 1);

  const recentActivities = [
    { id: 1, type: "lead", title: "Новый лид из Telegram", description: "Artem_lidorub", time: "Только что", user: "ИИ Агент" },
    { id: 2, type: "deal", title: "Сделка 'Офисный центр'", description: "Переговоры", time: "1 час назад", user: "Менеджер" },
    { id: 3, type: "task", title: "Подготовить КП", description: "Срок: сегодня", time: "2 часа назад", user: "Вы" },
    { id: 4, type: "message", title: "Сообщение от клиента", description: "WhatsApp", time: "3 часа назад", user: "Клиент" },
  ];

  const upcomingTasks = tasks.slice(0, 5).map((task: any) => ({
    id: task.id,
    title: task.title,
    deadline: task.dueDate ? new Date(task.dueDate).toLocaleString("ru-RU") : "Без срока",
    priority: task.priority?.toLowerCase() || "medium",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Дашборд</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Обзор вашего бизнеса
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/tasks")}>
            <Calendar className="h-4 w-4 mr-2" />
            Календарь
          </Button>
          <Button size="sm" onClick={() => router.push("/calls")}>
            <Phone className="h-4 w-4 mr-2" />
            Новый звонок
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="flex items-center text-xs mt-1">
                {stat.trend === "up" ? (
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                  {stat.change}
                </span>
                <span className="text-slate-500 ml-1">за 30 дней</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Воронка продаж</CardTitle>
            <CardDescription>Текущие сделки по этапам</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pipelineStages.map((stage) => (
                <div 
                  key={stage.stage} 
                  className="space-y-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => router.push("/deals")}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{stage.stage}</span>
                    <Badge variant="outline">{stage.count}</Badge>
                  </div>
                  <div className="h-6 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-lg transition-all duration-500`}
                      style={{ width: `${(stage.count / maxStage) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Leads Status */}
        <Card>
          <CardHeader>
            <CardTitle>Лиды ИИ</CardTitle>
            <CardDescription>По данным ИИ агента</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div 
                className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/ai-agent")}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span className="text-sm">Новые</span>
                </div>
                <span className="text-xl font-bold">{newLeads}</span>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/ai-agent")}
              >
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm">В работе</span>
                </div>
                <span className="text-xl font-bold">{leads.length - newLeads - qualifiedLeads}</span>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/ai-agent")}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm">Квалифицированы</span>
                </div>
                <span className="text-xl font-bold">{qualifiedLeads}</span>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/ai-agent")}
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-slate-500" />
                  <span className="text-sm">Всего лидов</span>
                </div>
                <span className="text-xl font-bold">{leads.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Последние активности</CardTitle>
            <CardDescription>Недавние действия в системе</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => {
                    if (activity.type === "lead") router.push("/ai-agent");
                    else if (activity.type === "deal") router.push("/deals");
                    else if (activity.type === "task") router.push("/tasks");
                    else router.push("/messages");
                  }}
                  className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{activity.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{activity.user}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{activity.time}</span>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Ближайшие задачи</CardTitle>
            <CardDescription>
              {pendingTasks} задач в работе
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Нет задач</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <CheckCircle2 className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{task.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.deadline}
                      </p>
                    </div>
                    <Badge
                      variant={
                        task.priority === "high" || task.priority === "HIGH"
                          ? "destructive"
                          : task.priority === "medium" || task.priority === "MEDIUM"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {task.priority === "high" ? "Выс." : task.priority === "medium" ? "Сред." : "Низ."}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
