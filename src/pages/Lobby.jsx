import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Lobby() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const joinCode = searchParams.get('room')
  const returnCampaignId = searchParams.get('campaignId')
  const isGuest = searchParams.get('guest') === 'true'

  // isHost = has campaignId but is NOT a guest
  const isHost = !!returnCampaignId ? !isGuest : !joinCode

  const [phase, setPhase] = useState(() => {
    if (returnCampaignId) return 'waiting'  // returning from char create (host or guest)
    if (!joinCode) return 'creating'         // fresh host, no code
    return 'joining'                          // guest with code, not yet validated
  })

  const [campaign, setCampaign] = useState(null)
  const [roomCode, setRoomCode] = useState(joinCode || '')
  const [players, setPlayers] = useState([])
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const channelRef = useRef(null)
  const statusChannelRef = useRef(null)
  const initializedRef = useRef(false)

  // ─── INIT ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if (returnCampaignId) {
      // Both host and guest returning from char create
      loadExistingCampaign(returnCampaignId)
    } else if (!joinCode) {
      // Fresh host — create new campaign
      createCampaign()
    }
  }, [])

  // Guest with code in URL — validate
  useEffect(() => {
    if (!returnCampaignId && joinCode) validateAndJoin(joinCode)
  }, [joinCode])

  // ─── HOST: Load existing campaign ─────────────────────────────────────────
  async function loadExistingCampaign(id) {
    const { data } = await supabase.from('campaigns').select().eq('id', id).single()
    if (data) {
      setCampaign(data)
      setRoomCode(data.room_code)
      subscribeToPlayers(data.id)
      // Guests watch for game start, host doesn't need to
      if (!isHost) watchCampaignStatus(data.id)
    }
  }

  // ─── HOST: Create new campaign ────────────────────────────────────────────
  async function createCampaign() {
    setPhase('creating')
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ room_code: code, name: `Campaign ${code}`, status: 'lobby' })
      .select().single()
    if (error) { setError('Failed to create campaign. Try again.'); return }
    setCampaign(data)
    setRoomCode(code)
    setPhase('waiting')
    subscribeToPlayers(data.id)
  }

  // ─── GUEST: Validate room code ────────────────────────────────────────────
  async function validateAndJoin(code) {
    const { data, error } = await supabase
      .from('campaigns')
      .select()
      .eq('room_code', code.toUpperCase())
      .single()
    if (error || !data) { setError('Room not found. Check your code.'); setPhase('enter_code'); return }
    if (data.status === 'active') { setError('This game has already started.'); setPhase('enter_code'); return }
    setCampaign(data)
    navigate(`/create?room=${code.toUpperCase()}&campaignId=${data.id}`)
  }

  // ─── REALTIME: Watch players ──────────────────────────────────────────────
  function subscribeToPlayers(campaignId) {
    loadPlayers(campaignId)
    const channel = supabase.channel(`lobby:${campaignId}`)
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'players',
      filter: `campaign_id=eq.${campaignId}`
    }, () => loadPlayers(campaignId))
    channel.subscribe()
    channelRef.current = channel
  }

  // ─── REALTIME: Watch for game start (guests only) ─────────────────────────
  function watchCampaignStatus(campaignId) {
    const channel = supabase.channel(`campaign_status:${campaignId}`)
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'campaigns',
      filter: `id=eq.${campaignId}`
    }, (payload) => {
      if (payload.new.status === 'active') {
        navigate(`/game/${campaignId}?room=${payload.new.room_code}&host=false`)
      }
    })
    channel.subscribe()
    statusChannelRef.current = channel
  }

  async function loadPlayers(campaignId) {
    const { data } = await supabase
      .from('players')
      .select('id, name, class, race, affinity, avatar_url')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
    if (data) setPlayers(data)
  }

  async function beginAdventure() {
    if (!campaign || players.length === 0) return
    setStarting(true)
    await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaign.id)
    navigate(`/game/${campaign.id}?room=${roomCode}&host=true`)
  }

  function handleManualJoin() {
    const code = roomCode.trim().toUpperCase()
    if (code.length < 6) { setError('Enter a valid 6-character room code.'); return }
    validateAndJoin(code)
  }

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (statusChannelRef.current) supabase.removeChannel(statusChannelRef.current)
    }
  }, [])

  // ─── RENDER: CREATING ─────────────────────────────────────────────────────
  if (phase === 'creating') {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '32px', animation: 'spin 2s linear infinite' }}>⚔</div>
        <div style={subtitleStyle}>FORGING YOUR REALM...</div>
        <style>{spinStyle}</style>
      </div>
    )
  }

  // ─── RENDER: ENTER CODE ───────────────────────────────────────────────────
  if (phase === 'enter_code') {
    return (
      <div style={containerStyle}>
        <button onClick={() => navigate('/')} style={backBtnStyle}>← BACK</button>
        <div style={titleStyle}>JOIN CAMPAIGN</div>
        <div style={subtitleStyle}>Enter your room code</div>
        <input
          value={roomCode}
          onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleManualJoin() }}
          placeholder="XXXXXX" maxLength={6} autoFocus
          style={codeInputStyle}
        />
        {error && <div style={errorStyle}>{error}</div>}
        <button onClick={handleManualJoin} disabled={roomCode.length < 6} style={primaryBtnStyle(roomCode.length >= 6)}>
          JOIN →
        </button>
        <style>{spinStyle}</style>
      </div>
    )
  }

  // ─── RENDER: WAITING ROOM ─────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '18px', color: 'var(--gold-light)', letterSpacing: '2px' }}>⚔ LORECRAFT</div>
          <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '10px', opacity: 0.4 }} />
        </div>

        {/* Room code */}
        <div style={{ padding: '24px 20px 0', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '4px', color: 'var(--text-dim)', marginBottom: '8px' }}>
            {isHost ? 'SHARE THIS CODE WITH YOUR PARTY' : 'WAITING FOR HOST TO BEGIN'}
          </div>
          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '42px', color: 'var(--gold)', letterSpacing: '10px', textShadow: '0 0 30px rgba(201,168,76,0.4)' }}>
            {roomCode}
          </div>
          {isHost && (
            <button onClick={() => navigator.clipboard.writeText(roomCode)} style={{ marginTop: '8px', background: 'none', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 14px', fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', cursor: 'pointer' }}>
              COPY CODE
            </button>
          )}
        </div>

        {/* Players list */}
        <div style={{ padding: '24px 20px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
            PARTY — {players.length} {players.length === 1 ? 'HERO' : 'HEROES'}
          </div>

          {players.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '3px', color: '#3a3050', marginBottom: '8px' }}>
                WAITING FOR ADVENTURERS...
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', opacity: 0.3, animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {players.map(p => (
                <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: '2px solid var(--gold)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--gold)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>⚔</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold-light)', marginBottom: '2px' }}>{p.name}</div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px' }}>{p.race} {p.class}</div>
                  </div>
                  <div style={{ fontSize: '9px', color: '#27ae60', fontFamily: "'Cinzel', serif", letterSpacing: '1px' }}>✓ READY</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Host buttons */}
        {isHost && (
          <div style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={beginAdventure}
              disabled={starting || players.length === 0}
              style={{
                padding: '16px', fontFamily: "'Cinzel', serif", fontSize: '13px', letterSpacing: '3px',
                cursor: starting || players.length === 0 ? 'not-allowed' : 'pointer',
                background: players.length > 0 ? 'linear-gradient(135deg, #1e1830, #2a2045)' : 'var(--bg2)',
                border: `2px solid ${players.length > 0 ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: '4px',
                color: players.length > 0 ? 'var(--gold-light)' : 'var(--text-dim)',
                boxShadow: players.length > 0 ? '0 0 30px rgba(201,168,76,0.3)' : 'none',
                opacity: starting ? 0.7 : 1, transition: 'all 0.3s'
              }}>
              {starting
                ? '⚔ BEGINNING...'
                : players.length === 0
                ? 'WAITING FOR PLAYERS...'
                : `⚔ BEGIN ADVENTURE (${players.length} ${players.length === 1 ? 'HERO' : 'HEROES'})`
              }
            </button>

            <button
              onClick={() => navigate(`/create?campaignId=${campaign?.id}&host=true`)}
              style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '4px', color: 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px', cursor: 'pointer' }}>
              + CREATE YOUR CHARACTER
            </button>

            <button onClick={() => navigate('/')} style={{ padding: '8px', background: 'transparent', border: 'none', color: 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
              ← BACK TO MENU
            </button>
          </div>
        )}

        {/* Guest waiting message */}
        {!isHost && (
          <div style={{ padding: '16px 20px 32px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
              YOUR CHARACTER IS READY
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', opacity: 0.5, animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: '#3a3050' }}>
              WAITING FOR HOST TO BEGIN THE ADVENTURE...
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.3}30%{transform:translateY(-6px);opacity:1} }
        `}</style>
      </div>
    )
  }

  // Fallback
  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '32px', animation: 'spin 2s linear infinite' }}>⚔</div>
      <style>{spinStyle}</style>
    </div>
  )
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const containerStyle = {
  height: '100%', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', gap: '16px', padding: '24px'
}
const titleStyle = {
  fontFamily: "'Cinzel Decorative', serif", fontSize: '20px',
  color: 'var(--gold-light)', letterSpacing: '2px'
}
const subtitleStyle = {
  fontFamily: "'Cinzel', serif", fontSize: '9px',
  letterSpacing: '3px', color: 'var(--text-dim)'
}
const errorStyle = {
  color: '#e74c3c', fontSize: '11px', fontStyle: 'italic',
  fontFamily: "'Cinzel', serif", textAlign: 'center'
}
const codeInputStyle = {
  background: 'var(--bg2)', border: '1px solid rgba(201,168,76,0.4)',
  borderRadius: '4px', padding: '14px', color: '#f5e6c8',
  fontSize: '28px', letterSpacing: '10px', outline: 'none',
  textAlign: 'center', fontFamily: "'Cinzel', serif",
  width: '100%', maxWidth: '280px', boxSizing: 'border-box'
}
const primaryBtnStyle = (active) => ({
  width: '100%', padding: '14px',
  background: active ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)',
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
  borderRadius: '4px', color: active ? 'var(--gold-light)' : 'var(--text-dim)',
  fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '3px',
  cursor: active ? 'pointer' : 'not-allowed', maxWidth: '280px'
})
const backBtnStyle = {
  background: 'none', border: 'none', color: 'var(--text-dim)',
  fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px',
  cursor: 'pointer', padding: 0, alignSelf: 'flex-start'
}
const spinStyle = `
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.3}30%{transform:translateY(-6px);opacity:1} }
`