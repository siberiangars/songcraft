"use client";

import { GENRES } from "@/lib/songcraft/config";

interface GenreSelectorProps {
  value: string;
  onChange: (genre: string) => void;
}

export function GenreSelector({ value, onChange }: GenreSelectorProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "10px",
      }}
    >
      {GENRES.map((genre) => (
        <button
          key={genre.id}
          className={`sc-chip ${value === genre.id ? "selected" : ""}`}
          onClick={() => onChange(genre.id)}
          style={{ padding: "12px 8px" }}
        >
          <div style={{ fontSize: "22px", marginBottom: "4px" }}>{genre.emoji}</div>
          <div style={{ fontSize: "11px", lineHeight: 1.2 }}>{genre.label}</div>
        </button>
      ))}
    </div>
  );
}
