'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Player, Question, Letters } from '@/lib/types'
import { categories } from '@/lib/data'
import Scoreboard from '@/components/scoreboard'
import QuestionCard from '@/components/question-card'
import GameOverModal from '@/components/game-over-modal'

const SESSION_KEY = 'trivia_session_token'
const WS_URL_KEY = 'trivia_ws_url'
const DEFAULT_WS_URL = 'ws://localhost/ws'
const MAX_RECONNECT_ATTEMPTS = 5

export default function Game() {
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)

  const [playerId, setPlayerId] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [numQuestions, setNumQuestions] = useState(0)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [turnState, setTurnState] = useState<{
    phase: 'shared' | 'single'
    playerId: number | null
    durationMs: number
    endsAt: number
  } | null>(null)
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [finalQuestions, setFinalQuestions] = useState<Question[]>([])
  const [finalPlayers, setFinalPlayers] = useState<Player[]>([])
  const [finalScores, setFinalScores] = useState<Record<number, number>>({})
  const [rematchVotes, setRematchVotes] = useState(0)
  const [rematchFailed, setRematchFailed] = useState(false)
  const [hasVotedRematch, setHasVotedRematch] = useState(false)
  const [opponentLeft, setOpponentLeft] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)

  const questionsRef = useRef<Question[]>([])
  const playersRef = useRef<Player[]>([])
  const scoresRef = useRef<Record<number, number>>({})
  const playerIdRef = useRef<number | null>(null)
  const numQuestionsRef = useRef<number>(0)
  const mathWinTriggeredRef = useRef(false)

  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const categoryId = searchParams.get('categoryId')
  const wsUrl = searchParams.get('wsUrl') ?? DEFAULT_WS_URL

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    scoresRef.current = scores
  }, [scores])
  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])
  useEffect(() => {
    numQuestionsRef.current = numQuestions
  }, [numQuestions])

  const addQuestionResponse = (
    answerChoice: string,
    responderId: number,
    correct: boolean,
    correctAnswer?: Letters,
  ) => {
    setQuestions((prev) => {
      const updated = [...prev]
      const current = updated[updated.length - 1]
      if (current) {
        current.history.push({
          guess: answerChoice as Letters,
          playerId: responderId,
          correct,
        })
        if (correctAnswer) current.correctAnswer = correctAnswer
      }
      return updated
    })
  }

  useEffect(() => {
    if (!countdown) return
    const id = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  useEffect(() => {
    if (!turnState) {
      setTurnSecondsRemaining(0)
      return
    }
    const update = () =>
      setTurnSecondsRemaining(
        Math.max(0, Math.ceil((turnState.endsAt - Date.now()) / 1000)),
      )
    update()
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [turnState?.endsAt])

  useEffect(() => {
    let cancelled = false
    let reconnectAttempts = 0
    const reconnectTimers: ReturnType<typeof setTimeout>[] = []

    const connect = () => {
      if (cancelled) return
      const token = sessionStorage.getItem(SESSION_KEY)
      const base = token ? (sessionStorage.getItem(WS_URL_KEY) ?? wsUrl) : wsUrl
      const url =
        `${base}?categoryId=${categoryId}&name=${name}` +
        (token ? `&sessionToken=${token}` : '')

      const socket = new WebSocket(url)
      wsRef.current = socket

      socket.onopen = () => {
        if (!cancelled) reconnectAttempts = 0
      }

      socket.onmessage = (msg) => {
        if (cancelled) return
        const data = JSON.parse(msg.data)
        console.log('WS:', data)

        switch (data.type) {
          case 'CONNECTED':
            sessionStorage.removeItem(WS_URL_KEY)
            setPlayerId(data.playerId)
            playerIdRef.current = data.playerId
            if (data.sessionToken)
              sessionStorage.setItem(SESSION_KEY, data.sessionToken)
            break

          case 'WAITING':
            break

          case 'REDIRECT':
            sessionStorage.setItem(WS_URL_KEY, data.url)
            socket.close()
            break

          case 'MATCH_FOUND':
            setPlayers(data.players)
            setNumQuestions(data.numQuestions)
            numQuestionsRef.current = data.numQuestions
            setQuestions([])
            setScores({})
            setTurnState(null)
            setShowModal(false)
            setRematchVotes(0)
            setRematchFailed(false)
            setHasVotedRematch(false)
            setOpponentLeft(false)
            mathWinTriggeredRef.current = false
            setCountdown(3)
            break

          case 'QUESTION':
            if (mathWinTriggeredRef.current) break
            setAnimKey((prev) => prev + 1)
            setQuestions((prev) => [
              ...prev,
              { question: data.question, choices: data.choices, history: [] },
            ])
            break

          case 'WRONG':
            addQuestionResponse(data.guessed, data.playerId, false)
            break

          case 'RESULT': {
            addQuestionResponse(
              data.guessed,
              data.winnerId,
              true,
              data.correctAnswer as Letters,
            )
            const newScores = data.scores ?? {}
            setScores(newScores)
            setTurnState(null)

            if (!mathWinTriggeredRef.current) {
              const N = numQuestionsRef.current
              const myId = playerIdRef.current
              if (N > 0 && myId !== null) {
                const myPlayer = playersRef.current.find(
                  (p) => p.playerId === myId,
                )
                const oppPlayer = playersRef.current.find(
                  (p) => p.playerId !== myId,
                )
                if (myPlayer && oppPlayer) {
                  const remaining = N - questionsRef.current.length
                  const s1 = newScores[myPlayer.playerId] ?? 0
                  const s2 = newScores[oppPlayer.playerId] ?? 0
                  if (
                    remaining > 0 &&
                    (s1 > s2 + remaining || s2 > s1 + remaining)
                  ) {
                    mathWinTriggeredRef.current = true
                    setTimeout(() => {
                      setFinalQuestions([...questionsRef.current])
                      setFinalPlayers([...playersRef.current])
                      setFinalScores(newScores)
                      setShowModal(true)
                    }, 900)
                  }
                }
              }
            }
            break
          }

          case 'TURN_STATE':
            setTurnState({
              phase: data.phase,
              playerId: data.playerId ?? null,
              durationMs: data.durationMs,
              endsAt: data.endsAt,
            })
            break

          case 'GAME_OVER':
            setFinalQuestions([...questionsRef.current])
            setFinalPlayers([...playersRef.current])
            setFinalScores(data.scores ?? {})
            setTurnState(null)
            setShowModal(true)
            break

          case 'REMATCH_VOTE':
            setRematchVotes(data.votes)
            break

          case 'REMATCH_FAILED':
            setRematchFailed(true)
            setRematchVotes(0)
            break

          case 'OPPONENT_LEFT':
            setFinalQuestions([...questionsRef.current])
            setFinalPlayers([...playersRef.current])
            setFinalScores({ ...scoresRef.current })
            setOpponentLeft(true)
            setTurnState(null)
            setShowModal(true)
            break

          case 'RECONNECT_STATE': {
            if (data.sessionToken)
              sessionStorage.setItem(SESSION_KEY, data.sessionToken)
            setPlayerId(data.playerId)
            playerIdRef.current = data.playerId

            const m = data.match
            if (!m) {
              sessionStorage.removeItem(SESSION_KEY)
              break
            }

            setPlayers(m.players)
            setNumQuestions(m.numQuestions)
            numQuestionsRef.current = m.numQuestions
            setScores(m.scores)

            const rebuilt: Question[] = m.questions.map(
              (q: {
                question: string
                choices: Record<Letters, string>
                history: {
                  playerId: number
                  guess: Letters
                  correct: boolean
                }[]
                correctAnswer: Letters | null
              }) => ({
                question: q.question,
                choices: q.choices,
                history: q.history,
                correctAnswer: q.correctAnswer ?? undefined,
              }),
            )

            setQuestions(rebuilt)
            setAnimKey((prev) => prev + 1)

            if (m.ended) {
              setFinalQuestions(rebuilt)
              setFinalPlayers(m.players)
              setFinalScores(m.scores)
              setTurnState(null)
              setShowModal(true)
            } else if (m.turnPhase && m.turnEndsAt) {
              setTurnState({
                phase: m.turnPhase,
                playerId: m.turnPlayerId ?? null,
                durationMs: m.turnDurationMs,
                endsAt: m.turnEndsAt,
              })
            }
            break
          }

          case 'SESSION_EXPIRED':
            sessionStorage.removeItem(SESSION_KEY)
            router.push('/')
            break
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
          const id = setTimeout(connect, 1500 * reconnectAttempts)
          reconnectTimers.push(id)
        }
      }
    }

    const initTimer = setTimeout(connect, 0)
    return () => {
      cancelled = true
      clearTimeout(initTimer)
      reconnectTimers.forEach(clearTimeout)
      wsRef.current?.close()
    }
  }, [])

  function answer(choice: string) {
    wsRef.current?.send(JSON.stringify({ type: 'ANSWER', answer: choice }))
  }

  function sendRematch() {
    setHasVotedRematch(true)
    wsRef.current?.send(JSON.stringify({ type: 'REMATCH' }))
  }

  function leaveGame() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'QUIT' }))
    }
    router.push('/')
  }

  const categoryName = useMemo(
    () =>
      categories.find((cat) => cat.categoryId === Number(categoryId))?.title,
    [categoryId],
  )

  const currentQuestion = questions[questions.length - 1]
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
  const isOpponentTurn =
    !!turnState && !isSharedTurn && turnState.playerId !== playerId
  const turnProgress = turnState
    ? Math.max(0, (turnSecondsRemaining / (turnState.durationMs / 1000)) * 100)
    : 0
  const p1Active = !isSharedTurn && currentTurnPlayerId === player1?.playerId
  const p2Active = !isSharedTurn && currentTurnPlayerId === player2?.playerId

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <h1
        className="text-4xl font-black tracking-widest uppercase"
        style={{
          color: '#ffc500',
          textShadow:
            '0 0 12px rgba(255,197,0,0.6), 0 0 40px rgba(255,197,0,0.2)',
        }}
      >
        {categoryName}
      </h1>

      {player2 ? (
        <Scoreboard
          player1={player1}
          player2={player2}
          player1Score={player1Score}
          player2Score={player2Score}
          p1Active={p1Active}
          p2Active={p2Active}
        />
      ) : (
        <p className="text-gray-500 tracking-[0.2em] text-sm uppercase animate-pulse mt-4">
          Your battle begins shortly...
        </p>
      )}

      <button
        onClick={leaveGame}
        className="text-xs font-bold tracking-widest uppercase transition-all px-4 py-2 mt-1 rounded-sm border border-red-900/40 text-red-400/60 hover:border-red-500/60 hover:text-red-400 cursor-pointer"
        style={{ background: 'rgba(180,0,0,0.06)' }}
      >
        Retreat
      </button>

      {countdown ? (
        <span
          key={countdown}
          className="text-[12rem] font-black leading-none mt-8"
          style={{
            animation: 'countdown-pop 0.9s ease both',
            color: '#00e5ff',
            textShadow: '0 0 40px rgba(0,191,255,0.8), 0 0 80px rgba(0,191,255,0.4)',
          }}
        >
          {countdown}
        </span>
      ) : (
        currentQuestion && (
          <QuestionCard
            key={animKey}
            currentQuestion={currentQuestion}
            playerId={playerId}
            isPlayerTurn={isPlayerTurn}
            turnSecondsRemaining={turnSecondsRemaining}
            turnProgress={turnProgress}
            isOpponentTurn={isOpponentTurn}
            questionNumber={questions.length}
            numQuestions={numQuestions}
            onAnswer={answer}
          />
        )
      )}

      <GameOverModal
        open={showModal}
        finalQuestions={finalQuestions}
        finalPlayers={finalPlayers}
        finalScores={finalScores}
        playerId={playerId}
        opponentLeft={opponentLeft}
        hasVotedRematch={hasVotedRematch}
        rematchFailed={rematchFailed}
        rematchVotes={rematchVotes}
        onRematch={sendRematch}
        onEndGame={() => router.push('/')}
      />
    </div>
  )
}
