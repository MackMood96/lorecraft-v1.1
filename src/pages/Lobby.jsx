import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

export default function Lobby() {
  const navigate = useNavigate()
  const { setPlayer, updateGameState } = useGame()
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [name, setName] = useState('')
  const [selectedClass, setSelectedClass] = useState(null)
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const CLASSES = [
    { id: 'warrior', name: 'Warrior', icon: '⚔️', hp: 120, color: '#c0392b',
      inventory: ['⚔️ Longsword', '🛡️ Iron Shield', '🍞 Rations x3'] },
    { id: 'rogue', name: 'Rogue', icon: '🗡️', hp: 85, color: '#8e44ad',
      inventory: ['🗡️ Twin Daggers', '🔧 Thieves Tools', '🌑 Shadow Cloak'] },
    { id: 'mage', name: 'Mage', icon: '🔮', hp: 70, color: '#2980b9',
      inventory: ['📖 Spellbook', '🔮 Arcane Focus', '💊 Mana Potion x2'] },
    { id: 'ranger', name: 'Ranger', icon: '🏹', hp: 95, color: '#27ae60',
      inventory: ['🏹 Longbow', '🪶 Quiver 20 arrows', '🐺 Animal Bond Scroll'] },
  ]

  async function handleCreate() {
    if (!name.trim() || !selectedClass) return
    setLoading(true)
    setError('')

    const cls = CLASSES.find(c => c.id === selectedClass)
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    try {
      const { data: campaign, error: campError } = await supabase
        .from('campaigns')
        .insert({ room_code: roomCode, name: `${name}'s Campaign` })
        .select()
        .single()

      if (campError) throw campError

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          class: cls.name,
          hp: cls.hp,
          max_hp: cls.hp,
          gold: 10,
          level: 1,
          inventory: cls.inventory
        })
        .select()
        .single()

      if (playerError) throw playerError

      setPlayer(player)
      updateGameState({
        hp: cls.hp,
        maxHp: cls.hp,
        inventory: cls.inventory,
        gold: 10,
        level: 1
      })

      navigate(`/game/${campaign.id}?room=${roomCode}&host=true`)
    } catch (e) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  async function handleJoin() {
    if (!name.trim() || !selectedClass || !roomCode.trim()) return
    setLoading(true)
    setError('')

    const cls = CLASSES.find(c => c.id === selectedClass)

    try {
      const { data: campaign, error: campError } = await supabase
        .from('campaigns')
        .select()
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (campError || !campaign) {
        setError('Room code not found. Check the code and try again.')
        setLoading(false)
        return
      }

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          class: cls.name,
          hp: cls.hp,
          max_hp: cls.hp,
          gold: 10,
          level: 1,
          inventory: cls.inventory
        })
        .select()
        .single()

      if (playerError) throw playerError

      setPlayer(player)
      updateGameState({
        hp: cls.hp,
        maxHp: cls.hp,
        inventory: cls.inventory,
        gold: 10,
        level: 1
      })

      navigate(`/game/${campaign.id}?room=${roomCode.toUpperCase()}`)
    } catch (e) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ padding: '24px 24px 0' }}>
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: 'none', color: 'var(--text-dim)',
          fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px',
          marginBottom: '16px', cursor: 'pointer', padding: 0
        }}>← BACK</button>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '20px', color: 'var(--gold-light)', letterSpacing: '2px' }}>
          Multiplayer
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '4px' }}>
          Adventure together in the realm of Lorecraft
        </div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '12px', opacity: 0.4 }}/>
      </div>

      {/* Mode Selection */}
      {!mode && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button onClick={() => setMode('create')} style={{
            padding: '20px',
            background: 'linear-gradient(135deg, #1e1830, #2a2045)',
            border: '1px solid var(--gold)',
            borderRadius: '8px',
            color: 'var(--gold-light)',
            fontSize: '14px',
            letterSpacing: '2px',
            fontFamily: "'Cinzel', serif",
            textAlign: 'left',
            boxShadow: '0 0 20px rgba(201,168,76,0.1)'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚔️</div>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>CREATE CAMPAIGN</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: "'EB Garamond', serif", fontStyle: 'italic' }}>
              Start a new adventure and invite friends with a room code
            </div>
          </button>

          <button onClick={() => setMode('join')} style={{
            padding: '20px',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontSize: '14px',
            letterSpacing: '2px',
            fontFamily: "'Cinzel', serif",
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚪</div>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>JOIN CAMPAIGN</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: "'EB Garamond', serif", fontStyle: 'italic' }}>
              Enter a room code to join a friend's adventure
            </div>
          </button>
        </div>
      )}

      {/* Create or Join Form */}
      {mode && (
        <>
          {/* Name Input */}
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px' }}>
              YOUR NAME
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={24}
              style={{
                width: '100%',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '12px 16px',
                color: 'var(--gold-light)',
                fontSize: '18px',
                outline: 'none'
              }}
            />
          </div>

          {/* Room Code Input for Join */}
          {mode === 'join' && (
            <div style={{ padding: '16px 24px 0' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                ROOM CODE
              </div>
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code..."
                maxLength={6}
                style={{
                  width: '100%',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '12px 16px',
                  color: 'var(--gold-light)',
                  fontSize: '24px',
                  letterSpacing: '8px',
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: "'Cinzel', serif"
                }}
              />
            </div>
          )}

          {/* Class Selection */}
          <div style={{ padding: '16px 24px 0', flex: 1 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
              CHOOSE YOUR CLASS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {CLASSES.map(cls => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id)}
                  style={{
                    background: selectedClass === cls.id ? 'var(--bg3)' : 'var(--bg2)',
                    border: `1px solid ${selectedClass === cls.id ? cls.color : 'var(--border)'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    borderTop: selectedClass === cls.id ? `2px solid ${cls.color}` : `1px solid var(--border)`
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{cls.icon}</div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold-light)' }}>
                    {cls.name.toUpperCase()}
                  </div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: cls.color, marginTop: '4px' }}>
                    ❤️ {cls.hp} HP
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 24px 0', color: '#e74c3c', fontStyle: 'italic', fontSize: '14px' }}>
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ padding: '20px 24px 32px', display: 'flex', gap: '12px' }}>
            <button onClick={() => { setMode(null); setError('') }} style={{
              padding: '14px 20px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-dim)',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              letterSpacing: '2px'
            }}>BACK</button>

            <button
              onClick={mode === 'create' ? handleCreate : handleJoin}
              disabled={loading || !name.trim() || !selectedClass || (mode === 'join' && roomCode.length < 6)}
              style={{
                flex: 1,
                padding: '14px',
                background: 'linear-gradient(135deg, #2a1f0a, #3d2e10)',
                border: '1px solid var(--gold)',
                borderRadius: '4px',
                color: 'var(--gold-light)',
                fontFamily: "'Cinzel', serif",
                fontSize: '12px',
                letterSpacing: '2px',
                opacity: loading || !name.trim() || !selectedClass ? 0.5 : 1
              }}
            >
              {loading ? 'LOADING...' : mode === 'create' ? 'CREATE & ENTER' : 'JOIN CAMPAIGN'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}