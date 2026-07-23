"use client";

interface Step {
  id: string;
  title: string;
  icon: string;
}

interface StepWizardProps {
  steps: Step[];
  currentStep: number;
}

export function StepWizard({ steps, currentStep }: StepWizardProps) {
  return (
    <div style={{ padding: "16px 20px 0" }}>
      {/* Progress bar */}
      <div className="sc-progress" style={{ marginBottom: "12px" }}>
        <div
          className="sc-progress-bar"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              opacity: i <= currentStep ? 1 : 0.3,
              transition: "opacity 0.3s ease",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: i < currentStep
                  ? "linear-gradient(135deg, #C9A84C, #E8C96A)"
                  : i === currentStep
                    ? "rgba(201, 168, 76, 0.2)"
                    : "var(--sc-bg-elevated)",
                border: i === currentStep ? "1.5px solid #C9A84C" : "1.5px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                color: i < currentStep ? "#1A1200" : "var(--sc-text-primary)",
                transition: "all 0.3s ease",
              }}
            >
              {i < currentStep ? "✓" : step.icon}
            </div>
            <span
              style={{
                fontSize: "10px",
                color: i === currentStep ? "var(--sc-gold)" : "var(--sc-text-muted)",
                fontWeight: i === currentStep ? 600 : 400,
                textAlign: "center",
              }}
            >
              {step.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
