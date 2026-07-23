"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Play,
  Pause,
  Download,
  Search,
  Clock,
  User,
  Volume2,
  Settings,
} from "lucide-react";

interface CallLog {
  id: string;
  callId: string | null;
  from: string;
  to: string;
  direction: "INCOMING" | "OUTGOING" | "MISSED";
  status: "ANSWERED" | "NO_ANSWER" | "BUSY" | "FAILED";
  duration: number;
  recordingUrl: string | null;
  startTime: string;
  endTime: string | null;
  notes: string | null;
  contact?: { firstName: string; lastName: string };
  user?: { name: string };
}

const mockCalls: CallLog[] = [
  {
    id: "1",
    callId: "call_001",
    from: "+7 999 123-45-67",
    to: "+7 495 123-45-67",
    direction: "INCOMING",
    status: "ANSWERED",
    duration: 245,
    recordingUrl: "/recordings/call_001.mp3",
    startTime: "2026-03-29T10:30:00",
    endTime: "2026-03-29T10:34:05",
    notes: "Клиент заинтересован в CRM",
    contact: { firstName: "Иван", lastName: "Петров" },
    user: { name: "Анна Сидорова" },
  },
  {
    id: "2",
    callId: "call_002",
    from: "+7 495 123-45-67",
    to: "+7 999 234-56-78",
    direction: "OUTGOING",
    status: "ANSWERED",
    duration: 180,
    recordingUrl: "/recordings/call_002.mp3",
    startTime: "2026-03-29T11:15:00",
    endTime: "2026-03-29T11:18:00",
    notes: "Заказал демонстрацию",
    contact: { firstName: "Мария", lastName: "Сидорова" },
    user: { name: "Михаил Козлов" },
  },
  {
    id: "3",
    callId: "call_003",
    from: "+7 999 345-67-89",
    to: "+7 495 123-45-67",
    direction: "MISSED",
    status: "NO_ANSWER",
    duration: 0,
    recordingUrl: null,
    startTime: "2026-03-29T11:45:00",
    endTime: null,
    notes: null,
    contact: { firstName: "Алексей", lastName: "Козлов" },
    user: undefined,
  },
  {
    id: "4",
    callId: "call_004",
    from: "+7 495 123-45-67",
    to: "+7 999 456-78-90",
    direction: "OUTGOING",
    status: "BUSY",
    duration: 0,
    recordingUrl: null,
    startTime: "2026-03-29T12:00:00",
    endTime: null,
    notes: "Перезвонить завтра",
    contact: { firstName: "Елена", lastName: "Новикова" },
    user: { name: "Анна Сидорова" },
  },
  {
    id: "5",
    callId: "call_005",
    from: "+7 999 567-89-01",
    to: "+7 495 123-45-67",
    direction: "INCOMING",
    status: "ANSWERED",
    duration: 520,
    recordingUrl: "/recordings/call_005.mp3",
    startTime: "2026-03-29T14:20:00",
    endTime: "2026-03-29T14:28:40",
    notes: "Обсуждение контракта",
    contact: { firstName: "Алексей", lastName: "Петров" },
    user: { name: "Елена Новикова" },
  },
];

