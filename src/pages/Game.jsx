import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

// ─── VOICE POOLS ────────────────────────────────────────────────────────────
const MALE_VOICES = ['Fenrir', 'Orus', 'Achird']
const FEMALE_VOICES = ['Kore', 'Aoede', 'Leda']
const NARRATOR_VOICE = 'Charon'

// ─── SCENE PROMPTS ───────────────────────────────────────────────────────────
const SCENE_KEYWORDS = {
  tavern: '2D pixel art RPG tavern interior, 16-bit style, warm torchlight, wooden beams, bar counter, ale barrels, cozy medieval fantasy, side view game background, no characters',
  dungeon: '2D pixel art RPG dungeon corridor, 16-bit style, dark stone walls, iron torches, chains, ancient stone, dark fantasy, side view game background, no characters',
  forest: '2D pixel art RPG forest at night, 16-bit style, ancient trees, moonlight, glowing fireflies, mystical atmosphere, side view game background, no characters',
  combat: '2D pixel art RPG battlefield, 16-bit style, dramatic lighting, swords clashing, fire and shadow, dark fantasy, side view game background, no characters',
  mystery: '2D pixel art RPG mysterious chamber, 16-bit style, arcane symbols, glowing runes, ancient stone, candlelight, side view game background, no characters',
  exploration: '2D pixel art RPG fantasy landscape, 16-bit style, rolling hills, ancient ruins, dramatic sky, medieval fantasy, side view game background, no characters',
  inn: '2D pixel art RPG cozy inn interior, 16-bit style, fireplace, wooden furniture, warm light, medieval fantasy, side view game background, no characters',
}

function detectSceneFromText(text) {
  const lower = text.toLowerCase()
  if (lower.includes('tavern') || lower.includes('bar') || lower.includes('ale') || lower.includes('bard')) return 'tavern'
  if (lower.includes('dungeon') || lower.includes('cave') || lower.includes('crypt') || lower.includes('undead')) return 'dungeon'
  if (lower.includes('forest') || lower.includes('tree') || lower.includes('wood') || lower.includes('clearing')) return 'forest'
  if (lower.includes('attack') || lower.includes('combat') || lower.includes('fight') || lower.includes('battle')) return 'combat'
  if (lower.includes('mysterious') || lower.includes('ancient') || lower.includes('rune') || lower.includes('magic')) return 'mystery'
  if (lower.includes('inn') || lower.includes('rest') || lower.includes('sleep')) return 'inn'
  return null
}
function buildSceneUrl(prompt, seed) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=500&nologo=true&seed=${seed}&model=flux`
}

function buildNpcSceneUrl(npc, sceneName) {
  const envPrompt = SCENE_KEYWORDS[sceneName] || SCENE_KEYWORDS.exploration
  const npcPrompt = `2D pixel art RPG character portrait, 16-bit style, ${npc.description || `${npc.race} ${npc.role}`}, ${envPrompt}, character visible, game art style`
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(npcPrompt)}?width=800&height=500&nologo=true&seed=${npc.seed || Math.floor(Math.random() * 9999)}&model=flux`
}
// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert Dungeon Master for a text-based fantasy RPG. Your role is to create an immersive, dynamic, and engaging adventure.

RULES:
- Narrate vividly but concisely. Match response length to the situation.
- Simple actions (talking to NPC, looking around) = 1-2 sentences only.
- Complex actions (entering new area, combat, major story moments) = up to 3 paragraphs.
- NEVER pad responses. If one sentence is appropriate, use one sentence.
- Address players by name when multiple are present.
- NEVER speak, act, or respond on behalf of ANY player character under ANY circumstances.
- @MENTION RULE — CRITICAL: If a message contains @PlayerName, respond with ONLY one narrative sentence e.g. "Mack turns to May, waiting for her response." Then STOP. Do NOT write what the mentioned player says or does.
- You control ONLY the world, environment, and NPCs. Never put words in a player's mouth.
- React to EVERYTHING the player does.
- When combat occurs, roll dice explicitly: "Rolling d20... [result]!" and describe outcomes dramatically.
- Only ONE NPC may speak per response. If multiple NPCs are present, have them speak one at a time across turns.
- End with suggested actions in *italics* ONLY for complex responses.
- Track player HP. If they take damage, tell them.

DIALOGUE FORMATTING — CRITICAL:
- NPC dialogue MUST always be on its own separate paragraph, never mixed with narration.
- Narration describing the NPC goes in the paragraph BEFORE or AFTER the dialogue paragraph.
- CORRECT format example:
  The old dwarf steps forward, his eyes narrowing with suspicion.

  Gorin: "State your business, traveller. We don't take kindly to strangers here."

  His hand rests on the hilt of his axe.
- NEVER put narration and NPC dialogue on the same paragraph.

NPC DATA — CRITICAL:
- The FIRST time an NPC appears, include a data tag at the END of your response.
- Format: <npc_data>{"name":"NpcName","gender":"male|female","voice":"VoiceName","race":"Race","role":"Role","description":"physical appearance and personality in one sentence"}</npc_data>
- Male NPC voices: Fenrir (warrior/villain), Orus (merchant/elder), Achird (mysterious/mage)
- Female NPC voices: Kore (mysterious/mage), Aoede (noble/elf), Leda (warrior/ranger)
- Choose voice that best fits personality and role.
- When an NPC speaks, format as: NpcName: "their words here"
- Only one NPC data tag per response. Never repeat for the same NPC.

