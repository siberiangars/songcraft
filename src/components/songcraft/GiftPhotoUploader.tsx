"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type GiftPhoto = {
  token: string;
  url: string;
  filename: string;
};

export function GiftPhotoUploader({
  initData,
  token,
  onChange,
}: {
  initData: string;
  token: string | null;
  onChange: (token: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<GiftPhoto | null>(() =>
    token
      ? {
          token,
          url: `/api/songcraft/media/${token}`,
          filename: "Фото для подарка",
        }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadFile = async (file?: File) => {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
      setError("Подойдет фото JPG, PNG или WEBP размером до 15 МБ.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "gift_cover_photo");
      const response = await fetch("/api/songcraft/uploads", {
        method: "POST",
        headers: { "x-telegram-init-data": initData },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось загрузить фото");
      }
      const next = { token: data.token, url: data.url, filename: data.filename };
      setItem(next);
      onChange(next.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = () => {
    setItem(null);
    onChange(null);
  };

  return (
    <div className="sc-gift-photo-uploader">
      <div className="sc-slideshow-heading">
        <span>
          <strong>Фото для подарка</strong>
          <small>Поставим его на обложку трека и красивую страницу для пересылки</small>
        </span>
        <b className={item ? "ready" : ""}>{item ? "Готово" : "Можно добавить"}</b>
      </div>

      {item ? (
        <div className="sc-gift-photo-preview">
          <img src={item.url} alt="Фото для обложки трека" />
          <span>
            <strong>Фото добавлено</strong>
            <small>{item.filename}</small>
          </span>
          <button type="button" onClick={remove} aria-label="Удалить фото">
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sc-slideshow-add"
          disabled={uploading || !initData}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <LoaderCircle className="sc-spin" size={19} /> : <ImagePlus size={19} />}
          {uploading ? "Загружаем фото" : "Загрузить 1 фото"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => uploadFile(event.target.files?.[0])}
      />
      <p className="sc-slideshow-hint">
        Лучше всего смотрится портрет или совместное фото без мелкого текста.
      </p>
      {error && <p className="sc-slideshow-warning">{error}</p>}
    </div>
  );
}
