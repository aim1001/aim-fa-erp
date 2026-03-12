import { Phone, Mail } from "lucide-react";

interface ContactLinkProps {
  value: string | null | undefined;
  fallback?: string;
  className?: string;
  showIcon?: boolean;
  "data-testid"?: string;
}

export function PhoneLink({ value, fallback = "-", className = "", showIcon = false, ...props }: ContactLinkProps) {
  if (!value || !value.trim()) {
    return <span className={className} data-testid={props["data-testid"]}>{fallback}</span>;
  }

  const digits = value.replace(/[^+\d]/g, "");

  return (
    <a
      href={`tel:${digits}`}
      className={`text-primary hover:text-primary/80 transition-colors ${className}`}
      data-testid={props["data-testid"]}
      onClick={(e) => e.stopPropagation()}
    >
      {showIcon && <Phone className="h-3 w-3 inline mr-1" />}
      {value}
    </a>
  );
}

export function EmailLink({ value, fallback = "-", className = "", showIcon = false, ...props }: ContactLinkProps) {
  if (!value || !value.trim()) {
    return <span className={className} data-testid={props["data-testid"]}>{fallback}</span>;
  }

  return (
    <a
      href={`mailto:${value}`}
      className={`text-primary hover:text-primary/80 transition-colors ${className}`}
      data-testid={props["data-testid"]}
      onClick={(e) => e.stopPropagation()}
    >
      {showIcon && <Mail className="h-3 w-3 inline mr-1" />}
      {value}
    </a>
  );
}
