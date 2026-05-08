const WebSocket = require('ws')
const fs = require('fs')
const crypto = require('crypto')
const Redis = require('ioredis')

const NUM_QUESTIONS = 5

const INSTANCE_ID = process.env.PORT || '3001'
const WS_BASE_URL = process.env.WS_BASE_URL || `ws://localhost:${INSTANCE_ID}`

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: 6379,
})
const redisSub = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: 6379,
})

// session helpers
const getSession = async (token) => {
  const data = await redis.get(`session:${token}`)
  return data ? JSON.parse(data) : null
}
const saveSession = async (token, session) => {
  await redis.set(`session:${token}`, JSON.stringify(session))
}

// match queue to correct category game
const QUEUE_KEY = (categoryId) => `queue:${categoryId}`

// add player to matchmaking queue
const enquePlayer = async (categoryId, playerId, sessionToken) => {
  await redis.rpush(
    QUEUE_KEY(categoryId),
    JSON.stringify({ playerId, sessionToken }),
  )
}

// remove player from queue
const removeFromQueue = async (categoryId, playerId) => {
  const key = QUEUE_KEY(categoryId)
  const items = await redis.lrange(key, 0, -1)
  for (const item of items) {
    const parsed = JSON.parse(item)
    if (parsed.playerId === playerId) {
      await redis.lrem(key, 0, item)
      break
    }
  }
}

// match two players from the queue atomically
const tryMatchPlayers = async (categoryId) => {
  const key = QUEUE_KEY(categoryId)
  const script = `
    local p1 = redis.call('lpop', KEYS[1])
    if not p1 then return nil end
    local p2 = redis.call('lpop', KEYS[1])
    if not p2 then
      redis.call('lpush', KEYS[1], p1)
      return nil
    end
    return {p1, p2}
  `
  const result = await redis.eval(script, 1, key)
  if (!result) return null
  return { p1: JSON.parse(result[0]), p2: JSON.parse(result[1]) }
}

const wss = new WebSocket.Server({ port: parseInt(INSTANCE_ID) })
const clients = new Map() // playerId -> ws
const matches = new Map() // matchId -> match data
const sessionTimers = new Map() // sessionToken -> reconnect timers for pending disconnects

const registerClient = (ws) => clients.set(ws.playerId, ws)
const unregisterClient = (ws) => clients.delete(ws.playerId)
const findWs = (playerId) => clients.get(playerId)

// subscribe to matchmaking channel for this instance to receive match requests
redisSub.subscribe('matchmaking', `server:${INSTANCE_ID}`)

// when a matchmaking message is received, attempt to match two players and coordinate the match start
redisSub.on('message', async (channel, payload) => {
  if (channel === 'matchmaking') {
    const matchPair = await tryMatchPlayers(payload)
    if (!matchPair) return
    await coordinateMatch(
      matchPair.p1.sessionToken,
      matchPair.p2.sessionToken,
      payload,
    )
    return
  }

  if (channel === `server:${INSTANCE_ID}`) {
    const data = JSON.parse(payload)

    if (data.type === '__CANCEL_RECONNECT__') {
      const timers = sessionTimers.get(data.sessionToken)
      if (timers?.reconnectTimer) {
        clearTimeout(timers.reconnectTimer)
        sessionTimers.delete(data.sessionToken)
      }
      return
    }

    if (data.type === '__START_MATCH__') {
      const [s1, s2] = await Promise.all([
        getSession(data.p1Token),
        getSession(data.p2Token),
      ])
      if (!s1 || !s2) return
      const ws1 = clients.get(s1.playerId)
      const ws2 = clients.get(s2.playerId)
      if (!ws1 || !ws2) return
      await startMatch(ws1, ws2, data.categoryId)
      return
    }

    const ws = clients.get(data.playerId)
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data.msg))
    }
  }
})

// helper to send a message to a player on a specific instance (used for cross-instance coordination)
const sendToInstance = (serverId, playerId, msg) =>
  redis.publish(`server:${serverId}`, JSON.stringify({ playerId, msg }))

