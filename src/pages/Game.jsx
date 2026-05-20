import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

// ─── VOICE POOLS ────────────────────────────────────────────────────────────
const MALE_VOICES = ['Fenrir', 'Orus', 'Achird']
const FEMALE_VOICES = ['Kore', 'Aoede', 'Leda']
const NARRATOR_VOICE = 'Charon'

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

NPC VOICE ASSIGNMENT — CRITICAL:
- The FIRST time an NPC appears, you MUST include a voice tag at the end of your response.
- Format: <npc_voice>{"name":"NpcName","gender":"male|female","voice":"VoiceName"}</npc_voice>
- Male NPC voices: Fenrir (warrior/villain), Orus (merchant/elder), Achird (mysterious/mage)
- Female NPC voices: Kore (mysterious/mage), Aoede (noble/elf), Leda (warrior/ranger)
- Choose the voice that best fits the NPC's personality and role.
- When an NPC speaks, format their dialogue as: NpcName: "their words here"
- Only one NPC voice tag per response.

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

// ─── PARSE NPC VOICE TAG ─────────────────────────────────────────────────────
function parseNpcVoice(text) {
  const match = text.match(/<npc_voice>([\s\S]*?)<\/npc_voice>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

// ─── DETECT NPC IN PARAGRAPH ─────────────────────────────────────────────────
// Returns { npcName, npcVoice } if paragraph contains NPC dialogue, else null
function detectNpcInParagraph(paragraph, npcVoices) {
  for (const [name, voice] of Object.entries(npcVoices)) {
    // Look for "NpcName: " pattern indicating NPC is speaking
    if (paragraph.includes(`${name}:`)) {
      return { npcName: name, npcVoice: voice }
    }
  }
  return null
}

// ─── GENERATE TTS FOR ONE PARAGRAPH ─────────────────────────────────────────
async function generateParagraphTTS(paragraph, npcVoices) {
  const npc = detectNpcInParagraph(paragraph, npcVoices)

  let body
  if (npc) {
    // Multi-speaker: Narrator + NPC
    const script = paragraph
      .replace(new RegExp(`${npc.npcName}:\\s*"`, 'g'), `${npc.npcName}: "`)
    body = {
      contents: [{ parts: [{ text: script }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'Narrator', voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATOR_VOICE } } },
              { speaker: npc.npcName, voiceConfig: { prebuiltVoiceConfig: { voiceName: npc.npcVoice } } }
            ]
          }
        }
      }
    }
    // Prefix lines with speaker labels for multi-speaker
    const lines = paragraph.split('\n').map(line => {
      if (line.includes(`${npc.npcName}:`)) return line
      return `Narrator: ${line}`
    })
    body.contents[0].parts[0].text = lines.join('\n')
  } else {
    // Single speaker: Narrator only
    body = {
      contents: [{ parts: [{ text: `Narrator: ${paragraph}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'Narrator', voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATOR_VOICE } } },
              { speaker: 'NPC', voiceConfig: { prebuiltVoiceConfig: { voiceName: MALE_VOICES[0] } } }
            ]
          }
        }
      }
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${import.meta.env.VITE_GEMINI_TTS_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )
  const data = await response.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].inlineData.data // base64 PCM
}

// ─── PARSE HELPERS ───────────────────────────────────────────────────────────
function parseStateUpdate(text) {
  const match = text.match(/<state_update>([\s\S]*?)<\/state_update>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function cleanText(text) {
  return text
    .replace(/<state_update>[\s\S]*?<\/state_update>/g, '')
    .replace(/<npc_voice>[\s\S]*?<\/npc_voice>/g, '')
    .trim()
}

// ─── PLAY BASE64 AUDIO ───────────────────────────────────────────────────────
function playBase64Audio(base64Pcm, audioRef) {
  const blob = pcmToWav(base64Pcm)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  if (audioRef) audioRef.current = audio
  return audio
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
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
  const [playerAvatars, setPlayerAvatars] = useState({})
  const [muted, setMuted] = useState(false)
  const [musicMuted, setMusicMuted] = useState(false)
  const [ttsStatus, setTtsStatus] = useState('idle')
  const [npcVoices, setNpcVoices] = useState({}) // { "Grukk": "Fenrir", "Lyra": "Kore" }

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
  const npcVoicesRef = useRef({})
  const audioChannelRef = useRef(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { musicMutedRef.current = musicMuted }, [musicMuted])
  useEffect(() => { npcVoicesRef.current = npcVoices }, [npcVoices])

  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCount.current = messages.length
  }, [messages])

  // ─── INIT ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId) return
    loadMessages()
    loadNpcVoices()
    const cleanupMessages = subscribeToMessages()
    const cleanupAudio = subscribeToAudio()
    subscribeToPresence()
    loadPlayers()
    loadPlayerAvatars()
    checkDmBusy()

    const poll = setInterval(() => {
      loadMessages()
      checkDmBusy()
    }, 3000)

    return () => {
      cleanupMessages()
      cleanupAudio()
      clearInterval(poll)
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
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

  // ─── LOAD NPC VOICES FROM SUPABASE ───────────────────────────────────────
  async function loadNpcVoices() {
    const { data } = await supabase
      .from('campaigns')
      .select('npc_voices')
      .eq('id', campaignId)
      .single()
    if (data?.npc_voices) {
      setNpcVoices(data.npc_voices)
      npcVoicesRef.current = data.npc_voices
    }
  }

  // ─── SAVE NPC VOICES TO SUPABASE ─────────────────────────────────────────
  async function saveNpcVoices(voices) {
    await supabase
      .from('campaigns')
      .update({ npc_voices: voices })
      .eq('id', campaignId)
  }

  // ─── AUDIO REALTIME CHANNEL ───────────────────────────────────────────────
  // Host broadcasts base64 audio chunks, non-hosts receive and play
  function subscribeToAudio() {
    const channel = supabase.channel(`audio:${campaignId}`, {
      config: { broadcast: { self: false } }
    })

    if (!isHost) {
      // Non-hosts listen for audio chunks from host
      const audioQueue = []
      let isPlaying = false

      const playNext = async () => {
        if (isPlaying || audioQueue.length === 0) return
        isPlaying = true
        const base64Pcm = audioQueue.shift()
        try {
          const audio = playBase64Audio(base64Pcm, currentAudioRef)
          setTtsStatus('playing')
          await new Promise((resolve, reject) => {
            audio.addEventListener('ended', resolve)
            audio.addEventListener('error', reject)
            audio.play()
          })
        } catch (e) {
          console.log('Audio play error:', e)
        }
        isPlaying = false
        if (audioQueue.length > 0) playNext()
        else setTtsStatus('idle')
      }

      channel.on('broadcast', { event: 'audio_chunk' }, ({ payload }) => {
        if (mutedRef.current) return
        audioQueue.push(payload.base64Pcm)
        playNext()
      })

      channel.on('broadcast', { event: 'audio_start' }, () => {
        setTtsStatus('loading')
      })

      channel.on('broadcast', { event: 'audio_end' }, () => {
        if (audioQueue.length === 0) setTtsStatus('idle')
      })
    }

    channel.subscribe()
    audioChannelRef.current = channel
    return () => supabase.removeChannel(channel)
  }

  // ─── HOST: GENERATE + BROADCAST TTS ──────────────────────────────────────
  async function hostGenerateAndBroadcast(text) {
    if (mutedRef.current) return
    const clean = text.replace(/<[^>]+>/g, '').trim()
    if (!clean) return

    // Split into paragraphs
    const paragraphs = clean.split(/\n+/).filter(p => p.trim().length > 0)
    const chunks = paragraphs.length > 0 ? paragraphs : [clean]

    // Signal start to non-hosts
    audioChannelRef.current?.send({
      type: 'broadcast',
      event: 'audio_start',
      payload: {}
    })

    setTtsStatus('loading')

    try {
      // Generate first chunk
      let currentBase64 = await generateParagraphTTS(chunks[0], npcVoicesRef.current)

      // Play first chunk on host + broadcast to non-hosts
      const broadcastAndPlay = async (base64Pcm) => {
        // Broadcast to non-hosts
        audioChannelRef.current?.send({
          type: 'broadcast',
          event: 'audio_chunk',
          payload: { base64Pcm }
        })
        // Play on host
        const audio = playBase64Audio(base64Pcm, currentAudioRef)
        setTtsStatus('playing')
        await new Promise((resolve, reject) => {
          audio.addEventListener('ended', resolve)
          audio.addEventListener('error', reject)
          audio.play()
        })
      }

      for (let i = 0; i < chunks.length; i++) {
        if (mutedRef.current) break

        // Preload next chunk while current plays
        const nextPromise = i + 1 < chunks.length
          ? generateParagraphTTS(chunks[i + 1], npcVoicesRef.current)
          : null

        await broadcastAndPlay(currentBase64)

        if (nextPromise) currentBase64 = await nextPromise
      }

      setTtsStatus('idle')
    } catch (e) {
      console.log('TTS error:', e)
      setTtsStatus('error')
    }

    // Signal end to non-hosts
    audioChannelRef.current?.send({
      type: 'broadcast',
      event: 'audio_end',
      payload: {}
    })
  }

  // ─── MUSIC ───────────────────────────────────────────────────────────────
  function playMusic(mood) {
    if (musicMutedRef.current) return
    if (currentMoodRef.current === mood && musicRef.current && !musicRef.current.paused) return
    const track = MUSIC_TRACKS[mood]
    if (!track) return
    if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
    const audio = new Audio(track)
    audio.loop = true
    audio.volume = 0.3
    audio.play().catch(() => {})
    musicRef.current = audio
    currentMoodRef.current = mood
  }

  // ─── SUPABASE HELPERS ─────────────────────────────────────────────────────
  async function checkDmBusy() {
    const { data } = await supabase
      .from('campaigns').select('dm_busy').eq('id', campaignId).single()
    if (data) setDmBusy(data.dm_busy)
  }

  async function setDmBusyState(busy) {
    await supabase.from('campaigns').update({ dm_busy: busy }).eq('id', campaignId)
    setDmBusy(busy)
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages').select('*').eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      setMessages(prev => {
        if (prev.length === data.length) return prev
        const newMessages = data.map(m => ({ role: m.role, text: m.content, playerName: m.player_name }))
        const lastMsg = newMessages[newMessages.length - 1]
        if (lastMsg.role === 'dm' && prev.length < newMessages.length && isHost) {
          hostGenerateAndBroadcast(lastMsg.text)
          playMusic(detectMood(lastMsg.text))
        }
        return newMessages
      })
      hasStarted.current = true
    }
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from('messages').select('player_name')
      .eq('campaign_id', campaignId).eq('role', 'player')
    if (data) {
      const unique = [...new Set(data.map(m => m.player_name).filter(Boolean))]
      setPlayers(unique)
    }
  }

  async function loadPlayerAvatars() {
    const { data } = await supabase
      .from('players').select('name, avatar_url').not('avatar_url', 'is', null)
    if (data) {
      const avatarMap = {}
      data.forEach(p => { if (p.avatar_url) avatarMap[p.name] = p.avatar_url })
      setPlayerAvatars(avatarMap)
    }
  }

  function subscribeToMessages() {
    const channel = supabase.channel(`messages:${campaignId}`)

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        const msg = payload.new
        addMessage({ role: msg.role, text: msg.content, playerName: msg.player_name })
        if (msg.role === 'dm' && isHost) {
          hostGenerateAndBroadcast(msg.content)
          playMusic(detectMood(msg.content))
        }
        if (msg.role === 'player') loadPlayers()
      }
    )

    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => { setDmBusy(payload.new.dm_busy) }
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
      if (status === 'SUBSCRIBED') await channel.track({ typing: false })
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
      const filtered = players.filter(p => p.toLowerCase().startsWith(search) && p !== player?.name)
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
    if (userMessage) history.push({ role: 'user', content: `${player?.name}: ${userMessage}` })
    if (history.length === 0) {
      const playerList = players.length > 0 ? players.join(', ') : player?.name
      history.push({ role: 'user', content: `Start our adventure. Players: ${playerList}. Host is ${player?.name} the ${player?.class}` })
    }

    const hasMention = userMessage && userMessage.includes('@')

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT +
              `\n\nPlayers in this campaign: ${players.length > 0 ? players.join(', ') : player?.name}. ` +
              `Acting player: ${player?.name} the ${player?.class}, HP: ${gameState.hp}/${gameState.maxHp}, Gold: ${gameState.gold}.` +
              (hasMention ? '\n\nCRITICAL: This message contains an @mention. ONE sentence only. Stop immediately after.' : '')
          },
          ...history
        ],
        max_tokens: 1000
      })
    })
    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'The dungeon stirs...'
  }

  // ─── HANDLE DM RESPONSE ───────────────────────────────────────────────────
  async function processDmResponse(raw) {
    // Parse NPC voice assignment
    const npcVoice = parseNpcVoice(raw)
    if (npcVoice && npcVoice.name && npcVoice.voice) {
      const updated = { ...npcVoicesRef.current, [npcVoice.name]: npcVoice.voice }
      setNpcVoices(updated)
      npcVoicesRef.current = updated
      await saveNpcVoices(updated)
    }

    // Parse state update
    const stateUpdate = parseStateUpdate(raw)
    if (stateUpdate) updateGameState(stateUpdate)

    // Clean text and save
    const clean = cleanText(raw)
    await saveMessage('dm', clean)
  }

  async function startAdventure() {
    if (!player) return
    await setDmBusyState(true)
    setLoading(true)
    let attempts = 0
    while (attempts < 3) {
      try {
        const raw = await callDM(null)
        await processDmResponse(raw)
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
      await processDmResponse(raw)
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

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '10px 16px', background: 'rgba(10,8,18,0.95)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', letterSpacing: '2px' }}>LORECRAFT</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            fontSize: '9px', fontFamily: "'Cinzel', serif", letterSpacing: '1px',
            color: ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : ttsStatus === 'error' ? '#c0392b' : 'var(--text-dim)',
            padding: '3px 8px',
            border: `1px solid ${ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : ttsStatus === 'error' ? '#c0392b' : 'var(--border)'}`,
            borderRadius: '4px'
          }}>
            {ttsStatus === 'playing' ? '🔊 PLAYING' : ttsStatus === 'loading' ? '⏳ LOADING' : ttsStatus === 'error' ? '❌ ERROR' : '💤 IDLE'}
          </div>
          <button onClick={() => {
            const newMuted = !mutedRef.current
            mutedRef.current = newMuted
            setMuted(newMuted)
            if (newMuted && currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null }
          }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '14px' }}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button onClick={() => {
            const newMuted = !musicMutedRef.current
            musicMutedRef.current = newMuted
            setMusicMuted(newMuted)
            if (newMuted && musicRef.current) { musicRef.current.pause() }
            else if (!newMuted && musicRef.current) { musicRef.current.play() }
          }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '14px' }}>
            {musicMuted ? '🔕' : '🎵'}
          </button>
          {roomCode && (
            <button onClick={() => setShowRoomCode(!showRoomCode)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '12px', fontFamily: "'Cinzel', serif", letterSpacing: '1px' }}>
              🔗 {roomCode}
            </button>
          )}
          <button onClick={() => setShowInventory(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '4px 10px', fontSize: '14px' }}>🎒</button>
        </div>
      </div>

      {/* Room Code Banner */}
      {showRoomCode && roomCode && (
        <div style={{ background: 'linear-gradient(135deg, #1e1830, #2a2045)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '4px' }}>INVITE FRIENDS — SHARE THIS CODE</div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '28px', color: 'var(--gold)', letterSpacing: '8px' }}>{roomCode}</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(roomCode); setShowRoomCode(false) }}
            style={{ background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold)', padding: '8px 16px', fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '1px' }}>
            COPY
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ padding: '8px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--text-dim)' }}>{player?.name} · {player?.class}</span>
        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.5s' }}/>
        </div>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--text)' }}>❤️ {gameState.hp}/{gameState.maxHp}</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)' }}>🪙 {gameState.gold}</span>
      </div>

      {/* DM Busy Banner */}
      {dmBusy && !loading && (
        <div style={{ background: 'rgba(201,168,76,0.05)', borderBottom: '1px solid var(--border)', padding: '6px 16px', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', color: 'var(--text-dim)', textAlign: 'center', flexShrink: 0 }}>
          ⚔️ THE DUNGEON MASTER IS RESPONDING...
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'player' ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexDirection: msg.role === 'player' ? 'row-reverse' : 'row' }}>
              {msg.role === 'player' && playerAvatars[msg.playerName || player?.name] && (
                <img src={playerAvatars[msg.playerName || player?.name]} alt={msg.playerName}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>
                {msg.role === 'dm' ? 'DUNGEON MASTER' : (msg.playerName || player?.name)?.toUpperCase()}
              </div>
            </div>
            <div style={{
              maxWidth: '85%', padding: '12px 16px',
              borderRadius: msg.role === 'dm' ? '0 12px 12px 12px' : '12px 0 12px 12px',
              background: msg.role === 'dm' ? 'linear-gradient(135deg, #14102a, #1a1535)' : 'linear-gradient(135deg, #0f1a14, #142010)',
              border: msg.role === 'dm' ? '1px solid var(--border)' : '1px solid rgba(39,174,96,0.2)',
              borderLeft: msg.role === 'dm' ? '2px solid var(--gold)' : undefined,
              borderRight: msg.role === 'player' ? '2px solid var(--green)' : undefined,
              fontSize: '15px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap'
            }}>
              {msg.text.split(/(@\w+)/g).map((part, i) =>
                part.startsWith('@') ? <span key={i} style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{part}</span> : part
              )}
            </div>
          </div>
        ))}

        {typers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>{typers.join(', ').toUpperCase()}</div>
            <div style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #0f1a14, #142010)', border: '1px solid rgba(39,174,96,0.2)', borderRight: '2px solid var(--green)', borderRadius: '12px 0 12px 12px', display: 'flex', gap: '4px', width: 'fit-content', alignSelf: 'flex-end' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', background: 'var(--green)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}/>)}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)' }}>DUNGEON MASTER</div>
            <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #14102a, #1a1535)', border: '1px solid var(--border)', borderLeft: '2px solid var(--gold)', borderRadius: '0 12px 12px 12px', display: 'flex', gap: '4px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', background: 'var(--gold)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}/>)}
            </div>
          </div>
        )}
        <div ref={messagesEndRef}/>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '6px', padding: '0 12px 8px', overflowX: 'auto', flexShrink: 0 }}>
        {['👁 Look Around', '⚔️ Attack', '🌑 Sneak', '🔍 Search', '💬 Talk', '💨 Flee'].map(action => (
          <button key={action} onClick={() => quickAction(action.split(' ').slice(1).join(' '))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '6px 14px', color: dmBusy ? '#3a3050' : 'var(--text-dim)', fontSize: '11px', letterSpacing: '1px', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Cinzel', serif", cursor: dmBusy ? 'not-allowed' : 'pointer' }}>
            {action}
          </button>
        ))}
      </div>

      {/* @ Mention Dropdown */}
      {mentionSearch !== null && filteredPlayers.length > 0 && (
        <div style={{ position: 'absolute', bottom: '80px', left: '12px', background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 0 20px rgba(201,168,76,0.2)' }}>
          {filteredPlayers.map(p => (
            <div key={p} onClick={() => insertMention(p)}
              style={{ padding: '10px 16px', cursor: 'pointer', fontFamily: "'Cinzel', serif", fontSize: '12px', color: 'var(--gold-light)', letterSpacing: '1px', borderBottom: '1px solid var(--border)' }}>
              ⚔️ {p}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 12px 16px', background: 'rgba(10,8,18,0.98)', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0, position: 'relative' }}>
        <textarea ref={inputRef} value={input}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }}}
          placeholder={dmBusy ? 'The DM is responding...' : 'What do you do... (@ to mention a player)'}
          disabled={dmBusy} rows={1}
          style={{ flex: 1, background: 'var(--bg2)', border: `1px solid ${dmBusy ? 'rgba(201,168,76,0.1)' : 'var(--border)'}`, borderRadius: '20px', padding: '10px 16px', color: dmBusy ? 'var(--text-dim)' : 'var(--text)', fontSize: '16px', outline: 'none', resize: 'none', maxHeight: '100px', lineHeight: 1.4, fontFamily: "'EB Garamond', serif", cursor: dmBusy ? 'not-allowed' : 'text' }}
        />
        <button onClick={sendMessage} disabled={dmBusy}
          style={{ width: '42px', height: '42px', background: dmBusy ? 'var(--bg2)' : 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: `1px solid ${dmBusy ? 'var(--border)' : 'var(--gold)'}`, borderRadius: '50%', color: dmBusy ? 'var(--text-dim)' : 'var(--gold)', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: dmBusy ? 'none' : '0 0 15px rgba(201,168,76,0.15)', cursor: dmBusy ? 'not-allowed' : 'pointer' }}>➤</button>
      </div>

      {/* Inventory Modal */}
      {showInventory && (
        <div onClick={() => setShowInventory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '20px 24px 40px' }}>
            <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 20px' }}/>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '16px' }}>⚔ Inventory</div>
            {gameState.inventory.map((item, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(201,168,76,0.1)', fontSize: '15px', color: 'var(--text)' }}>{item}</div>
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