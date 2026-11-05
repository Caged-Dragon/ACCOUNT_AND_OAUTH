import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Sign in – Caged Dragon', description: 'One sign-in for every @draco-mail.com account.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
