import { Inter } from "next/font/google";

import styles from "./updates.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-update-sans" });

export default function UpdateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${inter.variable} ${styles.updateCanvas}`}>{children}</div>;
}
