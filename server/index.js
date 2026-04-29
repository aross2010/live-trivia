const WebSocket = require('ws')
const fs = require('fs')

const wss = new WebSocket.Server({ port: 3001 })

let waitingPlayer = null
let playerIdCounter = 0
let matchIdCounter = 0

const matches = new Map()
const questions = JSON.parse(fs.readFileSync('./questions.json', 'utf-8'))

console.log('Server running on ws://localhost:3001')

wss.on('connection', (ws) => {
  ws.playerId = playerIdCounter++
  ws.matchId = null

  console.log('Player connected:', ws.playerId)

  ws.on('message', (msg) => handleMessage(ws, msg)) // incoming handle messages from this player
  ws.on('close', () => handleDisconnect(ws)) // handle player disconnects

  send(ws, { type: 'CONNECTED', playerId: ws.playerId })

  if (!waitingPlayer) {
    // first player waits for opponent
    waitingPlayer = ws
    send(ws, { type: 'WAITING' })
  } else {
    const p1 = waitingPlayer
    const p2 = ws
    waitingPlayer = null // reset waiting player to allow new game to begin for next players

    startMatch(p1, p2)
  }
})

const startMatch = (p1, p2) => {
  const match = {
    id: matchIdCounter++,
    players: [p1, p2],
    currentQuestion: 0,
    questions: shuffle([...questions]).slice(0, 3),

    answered: false, // has question been answered
    lastResponder: null, // keep track of who answered last, players take turns after initial response

    scores: {
      // one point per correct answer
      [p1.playerId]: 0,
      [p2.playerId]: 0,
    },
  }

  matches.set(match.id, match) // new match state

  p1.matchId = match.id
  p2.matchId = match.id

  console.log('Match started:', match.id)

  match.players.forEach((p) => {
    send(p, {
      type: 'MATCH_FOUND',
      matchId: match.id,
      players: match.players.map((pl) => pl.playerId),
    })
  })

  sendQuestion(match)
}

const sendQuestion = (match) => {
  if (match.currentQuestion >= match.questions.length) {
    endMatch(match)
    return
  }

  const q = match.questions[match.currentQuestion]
  match.answered = false

  // send question to both players
  match.players.forEach((p) => {
    send(p, {
      type: 'QUESTION',
      question: q.question,
      choices: {
        A: q.A,
        B: q.B,
        C: q.C,
        D: q.D,
      },
      index: match.currentQuestion,
    })
  })
}

const handleMessage = (ws, raw) => {
  let data

  try {
    data = JSON.parse(raw)
  } catch {
    return
  }

  if (!data.type) return

  switch (data.type) {
    case 'ANSWER':
      handleAnswer(ws, data)
      break

    case 'REMATCH':
      handleRematch(ws)
      break

    case 'QUIT':
      handleQuit(ws)
      break
  }
}

const handleAnswer = (ws, data) => {
  const match = matches.get(ws.matchId)
  if (!match) return

  if (match.answered) return

  const q = match.questions[match.currentQuestion]
  const answer = (data.answer || '').toUpperCase().trim()

  if (!['A', 'B', 'C', 'D'].includes(answer)) return

  const correct = answer === q.answer

  // wrong, other player gets chance to answer
  if (!correct) {
    match.lastResponder = ws.playerId

    const other = match.players.find((p) => p.playerId !== ws.playerId)

    send(ws, { type: 'WRONG' })
    send(other, { type: 'YOUR_TURN' })

    return
  }

  // correct, end question, update score, send result to both players
  match.answered = true
  match.scores[ws.playerId]++

  match.players.forEach((p) => {
    send(p, {
      type: 'RESULT',
      winnerId: ws.playerId,
      correctAnswer: q.answer,
      scores: match.scores,
    })
  })

  setTimeout(() => {
    match.currentQuestion++
    sendQuestion(match)
  }, 1500)
}

const handleRematch = (ws) => {
  const match = matches.get(ws.matchId)
  if (!match) return

  if (!match.rematchVotes) {
    match.rematchVotes = new Set()
  }

  if (!match.rematchTimer) {
    match.rematchTimer = setTimeout(() => {
      match.rematchVotes = new Set()

      match.players.forEach((p) => {
        send(p, { type: 'REMATCH_FAILED' })
      })

      match.rematchTimer = null
    }, 10000)
  }

  match.rematchVotes.add(ws.playerId)

  match.players.forEach((p) => {
    send(p, {
      type: 'REMATCH_VOTE',
      votes: match.rematchVotes.size,
    })
  })

  if (match.rematchVotes.size === 2) {
    clearTimeout(match.rematchTimer)
    match.rematchTimer = null
    match.rematchVotes = new Set()

    startMatch(match.players[0], match.players[1])
  }
}

const handleQuit = (ws) => {
  const match = matches.get(ws.matchId)
  if (!match) return

  match.players.forEach((p) => {
    if (p !== ws) {
      send(p, { type: 'OPPONENT_LEFT' })
    }
  })

  matches.delete(match.id)
}

const handleDisconnect = (ws) => {
  console.log('Disconnected:', ws.playerId)

  if (waitingPlayer === ws) {
    waitingPlayer = null
    return
  }

  handleQuit(ws)
}

const endMatch = (match) => {
  match.players.forEach((p) => {
    send(p, {
      type: 'GAME_OVER',
      scores: match.scores,
    })
  })

  matches.delete(match.id)
}

const send = (ws, msg) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

const shuffle = (arr) => {
  return arr.sort(() => Math.random() - 0.5)
}
