interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  Draft:            { label: "Draft",            color: "text-apple-gray  bg-apple-gray/10  border-apple-gray/30",   dot: "bg-apple-gray" },
  Funded:           { label: "Funded",           color: "text-apple-blue  bg-apple-blue/10  border-apple-blue/30",   dot: "bg-apple-blue" },
  Submitted:        { label: "Submitted",        color: "text-apple-amber bg-apple-amber/10 border-apple-amber/30",  dot: "bg-apple-amber" },
  Released:         { label: "Released",         color: "text-apple-green bg-apple-green/10 border-apple-green/30",  dot: "bg-apple-green" },
  Refunded:         { label: "Refunded",         color: "text-apple-red   bg-apple-red/10   border-apple-red/30",    dot: "bg-apple-red" },
  Disputed:         { label: "Disputed",         color: "text-apple-orange bg-apple-orange/10 border-apple-orange/30", dot: "bg-apple-orange" },
  MutualResolution: { label: "Mutual",           color: "text-apple-purple bg-apple-purple/10 border-apple-purple/30", dot: "bg-apple-purple" },
  Cancelled:        { label: "Cancelled",        color: "text-apple-gray  bg-apple-gray/10  border-apple-gray/30",   dot: "bg-apple-gray" },
  Active:           { label: "Active",           color: "text-apple-blue  bg-apple-blue/10  border-apple-blue/30",   dot: "bg-apple-blue" },
  Completed:        { label: "Completed",        color: "text-apple-green bg-apple-green/10 border-apple-green/30",  dot: "bg-apple-green" },
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-apple-gray bg-apple-gray/10 border-apple-gray/30",
    dot: "bg-apple-gray",
  };

  const sizeClass = size === "sm"
    ? "text-xs px-2 py-0.5 gap-1"
    : "text-xs px-2.5 py-1 gap-1.5";

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${cfg.color} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
