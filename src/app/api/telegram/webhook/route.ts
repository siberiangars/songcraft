import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { processWithAI } from "@/lib/ai-manager";
import { ProxyAgent } from "proxy-agent";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export async function POST(request: Request) {
  try {
    const body: TelegramUpdate = await request.json();
    
    if (!body.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const { message } = body;
    const chatId = message.chat.id;
    const userMessage = message.text || "";
    const firstName = message.chat.first_name || "";
    const lastName = message.chat.last_name || "";
    const username = message.chat.username || "";

    // Find or create lead
    let lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { telegramId: chatId.toString() },
          { phone: username },
        ],
      },
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!lead) {
      // Create new lead
      lead = await prisma.lead.create({
        data: {
          telegramId: chatId.toString(),
          name: `${firstName} ${lastName}`.trim() || username,
          phone: username ? `@${username}` : null,
          source: "TELEGRAM",
          status: "NEW",
          score: 50,
          metadata: JSON.stringify({
            firstName,
            lastName,
            username,
            chatId,
          }),
        },
        include: {
          conversations: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
    }

    // Get conversation history
    let conversation = lead.conversations[0];
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          leadId: lead.id,
          channel: "TELEGRAM",
          status: "ACTIVE",
        },
      });
    }

    // Save user message
    await prisma.message.create({
      data: {
        content: userMessage,
        direction: "INCOMING",
        channel: "TELEGRAM",
        status: "RECEIVED",
        from: chatId.toString(),
        to: TELEGRAM_BOT_TOKEN || "",
        conversationId: conversation.id,
        leadId: lead.id,
      },
    });

    // Get conversation history for AI context
    const messageHistory = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // Simple responses without AI for testing
    const responses = [
      "Привет! Расскажите, чем занимаетесь?",
      "Спасибо! Расскажите подробнее о вашем бизнесе?",
      "Интересно! Какие каналы привлечения клиентов вы используете?",
      "Понял. Сколько клиентов в месяц вы хотите привлекать?",
      "Отлично! Предлагаю обсудить это на бесплатной консультации.",
    ];
    
    // Get response based on message count
    const msgCount = messageHistory.filter(m => m.direction === "INCOMING").length;
    const aiResponse = {
      message: responses[Math.min(msgCount, responses.length - 1)],
      newStage: "ENGAGE",
      score: 60,
    };
    console.log("AI Response (simple):", aiResponse.message);

    // Save AI response
    await prisma.message.create({
      data: {
        content: aiResponse.message,
        direction: "OUTGOING",
        channel: "TELEGRAM",
        status: "SENT",
        from: TELEGRAM_BOT_TOKEN || "",
        to: chatId.toString(),
        conversationId: conversation.id,
        leadId: lead.id,
      },
    });

    // Update lead if stage changed
    if (aiResponse.newStage && aiResponse.newStage !== lead.stage) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: aiResponse.newStage,
          status: aiResponse.newStage === "CLOSING" ? "QUALIFIED" : lead.status,
          score: aiResponse.score || lead.score,
        },
      });

      // Create activity log
      await prisma.activity.create({
        data: {
          type: "LEAD_STAGE_CHANGED",
          description: `Лид перешёл на этап: ${aiResponse.newStage}`,
          metadata: JSON.stringify({
            from: lead.stage,
            to: aiResponse.newStage,
          }),
          leadId: lead.id,
        },
      });

      // Notify manager if lead is qualified
      if (aiResponse.newStage === "CLOSING") {
        await prisma.notification.create({
          data: {
            title: "Новый квалифицированный лид!",
            message: `${lead.name} согласился на консультацию`,
            type: "SUCCESS",
            link: `/leads/${lead.id}`,
            userId: lead.ownerId || "",
          },
        });
      }
    }

    // Send response to Telegram via proxy
    console.log("Sending to Telegram:", chatId, aiResponse.message);
    
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
      const agent = new ProxyAgent();
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponse.message
        }),
        agent
      } as RequestInit & { agent: ProxyAgent });
      console.log("Telegram response:", response.status);
    } catch(e) {
      console.log("Telegram send error:", e);
    }

    return NextResponse.json({ ok: true, message: aiResponse.message });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  console.log("sendTelegramMessage called with:", chatId, TELEGRAM_BOT_TOKEN?.slice(0, 10));
  
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    console.log("Sending request to:", url);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    
    const result = await response.text();
    console.log("Telegram response:", result);
  } catch (error) {
    console.error("Error sending to Telegram:", error);
  }
}

export async function GET() {
  // Health check
  return NextResponse.json({ status: "ok", service: "telegram-webhook" });
}
