import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zeneith — Private Payroll on Stellar",
  description: "Zero-Knowledge Payroll & Compliance Layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