// coordinate which server will host the match and redirect users if needed
const coordinateMatch = async (p1Token, p2Token, categoryId) => {
  const [s1, s2] = await Promise.all([getSession(p1Token), getSession(p2Token)])
  if (!s1 || !s2) return

  if (s1.serverId === s2.serverId) {
    await redis.publish(
      `server:${s1.serverId}`,
      JSON.stringify({ type: '__START_MATCH__', p1Token, p2Token, categoryId }),
    )
    return
  }

  // randomly pick which player's server owns the match so matches distribute evenly
  const [owner, guest] = Math.random() < 0.5 ? [s1, s2] : [s2, s1]

  await Promise.all([
    saveSession(p1Token, {
      ...s1,
      pendingMatch: { partnerToken: p2Token, categoryId },
    }),
    saveSession(p2Token, {
      ...s2,
      pendingMatch: { partnerToken: p1Token, categoryId },
    }),
  ])

  await sendToInstance(guest.serverId, guest.playerId, {
    type: 'REDIRECT',
    url: owner.wsBaseUrl,
  })
}

const questions = JSON.parse(fs.readFileSync('./questions.json', 'utf-8'))
const TURN_DURATIONS = { shared: 20000, single: 10000 } // time limits for answering questions
const RECONNECT_GRACE_MS = 10000 // time allowed for a player to reconnect before forfeit
const HEARTBEAT_MS = 20000 // interval for checking if clients are still connected (ping/pong)

console.log(`Server running on ws://localhost:${INSTANCE_ID}`)

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) {
      ws.terminate()
      return
    }
    ws.alive = false
    ws.ping()
  })
}, HEARTBEAT_MS)

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const sessionToken = url.searchParams.get('sessionToken')

  ws.alive = true
  ws.on('pong', () => {
    ws.alive = true
  })

  // on refresh, restore session and match state to continue game
  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      await handleReconnect(ws, sessionToken, session)
      return
    }
  }

  const categoryId = url.searchParams.get('categoryId') || '1'
  const rawName = url.searchParams.get('name') || ''
  const token = crypto.randomBytes(16).toString('hex')

  ws.playerId = await redis.incr('global:playerId')
  registerClient(ws)

  ws.sessionToken = token
  ws.categoryId = categoryId
  ws.matchId = null
  ws.name = rawName.trim().slice(0, 20) || `Player ${ws.playerId}`

  // save session to redis so its available across instances for matchmaking and reconnects
  await saveSession(token, {
    playerId: ws.playerId,
    name: ws.name,
    categoryId,
    matchId: null,
    matchServerId: null,
    serverId: INSTANCE_ID,
    wsBaseUrl: WS_BASE_URL,
    pendingMatch: null,
  })

  console.log(
    `Player connected: ${ws.playerId}  Name: ${ws.name}  Category: ${categoryId}`,
  )

  // handle incoming messages and disconnections
  ws.on('message', (msg) => handleMessage(ws, msg))
  ws.on('close', () => handleDisconnect(ws))

  // confirm connection, attempt to find match
  send(ws, { type: 'CONNECTED', playerId: ws.playerId, sessionToken: token })
  await matchmake(ws)
})

// add player to matchmaking queue and notify them to wait for an opponent
const matchmake = async (ws) => {
  await enquePlayer(ws.categoryId, ws.playerId, ws.sessionToken)
  send(ws, { type: 'WAITING' })
  await redis.publish('matchmaking', ws.categoryId)
}

