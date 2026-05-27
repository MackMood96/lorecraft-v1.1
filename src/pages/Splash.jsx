import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Splash() {
  const navigate = useNavigate()
  const [showJoin, setShowJoin] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')

  function handleJoin() {
    const code = roomCode.trim().toUpperCase()
    if (code.length < 6) { setError('Enter a valid 6-character room code.'); return }
    navigate(`/lobby?room=${code}`)
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #1e1535 0%, #0a0812 70%)',
      gap: '0', padding: '24px'
    }}>

      {/* Emblem */}
      <svg width="140" height="140" viewBox="0 0 160 160" fill="none"
        style={{ filter: 'drop-shadow(0 0 20px rgba(201,168,76,0.5))', marginBottom: '-8px' }}>
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5e6c8"/>
            <stop offset="50%" stopColor="#c9a84c"/>
            <stop offset="100%" stopColor="#7a5c1e"/>
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="74" stroke="url(#sg)" strokeWidth="1" opacity="0.35"/>
        <path d="M80 22 L112 38 L112 78 Q112 108 80 126 Q48 108 48 78 L48 38 Z"
          fill="#1e1830" stroke="url(#sg)" strokeWidth="1.5"/>
        <path d="M52 68 Q52 62 58 60 L78 60 L78 96 Q68 94 58 96 Q52 94 52 88 Z"
          fill="#1a1530" stroke="url(#sg)" strokeWidth="1.2"/>
        <path d="M108 68 Q108 62 102 60 L82 60 L82 96 Q92 94 102 96 Q108 94 108 88 Z"
          fill="#1a1530" stroke="url(#sg)" strokeWidth="1.2"/>
        <rect x="78" y="60" width="4" height="36" fill="url(#sg)" rx="1"/>
        <line x1="59" y1="70" x2="75" y2="70" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="59" y1="76" x2="75" y2="76" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="59" y1="82" x2="75" y2="82" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="70" x2="101" y2="70" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="76" x2="101" y2="76" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="82" x2="101" y2="82" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <polygon points="93,89 94.5,92.5 98,94 94.5,95.5 93,99 91.5,95.5 88,94 91.5,92.5" fill="#c9a84c"/>
      </svg>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 4px' }}>
        <div style={{ width: '50px', height: '1px', background: 'linear-gradient(90deg, transparent, #c9a84c)' }}/>
        <div style={{ width: '4px', height: '4px', background: '#c9a84c', transform: 'rotate(45deg)' }}/>
        <div style={{ width: '50px', height: '1px', background: 'linear-gradient(90deg, #c9a84c, transparent)' }}/>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Cinzel Decorative', serif", fontWeight: 900, fontSize: '38px',
        letterSpacing: '6px',
        background: 'linear-gradient(180deg, #f5e6c8 0%, #c9a84c 50%, #7a5c1e 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 15px rgba(201,168,76,0.3))'
      }}>LORECRAFT</div>

      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '10px',
        color: '#8a7040', marginTop: '6px'
      }}>AI DUNGEON MASTER</div>

      {/* Buttons or Join Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '48px', width: '260px' }}>
        {!showJoin ? (
          <>
            <button onClick={() => navigate('/lobby')} style={{
              padding: '14px', background: 'linear-gradient(135deg, #1e1830, #2a2045)',
              border: '1px solid #c9a84c', borderRadius: '4px', color: '#f5e6c8',
              fontSize: '13px', letterSpacing: '3px', cursor: 'pointer',
              boxShadow: '0 0 20px rgba(201,168,76,0.15)',
              fontFamily: "'Cinzel', serif"
            }}>⚔️ NEW GAME</button>

            <button onClick={() => navigate('/lobby?join=true')} style={{
              padding: '14px', background: 'transparent',
              border: '1px solid rgba(201,168,76,0.3)', borderRadius: '4px',
              color: '#8a7040', fontSize: '13px', letterSpacing: '3px', cursor: 'pointer',
              fontFamily: "'Cinzel', serif"
            }}>🚪 JOIN CAMPAIGN</button>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px',
              color: 'var(--text-dim)', textAlign: 'center', marginBottom: '4px'
            }}>ENTER ROOM CODE</div>

            <input
              value={roomCode}
              onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
              placeholder="XXXXXX"
              maxLength={6}
              autoFocus
              style={{
                background: 'var(--bg2)', border: '1px solid rgba(201,168,76,0.4)',
                borderRadius: '4px', padding: '14px', color: '#f5e6c8',
                fontSize: '26px', letterSpacing: '10px', outline: 'none',
                textAlign: 'center', fontFamily: "'Cinzel', serif", width: '100%',
                boxSizing: 'border-box'
              }}
            />

            {error && (
              <div style={{ color: '#e74c3c', fontSize: '11px', textAlign: 'center', fontStyle: 'italic' }}>
                {error}
              </div>
            )}

            <button onClick={handleJoin} disabled={roomCode.length < 6} style={{
              padding: '14px',
              background: roomCode.length >= 6 ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)',
              border: `1px solid ${roomCode.length >= 6 ? '#c9a84c' : 'var(--border)'}`,
              borderRadius: '4px',
              color: roomCode.length >= 6 ? '#f5e6c8' : 'var(--text-dim)',
              fontSize: '13px', letterSpacing: '3px', cursor: roomCode.length >= 6 ? 'pointer' : 'not-allowed',
              fontFamily: "'Cinzel', serif"
            }}>JOIN →</button>

            <button onClick={() => { setShowJoin(false); setRoomCode(''); setError('') }} style={{
              padding: '10px', background: 'transparent', border: 'none',
              color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '2px',
              cursor: 'pointer', fontFamily: "'Cinzel', serif"
            }}>← BACK</button>
          </>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: '30px', fontFamily: "'Cinzel', serif",
        fontSize: '9px', letterSpacing: '2px', color: '#2a2030'
      }}>v1.1 EARLY ACCESS</div>
    </div>
  )
}