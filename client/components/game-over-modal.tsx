import Modal from './modal'
import { Question, Player } from '@/lib/types'

type Props = {
  open: boolean
  finalQuestions: Question[]
  finalPlayers: Player[]
  finalScores: Record<number, number>
  playerId: number | null
  opponentLeft: boolean
  hasVotedRematch: boolean
  rematchFailed: boolean
  rematchVotes: number
  onRematch: () => void
  onEndGame: () => void
}

export default function GameOverModal({
  open,
  finalQuestions,
  finalPlayers,
  finalScores,
  playerId,
  opponentLeft,
  hasVotedRematch,
  rematchFailed,
  rematchVotes,
  onRematch,
  onEndGame,
}: Props) {
  const myPlayer = finalPlayers.find((p) => p.playerId === playerId)
  const oppPlayer = finalPlayers.find((p) => p.playerId !== playerId)
  const myScore = finalScores[myPlayer?.playerId ?? -1] ?? 0
  const oppScore = finalScores[oppPlayer?.playerId ?? -1] ?? 0
  const iWon = opponentLeft || myScore > oppScore
  const isTie = !opponentLeft && myScore === oppScore

  const winnerText = opponentLeft
    ? 'Opponent fled the battlefield'
    : !myPlayer || !oppPlayer
      ? ''
      : myScore > oppScore
        ? `${myPlayer.name} — Victory!`
        : oppScore > myScore
          ? `${oppPlayer.name} — Victory!`
          : "The Force is balanced — It's a tie!"

  const outcomeStyle = isTie
    ? { color: '#aaa', textShadow: '0 0 12px rgba(200,200,200,0.4)' }
    : iWon
      ? {
          color: '#ffc500',
          textShadow: '0 0 20px rgba(255,197,0,0.7), 0 0 50px rgba(255,197,0,0.3)',
        }
      : { color: '#ff4444', textShadow: '0 0 20px rgba(255,50,50,0.7)' }

  return (
    <Modal open={open} onClose={() => {}} className="max-w-2xl">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2
            className="text-3xl font-black tracking-widest uppercase"
            style={outcomeStyle}
          >
            {isTie ? 'Draw' : iWon ? 'Victory' : 'Defeat'}
          </h2>
          <p className="mt-2 text-gray-400 text-sm tracking-wide">{winnerText}</p>
        </div>

        <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
          {finalQuestions.filter((q) => q.history.some((h) => h.correct)).map((q, i) => {
            const winEntry = q.history.find((h) => h.correct)
            const answerer = finalPlayers.find((p) => p.playerId === winEntry?.playerId)
            const answererIsMe = answerer?.playerId === myPlayer?.playerId
            return (
              <div
                key={i}
                className="rounded-sm p-4"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <p className="mb-1 text-xs text-gray-600 uppercase tracking-widest">
                  Round {i + 1}
                </p>
                <p
                  className="mb-3 font-medium leading-snug"
                  style={{ fontFamily: 'var(--font-jost)' }}
                >
                  {q.question}
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="rounded-sm px-2 py-0.5 font-mono"
                    style={{
                      background: 'rgba(0,200,80,0.15)',
                      border: '1px solid rgba(0,200,80,0.3)',
                      color: '#4ade80',
                    }}
                  >
                    {q.correctAnswer}
                  </span>
                  <span
                    className="text-gray-300"
                    style={{ fontFamily: 'var(--font-jost)' }}
                  >
                    {q.correctAnswer ? q.choices[q.correctAnswer] : '—'}
                  </span>
                </div>
                <p className="mt-2 text-xs">
                  {answerer ? (
                    <span
                      style={{
                        color: answererIsMe ? '#60c8ff' : '#ff7070',
                        textShadow: answererIsMe
                          ? '0 0 8px rgba(0,191,255,0.5)'
                          : '0 0 8px rgba(255,50,50,0.5)',
                      }}
                    >
                      Answered by {answerer.name}
                    </span>
                  ) : (
                    <span className="text-gray-600">No one answered</span>
                  )}
                </p>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRematch}
            disabled={hasVotedRematch || rematchFailed || opponentLeft}
            className="flex-1 py-3 font-bold tracking-widest uppercase text-sm rounded-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, rgba(0,191,255,0.12), rgba(0,100,180,0.08))',
              border: '1px solid rgba(0,191,255,0.35)',
              color: '#00e0ff',
              boxShadow: '0 0 16px rgba(0,191,255,0.12)',
            }}
          >
            {opponentLeft
              ? 'Opponent fled'
              : rematchFailed
                ? 'Duel cancelled'
                : hasVotedRematch
                  ? `Awaiting… (${rematchVotes}/2)`
                  : 'Duel Again'}
          </button>
          <button
            onClick={onEndGame}
            className="flex-1 py-3 font-bold tracking-widest uppercase text-sm rounded-sm transition-all cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#888',
            }}
          >
            Return to Base
          </button>
        </div>
      </div>
    </Modal>
  )
}
