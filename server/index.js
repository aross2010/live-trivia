const WebSocket = require('ws')
const fs = require('fs')

const wss = new WebSocket.Server({ port: 3001 })

let waitingPlayers = new Map() // categoryId, waiting players
let playerIdCounter = 0
let matchIdCounter = 0

const matches = new Map()
const questions = JSON.parse(fs.readFileSync('./questions.json', 'utf-8'))
const TURN_DURATIONS = {
  shared: 20000,
  single: 10000,
}

console.log('Server running on ws://localhost:3001')

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const categoryId = url.searchParams.get('categoryId') || '1'
  const name = url.searchParams.get('name')

  console.log(categoryId, name)

  ws.categoryId = categoryId
  ws.playerId = playerIdCounter++
  ws.matchId = null
  ws.name = name.trim().slice(0, 20) || `Player ${ws.playerId}`

  console.log(
    'Player connected:',
    ws.playerId,
    ' Name:',
    ws.name,
    ' Category:',
    categoryId,
  )

  ws.on('message', (msg) => handleMessage(ws, msg)) // incoming handle messages from this player
  ws.on('close', () => handleDisconnect(ws)) // handle player disconnects

  send(ws, { type: 'CONNECTED', playerId: ws.playerId })

  const queue = waitingPlayers.get(categoryId) || []

  if (queue.length === 0) {
    // no one waiting, add player to queu
    queue.push(ws)
    waitingPlayers.set(categoryId, queue)

    send(ws, { type: 'WAITING' })
  } else {
    const opponent = queue.shift() // get waiting player

    if (queue.length === 0) {
      waitingPlayers.delete(categoryId) // reset waiting player to allow new game to begin for next players
    }

    startMatch(opponent, ws, categoryId)
  }
})

const startMatch = (p1, p2, categoryId) => {
  const categoryQuestions = questions[categoryId] || questions['1']

  const match = {
    id: matchIdCounter++,
    players: [p1, p2],
    currentQuestion: 0,
    questions: shuffle([...categoryQuestions]).slice(0, 3),
    categoryId,
    answered: false, // has question been answered
    lastResponder: null, // keep track of who answered last, players take turns after initial response
    turnTimer: null,
    turnPhase: null,
    turnOwnerId: null,
    turnEndsAt: null,

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
      players: match.players.map((pl) => ({
        playerId: pl.playerId,
        name: pl.name,
      })),
      numQuestions: match.questions.length,
    })
  })

  sendQuestion(match)
}

const clearTurnTimer = (match) => {
  if (match.turnTimer) {
    clearTimeout(match.turnTimer)
    match.turnTimer = null
  }
}

const broadcastTurnState = (match, phase, playerId, durationMs) => {
  const endsAt = Date.now() + durationMs

  match.players.forEach((p) => {
    send(p, {
      type: 'TURN_STATE',
      phase,
      playerId,
      durationMs,
      endsAt,
    })
  })

  return endsAt
}

const scheduleTurn = (match, phase, playerId, durationMs) => {
  clearTurnTimer(match)

  match.turnPhase = phase
  match.turnOwnerId = playerId
  match.turnEndsAt = broadcastTurnState(match, phase, playerId, durationMs)

  match.turnTimer = setTimeout(() => {
    if (match.answered || !matches.has(match.id)) return

    const nextPlayer =
      phase === 'shared'
        ? match.players[match.currentQuestion % match.players.length]
        : match.players.find((p) => p.playerId !== playerId)

    if (!nextPlayer) return

    scheduleTurn(match, 'single', nextPlayer.playerId, TURN_DURATIONS.single)
  }, durationMs)
}

const sendQuestion = (match) => {
  if (match.currentQuestion >= match.questions.length) {
    endMatch(match)
    return
  }

  const q = match.questions[match.currentQuestion]
  match.answered = false
  match.lastResponder = null

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

  scheduleTurn(match, 'shared', null, TURN_DURATIONS.shared)
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

  // reject if not this player's turn
  if (match.lastResponder === ws.playerId) {
    send(ws, { type: 'NOT_YOUR_TURN' })
    return
  }

  const q = match.questions[match.currentQuestion]
  const answer = (data.answer || '').toUpperCase().trim()

  if (!['A', 'B', 'C', 'D'].includes(answer)) return

  const correct = answer === q.answer

  // wrong, other player gets chance to answer
  if (!correct) {
    match.lastResponder = ws.playerId

    const other = match.players.find((p) => p.playerId !== ws.playerId)

    match.players.forEach((p) => {
      send(p, { type: 'WRONG', playerId: ws.playerId, guessed: answer })
    })

    if (other) {
      scheduleTurn(match, 'single', other.playerId, TURN_DURATIONS.single)
    }

    return
  }

  // correct, end question, update score, send result to both players
  match.answered = true
  clearTurnTimer(match)
  match.scores[ws.playerId]++

  match.players.forEach((p) => {
    send(p, {
      type: 'RESULT',
      winnerId: ws.playerId,
      guessed: answer,
      correct: true,
      correctAnswer: q.answer,
      scores: match.scores,
    })
  })

  setTimeout(() => {
    match.currentQuestion++
    sendQuestion(match)
  }, 1000)
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

    startMatch(match.players[0], match.players[1], match.categoryId)
  }
}

const handleQuit = (ws) => {
  const match = matches.get(ws.matchId)
  if (!match) return

  clearTurnTimer(match)

  match.players.forEach((p) => {
    if (p !== ws) {
      send(p, { type: 'OPPONENT_LEFT' })
    }
  })

  matches.delete(match.id)
}

const handleDisconnect = (ws) => {
  console.log('Disconnected:', ws.playerId)

  // player is in a match
  if (ws.matchId !== null) {
    handleQuit(ws)
    return
  }

  // player is waiting in queue
  const queue = waitingPlayers.get(ws.categoryId)

  if (queue) {
    const index = queue.indexOf(ws)

    if (index !== -1) {
      queue.splice(index, 1)

      if (queue.length === 0) {
        waitingPlayers.delete(ws.categoryId)
      }
    }
  }
}

const endMatch = (match) => {
  clearTurnTimer(match)

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
