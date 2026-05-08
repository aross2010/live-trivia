import { FiCheck, FiX } from 'react-icons/fi'
import { Question } from '@/lib/types'

const CHOICE_DEFAULT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: 'none',
}
const CHOICE_CORRECT: React.CSSProperties = {
  background: 'rgba(0,200,80,0.15)',
  border: '1px solid rgba(0,200,80,0.4)',
  boxShadow: '0 0 20px rgba(0,200,80,0.2)',
}
const CHOICE_WRONG: React.CSSProperties = {
  background: 'rgba(220,0,0,0.15)',
  border: '1px solid rgba(220,0,0,0.35)',
  boxShadow: '0 0 16px rgba(220,0,0,0.2)',
}

type Props = {
  currentQuestion: Question
  playerId: number | null
  isPlayerTurn: boolean
  turnSecondsRemaining: number
  turnProgress: number
  isOpponentTurn: boolean
  questionNumber: number
  numQuestions: number
  onAnswer: (key: string) => void
}

export default function QuestionCard({
  currentQuestion,
  playerId,
  isPlayerTurn,
  turnSecondsRemaining,
  turnProgress,
  isOpponentTurn,
  questionNumber,
  numQuestions,
  onAnswer,
}: Props) {
  const { question, choices, history } = currentQuestion

  const timerGradient = isOpponentTurn
    ? 'linear-gradient(to right, #7f0000, #cc0000, #ff4444)'
    : 'linear-gradient(to right, #004080, #0080cc, #00ccff)'
  const timerGlow = isOpponentTurn
    ? '0 0 14px rgba(220,0,0,0.5)'
    : '0 0 14px rgba(0,191,255,0.5)'

  const lastGuess = history[history.length - 1]
  const canAnswer = isPlayerTurn && lastGuess?.playerId !== playerId

  return (
    <div
      style={{ animation: 'slide-in-from-right 0.45s ease-out both' }}
      className="flex flex-col gap-4 mt-8 w-full max-w-2xl"
    >
      <h3
        className="text-xl text-left leading-relaxed"
        style={{ fontFamily: 'var(--font-jost)' }}
      >
        {question}
      </h3>

      <div className="flex items-center gap-3">
        <small className="text-gray-600 text-xs tracking-widest w-8 text-right tabular-nums">
          {turnSecondsRemaining}s
        </small>
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-linear"
            style={{
              width: `${turnProgress}%`,
              background: timerGradient,
              boxShadow: timerGlow,
            }}
          />
        </div>
      </div>

      <div className="md:grid-cols-2 grid-cols-1 grid gap-2 mt-2">
        {Object.entries(choices).map(([key, val]) => {
          const myGuess = history.find((h) => h.playerId === playerId && h.guess === key)
          const isCorrect = myGuess?.correct === true
          const isWrong = myGuess?.correct === false
          const style = isCorrect ? CHOICE_CORRECT : isWrong ? CHOICE_WRONG : CHOICE_DEFAULT

          return (
            <button
              key={key}
              onClick={() => onAnswer(key)}
              disabled={!canAnswer}
              className="p-4 min-h-24 transition-all duration-200 rounded-sm flex flex-col items-start justify-between cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={style}
              onMouseEnter={(e) => {
                if (!canAnswer || isCorrect || isWrong) return
                const el = e.currentTarget
                el.style.border = '1px solid rgba(0,191,255,0.4)'
                el.style.boxShadow =
                  '0 0 20px rgba(0,191,255,0.15), inset 0 0 20px rgba(0,191,255,0.04)'
                el.style.background = 'rgba(0,191,255,0.07)'
              }}
              onMouseLeave={(e) => {
                if (!canAnswer || isCorrect || isWrong) return
                const el = e.currentTarget
                el.style.border = '1px solid rgba(255,255,255,0.08)'
                el.style.boxShadow = 'none'
                el.style.background = 'rgba(255,255,255,0.04)'
              }}
            >
              <p className="text-xl font-mono">
                {isCorrect ? (
                  <FiCheck className="text-2xl text-green-400" />
                ) : isWrong ? (
                  <FiX className="text-2xl text-red-400" />
                ) : (
                  <span className="text-gray-500">{key}.</span>
                )}
              </p>
              <p className="text-lg" style={{ fontFamily: 'var(--font-jost)' }}>
                {val}
              </p>
            </button>
          )
        })}
      </div>

      <small className="text-center mt-4 text-gray-600 tracking-widest text-xs uppercase">
        Round {questionNumber} of {numQuestions}
      </small>
    </div>
  )
}