// reconnect player to their session and active match
const handleReconnect = async (ws, sessionToken, session) => {
  // cancel any pending reconnect timer — on this instance or a remote one
  if (session.serverId !== INSTANCE_ID) {
    await redis.publish(
      `server:${session.serverId}`,
      JSON.stringify({ type: '__CANCEL_RECONNECT__', sessionToken }),
    )
  } else {
    const timers = sessionTimers.get(sessionToken)
    if (timers?.reconnectTimer) {
      clearTimeout(timers.reconnectTimer)
      sessionTimers.delete(sessionToken)
    }
  }

  ws.sessionToken = sessionToken
  ws.playerId = session.playerId
  ws.name = session.name
  ws.categoryId = session.categoryId
  ws.matchId = session.matchId

  registerClient(ws)
  await saveSession(sessionToken, {
    ...session,
    serverId: INSTANCE_ID,
    wsBaseUrl: WS_BASE_URL,
  })

  ws.on('message', (msg) => handleMessage(ws, msg))
  ws.on('close', () => handleDisconnect(ws))

  console.log(`Player reconnected: ${ws.playerId}`)

  // their active match lives on a different instance — redirect there
  if (session.matchServerId && session.matchServerId !== INSTANCE_ID) {
    send(ws, {
      type: 'REDIRECT',
      url: `ws://localhost:${session.matchServerId}`,
    })
    return
  }

  // arriving after a cross-instance redirect — check if partner is local yet
  if (session.pendingMatch) {
    const { partnerToken, categoryId } = session.pendingMatch

    // lock prevents both players from racing to start the match simultaneously
    const lockKey = `pending_lock:${[sessionToken, partnerToken].sort().join(':')}`
    const lock = await redis.set(lockKey, 1, 'NX', 'EX', 5)

    if (lock) {
      const partnerSession = await getSession(partnerToken)
      const partnerWs = partnerSession
        ? clients.get(partnerSession.playerId)
        : null

      await Promise.all([
        saveSession(sessionToken, {
          ...session,
          serverId: INSTANCE_ID,
          pendingMatch: null,
        }),
        partnerSession
          ? saveSession(partnerToken, { ...partnerSession, pendingMatch: null })
          : Promise.resolve(),
      ])

      if (partnerWs) {
        await startMatch(ws, partnerWs, categoryId)
      } else {
        // partner never arrived — re-queue this player
        send(ws, { type: 'CONNECTED', playerId: ws.playerId, sessionToken })
        await matchmake(ws)
      }
    }
    return
  }

  // normal reconnect to an active match on this instance
  const match = ws.matchId !== null ? matches.get(ws.matchId) : null

  if (!match) {
    ws.matchId = null
    await saveSession(sessionToken, {
      ...session,
      matchId: null,
      matchServerId: null,
      serverId: INSTANCE_ID,
      pendingMatch: null,
    })
    send(ws, { type: 'CONNECTED', playerId: ws.playerId, sessionToken })
    await matchmake(ws)
    return
  }

  const idx = match.players.findIndex((p) => p.playerId === ws.playerId)
  if (idx !== -1) match.players[idx] = ws

  send(ws, buildReconnectState(ws.playerId, sessionToken, match))
}

// build the state needed for a player to reconnect to an active match in progress
const buildReconnectState = (playerId, sessionToken, match) => {
  const count = match.ended ? match.currentQuestion : match.currentQuestion + 1
  const questionsList = match.questions.slice(0, count).map((q, i) => {
    const data = match.questionData[i] || { history: [], correctAnswer: null }
    return {
      question: q.question,
      choices: { A: q.A, B: q.B, C: q.C, D: q.D },
      history: data.history,
      correctAnswer: data.correctAnswer,
      index: i,
    }
  })

  return {
    type: 'RECONNECT_STATE',
    sessionToken,
    playerId,
    match: {
      matchId: match.id,
      players: match.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
      })),
      numQuestions: match.questions.length,
      scores: match.scores,
      ended: match.ended || false,
      questions: questionsList,
      currentQuestionIndex: match.currentQuestion,
      turnPhase: match.ended ? null : match.turnPhase,
      turnPlayerId: match.ended ? null : match.turnOwnerId,
      turnEndsAt: match.ended ? null : match.turnEndsAt,
      turnDurationMs: match.ended
        ? null
        : match.turnPhase === 'shared'
          ? TURN_DURATIONS.shared
          : TURN_DURATIONS.single,
    },
  }
}

