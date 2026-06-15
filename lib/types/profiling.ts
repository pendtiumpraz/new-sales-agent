// Profiling data model (Fase 2, doc 20). Company vs Human are separate subjects;
// contact channels are polymorphic with first-class provenance + consent.

export type OwnerType = "company" | "person";
export type ContactChannel =
  | "email"
  | "phone"
  | "whatsapp"
  | "linkedin"
  | "instagram"
  | "web"
  | "other";
export type ConsentStatus =
  | "unknown"
  | "legitimate_interest"
  | "opted_in"
  | "opted_out";
export type CaptureMode = "compliant" | "balanced" | "aggressive";
export type TargetMarket = "B2B" | "B2C" | "both";

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  hqCountry?: string | null;
  summary?: string | null;
  techStack: string[];
  products: string[];
  socials: Record<string, string>;
  status: string;
  source?: string | null;
  sourceUrl?: string | null;
  capturedAt?: string | Date | null;
  capturedMode?: CaptureMode | null;
}

export interface Person {
  id: string;
  tenantId: string;
  companyId?: string | null;
  fullName: string;
  title?: string | null;
  department?: string | null;
  seniority?: string | null;
  location?: string | null;
  socials: Record<string, string>;
  status: string;
  source?: string | null;
  sourceUrl?: string | null;
  capturedAt?: string | Date | null;
  capturedMode?: CaptureMode | null;
}

export interface ContactPoint {
  id: string;
  tenantId: string;
  ownerType: OwnerType;
  ownerId: string;
  channel: ContactChannel;
  value: string;
  label?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  capturedAt?: string | Date | null;
  capturedMode?: CaptureMode | null;
  consentStatus: ConsentStatus;
  verifiedAt?: string | Date | null;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  category?: string | null;
  valueProps: string[];
  pricingNotes?: string | null;
  targetMarket?: TargetMarket | null;
  icp?: Record<string, unknown> | null;
}
