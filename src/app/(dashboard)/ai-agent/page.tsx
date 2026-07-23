"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Bot,
  Send,
  User,
  Phone,
  MessageSquare,
  Zap,
  Settings,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart,
  MessageCircle,
  Hash,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegramId: string | null;
  source: string;
  status: string;
  stage: string;
  score: number;
  notes: string | null;
  _count: { messages: number; conversations: number };
  createdAt: string;
}

interface Conversation {
  id: string;
  leadId: string;
  leadName: string;
  status: string;
  startedAt: string;
  messages: Message[];
  temperature: string;
}

const agentScenarios = [
  {
    id: "greeting",
    name: "Приветствие",
    description: "Знакомство с новым лидом",
    message: "Здравствуйте! Меня зовут Алекс, я представляю компанию CRM Solutions. Мы помогаем бизнесу автоматизировать продажи и увеличивать конверсию на 40%. Подскажите, вы рассматриваете решения для автоматизации?",
    quickReplies: ["Да", "Нет", "Расскажите подробнее"],
  },
  {
    id: "qualification",
    name: "Квалификация",
    description: "Определение потребностей",
    message: "Отлично! Расскажите, пожалуйста, какой у вас сейчас процесс работы с клиентами?",
    quickReplies: ["Ручной", "Частично автоматизирован", "Полностью автоматизирован"],
  },
  {
    id: "warmup",
    name: "Прогрев",
    description: "Удержание интереса",
    message: "Понимаю вашу ситуацию. Многие наши клиенты начинали так же. После внедрения нашей CRM они увеличили конверсию на 35%.",
    quickReplies: ["Интересно", "Это дорого", "У меня уже есть CRM"],
  },
  {
    id: "offer",
    name: "Предложение",
    description: "Предложение консультации",
    message: "Мы можем передавать вам горячих клиентов от 100 руб. Такая низкая цена возможна за счет использования ИИ.",
    quickReplies: ["Да, интересно", "Нет, дорого", "Пока думаю"],
  },
  {
    id: "closing",
    name: "Закрытие",
    description: "Предложение созвона",
    message: "Предлагаю назначить онлайн-встречу. Когда вам будет удобно?",
    quickReplies: ["Завтра", "На этой неделе", "Перезвоните мне"],
  },
];

// Mock leads for initial display when API is empty
const mockLeads: Lead[] = [
  { id: "1", name: "Иван Петров", phone: "+7 999 123-45-67", email: "ivan@mail.ru", telegramId: null, source: "WEBSITE", status: "NEW", stage: "INIT", score: 85, notes: null, _count: { messages: 3, conversations: 1 }, createdAt: "2026-03-29T10:00:00" },
  { id: "2", name: "Мария Сидорова", phone: "+7 999 234-56-78", email: "maria@company.ru", telegramId: null, source: "PHONE", status: "CONTACTED", stage: "ENGAGE", score: 72, notes: null, _count: { messages: 5, conversations: 1 }, createdAt: "2026-03-28T10:00:00" },
  { id: "3", name: "Алексей Козлов", phone: "+7 999 345-67-89", email: null, telegramId: "alexkozlov", source: "TELEGRAM", status: "QUALIFIED", stage: "OFFER", score: 90, notes: null, _count: { messages: 8, conversations: 2 }, createdAt: "2026-03-29T09:00:00" },
  { id: "4", name: "Елена Новикова", phone: "+7 999 456-78-90", email: "elena@startup.io", telegramId: null, source: "WHATSAPP", status: "WARM", stage: "ENGAGE", score: 65, notes: null, _count: { messages: 2, conversations: 1 }, createdAt: "2026-03-27T10:00:00" },
];

