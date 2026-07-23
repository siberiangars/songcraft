"use client";

import { create } from "zustand";
import { OCCASIONS, GENRES, MOODS, PlanType } from "@/lib/songcraft/config";

export type OccasionId = (typeof OCCASIONS)[number]["id"];
export type GenreId = (typeof GENRES)[number]["id"];
export type MoodId = (typeof MOODS)[number]["id"];

export interface OrderDraft {
  occasion: OccasionId | "";
  genre: GenreId | "";
  mood: MoodId | "";
  voiceType: "female" | "male";
  tempo: "slow" | "medium" | "fast";
  userText: string;
  recipientName: string;
  style: string;
  language: "ru" | "en" | "both";
  plan: PlanType | "";
}

interface OrderStore {
  step: number;
  draft: OrderDraft;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateDraft: (patch: Partial<OrderDraft>) => void;
  resetDraft: () => void;
}

const INITIAL_DRAFT: OrderDraft = {
  occasion: "",
  genre: "",
  mood: "",
  voiceType: "female",
  tempo: "medium",
  userText: "",
  recipientName: "",
  style: "",
  language: "ru",
  plan: "",
};

export const useOrderStore = create<OrderStore>((set) => ({
  step: 0,
  draft: { ...INITIAL_DRAFT },

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: s.step + 1 })),
  prevStep: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  resetDraft: () => set({ step: 0, draft: { ...INITIAL_DRAFT } }),
}));
