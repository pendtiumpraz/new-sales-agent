import { ContactsSubnav } from "@/components/contacts/contacts-subnav";

// Shared layout for the Kontak cluster — a single step sub-nav above every
// /contacts/* page so the flow (Cari → Hasil → Sebaran → Kelola) is always
// visible and switchable (doc 40).
export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ContactsSubnav />
      {children}
    </div>
  );
}
