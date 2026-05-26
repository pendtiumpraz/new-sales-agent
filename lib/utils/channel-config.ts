import {
  type LucideIcon,
  Briefcase,
  Camera,
  Mail,
  MessageCircle,
  MessageSquare,
  Music2,
  Phone,
  ShoppingBag,
  Store,
} from "lucide-react";

import type {
  CadenceStepChannel,
  Marketplace,
  MessagingChannel,
} from "@/lib/types";

export interface ChannelMeta {
  label: string;
  color: string; // hex — used for the 8px dot + accents
  icon: LucideIcon;
}

export const CHANNELS: Record<CadenceStepChannel, ChannelMeta> = {
  whatsapp: { label: "WhatsApp", color: "#25D366", icon: MessageCircle },
  email: { label: "Email", color: "#6366F1", icon: Mail },
  instagram: { label: "Instagram", color: "#E1306C", icon: Camera },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: Briefcase },
  sms: { label: "SMS", color: "#0EA5E9", icon: MessageSquare },
  call: { label: "Telepon", color: "#8B5CF6", icon: Phone },
};

export const MARKETPLACES: Record<Marketplace, ChannelMeta> = {
  tokopedia: { label: "Tokopedia", color: "#03AC0E", icon: ShoppingBag },
  shopee: { label: "Shopee", color: "#EE4D2D", icon: Store },
  tiktok: { label: "TikTok Shop", color: "#000000", icon: Music2 },
};

const ALL: Record<string, ChannelMeta> = { ...CHANNELS, ...MARKETPLACES };

export function channelMeta(key: string): ChannelMeta {
  return ALL[key] ?? { label: key, color: "#94A3B8", icon: MessageSquare };
}

export const MESSAGING_CHANNELS: MessagingChannel[] = [
  "whatsapp",
  "email",
  "instagram",
  "linkedin",
  "sms",
];
