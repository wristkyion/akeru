import type { ReactNode } from "react";

// Shared layout for the lockdown and maintenance pages, so they match the rest of the app.
export function ErrorScreen({
  title,
  message,
  black = false,
  children,
}: {
  title: string;
  message: string;
  black?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={black ? "err-screen err-black" : "err-screen"}>
      <div className="err-card">
        <div className="brand brand-lg">
          <span className="logo">A</span>
          <span>akeru</span>
        </div>
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        {children && <div className="err-actions">{children}</div>}
      </div>
    </div>
  );
}
