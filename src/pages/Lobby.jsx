import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Lobby() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const campaignId = searchParams.get('campaignId')
  const isGuest = searchParams.get('guest') === 'true'
  const isHost = !isGuest

  const [roomCode, setRoomCode] = useState('')
  const [players, setPlayers] = useState([])
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)
  const statusChannelRef = useRef(null)
  const roomCodeRef = useRef('')

  useEffect(() => {
    if (!campaignId) { navigate('/'); return }
    init()
    // Poll players AND campaign status every 2 seconds — guaranteed fallback
    const poll = setInterval(async () => {
      loadPlayers(campaignId)
      // Guest checks if host has started
      if (isGuest) {
        const { data: campData } = await supabase
        .from('campaigns')
        .select('status, room_code')
        .eq('id', campaignId)
        .single()
      if (campData?.status === 'active' && isGuest) {
        navigate(`/game/${campaignId}?room=${campData.room_code}&host=false`)
      }
      }
    }, 2000)
    return () => {
      clearInterval(poll)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (statusChannelRef.current) supabase.removeChannel(statusChannelRef.current)
    }
  }, [campaignId])

  async function init() {
    const { data } = await supabase
      .from('campaigns')
      .select()
      .eq('id', campaignId)
      .single()
    if (!data) { navigate('/'); return }
    setRoomCode(data.room_code)
    roomCodeRef.current = data.room_code
    setLoading(false)
    await loadPlayers(campaignId)
    subscribeToPlayers(campaignId)
    // Always watch campaign status for guests via realtime too
    if (isGuest) watchCampaignStatus(campaignId)
  }

  function subscribeToPlayers(id) {
    const channel = supabase.channel(`lobby_players:${id}`)
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'players',
      filter: `campaign_id=eq.${id}`
    }, () => loadPlayers(id))
    channel.subscribe()
    channelRef.current = channel
  }

  function watchCampaignStatus(id) {
    const channel = supabase.channel(`campaign_status:${id}`)
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'campaigns',
      filter: `id=eq.${id}`
    }, (payload) => {
      if (payload.new.status === 'active') {
        navigate(`/game/${id}?room=${payload.new.room_code}&host=false`)
      }
    })
    channel.subscribe()
    statusChannelRef.current = channel
  }

  async function loadPlayers(id) {
    const { data } = await supabase
      .from('players')
      .select('id, name, class, race, affinity, avatar_url')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true })
    if (data) setPlayers(data)
  }

  async function beginAdventure() {
    if (!campaignId || players.length === 0) return
    setStarting(true)
    await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaignId)
    navigate(`/game/${campaignId}?room=${roomCodeRef.current}&host=true`)
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '32px', animation: 'spin 2s linear infinite' }}>⚔</div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)' }}>LOADING...</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflowY: 'auto' }}>

      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '18px', color: 'var(--gold-light)', letterSpacing: '2px' }}>⚔ LORECRAFT</div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '10px', opacity: 0.4 }} />
      </div>

      <div style={{ padding: '24px 20px 0', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '4px', color: 'var(--text-dim)', marginBottom: '8px' }}>
          {isHost ? 'SHARE THIS CODE WITH YOUR PARTY' : 'WAITING FOR HOST TO BEGIN'}
        </div>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '42px', color: 'var(--gold)', letterSpacing: '10px', textShadow: '0 0 30px rgba(201,168,76,0.4)' }}>
          {roomCode}
        </div>
        {isHost && (
          <button onClick={() => navigator.clipboard.writeText(roomCode)}
            style={{ marginTop: '8px', background: 'none', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 14px', fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', cursor: 'pointer' }}>
            COPY CODE
          </button>
        )}
      </div>

      <div style={{ padding: '24px 20px 0', flex: 1 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
          PARTY — {players.length} {players.length === 1 ? 'HERO' : 'HEROES'}
        </div>

        {players.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '3px', color: '#3a3050', marginBottom: '8px' }}>WAITING FOR ADVENTURERS...</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', opacity: 0.3, animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
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

      {isHost && (
        <div style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={beginAdventure} disabled={starting || players.length === 0}
            style={{
              padding: '16px', fontFamily: "'Cinzel', serif", fontSize: '13px', letterSpacing: '3px',
              cursor: starting || players.length === 0 ? 'not-allowed' : 'pointer',
              background: players.length > 0 ? 'linear-gradient(135deg, #1e1830, #2a2045)' : 'var(--bg2)',
              border: `2px solid ${players.length > 0 ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: '4px', color: players.length > 0 ? 'var(--gold-light)' : 'var(--text-dim)',
              boxShadow: players.length > 0 ? '0 0 30px rgba(201,168,76,0.3)' : 'none',
              opacity: starting ? 0.7 : 1, transition: 'all 0.3s'
            }}>
            {starting ? '⚔ BEGINNING...' : players.length === 0 ? 'WAITING FOR PLAYERS...' : `⚔ BEGIN ADVENTURE (${players.length} ${players.length === 1 ? 'HERO' : 'HEROES'})`}
          </button>
          <button onClick={() => navigate(`/create?campaignId=${campaignId}&host=true`)}
            style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '4px', color: 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px', cursor: 'pointer' }}>
            + CREATE YOUR CHARACTER
          </button>
          <button onClick={() => navigate('/')} style={{ padding: '8px', background: 'transparent', border: 'none', color: 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
            ← BACK TO MENU
          </button>
        </div>
      )}

      {!isHost && (
        <div style={{ padding: '16px 20px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>YOUR CHARACTER IS READY</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
            {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', opacity: 0.5, animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
          </div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: '#3a3050' }}>WAITING FOR HOST TO BEGIN THE ADVENTURE...</div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.3}30%{transform:translateY(-6px);opacity:1} }
      `}</style>
    </div>
  )
}