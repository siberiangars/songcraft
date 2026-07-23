"use client";

import { useState, useRef, useEffect } from "react";
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
  MessageSquare,
  Send,
  Search,
  Phone,
  Mail,
  MessageCircle,
  Hash,
  Check,
  CheckCheck,
  Paperclip,
  Image,
  MoreVertical,
  Star,
  Archive,
  Trash2,
  User,
} from "lucide-react";

interface Message {
  id: string;
  content: string;
  direction: "INCOMING" | "OUTGOING";
  channel: "SMS" | "EMAIL" | "WHATSAPP" | "TELEGRAM";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  from: string;
  to: string;
  subject?: string;
  createdAt: string;
  readAt?: string;
}

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar?: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP" | "TELEGRAM";
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  messages: Message[];
}

const mockConversations: Conversation[] = [
  {
    id: "1",
    contactId: "c1",
    contactName: "Иван Петров",
    contactPhone: "+7 999 123-45-67",
    channel: "WHATSAPP",
    lastMessage: "Добрый день! Да, мне интересно.",
    lastMessageTime: "2026-03-29T15:30:00",
    unread: 2,
    messages: [
      { id: "m1", content: "Здравствуйте! Хотел узнать о вашей CRM системе.", direction: "INCOMING", channel: "WHATSAPP", status: "READ", from: "+7 999 123-45-67", to: "+7 495 123-45-67", createdAt: "2026-03-29T15:25:00" },
      { id: "m2", content: "Добрый день! Конечно, расскажу подробнее. Какие задачи нужно решить?", direction: "OUTGOING", channel: "WHATSAPP", status: "READ", from: "+7 495 123-45-67", to: "+7 999 123-45-67", createdAt: "2026-03-29T15:26:00" },
      { id: "m3", content: "Нужно автоматизировать продажи и учет клиентов.", direction: "INCOMING", channel: "WHATSAPP", status: "READ", from: "+7 999 123-45-67", to: "+7 495 123-45-67", createdAt: "2026-03-29T15:28:00" },
      { id: "m4", content: "Добрый день! Да, мне интересно.", direction: "INCOMING", channel: "WHATSAPP", status: "DELIVERED", from: "+7 999 123-45-67", to: "+7 495 123-45-67", createdAt: "2026-03-29T15:30:00" },
    ],
  },
  {
    id: "2",
    contactId: "c2",
    contactName: "Мария Сидорова",
    contactPhone: "maria@company.ru",
    channel: "EMAIL",
    lastMessage: "Отправила вам коммерческое предложение",
    lastMessageTime: "2026-03-29T14:00:00",
    unread: 1,
    messages: [
      { id: "m5", content: "Здравствуйте! Прошу выслать коммерческое предложение.", direction: "INCOMING", channel: "EMAIL", status: "READ", from: "maria@company.ru", to: "sales@crm.ru", subject: "Запрос КП", createdAt: "2026-03-29T13:00:00" },
      { id: "m6", content: "Добрый день! Отправила вам коммерческое предложение", direction: "OUTGOING", channel: "EMAIL", status: "DELIVERED", from: "sales@crm.ru", to: "maria@company.ru", subject: "RE: Запрос КП", createdAt: "2026-03-29T14:00:00" },
    ],
  },
  {
    id: "3",
    contactId: "c3",
    contactName: "Алексей Козлов",
    contactPhone: "+7 999 345-67-89",
    channel: "TELEGRAM",
    lastMessage: "Отлично, жду звонка!",
    lastMessageTime: "2026-03-29T12:00:00",
    unread: 0,
    messages: [
      { id: "m7", content: "Привет! Вижу вы заинтересовались нашей CRM.", direction: "OUTGOING", channel: "TELEGRAM", status: "READ", from: "crm_bot", to: "@alexkozlov", createdAt: "2026-03-29T11:55:00" },
      { id: "m8", content: "Отлично, жду звонка!", direction: "INCOMING", channel: "TELEGRAM", status: "READ", from: "@alexkozlov", to: "crm_bot", createdAt: "2026-03-29T12:00:00" },
    ],
  },
  {
    id: "4",
    contactId: "c4",
    contactName: "Елена Новикова",
    contactPhone: "+7 999 456-78-90",
    channel: "SMS",
    lastMessage: "Напоминаем о встрече завтра в 10:00",
    lastMessageTime: "2026-03-29T09:00:00",
    unread: 0,
    messages: [
      { id: "m9", content: "Напоминаем о встрече завтра в 10:00", direction: "OUTGOING", channel: "SMS", status: "DELIVERED", from: "+7 495 123-45-67", to: "+7 999 456-78-90", createdAt: "2026-03-29T09:00:00" },
    ],
  },
];

