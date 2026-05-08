import { Player } from '@/lib/types'
import CrossedSabers from './crossed-sabers'

type Props = {
  player1: Player | undefined
  player2: Player
  player1Score: number
  player2Score: number
  p1Active: boolean
  p2Active: boolean
}

export default function Scoreboard({
  player1,
  player2,
  player1Score,
  player2Score,
  p1Active,
  p2Active,
}: Props) {
  return (
    <div className="flex items-center justify-center gap-4 w-full max-w-sm mt-2">
      <div className="flex flex-col items-center flex-1 gap-1">
        <span
          className={`text-sm font-semibold tracking-wide truncate max-w-28 text-center ${p1Active ? 'saber-glow-blue-active' : 'saber-glow-blue'}`}
        >
          {player1?.name}
        </span>
        <span
          className="text-6xl font-black leading-none"
          style={{
            color: '#00bfff',
            textShadow: '0 0 20px rgba(0,191,255,0.7), 0 0 50px rgba(0,191,255,0.3)',
          }}
        >
          {player1Score}
        </span>
      </div>

      <CrossedSabers />

      <div className="flex flex-col items-center flex-1 gap-1">
        <span
          className={`text-sm font-semibold tracking-wide truncate max-w-28 text-center ${p2Active ? 'saber-glow-red-active' : 'saber-glow-red'}`}
        >
          {player2.name}
        </span>
        <span
          className="text-6xl font-black leading-none"
          style={{
            color: '#ff4444',
            textShadow: '0 0 20px rgba(255,50,50,0.7), 0 0 50px rgba(255,50,50,0.3)',
          }}
        >
          {player2Score}
        </span>
      </div>
    </div>
  )
}
