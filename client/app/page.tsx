'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Modal from '../components/modal'
import CrossedSabers from '../components/crossed-sabers'
import { categories } from '@/lib/data'

export default function Home() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  )

  const joinGame = (categoryId: number) => {
    setSelectedCategoryId(categoryId)
    setModalOpen(true)
  }

  const submitName = (name: string) => {
    setModalOpen(false)
    router.push(
      `/game?name=${encodeURIComponent(name)}&categoryId=${encodeURIComponent(String(selectedCategoryId))}`,
    )
  }

  const renderedCategories = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map((cat, idx) => {
        return (
          <button
            key={idx}
            className="relative group p-px rounded-sm overflow-hidden hover:scale-105 hover:cursor-pointer transition-all duration-300"
            onClick={() => joinGame(cat.categoryId)}
          >
            <span className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-linear-to-r from-[#00bfff]/60 via-[#00bfff]/20 to-[#00bfff]/60" />
            <span
              className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                boxShadow:
                  'inset 0 0 20px rgba(0,191,255,0.15), 0 0 30px rgba(0,191,255,0.12)',
              }}
            />
            <div className="relative bg-white/5 border border-white/10 group-hover:border-[#00bfff]/40 rounded-sm p-4 transition-all duration-300 h-full">
              <div className="flex items-center gap-4 mb-4">
                <cat.icon
                  className="text-4xl mb-2 drop-shadow-lg"
                  color={cat.color}
                />
                <h3 className="text-lg font-semibold tracking-widest uppercase">
                  {cat.title}
                </h3>
              </div>
              <p className="text-sm text-left text-gray-400">
                {cat.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <div className="flex items-center justify-center gap-5">
          <CrossedSabers />
          <h1
            className="text-6xl font-black uppercase"
            style={{
              color: '#00e5ff',
              textShadow:
                '0 0 10px #00e5ff, 0 0 25px rgba(0,191,255,0.85), 0 0 60px rgba(0,191,255,0.55), 0 0 120px rgba(0,150,255,0.3)',
            }}
          >
            DUEL
          </h1>
          <CrossedSabers />
        </div>
        <p className="mt-3 text-sm tracking-[0.2em] uppercase text-gray-400">
          head-to-head trivia
        </p>
      </div>

      <div className="mt-12 w-full">
        <h2
          className="text-xl font-semibold mb-6 tracking-[0.2em] uppercase text-center"
          style={{
            color: '#a0c4ff',
            textShadow: '0 0 12px rgba(0,191,255,0.3)',
          }}
        >
          Choose Your Path
        </h2>
        {renderedCategories}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <h2
          className="text-xl font-semibold mb-2 tracking-widest uppercase"
          style={{
            color: '#ffc500',
            textShadow: '0 0 10px rgba(255,197,0,0.5)',
          }}
        >
          Enter Petranaki arena
        </h2>
        <p className="text-xs text-gray-500 tracking-widest uppercase mb-5">
          Your name, jedi
        </p>
        <input
          autoFocus
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName(playerName)
            if (e.key === 'Escape') setModalOpen(false)
          }}
          placeholder="Enter your name"
          className="w-full mb-5 p-3 bg-white/5 border border-white/15 rounded-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#00bfff]/60 transition-colors"
          style={{ fontFamily: 'var(--font-jost)' }}
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(false)}
            className="px-5 py-2 rounded-sm border border-white/15 text-gray-400 hover:border-white/30 hover:text-white transition-all text-sm tracking-widest uppercase"
          >
            Retreat
          </button>
          <button
            onClick={() => submitName(playerName)}
            className="px-5 py-2 rounded-sm text-sm font-bold tracking-widest uppercase transition-all"
            style={{
              background:
                'linear-gradient(135deg, rgba(0,191,255,0.2), rgba(0,100,200,0.15))',
              border: '1px solid rgba(0,191,255,0.5)',
              color: '#00e0ff',
              boxShadow: '0 0 20px rgba(0,191,255,0.2)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 0 30px rgba(0,191,255,0.4), inset 0 0 20px rgba(0,191,255,0.1)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 0 20px rgba(0,191,255,0.2)'
            }}
          >
            Hop in
          </button>
        </div>
      </Modal>
    </div>
  )
}