export default function MessagesPage() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (selectedConversation) {
      scrollToBottom();
    }
  }, [selectedConversation]);

  const filteredConversations = mockConversations.filter((conv) => {
    const matchesSearch =
      conv.contactName.toLowerCase().includes(search.toLowerCase()) ||
      conv.contactPhone.includes(search) ||
      conv.lastMessage.toLowerCase().includes(search.toLowerCase());
    
    const matchesChannel = channelFilter === "all" || conv.channel === channelFilter;
    
    return matchesSearch && matchesChannel;
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    // In real app, this would send the message
    setNewMessage("");
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "WHATSAPP":
        return <MessageCircle className="h-4 w-4 text-green-500" />;
      case "TELEGRAM":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "EMAIL":
        return <Mail className="h-4 w-4 text-purple-500" />;
      case "SMS":
        return <MessageSquare className="h-4 w-4 text-orange-500" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getChannelLabel = (channel: string) => {
    const labels: Record<string, string> = {
      WHATSAPP: "WhatsApp",
      TELEGRAM: "Telegram",
      EMAIL: "Email",
      SMS: "SMS",
    };
    return labels[channel] || channel;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SENT":
        return <Check className="h-3 w-3 text-slate-400" />;
      case "DELIVERED":
        return <CheckCheck className="h-3 w-3 text-slate-400" />;
      case "READ":
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case "FAILED":
        return <span className="text-red-500 text-xs">!</span>;
      default:
        return null;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Вчера";
    } else if (days < 7) {
      return date.toLocaleDateString("ru-RU", { weekday: "short" });
    } else {
      return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Сообщения</h1>
          <p className="text-slate-500 dark:text-slate-400">
            WhatsApp, Telegram, Email, SMS в одном месте
          </p>
        </div>
        <Button>
          <Send className="h-4 w-4 mr-2" /> Новое сообщение
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-6 h-[calc(100%-80px)]">
        {/* Conversations List */}
        <div className="col-span-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          {/* Search and Filter */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Поиск..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Канал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все каналы</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="TELEGRAM">Telegram</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-4 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                  selectedConversation?.id === conv.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                      {conv.contactName.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="absolute -bottom-1 -right-1">
                      {getChannelIcon(conv.channel)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{conv.contactName}</span>
                      <span className="text-xs text-slate-400">
                        {formatTime(conv.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm text-slate-500 truncate">
                        {conv.lastMessage}
                      </p>
                      {conv.unread > 0 && (
                        <Badge className="ml-2 bg-blue-500 text-white">
                          {conv.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Window */}
        <div className="col-span-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                    {selectedConversation.contactName.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-medium">{selectedConversation.contactName}</div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      {getChannelIcon(selectedConversation.channel)}
                      <span>{selectedConversation.contactPhone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <User className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Star className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === "OUTGOING" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        message.direction === "OUTGOING"
                          ? "bg-blue-500 text-white"
                          : "bg-slate-100 dark:bg-slate-700"
                      }`}
                    >
                      {message.subject && (
                        <div className={`text-sm font-medium mb-1 ${message.direction === "OUTGOING" ? "text-blue-100" : "text-slate-600 dark:text-slate-300"}`}>
                          {message.subject}
                        </div>
                      )}
                      <p>{message.content}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 text-xs ${message.direction === "OUTGOING" ? "text-blue-100" : "text-slate-400"}`}>
                        <span>{formatMessageTime(message.createdAt)}</span>
                        {message.direction === "OUTGOING" && getStatusIcon(message.status)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Image className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder="Введите сообщение..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleSendMessage();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Выберите диалог</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
