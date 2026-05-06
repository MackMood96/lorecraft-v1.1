import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

const CLASSES = [
  { id: 'warrior', name: 'Warrior', icon: '⚔️', desc: 'Mighty fighter, expert in arms and armor', hp: 120, color: '#c0392b',
    inventory: ['⚔️ Longsword', '🛡️ Iron Shield', '🍞 Rations x3'] },
  { id: 'rogue', name: 'Rogue', icon: '🗡️', desc: 'Shadow walker, master of stealth and cunning', hp: 85, color: '#8e44ad',
    inventory: ['🗡️ Twin Daggers', '🔧 Thieves Tools', '🌑 Shadow Cloak'] },
  { id: 'mage', name: 'Mage', icon: '🔮', desc: 'Arcane scholar, wielder of destructive magic', hp: 70, color: '#2980b9',
    inventory: ['📖 Spellbook', '🔮 Arcane Focus', '💊 Mana Potion x2'] },
  { id: 'ranger', name: 'Ranger', icon: '🏹', desc: 'Wilderness hunter, skilled with bow and beast', hp: 95, color: '#27ae60',
    inventory: ['🏹 Longbow', '🪶 Quiver 20 arrows', '🐺 Animal Bond Scroll'] },
]

export default function CharCreate() {
  const navigate = useNavigate()
  const { setPlayer, updateGameState } = useGame()
  const [name, setName] = useState('')
  const [selectedClass, setSelectedClass] = useState(null)
  const [loading, setLoading] = useState(false)

  const ready = name.trim() && selectedClass

  async function handleBegin() {
    if (!ready || loading) return
    setLoading(true)

    const cls = CLASSES.find(c => c.id === selectedClass)

    // Create campaign with room code
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .insert({ room_code: roomCode, name: `${name}'s Campaign` })
      .select()
      .single()

    if (campError) {
      console.error(campError)
      setLoading(false)
      return
    }

    // Create player
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

    if (playerError) {
      console.error(playerError)
      setLoading(false)
      return
    }

    setPlayer(player)
    updateGameState({
      hp: cls.hp,
      maxHp: cls.hp,
      inventory: cls.inventory,
      gold: 10,
      level: 1
    })

    navigate(`/game/${campaign.id}`)
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
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '20px', color: 'var(--gold-light)', letterSpacing: '2px' }}>
          Create Your Hero
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '4px' }}>
          Who will you become in the realm of Lorecraft?
        </div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '12px', opacity: 0.4 }}/>
      </div>

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

      {/* Class Selection */}
      <div style={{ padding: '20px 24px 0', flex: 1 }}>
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
                padding: '16px 12px',
                cursor: 'pointer',
                boxShadow: selectedClass === cls.id ? `0 0 20px ${cls.color}22` : 'none',
                borderTop: selectedClass === cls.id ? `2px solid ${cls.color}` : `1px solid var(--border)`
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{cls.icon}</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '1px', color: 'var(--gold-light)', marginBottom: '4px' }}>
                {cls.name.toUpperCase()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.4 }}>
                {cls.desc}
              </div>
              <div style={{ marginTop: '8px', fontFamily: "'Cinzel', serif", fontSize: '10px', color: cls.color }}>
                ❤️ {cls.hp} HP
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Begin Button */}
      <div style={{ padding: '20px 24px 32px' }}>
        <button
          onClick={handleBegin}
          disabled={!ready || loading}
          style={{
            width: '100%',
            padding: '16px',
            background: ready ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)',
            border: `1px solid ${ready ? 'var(--gold)' : 'var(--border)'}`,
            borderRadius: '4px',
            color: ready ? 'var(--gold-light)' : 'var(--text-dim)',
            fontSize: '13px',
            letterSpacing: '3px',
            boxShadow: ready ? '0 0 30px rgba(201,168,76,0.2)' : 'none',
            transition: 'all 0.3s'
          }}
        >
          {loading ? 'ENTERING THE REALM...' : 'ENTER THE REALM'}
        </button>
      </div>
    </div>
  )
}