KNOWN NPCS IN THIS CAMPAIGN:
{{NPC_ROSTER}}

When HP or gold changes, include at the END of your response:
<state_update>
{"hp": NEW_HP, "gold": NEW_GOLD}
</state_update>`

// ─── MUSIC ──────────────────────────────────────────────────────────────────
const MUSIC_TRACKS = {
  exploration: '/music/exploration.mp3',
  combat: '/music/combat.mp3',
  mystery: '/music/mystery.mp3',
  tavern: '/music/tavern.mp3',
  dungeon: '/music/dungeon.mp3',
  inn: '/music/inn.mp3'
}

function detectMood(text) {
  const lower = text.toLowerCase()
  if (lower.includes('attack') || lower.includes('combat') || lower.includes('fight') ||
      lower.includes('battle') || lower.includes('enemy') || lower.includes('sword') ||
      lower.includes('blood') || lower.includes('roll') || lower.includes('damage')) return 'combat'
  if (lower.includes('tavern') || lower.includes('inn') || lower.includes('bar') ||
      lower.includes('drink') || lower.includes('ale') || lower.includes('bard')) return 'tavern'
  if (lower.includes('dungeon') || lower.includes('cave') || lower.includes('dark') ||
      lower.includes('shadow') || lower.includes('undead') || lower.includes('crypt')) return 'dungeon'
  if (lower.includes('mysterious') || lower.includes('strange') || lower.includes('puzzle') ||
      lower.includes('secret') || lower.includes('hidden') || lower.includes('ancient')) return 'mystery'
  return 'exploration'
}

// ─── PCM → WAV ──────────────────────────────────────────────────────────────
function pcmToWav(base64Pcm) {
  const raw = atob(base64Pcm)
  const pcm = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) pcm[i] = raw.charCodeAt(i)
  const wav = new ArrayBuffer(44 + pcm.length)
  const view = new DataView(wav)
  const write = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true)
  write(8, 'WAVE'); write(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, 24000, true)
  view.setUint32(28, 48000, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true); write(36, 'data')
  view.setUint32(40, pcm.length, true)
  new Uint8Array(wav).set(pcm, 44)
  return new Blob([wav], { type: 'audio/wav' })
}

// ─── PARSE NPC DATA TAG ──────────────────────────────────────────────────────
function parseNpcData(text) {
  const match = text.match(/<npc_data>([\s\S]*?)<\/npc_data>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function detectNpcInParagraph(paragraph, npcData) {
  for (const [name, data] of Object.entries(npcData)) {
    if (paragraph.trim().startsWith(`${name}:`)) {
      return { npcName: name, npcVoice: data.voice || data }
    }
  }
  return null
}

async function generateParagraphTTS(paragraph, npcData) {
  const npc = detectNpcInParagraph(paragraph, npcData)
  let body
  if (npc) {
    body = {
      contents: [{ parts: [{ text: paragraph.replace(`${npc.npcName}:`, '').trim() }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: npc.npcVoice } } }
      }
    }
  } else {
    body = {
      contents: [{ parts: [{ text: `Read this like David Attenborough narrating a dark fantasy world — measured, authoritative, with quiet wonder and gravitas. British accent: ${paragraph}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATOR_VOICE } } }
      }
    }
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${import.meta.env.VITE_GEMINI_TTS_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  const data = await response.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].inlineData.data
}

function parseStateUpdate(text) {
  const match = text.match(/<state_update>([\s\S]*?)<\/state_update>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function cleanText(text) {
  return text
    .replace(/<state_update>[\s\S]*?<\/state_update>/g, '')
    .replace(/<npc_data>[\s\S]*?<\/npc_data>/g, '')
    .trim()
}

function playBase64Audio(base64Pcm, audioRef) {
  const blob = pcmToWav(base64Pcm)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  if (audioRef) audioRef.current = audio
  return audio
}

function buildNpcRoster(npcData) {
  const npcs = Object.values(npcData)
  if (npcs.length === 0) return 'None yet.'
  return npcs.map(n =>
    `- ${n.name} (${n.race || 'Unknown'}, ${n.role || 'Unknown'}, voice: ${n.voice}): ${n.description || 'No description.'}`
  ).join('\n')
}

// ─── DRAGGABLE WINDOW HOOK ───────────────────────────────────────────────────
function useFloatingWindow(initialPos, initialSize) {
  const [pos, setPos] = useState(initialPos)
  const [size, setSize] = useState(initialSize)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const prevRef = useRef(null)

  const startDrag = useCallback((e) => {
    if (maximized || e.button !== 0) return
    e.preventDefault()
    const ox = e.clientX - pos.x
    const oy = e.clientY - pos.y
    const onMove = (e) => setPos({ x: Math.max(0, e.clientX - ox), y: Math.max(0, e.clientY - oy) })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos, maximized])

  const startResize = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, sw = size.w, sh = size.h
    const onMove = (e) => setSize({ w: Math.max(300, sw + e.clientX - sx), h: Math.max(200, sh + e.clientY - sy) })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size])

  const toggleMaximize = useCallback(() => {
    if (maximized) { setPos(prevRef.current.pos); setSize(prevRef.current.size); setMaximized(false) }
    else { prevRef.current = { pos, size }; setMaximized(true) }
  }, [maximized, pos, size])

  const toggleMinimize = useCallback(() => setMinimized(m => !m), [])

  return { pos, size, minimized, maximized, startDrag, startResize, toggleMaximize, toggleMinimize }
}

