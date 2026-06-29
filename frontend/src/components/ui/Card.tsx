import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
  const base = "rounded-2xl glass p-5";
  const hoverClass = hover ? "glass-hover cursor-pointer" : "";
  const clickClass = onClick ? "cursor-pointer" : "";

  return (
    <div
      className={`${base} ${hoverClass} ${clickClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-apple-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: "blue" | "green" | "red" | "amber";
}

const ACCENT = {
  blue:  "text-apple-blue",
  green: "text-apple-green",
  red:   "text-apple-red",
  amber: "text-apple-amber",
};

export function StatCard({ label, value, icon, accent = "blue" }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`p-2 rounded-xl bg-current/10 ${ACCENT[accent]}`}>
            <span className={`block ${ACCENT[accent]}`}>{icon}</span>
          </div>
        )}
        <div>
          <p className="text-sm text-apple-text-secondary">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${ACCENT[accent]}`}>{value}</p>
        </div>
      </div>
    </Card>
  );
}
