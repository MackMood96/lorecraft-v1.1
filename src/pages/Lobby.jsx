import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Lobby() {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')

  function handleJoin() {
    if (roomCode.trim().length < 6) {
      setError('Please enter a valid 6-digit room code.')
      return
    }
    navigate(`/create?room=${roomCode.toUpperCase()}`)
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

      <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Create Campaign */}
        <button onClick={() => navigate('/create')} style={{
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

        {/* Join Campaign */}
        <div style={{
          padding: '20px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚪</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', letterSpacing: '2px', color: 'var(--gold-light)', marginBottom: '4px' }}>
            JOIN CAMPAIGN
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: "'EB Garamond', serif", fontStyle: 'italic', marginBottom: '16px' }}>
            Enter a room code to join a friend's adventure
          </div>

          <input
            value={roomCode}
            onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
            placeholder="ENTER CODE"
            maxLength={6}
            style={{
              width: '100%',
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '12px 16px',
              color: 'var(--gold-light)',
              fontSize: '24px',
              letterSpacing: '8px',
              outline: 'none',
              textAlign: 'center',
              fontFamily: "'Cinzel', serif",
              marginBottom: '12px'
            }}
          />

          {error && (
            <div style={{ color: '#e74c3c', fontStyle: 'italic', fontSize: '13px', marginBottom: '8px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={roomCode.length < 6}
            style={{
              width: '100%',
              padding: '14px',
              background: roomCode.length >= 6 ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg3)',
              border: `1px solid ${roomCode.length >= 6 ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: '4px',
              color: roomCode.length >= 6 ? 'var(--gold-light)' : 'var(--text-dim)',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              letterSpacing: '2px',
              cursor: roomCode.length >= 6 ? 'pointer' : 'not-allowed'
            }}>
            CONTINUE →
          </button>
        </div>
      </div>
    </div>
  )
}