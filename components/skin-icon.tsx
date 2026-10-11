"use client";

import {
  BookMarked,
  Bot,
  CalendarRange,
  CircleDollarSign,
  ClipboardEdit,
  Github,
  MessageSquare,
  Microscope,
  Newspaper,
  Quote,
  Radar,
  Scale,
  School,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  BookIcon,
  CalendarIcon,
  ChatIcon,
  CodeIcon,
  CreditCardIcon,
  EditIcon,
  GlobeIcon,
  HeartIcon,
  HomeIcon,
  OwlIcon,
  RocketIcon,
  ShieldIcon,
  StarIcon,
  UserPlusIcon,
  UsersIcon,
} from "naive-icons";

import { useEffectiveSkin } from "@/lib/use-skin";

type IslandIcon = typeof ChatIcon;

const ICONS = {
  feedback: [Quote, ChatIcon],
  community: [Radar, UsersIcon],
  join: [UserPlus, UserPlusIcon],
  github: [Github, CodeIcon],
  comments: [MessageSquare, ChatIcon],
  rating: [Star, StarIcon],
  submit: [ClipboardEdit, EditIcon],
  timetable: [CalendarRange, CalendarIcon],
  FAH: [Newspaper, BookIcon],
  FBA: [CircleDollarSign, CreditCardIcon],
  FED: [School, OwlIcon],
  FHS: [Microscope, HeartIcon],
  FLL: [Scale, ShieldIcon],
  FSS: [BookMarked, GlobeIcon],
  FST: [Bot, RocketIcon],
  faculty: [School, HomeIcon],
} satisfies Record<string, [LucideIcon, IslandIcon]>;

export type SkinIconName = keyof typeof ICONS;

type SkinIconProps = {
  name: SkinIconName | (string & {});
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function SkinIcon({ name, size = 16, strokeWidth, className }: SkinIconProps) {
  const [Lucide, Island] = ICONS[name as SkinIconName] ?? ICONS.faculty;
  const island = useEffectiveSkin() === "island";

  if (island) {
    return <Island size={size} color="currentColor" className={className} aria-hidden />;
  }
  return <Lucide size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
