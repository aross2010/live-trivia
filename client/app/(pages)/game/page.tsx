'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Player, Question, Letters } from '@/lib/types'
import { categories } from '@/lib/data'
import { FiCheck, FiX } from 'react-icons/fi'

export default function Game() {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [status, setStatus] = useState('Connecting...')
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([]) // top of stack is current question
  const [numQuestions, setNumQuestions] = useState(0)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [turnState, setTurnState] = useState<{
    phase: 'shared' | 'single'
    playerId: number | null
    durationMs: number
    endsAt: number
  } | null>(null)
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState(0)

  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const categoryId = searchParams.get('categoryId')

  console.log('Game page query:', { name, categoryId })

  const addQuestionResponse = (
    answerChoice: string,
    playerId: number,
    correct: boolean,
  ) => {
    // add the current question history with the player that guessed
    setQuestions((prev) => {
      const updated = [...prev]
      const current = updated[updated.length - 1]

      if (current) {
        current.history.push({
          guess: answerChoice as Letters,
          playerId: playerId,
          correct: correct,
        })
      }

      return updated
    })
  }

  useEffect(() => {
    if (!turnState) {
      setTurnSecondsRemaining(0)
      return
    }

    const updateRemaining = () => {
      setTurnSecondsRemaining(
        Math.max(0, Math.ceil((turnState.endsAt - Date.now()) / 1000)),
      )
    }

    updateRemaining()
    const timerId = setInterval(updateRemaining, 250)

    return () => clearInterval(timerId)
  }, [turnState?.endsAt])

  useEffect(() => {
    if (!turnState) return

    if (turnState.phase === 'shared') {
      setStatus('Both players can guess')
      return
    }

    setStatus(turnState.playerId === playerId ? 'Your turn!' : 'Opponent turn')
  }, [turnState, playerId])

  useEffect(() => {
    const socket = new WebSocket(
      `ws://localhost:3001?categoryId=${categoryId}&name=${name}`,
    )

    socket.onopen = () => {
      setStatus('Connected')
    }

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      console.log('WS:', data)

      switch (data.type) {
        // initial connection response, assign player ID
        case 'CONNECTED':
          setPlayerId(data.playerId)
          break

        // player waiting for match
        case 'WAITING':
          setStatus('Waiting for opponent...')
          break

        // connected to opponent, match found
        case 'MATCH_FOUND':
          setStatus('Match found!')
          setPlayers(data.players)
          setNumQuestions(data.numQuestions)
          break

        // new question received
        case 'QUESTION':
          setQuestions((prev) => {
            const newQuestion = {
              question: data.question,
              choices: data.choices,
              history: [],
            }
            return [...prev, newQuestion]
          })
          break

        // wrong answer response
        case 'WRONG':
          setStatus('Wrong answer')
          addQuestionResponse(data.guessed, data.playerId, false)
          break

        // correct answer
        case 'RESULT':
          addQuestionResponse(data.guessed, data.winnerId, data.correct)
          setScores(data.scores ?? {})
          setTurnState(null)
          setStatus(`Correct: ${data.winnerId ?? 'none'}`)
          break

        case 'YOUR_TURN':
          setStatus('Your turn!')
          break

        case 'TURN_STATE':
          setTurnState({
            phase: data.phase,
            playerId: data.playerId ?? null,
            durationMs: data.durationMs,
            endsAt: data.endsAt,
          })
          break

        // protected in UI, rare case of desync or malicious user
        case 'NOT_YOUR_TURN':
          setStatus('Not your turn')
          break

        case 'GAME_OVER':
          setScores(data.scores ?? {})
          setTurnState(null)
          setStatus('Game Over')
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

  const categoryName = useMemo(() => {
    return categories.find((cat) => cat.categoryId === Number(categoryId))
      ?.title
  }, [categoryId])

  const currentQuestion = questions[questions.length - 1]
  const question = currentQuestion?.question
  const choices = currentQuestion?.choices ?? {}
  const questionNumber = questions.length

  const player1 = players.find((p) => p.playerId === playerId)
  const player2 = players.find((p) => p.playerId !== playerId)

  const player1Score = scores[player1?.playerId ?? -1] ?? 0
  const player2Score = scores[player2?.playerId ?? -1] ?? 0

  const isSharedTurn = turnState?.phase === 'shared'
  const currentTurnPlayerId = isSharedTurn
    ? null
    : (turnState?.playerId ?? null)
  const isPlayerTurn =
    !turnState || isSharedTurn || turnState.playerId === playerId
  const turnLabel =
    !turnState || isSharedTurn
      ? 'Both players can guess'
      : turnState.playerId === player1?.playerId
        ? `${player1?.name}'s turn`
        : `${player2?.name}'s turn`
  const turnProgress = turnState
    ? Math.max(0, (turnSecondsRemaining / (turnState.durationMs / 1000)) * 100)
    : 0

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-4xl font-bold">{categoryName}</h1>
      <h2 className="text-xl mt-4">
        {player2
          ? isSharedTurn
            ? `${player1?.name} (${player1Score}) vs ${player2.name} (${player2Score})`
            : `${currentTurnPlayerId == player1?.playerId ? '->' : ''} ${player1?.name} (${player1Score}) vs ${player2.name} (${player2Score}) ${currentTurnPlayerId == player2.playerId ? '<-' : ''}`
          : 'Waiting for an opponent...'}
      </h2>
      {question && (
        <div className="flex flex-col gap-4 mt-12 w-full max-w-2xl">
          <h3 className="text-xl text-left">{question}</h3>
          <small className="text-left text-gray-300">
            {turnSecondsRemaining}s
          </small>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-rose-500 via-red-500 to-orange-400 shadow-[0_0_18px_rgba(239,68,68,0.45)] transition-[width] duration-300 ease-linear"
              style={{ width: `${turnProgress}%` }}
            />
          </div>

          <div className="md:grid-cols-2 grid-cols-1 grid gap-2">
            {Object.entries(choices).map(([key, val]) => {
              const myGuessForThisAnswer = currentQuestion?.history?.find(
                (h) => h.playerId === playerId && h.guess === key,
              )
              const didIGuessThisAnswer = myGuessForThisAnswer !== undefined
              const wasThisGuessCorrect = myGuessForThisAnswer?.correct === true
              const wasThisGuessWrong = myGuessForThisAnswer?.correct === false

              const isCorrectAnswer = wasThisGuessCorrect && didIGuessThisAnswer
              const isWrongAnswer = wasThisGuessWrong && didIGuessThisAnswer

              const lastGuessInHistory =
                currentQuestion?.history?.[currentQuestion?.history?.length - 1]
              const wasILastToGuess = lastGuessInHistory?.playerId === playerId

              let buttonClass =
                'bg-gray-50/25 p-4 min-h-24 enabled:hover:bg-green-400/25 enabled:hover:scale-102 hover:cursor-pointer transition min-w-full flex flex-col items-start justify-between disabled:opacity-50 disabled:cursor-not-allowed'

              if (isCorrectAnswer) {
                buttonClass = buttonClass.replace(
                  'bg-gray-50/25',
                  'bg-green-500/40',
                )
              } else if (isWrongAnswer) {
                buttonClass = buttonClass.replace(
                  'bg-gray-50/25',
                  'bg-red-500/40',
                )
              }

              const canAnswer = isPlayerTurn && !wasILastToGuess

              return (
                <button
                  key={key}
                  onClick={() => answer(key)}
                  className={buttonClass}
                  disabled={!canAnswer}
                >
                  <p className="text-xl">
                    {isCorrectAnswer ? (
                      <FiCheck className="text-2xl" />
                    ) : isWrongAnswer ? (
                      <FiX className="text-2xl" />
                    ) : (
                      `${key}.`
                    )}
                  </p>
                  <p className="text-lg">{val as string}</p>
                </button>
              )
            })}
          </div>
          <small className="text-center mt-6 text-gray-300">
            {questionNumber} / {numQuestions}
          </small>
        </div>
      )}
      <div className="mt-48 flex flex-col gap-4">
        <small>Status: {status}</small>
        <small>Player ID: {playerId}</small>
        <small>Players: {JSON.stringify(players, null, 2)}</small>
        <small>Questions: {JSON.stringify(questions, null, 2)}</small>
        <small>Current Turn Player ID: {currentTurnPlayerId}</small>
        <small>Shared Turn: {isSharedTurn.toString()}</small>
        <small>Is Player Turn: {isPlayerTurn.toString()}</small>
        <small>Turn Seconds Remaining: {turnSecondsRemaining}</small>
      </div>
    </div>
  )
}
