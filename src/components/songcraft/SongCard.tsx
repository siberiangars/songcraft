"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle, Music2, Trash2, X } from "lucide-react";
import Image from "next/image";

interface Order {
  id: number;
  status: string;
  plan: string;
  recipientName: string;
  occasion: string;
  genre: string;
  createdAt: string;
  song?: {
    id: number;
    title: string;
    audioUrl: string;
    imageUrl?: string | null;
    duration?: number | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачен",
  PROCESSING: "В обработке",
  ENHANCING: "Улучшаем текст",
  GENERATING: "Пишем трек",
  COMPLETED: "Готов",
  FAILED: "Ошибка",
  REFUNDED: "Возврат",
  REFUNDING: "Возвращаем оплату",
};

export function SongCard({
  order,
  onClick,
  onDelete,
}: {
  order: Order;
  onClick?: () => void;
  onDelete?: (orderId: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const date = new Date(order.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const title = order.song?.title || (order.recipientName ? `Для ${order.recipientName}` : `Трек #${order.id}`);
  const statusClass = order.status === "COMPLETED" ? "success" : order.status === "FAILED" ? "error" : "working";
  const canDelete = !["PAID", "PROCESSING", "ENHANCING", "GENERATING", "REFUNDING"].includes(order.status);

  const remove = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(order.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className={`sc-song-row${confirming ? " confirming" : ""}`}>
      <button className="sc-song-open" onClick={onClick} disabled={!onClick || deleting}>
        <span className="sc-song-cover">
          {order.song?.imageUrl ? (
            <Image src={order.song.imageUrl} alt="" fill sizes="48px" unoptimized />
          ) : (
            <Music2 size={20} />
          )}
        </span>
        <span className="sc-song-copy">
          <strong>{title}</strong>
          <small>{order.genre || "Без жанра"} · {date}</small>
          <em className={statusClass}>{STATUS_LABEL[order.status] ?? order.status}</em>
        </span>
        {onClick && <ArrowRight size={17} />}
      </button>

      {canDelete && onDelete && (confirming ? (
        <span className="sc-song-delete-confirm">
          <button onClick={() => setConfirming(false)} aria-label="Отмена">
            <X size={16} />
          </button>
          <button className="danger" onClick={remove} disabled={deleting} aria-label="Удалить">
            {deleting ? <LoaderCircle className="sc-spin" size={16} /> : <Trash2 size={16} />}
            <span>Удалить</span>
          </button>
        </span>
      ) : (
        <button className="sc-song-delete" onClick={() => setConfirming(true)} aria-label="Удалить попытку">
          <Trash2 size={16} />
        </button>
      ))}
    </article>
  );
}
