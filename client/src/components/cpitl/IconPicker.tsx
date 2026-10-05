import React, { useMemo, useState } from 'react'
import {
  Apple, Archive, Baby, Banknote, Battery, Bike, Book, BookOpen, Box, Briefcase, Brush, Building2, Bus, Calculator, Camera, Car,
  Coffee, Coins, CreditCard, Droplets, Dumbbell, Fan, FileText, Flame, Flower2, Fuel, Gift, Globe, GraduationCap, Hammer, HardHat,
  Heart, Home, Landmark, Laptop, Leaf, Lightbulb, Mail, Map, Megaphone, Monitor, Music, Newspaper, Package, Paintbrush, Palette,
  PartyPopper, Pencil, Phone, PiggyBank, Pill, Plane, Plug, Printer, Receipt, Recycle, Ruler, Scissors, Shapes, Shield, Shirt,
  ShoppingCart, Snowflake, Sparkles, SprayCan, Star, Stethoscope, Tag, Ticket, Trees, Trophy, Truck, Users, Utensils, Wallet, Wifi,
  Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

/** Curated icon set for expense categories. Keys are stored on the server — never rename one. */
export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  pencil: { icon: Pencil, label: 'Stationery' },
  printer: { icon: Printer, label: 'Printing' },
  'spray-can': { icon: SprayCan, label: 'Cleaning' },
  wrench: { icon: Wrench, label: 'Repairs' },
  hammer: { icon: Hammer, label: 'Hammer' },
  'hard-hat': { icon: HardHat, label: 'Construction' },
  paintbrush: { icon: Paintbrush, label: 'Paint' },
  wifi: { icon: Wifi, label: 'Internet' },
  phone: { icon: Phone, label: 'Phone' },
  droplets: { icon: Droplets, label: 'Water' },
  zap: { icon: Zap, label: 'Power' },
  plug: { icon: Plug, label: 'Electrical' },
  lightbulb: { icon: Lightbulb, label: 'Lighting' },
  fan: { icon: Fan, label: 'Fan / AC' },
  snowflake: { icon: Snowflake, label: 'Cooling' },
  flame: { icon: Flame, label: 'Gas' },
  fuel: { icon: Fuel, label: 'Fuel' },
  bus: { icon: Bus, label: 'Bus' },
  car: { icon: Car, label: 'Car' },
  truck: { icon: Truck, label: 'Delivery' },
  bike: { icon: Bike, label: 'Bike' },
  plane: { icon: Plane, label: 'Travel' },
  'party-popper': { icon: PartyPopper, label: 'Events' },
  trophy: { icon: Trophy, label: 'Sports' },
  dumbbell: { icon: Dumbbell, label: 'Fitness' },
  music: { icon: Music, label: 'Music' },
  palette: { icon: Palette, label: 'Art' },
  'book-open': { icon: BookOpen, label: 'Books' },
  book: { icon: Book, label: 'Library' },
  'graduation-cap': { icon: GraduationCap, label: 'Academics' },
  laptop: { icon: Laptop, label: 'Laptop' },
  monitor: { icon: Monitor, label: 'IT' },
  camera: { icon: Camera, label: 'Camera' },
  calculator: { icon: Calculator, label: 'Accounts' },
  ruler: { icon: Ruler, label: 'Ruler' },
  scissors: { icon: Scissors, label: 'Craft' },
  brush: { icon: Brush, label: 'Brush' },
  landmark: { icon: Landmark, label: 'Bank' },
  banknote: { icon: Banknote, label: 'Cash' },
  coins: { icon: Coins, label: 'Coins' },
  wallet: { icon: Wallet, label: 'Wallet' },
  'credit-card': { icon: CreditCard, label: 'Card' },
  'piggy-bank': { icon: PiggyBank, label: 'Savings' },
  receipt: { icon: Receipt, label: 'Bills' },
  briefcase: { icon: Briefcase, label: 'Professional' },
  megaphone: { icon: Megaphone, label: 'Marketing' },
  newspaper: { icon: Newspaper, label: 'Ads' },
  'file-text': { icon: FileText, label: 'Documents' },
  mail: { icon: Mail, label: 'Postage' },
  utensils: { icon: Utensils, label: 'Canteen' },
  coffee: { icon: Coffee, label: 'Refreshments' },
  apple: { icon: Apple, label: 'Food' },
  stethoscope: { icon: Stethoscope, label: 'Medical' },
  pill: { icon: Pill, label: 'Medicine' },
  shield: { icon: Shield, label: 'Security' },
  shirt: { icon: Shirt, label: 'Uniform' },
  'shopping-cart': { icon: ShoppingCart, label: 'Purchases' },
  package: { icon: Package, label: 'Supplies' },
  box: { icon: Box, label: 'Storage' },
  archive: { icon: Archive, label: 'Records' },
  gift: { icon: Gift, label: 'Gifts' },
  ticket: { icon: Ticket, label: 'Tickets' },
  tag: { icon: Tag, label: 'Tag' },
  users: { icon: Users, label: 'Staff' },
  baby: { icon: Baby, label: 'Pre-primary' },
  'building-2': { icon: Building2, label: 'Building' },
  home: { icon: Home, label: 'Hostel' },
  trees: { icon: Trees, label: 'Garden' },
  leaf: { icon: Leaf, label: 'Plants' },
  'flower-2': { icon: Flower2, label: 'Decor' },
  recycle: { icon: Recycle, label: 'Waste' },
  battery: { icon: Battery, label: 'Battery' },
  globe: { icon: Globe, label: 'Web' },
  map: { icon: Map, label: 'Trips' },
  heart: { icon: Heart, label: 'Welfare' },
  star: { icon: Star, label: 'Awards' },
  sparkles: { icon: Sparkles, label: 'Special' },
  shapes: { icon: Shapes, label: 'Other' },
}