export default function AIAgentPage() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"active" | "paused">("active");
  const [autoResponse, setAutoResponse] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch leads from API
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        "Спасибо за сообщение! Расскажите подробнее о вашей задаче.",
        "Понял вас! Это частая ситуация. Наши клиенты решают такие проблемы за считанные дни.",
        "Отличный вопрос! Давайте разберём детально.",
        "Интересно! А какой у вас сейчас процесс работы с клиентами?",
        "Представлю вам несколько вариантов решения...",
      ];
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleScenarioClick = (scenario: typeof agentScenarios[0]) => {
    handleSendMessage(scenario.message);
  };

  const getStageBadge = (stage: string) => {
    const styles: Record<string, string> = {
      INIT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      ENGAGE: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      OFFER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      CLOSING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      END: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    };
    const labels: Record<string, string> = {
      INIT: "Знакомство",
      ENGAGE: "Выяснение",
      OFFER: "Предложение",
      CLOSING: "Закрытие",
      END: "Завершён",
    };
    return <Badge className={styles[stage] || styles.INIT}>{labels[stage] || stage}</Badge>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ИИ Агент</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Автоматический прогрев и квалификация лидов
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${agentStatus === "active" ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className="text-sm font-medium">
              {agentStatus === "active" ? "Активен" : "На паузе"}
            </span>
          </div>
          <Button
            variant={agentStatus === "active" ? "outline" : "default"}
            size="sm"
            onClick={() => setAgentStatus(agentStatus === "active" ? "paused" : "active")}
          >
            {agentStatus === "active" ? (
              <><Pause className="h-4 w-4 mr-2" /> Пауза</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Запустить</>
            )}
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" /> Настройки
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Лидов в работе</p>
                <p className="text-2xl font-bold">
                  {leads.filter((l: Lead) => l.status !== "CONVERTED" && l.status !== "LOST").length}
                </p>
              </div>
              <User className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Новых сегодня</p>
                <p className="text-2xl font-bold">
                  {leads.filter((l: Lead) => {
                    const today = new Date().toDateString();
                    return new Date(l.createdAt).toDateString() === today;
                  }).length}
                </p>
              </div>
              <MessageSquare className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">На этапе OFFER</p>
                <p className="text-2xl font-bold">
                  {leads.filter((l: Lead) => l.stage === "OFFER").length}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Квалифицированы</p>
                <p className="text-2xl font-bold">
                  {leads.filter((l: Lead) => l.stage === "CLOSING" || l.status === "QUALIFIED").length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Leads List */}
        <Card className="col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Активные лиды</CardTitle>
                <CardDescription>Лиды для прогрева</CardDescription>
              </div>
              <Button size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-8 text-slate-500">Загрузка...</div>
            ) : leads.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Лидов пока нет</p>
                <p className="text-sm">Подключите Telegram бота</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                {leads.map((lead: Lead) => (
                  <div
                    key={lead.id}
                    onClick={() => {
                      setSelectedLead(lead);
                      setMessages([]);
                    }}
                    className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      selectedLead?.id === lead.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{lead.name}</span>
                      <span className={`text-sm font-bold ${getScoreColor(lead.score)}`}>
                        {lead.score}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      {getStageBadge(lead.stage)}
                      <span>{lead._count?.messages || 0} сообщ.</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      {lead.source === "TELEGRAM" && <MessageCircle className="h-3 w-3" />}
                      {lead.source === "WHATSAPP" && <MessageSquare className="h-3 w-3" />}
                      {lead.phone || lead.telegramId || "Нет контакта"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Window */}
        <Card className="col-span-2">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {selectedLead ? `Чат с ${selectedLead.name}` : "Выберите лида"}
                </CardTitle>
                {selectedLead && (
                  <CardDescription>
                    Источник: {selectedLead.source} | Этап: {selectedLead.stage}
                  </CardDescription>
                )}
              </div>
              {selectedLead && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Phone className="h-4 w-4 mr-2" /> Позвонить
                  </Button>
                  <Button size="sm">
                    <User className="h-4 w-4 mr-2" /> Профиль
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          
          {/* Messages */}
          <CardContent className="h-96 overflow-y-auto p-4">
            {!selectedLead ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Выберите лида для начала общения</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Начните диалог с лида</p>
                  <p className="text-sm">Используйте сценарии ниже</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        message.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className={`text-xs mt-1 ${message.role === "user" ? "text-blue-100" : "text-slate-400"}`}>
                        {message.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </CardContent>

          {/* Quick Replies */}
          {selectedLead && messages.length > 0 && (
            <div className="border-t p-3 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 mb-2">Быстрые ответы:</p>
              <div className="flex flex-wrap gap-2">
                {agentScenarios[Math.min(Math.floor(messages.length / 2), agentScenarios.length - 1)]?.quickReplies?.map((reply, idx) => (
                  <Button
                    key={idx}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSendMessage(reply)}
                    className="text-xs h-7"
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Scenarios */}
          {selectedLead && (
            <div className="border-t p-3">
              <p className="text-xs text-slate-500 mb-2">Сценарии:</p>
              <div className="flex flex-wrap gap-2">
                {agentScenarios.map((scenario) => (
                  <Button
                    key={scenario.id}
                    variant="outline"
                    size="sm"
                    onClick={() => handleScenarioClick(scenario)}
                    className="text-xs"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    {scenario.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder={selectedLead ? "Введите сообщение..." : "Выберите лида"}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleSendMessage(inputMessage);
                  }
                }}
                disabled={!selectedLead}
              />
              <Button
                onClick={() => handleSendMessage(inputMessage)}
                disabled={!selectedLead || !inputMessage.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoResponse"
                  checked={autoResponse}
                  onChange={(e) => setAutoResponse(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="autoResponse" className="text-sm text-slate-500">
                  Автоматические ответы
                </label>
              </div>
              <div className="text-xs text-slate-400">
                AIPowered by GPT-4
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
