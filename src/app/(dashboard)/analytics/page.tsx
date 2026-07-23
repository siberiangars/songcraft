"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Target,
  Phone,
  MessageSquare,
  Calendar,
  Download,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
} from "lucide-react";

// Mock data for charts
const salesData = [
  { month: "Янв", deals: 45, revenue: 1250000 },
  { month: "Фев", deals: 52, revenue: 1450000 },
  { month: "Мар", deals: 48, revenue: 1320000 },
  { month: "Апр", deals: 61, revenue: 1680000 },
  { month: "Май", deals: 55, revenue: 1520000 },
  { month: "Июн", deals: 67, revenue: 1890000 },
];

const funnelData = [
  { stage: "Лиды", count: 1000, percentage: 100 },
  { stage: "Квалифицированы", count: 650, percentage: 65 },
  { stage: "Предложения", count: 380, percentage: 38 },
  { stage: "Переговоры", count: 220, percentage: 22 },
  { stage: "Выиграны", count: 150, percentage: 15 },
];

const sourcesData = [
  { source: "Сайт", leads: 350, percentage: 35 },
  { source: "Телефон", leads: 250, percentage: 25 },
  { source: "WhatsApp", leads: 180, percentage: 18 },
  { source: "Telegram", leads: 120, percentage: 12 },
  { source: "Email", leads: 100, percentage: 10 },
];

const managersData = [
  { name: "Анна Сидорова", deals: 45, revenue: 1250000, conversion: 32 },
  { name: "Михаил Козлов", deals: 38, revenue: 980000, conversion: 28 },
  { name: "Елена Новикова", deals: 52, revenue: 1450000, conversion: 35 },
  { name: "Алексей Петров", deals: 35, revenue: 890000, conversion: 25 },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("month");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Аналитика</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Отчёты и метрики эффективности
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">За неделю</SelectItem>
              <SelectItem value="month">За месяц</SelectItem>
              <SelectItem value="quarter">За квартал</SelectItem>
              <SelectItem value="year">За год</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> Экспорт
          </Button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Выручка</span>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold">{formatCurrency(9840000)}</div>
            <div className="flex items-center gap-1 text-sm text-green-500">
              <TrendingUp className="h-3 w-3" />
              <span>+12.5% к прошлому периоду</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Сделок</span>
              <Target className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">328</div>
            <div className="flex items-center gap-1 text-sm text-green-500">
              <TrendingUp className="h-3 w-3" />
              <span>+8.3% к прошлому периоду</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Конверсия</span>
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold">15.2%</div>
            <div className="flex items-center gap-1 text-sm text-red-500">
              <TrendingDown className="h-3 w-3" />
              <span>-2.1% к прошлому периоду</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Средний чек</span>
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold">{formatCurrency(299000)}</div>
            <div className="flex items-center gap-1 text-sm text-green-500">
              <TrendingUp className="h-3 w-3" />
              <span>+5.2% к прошлому периоду</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sales">
            <BarChart3 className="h-4 w-4 mr-2" />
            Продажи
          </TabsTrigger>
          <TabsTrigger value="funnel">
            <PieChart className="h-4 w-4 mr-2" />
            Воронка
          </TabsTrigger>
          <TabsTrigger value="sources">
            <LineChart className="h-4 w-4 mr-2" />
            Источники
          </TabsTrigger>
          <TabsTrigger value="managers">
            <Users className="h-4 w-4 mr-2" />
            Менеджеры
          </TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Динамика продаж</CardTitle>
                <CardDescription>Сделки и выручка по месяцам</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData.map((item, index) => (
                    <div key={index} className="flex items-center gap-4">
                      <div className="w-12 text-sm text-slate-500">{item.month}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm">{item.deals} сделок</span>
                          <span className="text-sm font-medium">{formatCurrency(item.revenue)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                            style={{ width: `${(item.revenue / 2000000) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Прогноз vs Факт</CardTitle>
                <CardDescription>Плановые показатели</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Выручка</span>
                      <span className="text-sm font-medium">9.8M / 12M ₽</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: "82%" }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">82% от плана</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Сделки</span>
                      <span className="text-sm font-medium">328 / 400</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: "82%" }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">82% от плана</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Новые клиенты</span>
                      <span className="text-sm font-medium">85 / 100</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: "85%" }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">85% от плана</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Конверсия</span>
                      <span className="text-sm font-medium">15.2% / 18%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: "84%" }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">84% от плана</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Funnel Tab */}
        <TabsContent value="funnel" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Воронка продаж</CardTitle>
              <CardDescription>Конверсия по этапам</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {funnelData.map((item, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium">{item.stage}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-500">{item.count} сделок</span>
                        <span className="text-sm font-medium">{item.percentage}%</span>
                      </div>
                      <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            index === 0 ? "bg-blue-500" :
                            index === 1 ? "bg-blue-400" :
                            index === 2 ? "bg-purple-500" :
                            index === 3 ? "bg-purple-400" :
                            "bg-green-500"
                          }`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                    {index > 0 && (
                      <div className="w-20 text-right">
                        <Badge variant="outline">
                          {Math.round((funnelData[index].count / funnelData[index - 1].count) * 100)}%
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-500">15%</div>
                    <div className="text-sm text-slate-500">Общая конверсия</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">28 дней</div>
                    <div className="text-sm text-slate-500">Средний цикл сделки</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{formatCurrency(65600)}</div>
                    <div className="text-sm text-slate-500">CAC (стоимость лида)</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Источники лидов</CardTitle>
              <CardDescription>Откуда приходят клиенты</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  {sourcesData.map((item, index) => (
                    <div key={index} className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium">{item.source}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-500">{item.leads} лидов</span>
                          <span className="text-sm font-medium">{item.percentage}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              index === 0 ? "bg-blue-500" :
                              index === 1 ? "bg-green-500" :
                              index === 2 ? "bg-green-400" :
                              index === 3 ? "bg-blue-400" :
                              "bg-purple-500"
                            }`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative w-48 h-48">
                    {/* Simple pie chart representation */}
                    <div className="absolute inset-0 rounded-full border-8 border-blue-500" style={{ clipPath: "polygon(50% 0%, 100% 0%, 100% 35%, 50% 50%)" }} />
                    <div className="absolute inset-0 rounded-full border-8 border-green-500" style={{ clipPath: "polygon(100% 35%, 100% 60%, 50% 50%)" }} />
                    <div className="absolute inset-0 rounded-full border-8 border-green-400" style={{ clipPath: "polygon(100% 60%, 70% 100%, 50% 50%)" }} />
                    <div className="absolute inset-0 rounded-full border-8 border-blue-400" style={{ clipPath: "polygon(70% 100%, 30% 100%, 50% 50%)" }} />
                    <div className="absolute inset-0 rounded-full border-8 border-purple-500" style={{ clipPath: "polygon(30% 100%, 0% 65%, 50% 50%)" }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Managers Tab */}
        <TabsContent value="managers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Эффективность менеджеров</CardTitle>
              <CardDescription>Рейтинг по показателям</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {managersData.map((manager, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{manager.name}</div>
                      <div className="text-sm text-slate-500">
                        {manager.deals} сделок
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(manager.revenue)}</div>
                      <div className="text-sm text-slate-500">
                        Конверсия: {manager.conversion}%
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                          style={{ width: `${manager.conversion}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