export default function CallsPage() {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);

  const { data: calls = mockCalls, isLoading } = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const res = await fetch("/api/calls");
      if (!res.ok) return mockCalls;
      return res.json();
    },
  });

  const filteredCalls = calls.filter((call: CallLog) => {
    const matchesSearch =
      call.from.includes(search) ||
      call.to.includes(search) ||
      call.contact?.firstName.toLowerCase().includes(search.toLowerCase()) ||
      call.contact?.lastName.toLowerCase().includes(search.toLowerCase());
    
    const matchesDirection = directionFilter === "all" || call.direction === directionFilter;
    const matchesStatus = statusFilter === "all" || call.status === statusFilter;
    
    return matchesSearch && matchesDirection && matchesStatus;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case "INCOMING":
        return <PhoneIncoming className="h-4 w-4 text-green-500" />;
      case "OUTGOING":
        return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
      case "MISSED":
        return <PhoneMissed className="h-4 w-4 text-red-500" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ANSWERED: "bg-green-100 text-green-700 dark:bg-green-900/30",
      NO_ANSWER: "bg-red-100 text-red-700 dark:bg-red-900/30",
      BUSY: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30",
      FAILED: "bg-gray-100 text-gray-700 dark:bg-gray-900/30",
    };
    const labels: Record<string, string> = {
      ANSWERED: "Отвечен",
      NO_ANSWER: "Без ответа",
      BUSY: "Занято",
      FAILED: "Ошибка",
    };
    return <Badge className={styles[status] || styles.ANSWERED}>{labels[status] || status}</Badge>;
  };

  const getDirectionLabel = (direction: string) => {
    const labels: Record<string, string> = {
      INCOMING: "Входящий",
      OUTGOING: "Исходящий",
      MISSED: "Пропущенный",
    };
    return labels[direction] || direction;
  };

  // Stats
  const totalCalls = calls.length;
  const answeredCalls = calls.filter((c: CallLog) => c.status === "ANSWERED").length;
  const missedCalls = calls.filter((c: CallLog) => c.direction === "MISSED").length;
  const totalDuration = calls.reduce((sum: number, c: CallLog) => sum + c.duration, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Звонки</h1>
          <p className="text-slate-500 dark:text-slate-400">
            История звонков и интеграция телефонии
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> Экспорт
          </Button>
          <Button>
            <Phone className="h-4 w-4 mr-2" /> Исходящий звонок
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Всего звонков</p>
                <p className="text-2xl font-bold">{totalCalls}</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Отвечено</p>
                <p className="text-2xl font-bold">{answeredCalls}</p>
              </div>
              <PhoneIncoming className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Пропущено</p>
                <p className="text-2xl font-bold">{missedCalls}</p>
              </div>
              <PhoneMissed className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Общее время</p>
                <p className="text-2xl font-bold">{formatDuration(totalDuration)}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Поиск по номеру или контакту..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Направление" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все направления</SelectItem>
            <SelectItem value="INCOMING">Входящие</SelectItem>
            <SelectItem value="OUTGOING">Исходящие</SelectItem>
            <SelectItem value="MISSED">Пропущенные</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="ANSWERED">Отвеченные</SelectItem>
            <SelectItem value="NO_ANSWER">Без ответа</SelectItem>
            <SelectItem value="BUSY">Занято</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Calls Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Загрузка...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Откуда</TableHead>
                  <TableHead>Куда</TableHead>
                  <TableHead>Дата и время</TableHead>
                  <TableHead>Длительность</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Оператор</TableHead>
                  <TableHead className="w-32">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call: CallLog) => (
                  <TableRow key={call.id}>
                    <TableCell>{getDirectionIcon(call.direction)}</TableCell>
                    <TableCell>
                      {call.contact ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                            {call.contact.firstName[0]}{call.contact.lastName[0]}
                          </div>
                          <div>
                            <div className="font-medium">
                              {call.contact.firstName} {call.contact.lastName}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">Неизвестный</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{call.from}</TableCell>
                    <TableCell className="font-mono text-sm">{call.to}</TableCell>
                    <TableCell>{formatDate(call.startTime)}</TableCell>
                    <TableCell>
                      {call.duration > 0 ? (
                        formatDuration(call.duration)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(call.status)}</TableCell>
                    <TableCell>
                      {call.user?.name || (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {call.recordingUrl ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setPlayingCallId(
                                playingCallId === call.id ? null : call.id
                              )
                            }
                          >
                            {playingCallId === call.id ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled
                          >
                            <Volume2 className="h-4 w-4 opacity-30" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Telephony Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Интеграция телефонии</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium">Sipuni</div>
                  <Badge variant="outline" className="text-xs">Подключен</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-500">Облачная АТС с записью звонков</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Phone className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium">Mango</div>
                  <Badge variant="outline" className="text-xs">Подключен</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-500">Виртуальная АТС с CRM</p>
            </div>
            <div className="p-4 border rounded-lg border-dashed">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <Settings className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <div className="font-medium">Добавить АТС</div>
                </div>
              </div>
              <p className="text-sm text-slate-500">Подключите другую АТС</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
