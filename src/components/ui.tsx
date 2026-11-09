import type { ComponentProps } from "react";

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="auth-bg">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-6 text-center">
          <div className="logo-mark mx-auto mb-3" style={{ width: 46, height: 46, borderRadius: 12 }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm" style={{ color: "#9aa7bd" }}>{subtitle}</p>}
        </div>
        <div className="auth-card">{children}</div>
        <p className="mt-6 text-center text-xs" style={{ color: "rgba(255,255,255,.28)" }}>ALIVIA · FIRMA CONTABLE OS</p>
      </main>
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="block text-[13px] font-medium" style={{ color: "var(--t2)" }}>
      {label}
      <input {...props} className="field mt-1" style={{ fontSize: 14, padding: "9px 12px" }} />
    </label>
  );
}

export function Button({ children, ...props }: ComponentProps<"button">) {
  return (
    <button {...props} className="btn btn-primary w-full" style={{ padding: "10px 16px", fontSize: 14 }}>
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  return children ? (
    <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--red-bg)", color: "#b42318" }}>
      {children}
    </p>
  ) : null;
}
