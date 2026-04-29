'use client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FaLightbulb } from 'react-icons/fa'
import { useState } from 'react'
import Modal from '../components/Modal'

const categories = [
  {
    title: 'General Knowledge',
    description: 'Test your general knowledge across various topics.',
    icon: FaLightbulb,
  },
]

export default function Home() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [playerName, setPlayerName] = useState('')

  const joinGame = () => setModalOpen(true)

  const submitName = (name: string) => {
    setModalOpen(false)
    router.push(`/game?name=${encodeURIComponent(name)}`)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-4xl font-bold">Welcome to Live Trivia!</h1>
      <p className="text-lg text-gray-700">
        Join a game and test your knowledge against other players in real-time.
      </p>
      <button
        onClick={joinGame}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Join Game
      </button>

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
