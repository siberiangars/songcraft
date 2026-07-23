"use client";

import { useEffect, useState } from "react";
import { Library, LoaderCircle, Plus } from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";
import { useOrder } from "@/hooks/useOrder";
import { SongCard } from "@/components/songcraft/SongCard";

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

export default function MySongsPage() {
  const { tg, isReady, initData, supportsBackButton } = useTelegram();
  const { fetchOrders, deleteOrder } = useOrder();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => { window.location.href = "/songcraft"; };
    tg?.BackButton.show();
    tg?.BackButton.onClick(onBack);
    return () => {
      tg?.BackButton.offClick(onBack);
      tg?.BackButton.hide();
    };
  }, [supportsBackButton, tg]);

  useEffect(() => {
    if (!isReady || !initData) return;
    let active = true;
    fetchOrders()
      .then((data) => { if (active) setOrders(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchOrders, initData, isReady]);

  const removeOrder = async (orderId: number) => {
    setDeleteError("");
    try {
      await deleteOrder(orderId);
      setOrders((current) => current.filter((order) => order.id !== orderId));
      tg?.HapticFeedback?.notificationOccurred("success");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Не удалось удалить попытку");
      tg?.HapticFeedback?.notificationOccurred("error");
    }
  };

  return (
    <div className="sc-shell sc-list-page">
      <div className="sc-page-heading">
        <div><span className="sc-kicker">Библиотека</span><h1>Мои треки</h1></div>
        <button className="sc-icon-button" onClick={() => { window.location.href = "/songcraft/create"; }} aria-label="Создать трек">
          <Plus size={20} />
        </button>
      </div>
      <p className="sc-page-lead">Все заказы, версии и готовые аудиофайлы.</p>
      {deleteError && <div className="sc-error-banner">{deleteError}</div>}

      {loading && initData ? (
        <div className="sc-empty-state">
          <LoaderCircle className="sc-spin" size={26} />
          <span>Загружаем библиотеку</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="sc-empty-state">
          <span className="sc-empty-icon"><Library size={25} /></span>
          <strong>Здесь появятся ваши треки</strong>
          <p>Создайте первый проект. Статус и готовые версии сохранятся в этой вкладке.</p>
          <button className="sc-btn-primary" onClick={() => { window.location.href = "/songcraft/create"; }}>
            <Plus size={17} /> Создать трек
          </button>
        </div>
      ) : (
        <div className="sc-song-list">
          {orders.map((order) => (
            <SongCard
              key={order.id}
              order={order}
              onClick={() => { window.location.href = `/songcraft/order/${order.id}`; }}
              onDelete={removeOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
