import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "StudyPilot | AI Study Assistant", description: "A personalized AI study assistant grounded in your own learning material." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