// ─── FLOATING WINDOW COMPONENT ───────────────────────────────────────────────
function FloatingWindow({ title, icon, children, zIndex, onFocus, win, accentColor = '#c9a84c' }) {
  const { pos, size, minimized, maximized, startDrag, startResize, toggleMaximize, toggleMinimize } = win
  const style = maximized
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: minimized ? 'auto' : size.h, zIndex }

  return (
    <div onMouseDown={onFocus} style={{
      ...style,
      background: 'rgba(8,6,16,0.97)',
      border: `1px solid ${accentColor}44`,
      borderRadius: maximized ? 0 : '8px',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: `0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px ${accentColor}22`,
      userSelect: 'none',
    }}>
      {/* Title Bar */}
      <div onMouseDown={startDrag} style={{
        padding: '7px 10px',
        background: 'linear-gradient(135deg, rgba(20,15,35,0.98), rgba(12,8,22,0.98))',
        borderBottom: `1px solid ${accentColor}33`,
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: maximized ? 'default' : 'grab', flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '10px', color: accentColor, fontFamily: "'Cinzel', serif", letterSpacing: '2px' }}>{title}</span>
        <div style={{ display: 'flex', gap: '5px' }} onMouseDown={e => e.stopPropagation()}>
          <button onClick={toggleMinimize} style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#f59e0b', border: 'none', cursor: 'pointer', fontSize: '8px', color: '#000' }}>−</button>
          <button onClick={toggleMaximize} style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#10b981', border: 'none', cursor: 'pointer', fontSize: '8px', color: '#000' }}>⤢</button>
        </div>
      </div>
      {!minimized && <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{children}</div>}
      {!minimized && !maximized && (
        <div onMouseDown={startResize} style={{
          position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px',
          cursor: 'se-resize',
          background: `linear-gradient(135deg, transparent 50%, ${accentColor}44 50%)`,
          borderRadius: '0 0 8px 0',
        }} />
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Game() {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const roomCode = searchParams.get('room')
  const isHost = searchParams.get('host') === 'true'
  const { player, gameState, updateGameState, messages, addMessage, setMessages } = useGame()

  // ─── DEVICE DETECTION ──────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  // ─── SCENE STATE ────────────────────────────────────────────────────────
  const [sceneUrl, setSceneUrl] = useState('')
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneLabel, setSceneLabel] = useState('Adventure Begins')
  const [showScene, setShowScene] = useState(true)
  const currentSceneRef = useRef('exploration')
  const sceneSeedRef = useRef(Math.floor(Math.random() * 9999))

  // ─── WINDOW TOGGLES (mobile) ────────────────────────────────────────────
  const [mobileSceneVisible, setMobileSceneVisible] = useState(true)

  // ─── DESKTOP WINDOW STATE ───────────────────────────────────────────────
  const sceneWin = useFloatingWindow({ x: 20, y: 60 }, { w: 520, h: 400 })
  const chatWin = useFloatingWindow({ x: 560, y: 60 }, { w: 500, h: 600 })
  const [zOrders, setZOrders] = useState({ scene: 10, chat: 11 })

  const focusWindow = (name) => {
    const max = Math.max(...Object.values(zOrders))
    setZOrders(z => ({ ...z, [name]: max + 1 }))
  }

  // ─── GAME STATE ─────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showRoomCode, setShowRoomCode] = useState(false)
  const [players, setPlayers] = useState([])
  const [dmBusy, setDmBusy] = useState(false)
  const [typers, setTypers] = useState([])
  const [mentionSearch, setMentionSearch] = useState(null)
  const [filteredPlayers, setFilteredPlayers] = useState([])
  const [playerAvatars, setPlayerAvatars] = useState({})
  const [muted, setMuted] = useState(false)
  const [musicMuted, setMusicMuted] = useState(false)
  const [ttsStatus, setTtsStatus] = useState('idle')
  const [npcData, setNpcData] = useState({})

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const hasStarted = useRef(false)
  const hasAnnounced = useRef(false)
  const typingTimeoutRef = useRef(null)
  const prevMessageCount = useRef(0)
  const mutedRef = useRef(false)
  const currentAudioRef = useRef(null)
  const musicRef = useRef(null)
  const currentMoodRef = useRef(null)
  const musicMutedRef = useRef(false)
  const npcDataRef = useRef({})
  const audioChannelRef = useRef(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { musicMutedRef.current = musicMuted }, [musicMuted])
  useEffect(() => { npcDataRef.current = npcData }, [npcData])

  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCount.current = messages.length
  }, [messages])

  // ─── SCENE GENERATION ───────────────────────────────────────────────────
  const loadScene = useCallback((sceneName, label, seed) => {
    const prompt = SCENE_KEYWORDS[sceneName] || SCENE_KEYWORDS.exploration
    const useSeed = seed || sceneSeedRef.current
    setSceneLoading(true)
    setSceneLabel(label || sceneName)
    setSceneUrl(buildSceneUrl(prompt, useSeed))
    currentSceneRef.current = sceneName
  }, [])

  const loadNpcScene = useCallback((npc) => {
    setSceneLoading(true)
    setSceneLabel(npc.name)
    const seed = npc.seed || Math.floor(Math.random() * 9999)
    setSceneUrl(buildNpcSceneUrl(npc, currentSceneRef.current))
  }, [])

  const regenerateScene = () => {
    sceneSeedRef.current = Math.floor(Math.random() * 9999)
    loadScene(currentSceneRef.current, sceneLabel)
  }

  // Load initial scene
  useEffect(() => { loadScene('exploration', 'Adventure Begins') }, [])

  // ─── INIT ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId) return
    loadMessages()
    loadNpcData()
    const cleanupMessages = subscribeToMessages()
    const cleanupAudio = subscribeToAudio()
    subscribeToPresence()
    loadPlayers()
    loadPlayerAvatars()
    checkDmBusy()
    const poll = setInterval(() => { loadMessages(); checkDmBusy() }, 3000)
    return () => {
      cleanupMessages(); cleanupAudio(); clearInterval(poll)
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
    }
  }, [campaignId])

  useEffect(() => {
    if (player && messages.length === 0 && !hasStarted.current && isHost) {
      hasStarted.current = true; startAdventure()
    }
    if (player && messages.length > 0 && !isHost && !hasAnnounced.current) {
      hasAnnounced.current = true
      saveMessage('player', `⚔️ ${player.name} the ${player.class} has joined the adventure!`, player.name)
    }
  }, [player, messages.length])

  async function loadNpcData() {
    const { data } = await supabase.from('campaigns').select('npc_voices').eq('id', campaignId).single()
    if (data?.npc_voices) { setNpcData(data.npc_voices); npcDataRef.current = data.npc_voices }
  }

  async function saveNpcData(data) {
    await supabase.from('campaigns').update({ npc_voices: data }).eq('id', campaignId)
  }

  function subscribeToAudio() {
    const channel = supabase.channel(`audio:${campaignId}`, { config: { broadcast: { self: false } } })
    if (!isHost) {
      const audioQueue = []; let isPlaying = false
      const playNext = async () => {
        if (isPlaying || audioQueue.length === 0) return
        isPlaying = true
        const base64Pcm = audioQueue.shift()
        try {
          const audio = playBase64Audio(base64Pcm, currentAudioRef)
          setTtsStatus('playing')
          await new Promise((resolve, reject) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', reject); audio.play() })
        } catch (e) { console.log('Audio play error:', e) }
        isPlaying = false
        if (audioQueue.length > 0) playNext(); else setTtsStatus('idle')
      }
      channel.on('broadcast', { event: 'audio_chunk' }, ({ payload }) => { if (mutedRef.current) return; audioQueue.push(payload.base64Pcm); playNext() })
      channel.on('broadcast', { event: 'audio_start' }, () => setTtsStatus('loading'))
      channel.on('broadcast', { event: 'audio_end' }, () => { if (audioQueue.length === 0) setTtsStatus('idle') })
    }
    channel.subscribe()
    audioChannelRef.current = channel
    return () => supabase.removeChannel(channel)
  }

  async function hostGenerateAndBroadcast(text) {
    if (mutedRef.current) return
    const clean = text.replace(/<[^>]+>/g, '').trim()
    if (!clean) return
    const paragraphs = clean.split(/\n+/).filter(p => p.trim().length > 0)
    const chunks = paragraphs.length > 0 ? paragraphs : [clean]
    audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_start', payload: {} })
    setTtsStatus('loading')
    try {
      let currentBase64 = await generateParagraphTTS(chunks[0], npcDataRef.current)
      const broadcastAndPlay = async (base64Pcm) => {
        audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_chunk', payload: { base64Pcm } })
        const audio = playBase64Audio(base64Pcm, currentAudioRef)
        setTtsStatus('playing')
        await new Promise((resolve, reject) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', reject); audio.play() })
      }
      for (let i = 0; i < chunks.length; i++) {
        if (mutedRef.current) break
        const nextPromise = i + 1 < chunks.length ? generateParagraphTTS(chunks[i + 1], npcDataRef.current) : null
        await broadcastAndPlay(currentBase64)
        if (nextPromise) currentBase64 = await nextPromise
      }
      setTtsStatus('idle')
    } catch (e) { console.log('TTS error:', e); setTtsStatus('error') }
    audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_end', payload: {} })
  }

  function playMusic(mood) {
    if (musicMutedRef.current) return
    if (currentMoodRef.current === mood && musicRef.current && !musicRef.current.paused) return
    const track = MUSIC_TRACKS[mood]; if (!track) return
    if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
    const audio = new Audio(track); audio.loop = true; audio.volume = 0.3; audio.play().catch(() => {})
    musicRef.current = audio; currentMoodRef.current = mood
  }

  async function checkDmBusy() {
    const { data } = await supabase.from('campaigns').select('dm_busy').eq('id', campaignId).single()
    if (data) setDmBusy(data.dm_busy)
  }

  async function setDmBusyState(busy) {
    await supabase.from('campaigns').update({ dm_busy: busy }).eq('id', campaignId)
    setDmBusy(busy)
  }

  async function loadMessages() {
    const { data } = await supabase.from('messages').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setMessages(prev => {
        if (prev.length === data.length) return prev
        const newMessages = data.map(m => ({ role: m.role, text: m.content, playerName: m.player_name }))
        const lastMsg = newMessages[newMessages.length - 1]
        if (lastMsg.role === 'dm' && prev.length < newMessages.length && isHost) {
          hostGenerateAndBroadcast(lastMsg.text)
          playMusic(detectMood(lastMsg.text))
          const scene = detectSceneFromText(lastMsg.text)
          if (scene) loadScene(scene, scene)
        }
        return newMessages
      })
      hasStarted.current = true
    }
  }

  async function loadPlayers() {
    const { data } = await supabase.from('messages').select('player_name').eq('campaign_id', campaignId).eq('role', 'player')
    if (data) { const unique = [...new Set(data.map(m => m.player_name).filter(Boolean))]; setPlayers(unique) }
  }

  async function loadPlayerAvatars() {
    const { data } = await supabase.from('players').select('name, avatar_url').not('avatar_url', 'is', null)
    if (data) { const avatarMap = {}; data.forEach(p => { if (p.avatar_url) avatarMap[p.name] = p.avatar_url }); setPlayerAvatars(avatarMap) }
  }

  function subscribeToMessages() {
    const channel = supabase.channel(`messages:${campaignId}`)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `campaign_id=eq.${campaignId}` }, (payload) => {
      const msg = payload.new
      addMessage({ role: msg.role, text: msg.content, playerName: msg.player_name })
      if (msg.role === 'dm' && isHost) {
        hostGenerateAndBroadcast(msg.content)
        playMusic(detectMood(msg.content))
        const scene = detectSceneFromText(msg.content)
        if (scene) loadScene(scene, scene)
      }
      if (msg.role === 'player') loadPlayers()
    })
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` }, (payload) => setDmBusy(payload.new.dm_busy))
    channel.subscribe()
    return () => supabase.removeChannel(channel)
  }

  function subscribeToPresence() {
    const channel = supabase.channel(`presence:${campaignId}`)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setTypers(Object.entries(state).filter(([key, val]) => val[0]?.typing && key !== player?.name).map(([key]) => key))
    })
    channel.subscribe(async (status) => { if (status === 'SUBSCRIBED') await channel.track({ typing: false }) })
    return channel
  }

  async function handleTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {}, 2000)
  }

  async function saveMessage(role, content, playerName = null) {
    await supabase.from('messages').insert({ campaign_id: campaignId, player_id: player?.id, role, content, player_name: playerName })
  }

  function handleInput(value) {
    setInput(value)
    const atIndex = value.lastIndexOf('@')
    if (atIndex !== -1) {
      const search = value.slice(atIndex + 1).toLowerCase()
      setMentionSearch(search)
      setFilteredPlayers(players.filter(p => p.toLowerCase().startsWith(search) && p !== player?.name))
    } else { setMentionSearch(null); setFilteredPlayers([]) }
  }

  function insertMention(playerName) {
    const atIndex = input.lastIndexOf('@')
    setInput(input.slice(0, atIndex) + `@${playerName} `)
    setMentionSearch(null); setFilteredPlayers([])
    inputRef.current?.focus()
  }

  async function callDM(userMessage) {
    const history = messages.map(m => ({ role: m.role === 'dm' ? 'assistant' : 'user', content: m.role === 'player' ? `${m.playerName || player?.name}: ${m.text}` : m.text }))
    if (userMessage) history.push({ role: 'user', content: `${player?.name}: ${userMessage}` })
    if (history.length === 0) {
      const playerList = players.length > 0 ? players.join(', ') : player?.name
      history.push({ role: 'user', content: `Start our adventure. Players: ${playerList}. Host is ${player?.name} the ${player?.class}` })
    }
    const hasMention = userMessage && userMessage.includes('@')
    const npcRoster = buildNpcRoster(npcDataRef.current)
    const systemContent = SYSTEM_PROMPT.replace('{{NPC_ROSTER}}', npcRoster) +
      `\n\nPlayers in this campaign: ${players.length > 0 ? players.join(', ') : player?.name}. ` +
      `Acting player: ${player?.name} the ${player?.class}, HP: ${gameState.hp}/${gameState.maxHp}, Gold: ${gameState.gold}.` +
      (hasMention ? '\n\nCRITICAL: This message contains an @mention. ONE sentence only. Stop immediately after.' : '')
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemContent }, ...history], max_tokens: 1000 })
    })
    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'The dungeon stirs...'
  }

  async function processDmResponse(raw) {
    const npc = parseNpcData(raw)
    if (npc && npc.name && npc.voice) {
      const seed = Math.floor(Math.random() * 9999)
      const updated = { ...npcDataRef.current, [npc.name]: { ...npc, seed } }
      setNpcData(updated); npcDataRef.current = updated
      await saveNpcData(updated)
      // Show NPC scene when new NPC appears
      loadNpcScene({ ...npc, seed })
    }
    const stateUpdate = parseStateUpdate(raw)
    if (stateUpdate) updateGameState(stateUpdate)
    const clean = cleanText(raw)
    await saveMessage('dm', clean)
  }

  async function startAdventure() {
    if (!player) return
    await setDmBusyState(true); setLoading(true)
    let attempts = 0
    while (attempts < 3) {
      try { const raw = await callDM(null); await processDmResponse(raw); break }
      catch (e) {
        attempts++
        if (attempts < 3) await new Promise(r => setTimeout(r, 5000))
        else await saveMessage('dm', 'The ancient magic stirs... try sending a message to begin your adventure.')
      }
    }
    await setDmBusyState(false); setLoading(false)
  }

  async function sendMessage() {
    if (!input.trim() || loading || dmBusy) return
    const userMsg = input.trim(); setInput('')
    await saveMessage('player', userMsg, player?.name)
    await setDmBusyState(true); setLoading(true)
    try { const raw = await callDM(userMsg); await processDmResponse(raw) }
    catch { await saveMessage('dm', 'The magic falters...') }
    await setDmBusyState(false); setLoading(false)
  }

  function quickAction(text) { setInput(text); setTimeout(() => sendMessage(), 100) }

  const hpPct = Math.max(0, (gameState.hp / gameState.maxHp) * 100)
  const hpColor = hpPct > 50 ? '#27ae60' : hpPct > 25 ? '#f39c12' : '#c0392b'

  // ─── SCENE PANEL (shared between mobile/desktop) ──────────────────────
  const SceneContent = (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0806' }}>
      {sceneLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#0a0806', zIndex: 2 }}>
          <div style={{ fontSize: '24px', animation: 'spin 3s linear infinite' }}>⚔</div>
          <div style={{ fontSize: '8px', color: '#4a3a2a', letterSpacing: '3px' }}>SUMMONING VISION...</div>
        </div>
      )}
      {sceneUrl && (
        <img src={sceneUrl} alt="Scene"
          onLoad={() => setSceneLoading(false)}
          onError={() => setSceneLoading(false)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: sceneLoading ? 0 : 1, transition: 'opacity 1s', imageRendering: 'pixelated' }}
        />
      )}
      {!sceneLoading && (
        <>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '20px 10px 8px' }}>
            <div style={{ fontSize: '9px', color: '#c9a84c88', letterSpacing: '2px', textTransform: 'uppercase' }}>{sceneLabel}</div>
          </div>
          <button onClick={regenerateScene} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: '1px solid #c9a84c44', borderRadius: '4px', color: '#c9a84c88', fontSize: '8px', padding: '2px 7px', cursor: 'pointer', letterSpacing: '1px' }}>↻</button>
        </>
      )}
    </div>
  )

  // ─── CHAT PANEL (shared between mobile/desktop) ───────────────────────
  const ChatContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Stats bar */}
      <div style={{ padding: '6px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: 'var(--text-dim)' }}>{player?.name} · {player?.class}</span>
        <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: 'var(--text)' }}>❤️ {gameState.hp}/{gameState.maxHp}</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: 'var(--gold)' }}>🪙 {gameState.gold}</span>
      </div>

      {dmBusy && !loading && (
        <div style={{ background: 'rgba(201,168,76,0.05)', borderBottom: '1px solid var(--border)', padding: '4px 12px', fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)', textAlign: 'center', flexShrink: 0 }}>
          ⚔️ THE DUNGEON MASTER IS RESPONDING...
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: msg.role === 'player' ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexDirection: msg.role === 'player' ? 'row-reverse' : 'row' }}>
              {msg.role === 'player' && playerAvatars[msg.playerName || player?.name] && (
                <img src={playerAvatars[msg.playerName || player?.name]} alt={msg.playerName} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: 'var(--text-dim)' }}>
                {msg.role === 'dm' ? 'DUNGEON MASTER' : (msg.playerName || player?.name)?.toUpperCase()}
              </div>
            </div>
            <div style={{
              maxWidth: '88%', padding: '10px 14px',
              borderRadius: msg.role === 'dm' ? '0 10px 10px 10px' : '10px 0 10px 10px',
              background: msg.role === 'dm' ? 'linear-gradient(135deg, #14102a, #1a1535)' : 'linear-gradient(135deg, #0f1a14, #142010)',
              border: msg.role === 'dm' ? '1px solid var(--border)' : '1px solid rgba(39,174,96,0.2)',
              borderLeft: msg.role === 'dm' ? '2px solid var(--gold)' : undefined,
              borderRight: msg.role === 'player' ? '2px solid var(--green)' : undefined,
              fontSize: '14px', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap'
            }}>
              {msg.text.split(/(@\w+)/g).map((part, i) =>
                part.startsWith('@') ? <span key={i} style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{part}</span> : part
              )}
            </div>
          </div>
        ))}

        {typers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: 'var(--text-dim)' }}>{typers.join(', ').toUpperCase()}</div>
            <div style={{ padding: '8px 12px', background: 'linear-gradient(135deg, #0f1a14, #142010)', border: '1px solid rgba(39,174,96,0.2)', borderRight: '2px solid var(--green)', borderRadius: '10px 0 10px 10px', display: 'flex', gap: '4px', width: 'fit-content', alignSelf: 'flex-end' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--green)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: 'var(--text-dim)' }}>DUNGEON MASTER</div>
            <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, #14102a, #1a1535)', border: '1px solid var(--border)', borderLeft: '2px solid var(--gold)', borderRadius: '0 10px 10px 10px', display: 'flex', gap: '4px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '5px', padding: '0 10px 6px', overflowX: 'auto', flexShrink: 0 }}>
        {['👁 Look Around', '⚔️ Attack', '🌑 Sneak', '🔍 Search', '💬 Talk', '💨 Flee'].map(action => (
          <button key={action} onClick={() => quickAction(action.split(' ').slice(1).join(' '))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '5px 12px', color: dmBusy ? '#3a3050' : 'var(--text-dim)', fontSize: '10px', letterSpacing: '1px', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Cinzel', serif", cursor: dmBusy ? 'not-allowed' : 'pointer' }}>
            {action}
          </button>
        ))}
      </div>

      {/* @ Mention Dropdown */}
      {mentionSearch !== null && filteredPlayers.length > 0 && (
        <div style={{ position: 'absolute', bottom: '70px', left: '10px', background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 0 20px rgba(201,168,76,0.2)' }}>
          {filteredPlayers.map(p => (
            <div key={p} onClick={() => insertMention(p)} style={{ padding: '8px 14px', cursor: 'pointer', fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold-light)', letterSpacing: '1px', borderBottom: '1px solid var(--border)' }}>
              ⚔️ {p}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '8px 10px 12px', background: 'rgba(10,8,18,0.98)', borderTop: '1px solid var(--border)', display: 'flex', gap: '7px', alignItems: 'flex-end', flexShrink: 0, position: 'relative' }}>
        <textarea ref={inputRef} value={input}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder={dmBusy ? 'The DM is responding...' : 'What do you do...'}
          disabled={dmBusy} rows={1}
          style={{ flex: 1, background: 'var(--bg2)', border: `1px solid ${dmBusy ? 'rgba(201,168,76,0.1)' : 'var(--border)'}`, borderRadius: '18px', padding: '8px 14px', color: dmBusy ? 'var(--text-dim)' : 'var(--text)', fontSize: '15px', outline: 'none', resize: 'none', maxHeight: '80px', lineHeight: 1.4, fontFamily: "'EB Garamond', serif", cursor: dmBusy ? 'not-allowed' : 'text' }}
        />
        <button onClick={sendMessage} disabled={dmBusy} style={{ width: '38px', height: '38px', background: dmBusy ? 'var(--bg2)' : 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: `1px solid ${dmBusy ? 'var(--border)' : 'var(--gold)'}`, borderRadius: '50%', color: dmBusy ? 'var(--text-dim)' : 'var(--gold)', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: dmBusy ? 'none' : '0 0 15px rgba(201,168,76,0.15)', cursor: dmBusy ? 'not-allowed' : 'pointer' }}>➤</button>
      </div>
    </div>
  )

  // ─── RENDER ───────────────────────────────────────────────────────────────

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>

        {/* Mobile Header */}
        <div style={{ padding: '8px 12px', background: 'rgba(10,8,18,0.95)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '14px', color: 'var(--gold)', letterSpacing: '2px' }}>LORECRAFT</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '1px', color: ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : 'var(--text-dim)', padding: '2px 6px', border: `1px solid ${ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px' }}>
              {ttsStatus === 'playing' ? '🔊' : ttsStatus === 'loading' ? '⏳' : '💤'}
            </div>
            <button onClick={() => setMobileSceneVisible(v => !v)} style={{ background: mobileSceneVisible ? 'rgba(201,168,76,0.15)' : 'none', border: `1px solid ${mobileSceneVisible ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: mobileSceneVisible ? 'var(--gold)' : 'var(--text-dim)', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}>🖼</button>
            <button onClick={() => { const n = !mutedRef.current; mutedRef.current = n; setMuted(n); if (n && currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null } }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '3px 8px', fontSize: '12px' }}>{muted ? '🔇' : '🔊'}</button>
            <button onClick={() => { const n = !musicMutedRef.current; musicMutedRef.current = n; setMusicMuted(n); if (n && musicRef.current) musicRef.current.pause(); else if (!n && musicRef.current) musicRef.current.play() }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '3px 8px', fontSize: '12px' }}>{musicMuted ? '🔕' : '🎵'}</button>
            {roomCode && <button onClick={() => setShowRoomCode(!showRoomCode)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '3px 8px', fontSize: '10px', fontFamily: "'Cinzel', serif" }}>🔗</button>}
            <button onClick={() => setShowInventory(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '3px 8px', fontSize: '12px' }}>🎒</button>
          </div>
        </div>

        {/* Room Code Banner */}
        {showRoomCode && roomCode && (
          <div style={{ background: 'linear-gradient(135deg, #1e1830, #2a2045)', borderBottom: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '3px' }}>INVITE FRIENDS</div>
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '22px', color: 'var(--gold)', letterSpacing: '6px' }}>{roomCode}</div>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(roomCode); setShowRoomCode(false) }} style={{ background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold)', padding: '6px 12px', fontFamily: "'Cinzel', serif", fontSize: '10px' }}>COPY</button>
          </div>
        )}

        {/* Mobile Scene Panel */}
        {mobileSceneVisible && (
          <div style={{ height: '38%', flexShrink: 0, borderBottom: '1px solid var(--border)', position: 'relative' }}>
            {SceneContent}
          </div>
        )}

        {/* Mobile Chat */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {ChatContent}
        </div>

        {/* Inventory Modal */}
        {showInventory && (
          <div onClick={() => setShowInventory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '20px 24px 40px' }}>
              <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 20px' }} />
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '16px' }}>⚔ Inventory</div>
              {gameState.inventory.map((item, i) => <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(201,168,76,0.1)', fontSize: '15px', color: 'var(--text)' }}>{item}</div>)}
              <div style={{ padding: '10px 0', fontSize: '15px', color: 'var(--gold)' }}>🪙 {gameState.gold} Gold</div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1} }
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `}</style>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ──
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050408', backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(30,15,60,0.3) 0%, transparent 60%)', overflow: 'hidden', position: 'relative', fontFamily: 'Georgia, serif' }}>

      {/* Desktop grid bg */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(201,168,76,0.02) 40px,rgba(201,168,76,0.02) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(201,168,76,0.02) 40px,rgba(201,168,76,0.02) 41px)', pointerEvents: 'none' }} />

      {/* ── SCENE FLOATING WINDOW ── */}
      <FloatingWindow title={sceneLabel.toUpperCase()} icon="🖼" zIndex={zOrders.scene} onFocus={() => focusWindow('scene')} win={sceneWin} accentColor="#c9a84c">
        {SceneContent}
      </FloatingWindow>

      {/* ── CHAT FLOATING WINDOW ── */}
      <FloatingWindow title="DUNGEON MASTER" icon="⚔" zIndex={zOrders.chat} onFocus={() => focusWindow('chat')} win={chatWin} accentColor="#27ae60">
        {ChatContent}
      </FloatingWindow>

      {/* ── TASKBAR ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '42px', background: 'rgba(5,3,10,0.98)', borderTop: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: '8px', zIndex: 1000 }}>
        <div style={{ color: '#c9a84c', fontSize: '11px', letterSpacing: '3px', fontFamily: "'Cinzel', serif", marginRight: '10px' }}>⚔ LORECRAFT</div>

        {/* Window toggles */}
        {[
          { key: 'scene', icon: '🖼', label: 'SCENE', w: sceneWin, accent: '#c9a84c' },
          { key: 'chat', icon: '⚔', label: 'CHAT', w: chatWin, accent: '#27ae60' },
        ].map(({ key, icon, label, w, accent }) => (
          <button key={key} onClick={() => { w.toggleMinimize(); focusWindow(key) }} style={{ padding: '4px 12px', fontSize: '9px', letterSpacing: '2px', background: w.minimized ? 'rgba(255,255,255,0.03)' : `${accent}22`, border: `1px solid ${w.minimized ? '#2a2a2a' : accent + '66'}`, borderRadius: '4px', color: w.minimized ? '#4a4a4a' : accent, cursor: 'pointer', fontFamily: "'Cinzel', serif" }}>{icon} {label}</button>
        ))}

        {/* TTS Status */}
        <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '1px', color: ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? '#c9a84c' : ttsStatus === 'error' ? '#c0392b' : '#3a3a3a', padding: '3px 8px', border: `1px solid ${ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? '#c9a84c' : ttsStatus === 'error' ? '#c0392b' : '#2a2a2a'}`, borderRadius: '4px' }}>
          {ttsStatus === 'playing' ? '🔊 PLAYING' : ttsStatus === 'loading' ? '⏳ LOADING' : ttsStatus === 'error' ? '❌ ERROR' : '💤 IDLE'}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {roomCode && <button onClick={() => setShowRoomCode(!showRoomCode)} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: '4px', color: '#4a4a4a', padding: '3px 10px', fontSize: '10px', fontFamily: "'Cinzel', serif", cursor: 'pointer' }}>🔗 {roomCode}</button>}
          <button onClick={() => setShowInventory(true)} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: '4px', color: '#4a4a4a', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}>🎒</button>
          <button onClick={() => { const n = !mutedRef.current; mutedRef.current = n; setMuted(n); if (n && currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null } }} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: '4px', color: '#4a4a4a', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}>{muted ? '🔇' : '🔊'}</button>
          <button onClick={() => { const n = !musicMutedRef.current; musicMutedRef.current = n; setMusicMuted(n); if (n && musicRef.current) musicRef.current.pause(); else if (!n && musicRef.current) musicRef.current.play() }} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: '4px', color: '#4a4a4a', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}>{musicMuted ? '🔕' : '🎵'}</button>
        </div>
      </div>

      {/* Room Code Banner */}
      {showRoomCode && roomCode && (
        <div style={{ position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #1e1830, #2a2045)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 2000, boxShadow: '0 8px 40px rgba(0,0,0,0.8)' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '4px' }}>INVITE FRIENDS</div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '28px', color: 'var(--gold)', letterSpacing: '8px' }}>{roomCode}</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(roomCode); setShowRoomCode(false) }} style={{ background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold)', padding: '8px 16px', fontFamily: "'Cinzel', serif", fontSize: '11px' }}>COPY</button>
          <button onClick={() => setShowRoomCode(false)} style={{ background: 'none', border: '1px solid #3a2a3a', borderRadius: '4px', color: '#6a5a6a', padding: '8px 10px', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventory && (
        <div onClick={() => setShowInventory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '340px', background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '16px' }}>⚔ Inventory</div>
            {gameState.inventory.map((item, i) => <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(201,168,76,0.1)', fontSize: '14px', color: 'var(--text)' }}>{item}</div>)}
            <div style={{ padding: '10px 0', fontSize: '14px', color: 'var(--gold)' }}>🪙 {gameState.gold} Gold</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:2px}
      `}</style>
    </div>
  )
}