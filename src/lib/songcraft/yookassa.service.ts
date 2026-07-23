import {
  YOOKASSA_RECEIPT_EMAIL,
  YOOKASSA_SECRET_KEY,
  YOOKASSA_SHOP_ID,
} from "./config";
import { logger } from "./logger";

interface CreateSbpPaymentInput {
  amountKopeks: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}

interface YooKassaCreateResponse {
  id?: string;
  confirmation?: { confirmation_url?: string };
  description?: string;
}

export async function createSbpPayment(input: CreateSbpPaymentInput) {
  if (!Number.isSafeInteger(input.amountKopeks) || input.amountKopeks <= 0) {
    throw new Error("Некорректная сумма платежа");
  }

  const shopId = YOOKASSA_SHOP_ID();
  const secretKey = YOOKASSA_SECRET_KEY();
  if (!shopId || !secretKey) {
    throw new Error("ЮKassa не настроена");
  }

  const amountValue = (input.amountKopeks / 100).toFixed(2);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "Idempotence-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: amountValue, currency: "RUB" },
      capture: true,
      payment_method_data: { type: "sbp" },
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: input.metadata,
      receipt: {
        customer: { email: YOOKASSA_RECEIPT_EMAIL() },
        items: [
          {
            description: input.description,
            quantity: "1.00",
            amount: { value: amountValue, currency: "RUB" },
            vat_code: 1,
            payment_mode: "full_payment",
            payment_subject: "service",
          },
        ],
      },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as YooKassaCreateResponse;
  if (!response.ok) {
    logger.error("YooKassa create payment failed", { status: response.status, body });
    throw new Error("Не удалось создать платёж в ЮKassa");
  }

  const paymentId = body.id;
  const confirmationUrl = body.confirmation?.confirmation_url;
  if (!paymentId || !confirmationUrl) {
    logger.error("YooKassa payment response is incomplete", { body });
    throw new Error("ЮKassa не вернула ссылку на оплату");
  }

  const parsedUrl = new URL(confirmationUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("ЮKassa вернула небезопасную ссылку на оплату");
  }

  return { paymentId, confirmationUrl };
}
