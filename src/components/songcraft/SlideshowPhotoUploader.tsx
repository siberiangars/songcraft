"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PhotoItem = {
  token: string;
  url: string;
  filename: string;
};

export function SlideshowPhotoUploader({
  initData,
  tokens,
  onChange,
}: {
  initData: string;
  tokens: string[];
  onChange: (tokens: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PhotoItem[]>(() =>
    tokens.map((token, index) => ({
      token,
      url: `/api/songcraft/media/${token}`,
      filename: `Фото ${index + 1}`,
    })),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadFiles = async (files: File[]) => {
    const available = MAX_PHOTOS - items.length;
    const selected = files.slice(0, available);
    if (!selected.length) return;

    const invalid = selected.find(
      (file) => !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES,
    );
    if (invalid) {
      setError("Подойдут фотографии JPG, PNG или WEBP размером до 15 МБ.");
      return;
    }

    setUploading(true);
    setError("");
    const uploaded: PhotoItem[] = [];
    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", "slideshow_photo");
        const response = await fetch("/api/songcraft/uploads", {
          method: "POST",
          headers: { "x-telegram-init-data": initData },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Не удалось загрузить фотографию");
        }
        uploaded.push({ token: data.token, url: data.url, filename: data.filename });
      }
      const nextItems = [...items, ...uploaded];
      setItems(nextItems);
      onChange(nextItems.map((item) => item.token));
    } catch (cause) {
      if (uploaded.length) {
        const nextItems = [...items, ...uploaded];
        setItems(nextItems);
        onChange(nextItems.map((item) => item.token));
      }
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить фотографии");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (token: string) => {
    const nextItems = items.filter((item) => item.token !== token);
    setItems(nextItems);
    onChange(nextItems.map((item) => item.token));
  };

  return (
    <div className="sc-slideshow-uploader">
      <div className="sc-slideshow-heading">
        <span>
          <strong>Фотографии для видео</strong>
          <small>От 3 до 12 снимков в нужном порядке</small>
        </span>
        <b className={items.length >= MIN_PHOTOS ? "ready" : ""}>{items.length}/{MAX_PHOTOS}</b>
      </div>

      {items.length > 0 && (
        <div className="sc-slideshow-grid">
          {items.map((item, index) => (
            <div className="sc-slideshow-photo" key={item.token}>
              {/* User-owned media is served by the authenticated SongCraft media route. */}
              <img src={item.url} alt={`Фото ${index + 1}`} />
              <span>{index + 1}</span>
              <button type="button" onClick={() => remove(item.token)} aria-label={`Удалить фото ${index + 1}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length < MAX_PHOTOS && (
        <button
          type="button"
          className="sc-slideshow-add"
          disabled={uploading || !initData}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <LoaderCircle className="sc-spin" size={19} /> : <ImagePlus size={19} />}
          {uploading ? "Загружаем фотографии" : items.length ? "Добавить ещё фото" : "Выбрать фотографии"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => uploadFiles(Array.from(event.target.files ?? []))}
      />
      <p className="sc-slideshow-hint">
        Лучше всего подойдут живые фото с человеком, общие воспоминания и 1–2 портрета.
      </p>
      {items.length > 0 && items.length < MIN_PHOTOS && (
        <p className="sc-slideshow-warning">Добавьте ещё {MIN_PHOTOS - items.length} фото.</p>
      )}
      {error && <p className="sc-slideshow-warning">{error}</p>}
    </div>
  );
}

export const SLIDESHOW_MIN_PHOTOS = MIN_PHOTOS;
