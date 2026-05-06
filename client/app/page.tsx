'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Modal from '../components/Modal'
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
            className="bg-gray-50/25 p-4 hover:bg-gray-50/40 hover:scale-105 hover:cursor-pointer transition"
            onClick={() => joinGame(cat.categoryId)}
          >
            <div className="flex items-center gap-4 mb-4">
              <cat.icon
                className={`text-4xl mb-2`}
                color={cat.color}
              />
              <h3 className="text-lg font-semibold">{cat.title}</h3>
            </div>
            <p className="text-sm text-left text-gray-50">{cat.description}</p>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-6xl font-bold">TriviaQuest</h1>
      <div className="mt-12">
        <h2 className="text-3xl font-semibold mb-6">Categories</h2>
        {renderedCategories}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <h2 className="text-xl font-semibold mb-4">Enter your name</h2>
        <input
          autoFocus
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName(playerName)
            if (e.key === 'Escape') setModalOpen(false)
          }}
          placeholder="Player name"
          className="w-full mb-4 p-2 border rounded"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 rounded border"
          >
            Cancel
          </button>
          <button
            onClick={() => submitName(playerName)}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Join
          </button>
        </div>
      </Modal>
    </div>
  )
}