const startMatch = async (p1, p2, categoryId) => {
  const categoryQuestions = questions[categoryId] || questions['1']
  const matchId = await redis.incr('global:matchId')

  const match = {
    id: matchId, // unique match ID
    players: [p1, p2], // player objects for each participant
    playerTokens: [p1.sessionToken, p2.sessionToken], // session tokens for cross-instance coordination
    currentQuestion: 0, // current question index in the match
    questions: shuffle([...categoryQuestions]).slice(0, NUM_QUESTIONS),
    categoryId,
    answered: false, // if current question is complete and answered correctly
    lastResponder: null, // playerId of last person to make guess (used to determine answering order in shared phase)
    turnTimer: null, // timer for enforcing turn time limits
    turnPhase: null, // 'shared' or 'single' to indicate if both players can answer or just one
    turnOwnerId: null, // playerId of who can answer during single phase
    turnEndsAt: null, // timestamp for when current turn expires
    scores: { [p1.playerId]: 0, [p2.playerId]: 0 }, // 1 point per correct answer
    questionData: [], // answer history and correct answer for each question for replay on reconnect
    ended: false, // if the match is over
    cleanupTimer: null, // timer for cleaning up match after it ends
  }

  for (let i = 0; i < match.questions.length; i++) {
    match.questionData.push({ history: [], correctAnswer: null })
  }

  matches.set(match.id, match)
  p1.matchId = match.id
  p2.matchId = match.id

  // record which instance owns this match so reconnecting players can be routed here
  const [s1, s2] = await Promise.all([
    getSession(p1.sessionToken),
    getSession(p2.sessionToken),
  ])
  await Promise.all([
    s1
      ? saveSession(p1.sessionToken, {
          ...s1,
          matchId: match.id,
          matchServerId: INSTANCE_ID,
        })
      : Promise.resolve(),
    s2
      ? saveSession(p2.sessionToken, {
          ...s2,
          matchId: match.id,
          matchServerId: INSTANCE_ID,
        })
      : Promise.resolve(),
  ])

  console.log(`Match started: ${match.id}`)

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

  setTimeout(() => sendQuestion(match), 3000) // give 3 seconds for countdown animation
}

const clearTurnTimer = (match) => {
  if (match.turnTimer) {
    clearTimeout(match.turnTimer)
    match.turnTimer = null
  }
}

// inform each client of turn state and how much time is left
const broadcastTurnState = (match, phase, playerId, durationMs) => {
  const endsAt = Date.now() + durationMs
  match.players.forEach((p) => {
    send(p, { type: 'TURN_STATE', phase, playerId, durationMs, endsAt })
  })
  return endsAt
}

// schedule next turn with time limit
const scheduleTurn = (match, phase, playerId, durationMs) => {
  clearTurnTimer(match)
  match.turnPhase = phase
  match.turnOwnerId = playerId
  match.turnEndsAt = broadcastTurnState(match, phase, playerId, durationMs)

  match.turnTimer = setTimeout(() => {
    if (match.answered || !matches.has(match.id)) return

    const nextPlayer =
      phase === 'shared'
        ? match.lastResponder
          ? match.players.find((p) => p.playerId !== match.lastResponder)
          : match.players[match.currentQuestion % match.players.length]
        : match.players.find((p) => p.playerId !== playerId)

    if (!nextPlayer) return
    scheduleTurn(match, 'single', nextPlayer.playerId, TURN_DURATIONS.single)
  }, durationMs)
}

// send current question to players and start shared answering phase
const sendQuestion = async (match) => {
  if (match.currentQuestion >= match.questions.length) {
    endMatch(match)
    return
  }

  const q = match.questions[match.currentQuestion]
  match.answered = false
  match.lastResponder = null

  match.players.forEach((p) => {
    send(p, {
      type: 'QUESTION',
      question: q.question,
      choices: { A: q.A, B: q.B, C: q.C, D: q.D },
      index: match.currentQuestion,
    })
  })

  scheduleTurn(match, 'shared', null, TURN_DURATIONS.shared)
}

// handle incoming messages from clients — only answers, quits, or rematch requests
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

