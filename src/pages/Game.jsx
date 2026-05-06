import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

const SYSTEM_PROMPT = `You are an expert Dungeon Master for a text-based fantasy RPG. Your role is to create an immersive, dynamic, and engaging adventure.

RULES:
- Narrate vividly. Describe scenes with atmosphere, tension, and detail.
- Address players by name when multiple are present.
- Address players by name when multiple are present.
- NEVER speak or act on behalf of player characters. If a player uses @mention to address another player, acknowledge it narratively but wait for that player to respond themselves. Only control NPCs and the world, never other players.
- React to EVERYTHING the player does.
- When combat occurs, roll dice explicitly: "Rolling d20... [result]!" and describe outcomes dramatically.
- Keep responses to 3-5 paragraphs max.
- End with a clear prompt or 2-3 suggested actions in *italics*.
- Track player HP. If they take damage, tell them.
- Address players by name when multiple are present.

When HP or gold changes, include at the END of your response:
<state_update>
{"hp": NEW_HP, "gold": NEW_GOLD}
</state_update>`

function parseStateUpdate(text) {
  const match = text.match(/<state_update>([\s\S]*?)<\/state_update>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function cleanText(text) {
  return text.replace(/<state_update>[\s\S]*?<\/state_update>/g, '').trim()
}

export default function Game() {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const roomCode = searchParams.get('room')
  const isHost = searchParams.get('host') === 'true'

  const { player, gameState, updateGameState, messages, addMessage, setMessages } = useGame()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showRoomCode, setShowRoomCode] = useState(false)
  const [players, setPlayers] = useState([])
  const [dmBusy, setDmBusy] = useState(false)
  const [typers, setTypers] = useState([])
  const [mentionSearch, setMentionSearch] = useState(null)
  const [filteredPlayers, setFilteredPlayers] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const hasStarted = useRef(false)
  const hasAnnounced = useRef(false)
  const typingTimeoutRef = useRef(null)

 const prevMessageCount = useRef(0)

useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCount.current = messages.length
  }, [messages])

  useEffect(() => {
    if (!campaignId) return
    loadMessages()
    const cleanup = subscribeToMessages()
    subscribeToPresence()
    loadPlayers()
    checkDmBusy()

    const poll = setInterval(() => {
      loadMessages()
      checkDmBusy()
    }, 3000)

    return () => {
      cleanup()
      clearInterval(poll)
    }
  }, [campaignId])

  useEffect(() => {
    if (player && messages.length === 0 && !hasStarted.current && isHost) {
      hasStarted.current = true
      startAdventure()
    }
    if (player && messages.length > 0 && !isHost && !hasAnnounced.current) {
      hasAnnounced.current = true
      saveMessage('player', `⚔️ ${player.name} the ${player.class} has joined the adventure!`, player.name)
    }
  }, [player, messages.length])

  async function checkDmBusy() {
    const { data } = await supabase
      .from('campaigns')
      .select('dm_busy')
      .eq('id', campaignId)
      .single()
    if (data) setDmBusy(data.dm_busy)
  }

  async function setDmBusyState(busy) {
    await supabase
      .from('campaigns')
      .update({ dm_busy: busy })
      .eq('id', campaignId)
    setDmBusy(busy)
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      setMessages(prev => {
        if (prev.length === data.length) return prev
        return data.map(m => ({ role: m.role, text: m.content, playerName: m.player_name }))
      })
      hasStarted.current = true
    }
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from('messages')
      .select('player_name')
      .eq('campaign_id', campaignId)
      .eq('role', 'player')

    if (data) {
      const unique = [...new Set(data.map(m => m.player_name).filter(Boolean))]
      setPlayers(unique)
    }
  }

  function subscribeToMessages() {
    const channel = supabase.channel(`messages:${campaignId}`)

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `campaign_id=eq.${campaignId}`
      },
      (payload) => {
        const msg = payload.new
        addMessage({ role: msg.role, text: msg.content, playerName: msg.player_name })
        if (msg.role === 'player') loadPlayers()
      }
    )

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'campaigns',
        filter: `id=eq.${campaignId}`
      },
      (payload) => {
        setDmBusy(payload.new.dm_busy)
      }
    )

    channel.subscribe()
    return () => supabase.removeChannel(channel)
  }

  function subscribeToPresence() {
    const channel = supabase.channel(`presence:${campaignId}`)

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const typing = Object.entries(state)
        .filter(([key, val]) => val[0]?.typing && key !== player?.name)
        .map(([key]) => key)
      setTypers(typing)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ typing: false })
      }
    })

    return channel
  }

  async function handleTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {}, 2000)
  }

  async function saveMessage(role, content, playerName = null) {
    await supabase.from('messages').insert({
      campaign_id: campaignId,
      player_id: player?.id,
      role,
      content,
      player_name: playerName
    })
  }

  function handleInput(value) {
    setInput(value)
    const atIndex = value.lastIndexOf('@')
    if (atIndex !== -1) {
      const search = value.slice(atIndex + 1).toLowerCase()
      const filtered = players.filter(p =>
        p.toLowerCase().startsWith(search) && p !== player?.name
      )
      setMentionSearch(search)
      setFilteredPlayers(filtered)
    } else {
      setMentionSearch(null)
      setFilteredPlayers([])
    }
  }

  function insertMention(playerName) {
    const atIndex = input.lastIndexOf('@')
    const newInput = input.slice(0, atIndex) + `@${playerName} `
    setInput(newInput)
    setMentionSearch(null)
    setFilteredPlayers([])
    inputRef.current?.focus()
  }

  async function callDM(userMessage) {
    const history = messages.map(m => ({
      role: m.role === 'dm' ? 'assistant' : 'user',
      content: m.role === 'player' ? `${m.playerName || player?.name}: ${m.text}` : m.text
    }))

    if (userMessage) {
      history.push({ role: 'user', content: `${player?.name}: ${userMessage}` })
    }

    if (history.length === 0) {
      const playerList = players.length > 0 ? players.join(', ') : player?.name
      history.push({ role: 'user', content: `Start our adventure. Players: ${playerList}. Host is ${player?.name} the ${player?.class}` })
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT + `\n\nThis is a SHARED multiplayer adventure. All players are in the same world together. Players in this campaign: ${players.length > 0 ? players.join(', ') : player?.name}. The player currently acting is ${player?.name} the ${player?.class}, HP: ${gameState.hp}/${gameState.maxHp}, Gold: ${gameState.gold}. Treat all players as a party adventuring together.`
          },
          ...history
        ],
        max_tokens: 1000
      })
    })

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'The dungeon stirs...'
  }

  async function startAdventure() {
    if (!player) return
    await setDmBusyState(true)
    setLoading(true)
    let attempts = 0
    while (attempts < 3) {
      try {
        const raw = await callDM(null)
        const stateUpdate = parseStateUpdate(raw)
        if (stateUpdate) updateGameState(stateUpdate)
        const clean = cleanText(raw)
        await saveMessage('dm', clean)
        break
      } catch (e) {
        attempts++
        if (attempts < 3) {
          await new Promise(r => setTimeout(r, 5000))
        } else {
          await saveMessage('dm', 'The ancient magic stirs... try sending a message to begin your adventure.')
        }
      }
    }
    await setDmBusyState(false)
    setLoading(false)
  }

  async function sendMessage() {
    if (!input.trim() || loading || dmBusy) return
    const userMsg = input.trim()
    setInput('')
    await saveMessage('player', userMsg, player?.name)
    await setDmBusyState(true)
    setLoading(true)
    try {
      const raw = await callDM(userMsg)
      const stateUpdate = parseStateUpdate(raw)
      if (stateUpdate) updateGameState(stateUpdate)
      const clean = cleanText(raw)
      await saveMessage('dm', clean)
    } catch {
      await saveMessage('dm', 'The magic falters...')
    }
    await setDmBusyState(false)
    setLoading(false)
  }

  function quickAction(text) {
    setInput(text)
    setTimeout(() => sendMessage(), 100)
  }

  const hpPct = Math.max(0, (gameState.hp / gameState.maxHp) * 100)
  const hpColor = hpPct > 50 ? '#27ae60' : hpPct > 25 ? '#f39c12' : '#c0392b'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: 'rgba(10,8,18,0.95)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', letterSpacing: '2px' }}>
          LORECRAFT
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {roomCode && (
            <button onClick={() => setShowRoomCode(!showRoomCode)} style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '12px',
              fontFamily: "'Cinzel', serif", letterSpacing: '1px'
            }}>🔗 {roomCode}</button>
          )}
          <button onClick={() => setShowInventory(true)} style={{
            background: 'none', border: '1px solid var(--border)',
            borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '14px'
          }}>🎒</button>
        </div>
      </div>

      {/* Room Code Banner */}
      {showRoomCode && roomCode && (
        <div style={{
          background: 'linear-gradient(135deg, #1e1830, #2a2045)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '4px' }}>
              INVITE FRIENDS — SHARE THIS CODE
            </div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '28px', color: 'var(--gold)', letterSpacing: '8px' }}>
              {roomCode}
            </div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(roomCode); setShowRoomCode(false) }}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--gold)',
              borderRadius: '4px', color: 'var(--gold)', padding: '8px 16px',
              fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '1px'
            }}>
            COPY
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{
        padding: '8px 16px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0
      }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--text-dim)' }}>
          {player?.name} · {player?.class}
        </span>
        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.5s' }}/>
        </div>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--text)' }}>
          ❤️ {gameState.hp}/{gameState.maxHp}
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)' }}>
          🪙 {gameState.gold}
        </span>
      </div>

      {/* DM Busy Banner */}
      {dmBusy && !loading && (
        <div style={{
          background: 'rgba(201,168,76,0.05)',
          borderBottom: '1px solid var(--border)',
          padding: '6px 16px',
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          letterSpacing: '2px',
          color: 'var(--text-dim)',
          textAlign: 'center',
          flexShrink: 0
        }}>
          ⚔️ THE DUNGEON MASTER IS RESPONDING...
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'player' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>
              {msg.role === 'dm' ? 'DUNGEON MASTER' : (msg.playerName || player?.name)?.toUpperCase()}
            </div>
            <div style={{
              maxWidth: '85%',
              padding: '12px 16px',
              borderRadius: msg.role === 'dm' ? '0 12px 12px 12px' : '12px 0 12px 12px',
              background: msg.role === 'dm' ? 'linear-gradient(135deg, #14102a, #1a1535)' : 'linear-gradient(135deg, #0f1a14, #142010)',
              border: msg.role === 'dm' ? '1px solid var(--border)' : '1px solid rgba(39,174,96,0.2)',
              borderLeft: msg.role === 'dm' ? '2px solid var(--gold)' : undefined,
              borderRight: msg.role === 'player' ? '2px solid var(--green)' : undefined,
              fontSize: '15px',
              lineHeight: 1.7,
              color: 'var(--text)',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.text.split(/(@\w+)/g).map((part, i) =>
                part.startsWith('@') ? (
                  <span key={i} style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{part}</span>
                ) : part
              )}
            </div>
          </div>
        ))}

        {/* Typing Indicators */}
        {typers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>
              {typers.join(', ').toUpperCase()}
            </div>
            <div style={{
              padding: '10px 16px',
              background: 'linear-gradient(135deg, #0f1a14, #142010)',
              border: '1px solid rgba(39,174,96,0.2)',
              borderRight: '2px solid var(--green)',
              borderRadius: '12px 0 12px 12px',
              display: 'flex', gap: '4px',
              width: 'fit-content',
              alignSelf: 'flex-end'
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px', background: 'var(--green)', borderRadius: '50%',
                  animation: 'bounce 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`
                }}/>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>DUNGEON MASTER</div>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #14102a, #1a1535)',
              border: '1px solid var(--border)',
              borderLeft: '2px solid var(--gold)',
              borderRadius: '0 12px 12px 12px',
              display: 'flex', gap: '4px'
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px', background: 'var(--gold)', borderRadius: '50%',
                  animation: 'bounce 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`
                }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef}/>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '6px', padding: '0 12px 8px', overflowX: 'auto', flexShrink: 0 }}>
        {['👁 Look Around', '⚔️ Attack', '🌑 Sneak', '🔍 Search', '💬 Talk', '💨 Flee'].map(action => (
          <button key={action} onClick={() => quickAction(action.split(' ').slice(1).join(' '))}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px',
              padding: '6px 14px', color: dmBusy ? '#3a3050' : 'var(--text-dim)', fontSize: '11px',
              letterSpacing: '1px', whiteSpace: 'nowrap', flexShrink: 0,
              fontFamily: "'Cinzel', serif",
              cursor: dmBusy ? 'not-allowed' : 'pointer'
            }}>
            {action}
          </button>
        ))}
      </div>

      {/* @ Mention Dropdown */}
      {mentionSearch !== null && filteredPlayers.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '12px',
          background: 'var(--bg3)',
          border: '1px solid var(--gold)',
          borderRadius: '8px',
          overflow: 'hidden',
          zIndex: 50,
          boxShadow: '0 0 20px rgba(201,168,76,0.2)'
        }}>
          {filteredPlayers.map(p => (
            <div
              key={p}
              onClick={() => insertMention(p)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
                fontSize: '12px',
                color: 'var(--gold-light)',
                letterSpacing: '1px',
                borderBottom: '1px solid var(--border)'
              }}
            >
              ⚔️ {p}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 12px 16px',
        background: 'rgba(10,8,18,0.98)',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0,
        position: 'relative'
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }}}
          placeholder={dmBusy ? 'The DM is responding...' : 'What do you do... (@ to mention a player)'}
          disabled={dmBusy}
          rows={1}
          style={{
            flex: 1, background: 'var(--bg2)', border: `1px solid ${dmBusy ? 'rgba(201,168,76,0.1)' : 'var(--border)'}`,
            borderRadius: '20px', padding: '10px 16px', color: dmBusy ? 'var(--text-dim)' : 'var(--text)',
            fontSize: '16px', outline: 'none', resize: 'none', maxHeight: '100px',
            lineHeight: 1.4, fontFamily: "'EB Garamond', serif",
            cursor: dmBusy ? 'not-allowed' : 'text'
          }}
        />
        <button onClick={sendMessage}
          disabled={dmBusy}
          style={{
          width: '42px', height: '42px',
          background: dmBusy ? 'var(--bg2)' : 'linear-gradient(135deg, #2a1f0a, #3d2e10)',
          border: `1px solid ${dmBusy ? 'var(--border)' : 'var(--gold)'}`,
          borderRadius: '50%',
          color: dmBusy ? 'var(--text-dim)' : 'var(--gold)', fontSize: '18px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: dmBusy ? 'none' : '0 0 15px rgba(201,168,76,0.15)',
          cursor: dmBusy ? 'not-allowed' : 'pointer'
        }}>➤</button>
      </div>

      {/* Inventory Modal */}
      {showInventory && (
        <div onClick={() => setShowInventory(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'flex-end', zIndex: 100
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', background: 'linear-gradient(180deg, #1a1530, #110e1c)',
            border: '1px solid var(--border)', borderRadius: '20px 20px 0 0',
            padding: '20px 24px 40px'
          }}>
            <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 20px' }}/>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '16px' }}>
              ⚔ Inventory
            </div>
            {gameState.inventory.map((item, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(201,168,76,0.1)', fontSize: '15px', color: 'var(--text)' }}>
                {item}
              </div>
            ))}
            <div style={{ padding: '10px 0', fontSize: '15px', color: 'var(--gold)' }}>🪙 {gameState.gold} Gold</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}