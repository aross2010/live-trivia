import type { Metadata } from 'next'
import { Jost } from 'next/font/google'
import './globals.css'

const jost = Jost({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-jost',
})

export const metadata: Metadata = {
  title: 'DUEL — Lightsaber Trivia',
  description: 'A head-to-head trivia duel. May the best mind win.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className="scroll-smooth! overflow-x-hidden flex flex-col items-center justify-center"
    >
      <body
        className={`${jost.variable} ${jost.className} text-gray-50 bg-mist-900 tracking-wide max-w-250 w-full overflow-x-hidden flex flex-col min-h-screen`}
      >
        <main className="flex flex-col items-center gap-36 px-4 justify-center py-10">
          {children}
        </main>
      </body>
    </html>
  )
}
