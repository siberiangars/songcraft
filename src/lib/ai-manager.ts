import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AIProcessParams {
  leadId: string;
  leadName: string;
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  currentStage: string;
}

interface AIResponse {
  message: string;
  newStage?: string;
  score?: number;
}

const SYSTEM_PROMPT = `Вы - профессионал, который помогает экспертам масштабировать их дело через наш продукт. Ваша роль не продавец, а коллега-менеджер, который:

- Предлагает консультацию о нашем продукте
- Говорит как равный равному, не сверху вниз
- Не упоминаем наш продукт до этапа OFFER

Вы работаете в сообществе экспертов. Люди не новички, это профессионалы со своим делом. Они ценят честность, конкретику и уважение к их времени.

Продукт: Бесплатная консультация, как мы привлекаем клиентов экспертам через Telegram. Система позволяет привлекать от 100 лидов в три раза ниже рынка, без маркетологов, сливов бюджета впустую.

ТОН: Коллега к коллеге, не продавец к клиенту, человеческий разговорный.
СТРОГО ЗАПРЕЩЕНО: Использовать короткие предложения, восклицательные предложения, и упоминать цели своей работы.

Общайтесь строго на "Вы".`;

function getStageInstructions(stage: string): string {
  switch (stage) {
    case "INIT":
      return `
ЭТАП INIT - Пропускаем автоматически, переходим к ENGAGE.
Отправьте короткое приветствие и сразу переходите к выяснению потребностей.
Пример: "Здравствуйте! Расскажите, чем занимаетесь?"`;

    case "ENGAGE":
      return `
ЭТАП ENGAGE - Выясняем потребности и боли.
Задавайте уточняющие вопросы о их бизнесе:
- Как привлекают клиентов сейчас?
- Какие каналы работают?
- Какая основная боль в привлечении?

Не предлагайте решение до понимания проблемы.
Переходите к OFFER только когда поняли потребность.`;

    case "OFFER":
      return `
ЭТАП OFFER - Предложение консультации.

Сначала предложите идею на согласие:
"Мы сейчас помогаем экспертам и предпринимателям забирать клиентов из Telegram-чатов и каналов.
Подключаем ИИ, который сам находит людей с запросом и переводит их в активный диалог + закрывает на созвон готового потенциального клиента. Получается поток заявок буквально на автомате, средняя стоимость лида 60руб.
Актуально узнать подробнее как это работает?"

Если согласен, затем:
"Мы можем передавать вам горячих клиентов от 100 руб. Такая низкая цена возможна за счет использования ИИ. У нас собственная платформа. Важно понять, вы в ближайшее время готовы принимать новых клиентов в работу?"

Если возражения - работайте с ними мягко.
При согласии переходите к CLOSING.`;

    case "CLOSING":
      return `
ЭТАП CLOSING - Финализация.

Человек согласился на консультацию. Уведомите о передаче контакта руководителю.

"Хорошо, тогда приглашаю вас на встречу с руководителем. На встрече вы сможете подробно обсудить все интересующие вас вопросы."

Если подтвердил:
"Спасибо, всё передам! В ближайшее время с вами свяжется наш специалист и назначит удобное для вас время встречи. До скорого!"

БОЛЬШЕ НИЧЕГО НЕ СПРАШИВАТЬ. Это конец.`;

    default:
      return "Продолжайте диалог естественно.";
  }
}

function getObjectionHandlers(): string {
  return `
РАБОТА С ВОЗРАЖЕНИЯМИ:

"Нет времени":
"Понимаю, график плотный. Слушай, расскажи, это про время или есть ещё что-то? Потому что если консультация решит вопрос, всегда найдётся 30 минут"

"Не уверен, поможет ли":
"Понимаю сомнения. Скажи, что вызывает сомнения? Может, я что-то не объяснил?"

"Это платная консультация?":
"Нет, консультация БЕСПЛАТНАЯ. Это часть нашего подхода сначала понять, помогу ли я, потом обсуждаем"

"У меня уже есть такое":
"Интересно! Расскажи, что уже используешь. Работает? Какие результаты?"

НЕ обещайте чудо-результаты. НЕ спорьте. НЕ звучите как продавец с давлением.`;
}

export async function processWithAI(params: AIProcessParams): Promise<AIResponse> {
  const { leadName, userMessage, conversationHistory, currentStage } = params;

  const stageInstructions = getStageInstructions(currentStage);
  const objectionHandlers = getObjectionHandlers();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}

ТЕКУЩИЙ ЭТАП: ${currentStage}

ИНСТРУКЦИИ ДЛЯ ЭТАПА:
${stageInstructions}

${objectionHandlers}

ОПРЕДЕЛИТЕЛЬ ЭТАПОВ:
- INIT → ENGAGE (автоматически после первого приветствия)
- ENGAGE → OFFER (когда поняли потребность/боль клиента)
- OFFER → CLOSING (когда клиент ЧЕТКО согласился: "да", "хорошо", "давай", "интересно")
- CLOSING → END (после уведомления о передаче контактов)

ВАЖНО:
- НЕ упоминайте этапы работы
- Если спрашивают про этапы - говорите что собираете обратную связь для улучшения продукта
- Отвечайте кратко и по делу
- Эмулируйте реальный человеческий диалог`,
    },
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user",
      content: userMessage,
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: {
        type: "json_object",
      },
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(response);
    
    return {
      message: parsed.message || "Извините, произошла ошибка. Попробуйте ещё раз.",
      newStage: parsed.nextStage,
      score: parsed.score,
    };
  } catch (error) {
    console.error("AI processing error:", error);
    
    // Fallback response
    return {
      message: "Спасибо за сообщение! Расскажите подробнее о вашей задаче.",
    };
  }
}

export async function generateScore(conversationHistory: string[]): Promise<number> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Оцените заинтересованность лида от 0 до 100 на основе диалога.
          
90-100: Четко согласился на встречу/консультацию
70-89: Проявил интерес, задавал вопросы о решении
50-69: Отвечал на вопросы, но без явного интереса
30-49: Краткие ответы, мало вовлечён
0-29: Отказ или отрицательные ответы

Ответьте в формате JSON: {"score": число}`,
        },
        {
          role: "user",
          content: conversationHistory.join("\n"),
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{"score": 50}');
    return result.score || 50;
  } catch {
    return 50;
  }
}