export const CATEGORY_COLORS = ['#6366f1', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

export const CategoryIcon: React.FC<{ icon?: string; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  icon,
  color = '#6366f1',
  size = 'md',
  className = '',
}) => {
  const Icon = CATEGORY_ICONS[icon || '']?.icon || Shapes
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
  const glyph = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${box} ${className}`} style={{ backgroundColor: `${color}1f`, color }}>
      <Icon className={glyph} />
    </span>
  )
}

export const IconPicker: React.FC<{ value: string; color?: string; onChange: (key: string) => void }> = ({ value, color = '#6366f1', onChange }) => {
  const [q, setQ] = useState('')
  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return Object.entries(CATEGORY_ICONS).filter(([key, def]) => !needle || key.includes(needle) || def.label.toLowerCase().includes(needle))
  }, [q])
  return (
    <div>
      <input
        className="mb-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        placeholder="Search icons…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid max-h-48 grid-cols-8 gap-1.5 overflow-y-auto sm:grid-cols-10">
        {entries.map(([key, def]) => {
          const Icon = def.icon
          const on = key === value
          return (
            <button
              key={key}
              type="button"
              title={def.label}
              aria-label={def.label}
              onClick={() => onChange(key)}
              className={`flex aspect-square w-full items-center justify-center rounded-lg border transition ${
                on ? 'border-transparent ring-2 ring-inset dark:ring-offset-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
              style={on ? { backgroundColor: `${color}1f`, color, ['--tw-ring-color' as string]: color } : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
            </button>
          )
        })}
        {!entries.length ? <p className="col-span-full py-4 text-center text-xs text-slate-400">No icons match.</p> : null}
      </div>
    </div>
  )
}

export const ColorSwatches: React.FC<{ value: string; onChange: (color: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {CATEGORY_COLORS.map((c) => (
      <button
        key={c}
        type="button"
        aria-label={`Colour ${c}`}
        onClick={() => onChange(c)}
        className={`h-7 w-7 rounded-full transition ${value === c ? 'ring-2 ring-offset-2 dark:ring-offset-slate-800' : 'hover:scale-110'}`}
        style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
      />
    ))}
  </div>
)
