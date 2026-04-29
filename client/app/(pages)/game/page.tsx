'use client'

import { useEffect, useState } from 'react'

export default function Game() {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [status, setStatus] = useState('Connecting...')
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [choices, setChoices] = useState<any>({})
  const [scores, setScores] = useState<any>(null)

  const query = new URLSearchParams(window.location.search)
  const name = query.get('name')

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3001')

    socket.onopen = () => {
      setStatus('Connected')
    }

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      console.log('WS:', data)

      switch (data.type) {
        case 'CONNECTED':
          setPlayerId(data.playerId)
          break

        case 'WAITING':
          setStatus('Waiting for opponent...')
          break

        case 'MATCH_FOUND':
          setStatus('Match found!')
          break

        case 'QUESTION':
          setQuestion(data.question)
          setChoices(data.choices)
          break

        case 'WRONG':
          setStatus('Wrong answer')
          break

        case 'RESULT':
          setScores(data.scores)
          setStatus(`Winner: ${data.winnerId ?? 'none'}`)
          break

        case 'GAME_OVER':
          setStatus('Game Over')
          setScores(data.scores)
          break
      }
    }

    setWs(socket)

    return () => socket.close()
  }, [])

  function answer(choice: string) {
    if (!ws) return

    ws.send(
      JSON.stringify({
        type: 'ANSWER',
        answer: choice,
      }),
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Game</h2>
      {name && <p>Player Name: {name}</p>}
      <p>Status: {status}</p>
      <p>Player: {playerId}</p>

      {scores && <pre>{JSON.stringify(scores, null, 2)}</pre>}

      {question && (
        <div>
          <h3>{question}</h3>

          <div>
            {Object.entries(choices).map(([key, val]) => (
              <button
                key={key}
                onClick={() => answer(key)}
                style={{ margin: 5 }}
              >
                {key}: {val as string}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
