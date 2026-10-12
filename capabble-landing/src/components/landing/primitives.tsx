import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  Building,
  Building2,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChartColumn,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock,
  CreditCard,
  Ellipsis,
  FileText,
  Flag,
  Globe,
  GraduationCap,
  Hourglass,
  House,
  IndianRupee,
  KeyRound,
  Landmark,
  Laptop,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LogIn,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  Mountain,
  NotebookPen,
  PencilRuler,
  Phone,
  Plug,
  Presentation,
  Receipt,
  Route,
  School,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trees,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "./data";

const ICONS = {
  "arrow-down": ArrowDown,
  "arrow-down-right": ArrowDownRight,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  "book-open": BookOpen,
  boxes: Boxes,
  briefcase: Briefcase,
  building: Building,
  "building-2": Building2,
  bus: Bus,
  "calendar-check": CalendarCheck,
  "calendar-days": CalendarDays,
  "calendar-x": CalendarX,
  "chart-column": ChartColumn,
  "chart-line": ChartLine,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "circle-check": CircleCheck,
  "clipboard-check": ClipboardCheck,
  clock: Clock,
  "credit-card": CreditCard,
  ellipsis: Ellipsis,
  "file-text": FileText,
  flag: Flag,
  globe: Globe,
  "graduation-cap": GraduationCap,
  hourglass: Hourglass,
  house: House,
  "indian-rupee": IndianRupee,
  "key-round": KeyRound,
  landmark: Landmark,
  laptop: Laptop,
  "layout-dashboard": LayoutDashboard,
  "layout-grid": LayoutGrid,
  library: Library,
  "log-in": LogIn,
  mail: Mail,
  "map-pin": MapPin,
  megaphone: Megaphone,
  menu: Menu,
  "message-circle": MessageCircle,
  "messages-square": MessagesSquare,
  mountain: Mountain,
  "notebook-pen": NotebookPen,
  "pencil-ruler": PencilRuler,
  phone: Phone,
  plug: Plug,
  presentation: Presentation,
  receipt: Receipt,
  route: Route,
  school: School,
  "shield-check": ShieldCheck,
  smartphone: Smartphone,
  sparkles: Sparkles,
  trees: Trees,
  trophy: Trophy,
  "user-plus": UserPlus,
  "user-round": UserRound,
  users: Users,
  wallet: Wallet,
  wrench: Wrench,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph className="cb-icon" size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}

type ButtonProps = {
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  href?: string;
  title?: string;
  className?: string;
  "aria-label"?: string;
  onClick?: () => void;
  children?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  href,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && (icon || iconRight);
  const isize = size === "lg" ? 18 : 16;
  const cls = [
    "cb-btn",
    `cb-btn--${variant}`,
    `cb-btn--${size}`,
    iconOnly && "cb-btn--icon",
    fullWidth && "cb-btn--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      {icon ? <Icon name={icon} size={isize} /> : null}
      {children ? <span className="cb-btn__label">{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={isize} /> : null}
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}

export function Badge({ tone = "neutral", dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`cb-badge cb-badge--${tone}`}>
      {dot ? <span className="cb-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Progress({
  value,
  label,
  showValue = true,
  tone = "accent",
  size,
  className,
}: {
  value: number;
  label?: string;
  showValue?: boolean;
  tone?: "accent" | "success";
  size?: "sm";
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className={["cb-progress", size === "sm" && "cb-progress--sm", className].filter(Boolean).join(" ")}>
      {label || showValue ? (
        <div className="cb-progress__head">
          {label ? <span className="cb-progress__label">{label}</span> : <span />}
          {showValue ? <span className="cb-progress__value">{pct}%</span> : null}
        </div>
      ) : null}
      <div
        className="cb-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div className={`cb-progress__fill cb-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  progress,
  progressTone = "accent",
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: IconName;
  progress?: number;
  progressTone?: "accent" | "success";
  delta?: string;
}) {
  return (
    <div className="cb-stat">
      <div className="cb-stat__top">
        <span className="cb-stat__label">{label}</span>
        {icon ? (
          <span className="cb-stat__icon">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <div className="cb-stat__value">
        {value}
        {unit ? <span className="cb-stat__unit">{unit}</span> : null}
      </div>
      {delta || hint ? (
        <div className="cb-stat__foot">
          {delta ? (
            <span className="cb-stat__delta">
              <Icon name="arrow-up-right" size={14} />
              {delta}
            </span>
          ) : null}
          {hint ? <span className="cb-stat__hint">{hint}</span> : null}
        </div>
      ) : null}
      {progress != null ? (
        <Progress value={progress} tone={progressTone} showValue={false} size="sm" className="cb-stat__progress" />
      ) : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`cb-avatar cb-avatar--${size}`} title={name}>
      <span aria-hidden="true">{initials(name)}</span>
      <span className="cb-visually-hidden">{name}</span>
    </span>
  );
}
