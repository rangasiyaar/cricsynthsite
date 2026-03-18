"use client";

import React from "react";

export const metadata = {
  title: "CricVeda",
  description: "Fantasy Cricket Intelligence API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

