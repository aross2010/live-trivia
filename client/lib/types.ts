export type Letters = 'A' | 'B' | 'C' | 'D'

export type Question = {
  question: string
  choices: Record<Letters, string> //
  history: {
    playerId: number
    guess: Letters
    correct: boolean
  }[] // in order history of guesses, display in UI, allow to take turns after initial response
}

// two players
export type Player = {
  playerId: number
  name: string
}