const handleAnswer = async (ws, data) => {
  const match = matches.get(ws.matchId)
  if (!match) return
  if (match.answered) return

  // block answers from players who just answered incorrectly (needed to prevent another guess before turn switches in shared phase)
  if (match.lastResponder === ws.playerId) {
    send(ws, { type: 'NOT_YOUR_TURN' })
    return
  }

  // block answers from non-turn owners during single phase
  if (match.turnPhase === 'single' && match.turnOwnerId !== ws.playerId) {
    send(ws, { type: 'NOT_YOUR_TURN' })
    return
  }

  const q = match.questions[match.currentQuestion]
  const answer = (data.answer || '').toUpperCase().trim()
  if (!['A', 'B', 'C', 'D'].includes(answer)) return

  const correct = answer === q.answer
  const qData = match.questionData[match.currentQuestion]

  if (!correct) {
    match.lastResponder = ws.playerId
    qData.history.push({ playerId: ws.playerId, guess: answer, correct: false })
    const other = match.players.find((p) => p.playerId !== ws.playerId)
    match.players.forEach((p) =>
      send(p, { type: 'WRONG', playerId: ws.playerId, guessed: answer }),
    )
    if (other)
      scheduleTurn(match, 'single', other.playerId, TURN_DURATIONS.single)
    return
  }

  // lock to prevent race conditions where both players answer correctly at the same time in shared phase
  const lockKey = `match:${match.id}:q:${match.currentQuestion}:winner`
  const lock = await redis.set(lockKey, ws.playerId, 'NX', 'EX', 120) // set key if not exists with 2 minute expiration to prevent stale locks
  if (!lock) return // other player answered first, ignore answer

  match.answered = true
  clearTurnTimer(match)
  match.scores[ws.playerId]++
  qData.history.push({ playerId: ws.playerId, guess: answer, correct: true })
  qData.correctAnswer = q.answer

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

  if (!match.rematchVotes) match.rematchVotes = new Set()

  if (!match.rematchTimer) {
    match.rematchTimer = setTimeout(() => {
      match.rematchVotes = new Set()
      match.players.forEach((p) => send(p, { type: 'REMATCH_FAILED' }))
      match.rematchTimer = null
      deleteMatch(match)
    }, 10000)
  }

  // require both players to vote for a rematch within the time limit
  match.rematchVotes.add(ws.playerId)
  match.players.forEach((p) =>
    send(p, { type: 'REMATCH_VOTE', votes: match.rematchVotes.size }),
  )

  if (match.rematchVotes.size === 2) {
    clearTimeout(match.rematchTimer)
    clearTimeout(match.cleanupTimer)
    match.rematchTimer = null
    match.rematchVotes = new Set()
    const players = match.players
    const categoryId = match.categoryId
    deleteMatch(match)
    startMatch(players[0], players[1], categoryId)
  }
}

const handleQuit = (ws) => {
  const match = matches.get(ws.matchId)
  if (!match) return
  forfeitMatch(match, ws.playerId)
}

const forfeitMatch = (match, quittingPlayerId) => {
  if (!matches.has(match.id)) return
  clearTurnTimer(match)
  clearTimeout(match.cleanupTimer)
  match.players.forEach((p) => {
    if (p.playerId !== quittingPlayerId) send(p, { type: 'OPPONENT_LEFT' })
  })
  deleteMatch(match)
}

const deleteMatch = (match) => {
  if (!matches.has(match.id)) return
  matches.delete(match.id)
  match.playerTokens.forEach(async (token) => {
    const sess = await getSession(token)
    if (sess) {
      await saveSession(token, { ...sess, matchId: null, matchServerId: null })
      await redis.expire(`session:${token}`, 60)
    }
  })
}

const handleDisconnect = async (ws) => {
  console.log(`Disconnected: ${ws.playerId}`)
  unregisterClient(ws)
  await removeFromQueue(ws.categoryId, ws.playerId)

  if (ws.matchId !== null) {
    const match = matches.get(ws.matchId)
    if (match && !match.ended) {
      const timers = {}
      timers.reconnectTimer = setTimeout(async () => {
        const m = matches.get(ws.matchId)
        if (m && !m.ended) forfeitMatch(m, ws.playerId)
        await redis.expire(`session:${ws.sessionToken}`, 60)
        sessionTimers.delete(ws.sessionToken)
      }, RECONNECT_GRACE_MS)
      sessionTimers.set(ws.sessionToken, timers)
    }
    return
  }

  await redis.expire(`session:${ws.sessionToken}`, 60)
}

const endMatch = (match) => {
  clearTurnTimer(match)
  match.ended = true
  match.players.forEach((p) =>
    send(p, { type: 'GAME_OVER', scores: match.scores }),
  )
  match.cleanupTimer = setTimeout(() => deleteMatch(match), 30000)
}

const send = (ws, msg) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
