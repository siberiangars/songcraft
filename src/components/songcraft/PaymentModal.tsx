"use client";

import { PRICING, PlanType } from "@/lib/songcraft/config";
import { useOrderStore } from "@/store/orderStore";

interface PaymentModalProps {
  onSelect: (plan: PlanType) => void;
}

export function PaymentModal({ onSelect }: PaymentModalProps) {
  const { draft, updateDraft } = useOrderStore((s) => ({
    draft: s.draft,
    updateDraft: s.updateDraft,
  }));

  const plans = Object.entries(PRICING) as [PlanType, (typeof PRICING)[PlanType]][];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {plans.map(([key, plan]) => {
        const isPopular = "popular" in plan && plan.popular;
        const isSelected = draft.plan === key;

        return (
          <div
            key={key}
            className={`sc-plan-card ${isPopular ? "popular" : ""} ${isSelected ? "selected" : ""}`}
            onClick={() => updateDraft({ plan: key })}
          >
            {isPopular && <div className="sc-popular-badge">✨ Популярный</div>}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: isSelected ? "var(--sc-gold-light)" : "var(--sc-text-primary)",
                    margin: "0 0 4px",
                  }}
                >
                  {plan.name}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--sc-text-secondary)", margin: 0 }}>
                  {plan.description}
                </p>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                <div
                  className={isSelected ? "sc-gradient-text" : ""}
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: isSelected ? undefined : "var(--sc-text-primary)",
                  }}
                >
                  {plan.price} ₽
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {plan.features.map((feature) => (
                <div
                  key={feature}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "var(--sc-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--sc-success)" }}>✓</span>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button
        className="sc-btn-primary"
        disabled={!draft.plan}
        onClick={() => draft.plan && onSelect(draft.plan as PlanType)}
        style={{ marginTop: "8px" }}
      >
        {draft.plan ? `Оплатить ${PRICING[draft.plan as PlanType].price} ₽ по СБП` : "Выберите тариф"}
      </button>
    </div>
  );
}
