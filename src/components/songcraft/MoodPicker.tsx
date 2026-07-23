"use client";

import { MOODS } from "@/lib/songcraft/config";

interface MoodPickerProps {
  value: string;
  onChange: (mood: string) => void;
}

const TEMPOS = [
  { id: "slow", label: "Медленно", emoji: "🐢" },
  { id: "medium", label: "Среднее", emoji: "🚶" },
  { id: "fast", label: "Быстро", emoji: "🏃" },
] as const;

interface MoodPickerWithTempoProps extends MoodPickerProps {
  tempo: string;
  onTempoChange: (tempo: string) => void;
}

export function MoodPicker({ value, onChange, tempo, onTempoChange }: MoodPickerWithTempoProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Mood */}
      <div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--sc-text-secondary)",
            marginBottom: "10px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Настроение
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {MOODS.map((mood) => (
            <button
              key={mood.id}
              className={`sc-chip ${value === mood.id ? "selected" : ""}`}
              onClick={() => onChange(mood.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                textAlign: "left",
                padding: "14px 16px",
              }}
            >
              <span style={{ fontSize: "22px" }}>{mood.emoji}</span>
              <span style={{ fontSize: "15px" }}>{mood.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tempo */}
      <div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--sc-text-secondary)",
            marginBottom: "10px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Темп
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {TEMPOS.map((t) => (
            <button
              key={t.id}
              className={`sc-chip ${tempo === t.id ? "selected" : ""}`}
              onClick={() => onTempoChange(t.id)}
            >
              <div style={{ fontSize: "20px", marginBottom: "4px" }}>{t.emoji}</div>
              <div style={{ fontSize: "12px" }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
