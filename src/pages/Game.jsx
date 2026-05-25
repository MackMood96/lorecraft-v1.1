import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

// ─── VOICE POOLS ────────────────────────────────────────────────────────────
const MALE_VOICES = ['Fenrir', 'Orus', 'Achird']
const FEMALE_VOICES = ['Kore', 'Aoede', 'Leda']
const NARRATOR_VOICE = 'Charon'

// ─── ITEM CATEGORIES ─────────────────────────────────────────────────────────
const ITEM_TYPES = { weapon: '⚔️', armor: '🛡️', consumable: '🧪', quest: '📜', accessory: '💍', misc: '📦' }

// ─── RARITY CONFIG ───────────────────────────────────────────────────────────
const RARITIES = {
  cursed:    { label: 'Cursed',    color: '#8b0000', bg: 'rgba(139,0,0,0.15)',     chance: 0.10 },
  common:    { label: 'Common',    color: '#9e9e9e', bg: 'rgba(158,158,158,0.1)',  chance: 0.40 },
  uncommon:  { label: 'Uncommon',  color: '#4caf50', bg: 'rgba(76,175,80,0.1)',    chance: 0.25 },
  rare:      { label: 'Rare',      color: '#2196f3', bg: 'rgba(33,150,243,0.1)',   chance: 0.15 },
  epic:      { label: 'Epic',      color: '#9c27b0', bg: 'rgba(156,39,176,0.1)',   chance: 0.08 },
  legendary: { label: 'Legendary', color: '#ffd700', bg: 'rgba(255,215,0,0.1)',    chance: 0.02 },
}

function rollRarity() {
  const r = Math.random()
  let cum = 0
  for (const [key, val] of Object.entries(RARITIES)) {
    cum += val.chance
    if (r <= cum) return key
  }
  return 'common'
}

// ─── GROQ CALL ───────────────────────────────────────────────────────────────
async function callGroq(system, user, maxTokens = 300) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.8
    })
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ─── SCENE PROMPT VIA GROQ ────────────────────────────────────────────────────
async function generateScenePrompt(dmText) {
  const prompt = await callGroq(
    `You generate image prompts for a 2D pixel art dark fantasy RPG game.
Given a dungeon master narrative, return ONLY a short image prompt.
Always include: "2D pixel art, 16-bit SNES RPG style, dark fantasy, no characters, no text, dramatic lighting"
Describe only the environment/location. Be specific and vivid. Max 30 words total.`,
    dmText,
    80
  )
  return prompt || '2D pixel art, 16-bit SNES RPG style, dark fantasy dungeon, no characters, dramatic lighting'
}

// ─── NPC PORTRAIT PROMPT VIA GROQ ─────────────────────────────────────────────
async function generateNpcPortraitPrompt(npc) {
  const prompt = await callGroq(
    `You generate character portrait prompts for a 2D pixel art dark fantasy RPG game.
Return ONLY a short image prompt. Max 30 words.
Always include: "2D pixel art, 16-bit RPG character portrait, dark fantasy, face and upper body"`,
    `NPC: ${npc.name}, ${npc.race} ${npc.role}. ${npc.description || ''}`,
    80
  )
  return prompt || `2D pixel art, 16-bit RPG character portrait, ${npc.race} ${npc.role}, dark fantasy, face and upper body`
}

// ─── VAULT ITEM/ABILITY VIA GROQ ──────────────────────────────────────────────
async function generateVaultRoll(playerClass, playerRace, rarity, type) {
  const raw = await callGroq(
    `You generate unique fantasy RPG ${type}s for a dark fantasy game.
Return ONLY valid JSON with no markdown, no backticks. Format:
{"name":"string","description":"string","effect":"string","flavor_text":"string","rarity":"${rarity}","type":"${type}"}
For cursed items: dark humor, negative twist. For legendary: mythic, awe-inspiring. Be creative and unexpected.`,
    `Generate a ${rarity} ${type} for a ${playerRace} ${playerClass}.`,
    200
  )
  try {
    return JSON.parse(raw)
  } catch {
    return { name: 'Mystery Shard', description: 'Its purpose is unclear.', effect: 'Unknown', flavor_text: 'Some things defy explanation.', rarity, type }
  }
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
- @MENTION RULE — CRITICAL: If a message contains @PlayerName, respond with ONLY one narrative sentence. Then STOP.
- You control ONLY the world, environment, and NPCs. Never put words in a player's mouth.
- React to EVERYTHING the player does.
- When combat occurs, roll dice explicitly: "Rolling d20... [result]!" and describe outcomes dramatically.
- Only ONE NPC may speak per response.
- End with suggested actions in *italics* ONLY for complex responses.
- Track player HP. If they take damage, tell them.

CLASS RESTRICTIONS — CRITICAL. Enforce strictly, never bend these rules:
- Warrior: Can use swords, axes, maces, spears, shields, bows. Can wear light/medium/heavy armor. CANNOT cast spells. CANNOT use wands or staves.
- Rogue: Can use daggers, shortbows, shortswords. Light armor only. CANNOT use heavy weapons or heavy armor. Limited magic use.
- Mage: Can use staves, wands, orbs. Robes only. CANNOT wear heavy armor. CANNOT use swords, axes or physical weapons. Magic is their primary tool.
- Ranger: Can use bows, daggers, shortswords. Light/medium armor. CANNOT use heavy armor. Limited spell use via nature magic only.
If a player attempts an action outside their class restrictions, the DM must refuse it narratively and suggest a class-appropriate alternative.

ATTRIBUTE SYSTEM — Use these to determine action outcomes:
- STR: Melee attacks, breaking things, intimidation
- DEX: Stealth, ranged attacks, dodging, lockpicking
- INT: Spells, knowledge, puzzles, arcane detection
- VIT: Endurance, resisting poison/disease, stamina
- CHA: Persuasion, deception, NPC reactions, trading
- LCK: Critical hits, finding items, random events

INVENTORY RULES:
- Players can only use items they actually have in their inventory
- When a player picks up, buys or receives an item include: <inventory_add>{"player":"Name","item":"item name","icon":"emoji"}</inventory_add>
- When a player uses, drops or loses an item include: <inventory_remove>{"player":"Name","item":"item name"}</inventory_remove>
- When a player trades with another player include both tags
- Players can grant rolls at the Vault of Fates as quest rewards: <grant_roll>{"player":"Name"}</grant_roll>

DIALOGUE FORMATTING — CRITICAL:
- NPC dialogue MUST always be on its own separate paragraph, never mixed with narration.
- NEVER put narration and NPC dialogue on the same paragraph.

NPC DATA — CRITICAL:
- The FIRST time an NPC appears, include a data tag at the END of your response.
- Format: <npc_data>{"name":"NpcName","gender":"male|female","voice":"VoiceName","race":"Race","role":"Role","description":"physical appearance and personality in one sentence"}</npc_data>
- Male NPC voices: Fenrir (warrior/villain), Orus (merchant/elder), Achird (mysterious/mage)
- Female NPC voices: Kore (mysterious/mage), Aoede (noble/elf), Leda (warrior/ranger)
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
  if (lower.includes('attack') || lower.includes('combat') || lower.includes('fight') || lower.includes('battle') || lower.includes('enemy') || lower.includes('blood') || lower.includes('roll') || lower.includes('damage')) return 'combat'
  if (lower.includes('tavern') || lower.includes('inn') || lower.includes('bar') || lower.includes('drink') || lower.includes('ale') || lower.includes('bard')) return 'tavern'
  if (lower.includes('dungeon') || lower.includes('cave') || lower.includes('dark') || lower.includes('shadow') || lower.includes('undead') || lower.includes('crypt')) return 'dungeon'
  if (lower.includes('mysterious') || lower.includes('strange') || lower.includes('puzzle') || lower.includes('secret') || lower.includes('hidden')) return 'mystery'
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

// ─── PARSE HELPERS ───────────────────────────────────────────────────────────
function parseNpcData(text) {
  const match = text.match(/<npc_data>([\s\S]*?)<\/npc_data>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function parseStateUpdate(text) {
  const match = text.match(/<state_update>([\s\S]*?)<\/state_update>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function parseInventoryAdd(text) {
  const matches = [...text.matchAll(/<inventory_add>([\s\S]*?)<\/inventory_add>/g)]
  return matches.map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
}

function parseInventoryRemove(text) {
  const matches = [...text.matchAll(/<inventory_remove>([\s\S]*?)<\/inventory_remove>/g)]
  return matches.map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
}

function parseGrantRoll(text) {
  const match = text.match(/<grant_roll>([\s\S]*?)<\/grant_roll>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function cleanText(text) {
  return text
    .replace(/<state_update>[\s\S]*?<\/state_update>/g, '')
    .replace(/<npc_data>[\s\S]*?<\/npc_data>/g, '')
    .replace(/<inventory_add>[\s\S]*?<\/inventory_add>/g, '')
    .replace(/<inventory_remove>[\s\S]*?<\/inventory_remove>/g, '')
    .replace(/<grant_roll>[\s\S]*?<\/grant_roll>/g, '')
    .trim()
}

function detectNpcInParagraph(paragraph, npcData) {
  for (const [name, data] of Object.entries(npcData)) {
    if (paragraph.trim().startsWith(`${name}:`)) {
      return { npcName: name, npcVoice: data.voice || data }
    }
  }
  return null
}

async function generateAllTTS(chunks, npcData) {
  return Promise.all(chunks.map(chunk => generateParagraphTTS(chunk, npcData)))
}

async function generateParagraphTTS(paragraph, npcData) {
  const npc = detectNpcInParagraph(paragraph, npcData)
  let body
  if (npc) {
    body = {
      contents: [{ parts: [{ text: paragraph.replace(`${npc.npcName}:`, '').trim() }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: npc.npcVoice } } } }
    }
  } else {
    body = {
      contents: [{ parts: [{ text: `Read this like David Attenborough narrating a dark fantasy world — measured, authoritative, with quiet wonder and gravitas. British accent: ${paragraph}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATOR_VOICE } } } }
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
  return npcs.map(n => `- ${n.name} (${n.race || 'Unknown'}, ${n.role || 'Unknown'}, voice: ${n.voice}): ${n.description || 'No description.'}`).join('\n')
}

function buildSceneUrl(prompt, seed) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=400&nologo=true&seed=${seed}&model=flux`
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Game() {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const roomCode = searchParams.get('room')
  const isHost = searchParams.get('host') === 'true'
  const { player, gameState, updateGameState, messages, addMessage, setMessages } = useGame()

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  // ─── SCENE STATE ──────────────────────────────────────────────────────────
  const [sceneUrl, setSceneUrl] = useState('')
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneLabel, setSceneLabel] = useState('Adventure Begins')
  const [sceneVisible, setSceneVisible] = useState(true)
  const sceneSeedRef = useRef(Math.floor(Math.random() * 99999))

  // ─── INVENTORY STATE ──────────────────────────────────────────────────────
  const [showInventory, setShowInventory] = useState(false)
  const [inventoryTab, setInventoryTab] = useState('items') // 'items' | 'equipment' | 'abilities'
  const [vaultRolling, setVaultRolling] = useState(false)
  const [vaultResult, setVaultResult] = useState(null)
  const [vaultRollsAvailable, setVaultRollsAvailable] = useState(1)

  // ─── GAME STATE ───────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
  const prevMessageCount = useRef(0)
  const mutedRef = useRef(false)
  const currentAudioRef = useRef(null)
  const musicRef = useRef(null)
  const currentMoodRef = useRef(null)
  const musicMutedRef = useRef(false)
  const npcDataRef = useRef({})
  const audioChannelRef = useRef(null)
  const sceneChannelRef = useRef(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { musicMutedRef.current = musicMuted }, [musicMuted])
  useEffect(() => { npcDataRef.current = npcData }, [npcData])

  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCount.current = messages.length
  }, [messages])

  // ─── SCENE ────────────────────────────────────────────────────────────────
  const loadSceneFromPrompt = useCallback((prompt, label) => {
    setSceneLoading(true)
    setSceneLabel(label || 'Scene')
    setSceneUrl(buildSceneUrl(prompt, sceneSeedRef.current))
  }, [])

  const regenerateScene = () => {
    sceneSeedRef.current = Math.floor(Math.random() * 99999)
    if (sceneUrl) {
      const url = new URL(sceneUrl)
      url.searchParams.set('seed', sceneSeedRef.current)
      setSceneLoading(true)
      setSceneUrl(url.toString())
    }
  }

  // ─── HOST: Generate scene from DM text via Groq ───────────────────────────
  const hostGenerateAndBroadcastScene = useCallback(async (dmText) => {
    try {
      const scenePrompt = await generateScenePrompt(dmText)
      const seed = sceneSeedRef.current
      const url = buildSceneUrl(scenePrompt, seed)
      // Broadcast scene URL to all players
      sceneChannelRef.current?.send({
        type: 'broadcast', event: 'scene_update',
        payload: { url, label: scenePrompt.slice(0, 40) + '...', seed }
      })
      setSceneLoading(true)
      setSceneLabel(scenePrompt.slice(0, 40) + '...')
      setSceneUrl(url)
    } catch (e) {
      console.log('Scene generation error:', e)
    }
  }, [])

  // ─── HOST: Generate NPC portrait via Groq ─────────────────────────────────
  const hostGenerateNpcPortrait = useCallback(async (npc) => {
    try {
      const portraitPrompt = await generateNpcPortraitPrompt(npc)
      const seed = Math.abs(npc.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 997) % 99999
      const portraitUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(portraitPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`
      // Broadcast NPC portrait to all players
      sceneChannelRef.current?.send({
        type: 'broadcast', event: 'npc_portrait',
        payload: { url: portraitUrl, label: npc.name, seed }
      })
      setSceneLoading(true)
      setSceneLabel(npc.name)
      setSceneUrl(portraitUrl)
      return { portraitUrl, seed }
    } catch (e) {
      console.log('NPC portrait error:', e)
      return {}
    }
  }, [])

  // ─── SCENE + AUDIO REALTIME CHANNELS ─────────────────────────────────────
  function subscribeToSceneAndAudio() {
    // Scene channel
    const sceneChannel = supabase.channel(`scene:${campaignId}`, { config: { broadcast: { self: false } } })
    if (!isHost) {
      sceneChannel.on('broadcast', { event: 'scene_update' }, ({ payload }) => {
        setSceneLoading(true)
        setSceneLabel(payload.label || 'Scene')
        setSceneUrl(payload.url)
        sceneSeedRef.current = payload.seed
      })
      sceneChannel.on('broadcast', { event: 'npc_portrait' }, ({ payload }) => {
        setSceneLoading(true)
        setSceneLabel(payload.label)
        setSceneUrl(payload.url)
      })
    }
    sceneChannel.subscribe()
    sceneChannelRef.current = sceneChannel

    // Audio channel
    const audioChannel = supabase.channel(`audio:${campaignId}`, { config: { broadcast: { self: false } } })
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
        } catch (e) { console.log('Audio error:', e) }
        isPlaying = false
        if (audioQueue.length > 0) playNext(); else setTtsStatus('idle')
      }
      audioChannel.on('broadcast', { event: 'audio_chunk' }, ({ payload }) => { if (mutedRef.current) return; audioQueue.push(payload.base64Pcm); playNext() })
      audioChannel.on('broadcast', { event: 'audio_start' }, () => setTtsStatus('loading'))
      audioChannel.on('broadcast', { event: 'audio_end' }, () => { if (audioQueue.length === 0) setTtsStatus('idle') })
    }
    audioChannel.subscribe()
    audioChannelRef.current = audioChannel

    return () => { supabase.removeChannel(sceneChannel); supabase.removeChannel(audioChannel) }
  }

  async function hostGenerateAndBroadcastAudio(text) {
    if (mutedRef.current) return
    const clean = text.replace(/<[^>]+>/g, '').trim()
    if (!clean) return
    const paragraphs = clean.split(/\n+/).filter(p => p.trim().length > 0)
    const chunks = paragraphs.length > 0 ? paragraphs : [clean]
    audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_start', payload: {} })
    setTtsStatus('loading')
    try {
      const allBase64 = await generateAllTTS(chunks, npcDataRef.current)
      for (let i = 0; i < allBase64.length; i++) {
        if (mutedRef.current) break
        const base64Pcm = allBase64[i]
        audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_chunk', payload: { base64Pcm } })
        const audio = playBase64Audio(base64Pcm, currentAudioRef)
        setTtsStatus('playing')
        await new Promise((resolve, reject) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', reject); audio.play() })
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

  // ─── INIT ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId) return
    loadMessages()
    loadNpcData()
    const cleanupChannels = subscribeToSceneAndAudio()
    subscribeToMessages()
    subscribeToPresence()
    loadPlayers()
    loadPlayerAvatars()
    checkDmBusy()
    // Load initial scene
    hostGenerateAndBroadcastScene('A fantasy adventure begins, misty landscape, ancient world')
    const poll = setInterval(() => { loadMessages(); checkDmBusy() }, 3000)
    return () => { cleanupChannels(); clearInterval(poll); if (musicRef.current) { musicRef.current.pause(); musicRef.current = null } }
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
          hostGenerateAndBroadcastAudio(lastMsg.text)
          playMusic(detectMood(lastMsg.text))
          hostGenerateAndBroadcastScene(lastMsg.text)
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
        hostGenerateAndBroadcastAudio(msg.content)
        playMusic(detectMood(msg.content))
        hostGenerateAndBroadcastScene(msg.content)
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

  function insertMention(pName) {
    const atIndex = input.lastIndexOf('@')
    setInput(input.slice(0, atIndex) + `@${pName} `)
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
    const attrs = player?.attributes || {}
    const equipment = player?.equipment || {}
    const abilities = player?.abilities || []

    const systemContent = SYSTEM_PROMPT.replace('{{NPC_ROSTER}}', npcRoster) +
      `\n\nPlayers in this campaign: ${players.length > 0 ? players.join(', ') : player?.name}.` +
      `\nActing player: ${player?.name} the ${player?.race || ''} ${player?.class}.` +
      `\nHP: ${gameState.hp}/${gameState.maxHp}. Gold: ${gameState.gold}.` +
      `\nAttributes: STR ${attrs.str || 0}, DEX ${attrs.dex || 0}, INT ${attrs.int || 0}, VIT ${attrs.vit || 0}, CHA ${attrs.cha || 0}, LCK ${attrs.lck || 0}.` +
      `\nEquipped: ${Object.entries(equipment).filter(([, v]) => v).map(([k, v]) => `${k}: ${v.name}`).join(', ') || 'Nothing'}.` +
      `\nInventory: ${gameState.inventory?.join(', ') || 'Empty'}.` +
      `\nAbilities: ${abilities.map(a => a.name).join(', ') || 'None'}.` +
      (hasMention ? '\n\nCRITICAL: This message contains an @mention. ONE sentence only. Stop immediately after.' : '')

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemContent }, ...history], max_tokens: 1000 })
    })
    const data = await response.json()
    if (!data.choices?.[0]?.message?.content) throw new Error('No response from DM')
    return data.choices[0].message.content
  }

  async function processDmResponse(raw) {
    // NPC data — generate portrait, save with locked seed
    const npc = parseNpcData(raw)
    if (npc && npc.name && npc.voice) {
      const { portraitUrl, seed } = await hostGenerateNpcPortrait(npc)
      const updated = { ...npcDataRef.current, [npc.name]: { ...npc, seed, portrait_url: portraitUrl } }
      setNpcData(updated); npcDataRef.current = updated
      await saveNpcData(updated)
    }

    // State update
    const stateUpdate = parseStateUpdate(raw)
    if (stateUpdate) updateGameState(stateUpdate)

    // Inventory adds
    const adds = parseInventoryAdd(raw)
    adds.forEach(add => {
      if (add.player === player?.name) {
        updateGameState({ inventory: [...(gameState.inventory || []), `${add.icon || '📦'} ${add.item}`] })
      }
    })

    // Inventory removes
    const removes = parseInventoryRemove(raw)
    removes.forEach(remove => {
      if (remove.player === player?.name) {
        updateGameState({ inventory: (gameState.inventory || []).filter(i => !i.includes(remove.item)) })
      }
    })

    // Grant vault roll
    const grantRoll = parseGrantRoll(raw)
    if (grantRoll?.player === player?.name) {
      setVaultRollsAvailable(v => v + 1)
    }

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
        console.log('DM error:', e); attempts++
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
    try {
      const raw = await callDM(userMsg)
      await processDmResponse(raw)
    } catch (e) {
      console.log('Send message error:', e)
      await saveMessage('dm', 'The dungeon stirs... something went wrong. Try again.')
    }
    await setDmBusyState(false); setLoading(false)
  }

  function quickAction(text) { setInput(text); setTimeout(() => sendMessage(), 100) }

  // ─── VAULT OF FATES ───────────────────────────────────────────────────────
  async function rollVault(type) {
    if (vaultRolling || vaultRollsAvailable <= 0) return
    if (type === 'item' && gameState.gold < 50 && vaultRollsAvailable <= 0) return
    setVaultRolling(true)
    setVaultResult(null)

    const rarity = rollRarity()
    const result = await generateVaultRoll(player?.class || 'Warrior', player?.race || 'Human', rarity, type)

    setVaultResult(result)
    setVaultRolling(false)

    if (vaultRollsAvailable > 0) {
      setVaultRollsAvailable(v => v - 1)
    } else {
      updateGameState({ gold: (gameState.gold || 0) - 50 })
    }
  }

  async function claimVaultResult() {
    if (!vaultResult) return
    if (vaultResult.type === 'item') {
      const icon = RARITIES[vaultResult.rarity]?.label === 'Cursed' ? '💀' : '✨'
      updateGameState({ inventory: [...(gameState.inventory || []), `${icon} ${vaultResult.name}`] })
    } else {
      const abilities = player?.abilities || []
      await supabase.from('players').update({ abilities: [...abilities, vaultResult] }).eq('id', player?.id)
    }
    setVaultResult(null)
  }

  const hpPct = Math.max(0, (gameState.hp / gameState.maxHp) * 100)
  const hpColor = hpPct > 50 ? '#27ae60' : hpPct > 25 ? '#f39c12' : '#c0392b'
  const scenePct = isMobile ? 32 : 38

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '7px 12px', background: 'rgba(10,8,18,0.98)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 10 }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: isMobile ? '12px' : '14px', color: 'var(--gold)', letterSpacing: '2px' }}>⚔ LORECRAFT</div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '1px', padding: '2px 6px', color: ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : ttsStatus === 'error' ? '#c0392b' : 'var(--text-dim)', border: `1px solid ${ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : ttsStatus === 'error' ? '#c0392b' : 'var(--border)'}`, borderRadius: '4px' }}>
            {ttsStatus === 'playing' ? '🔊' : ttsStatus === 'loading' ? '⏳' : ttsStatus === 'error' ? '❌' : '💤'}
          </div>
          <button onClick={() => setSceneVisible(v => !v)} style={{ background: sceneVisible ? 'rgba(201,168,76,0.15)' : 'none', border: `1px solid ${sceneVisible ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: sceneVisible ? 'var(--gold)' : 'var(--text-dim)', padding: '2px 7px', fontSize: '12px', cursor: 'pointer' }}>🖼</button>
          <button onClick={() => { const n = !mutedRef.current; mutedRef.current = n; setMuted(n); if (n && currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null } }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '2px 7px', fontSize: '12px', cursor: 'pointer' }}>{muted ? '🔇' : '🔊'}</button>
          <button onClick={() => { const n = !musicMutedRef.current; musicMutedRef.current = n; setMusicMuted(n); if (n && musicRef.current) musicRef.current.pause(); else if (!n && musicRef.current) musicRef.current.play() }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '2px 7px', fontSize: '12px', cursor: 'pointer' }}>{musicMuted ? '🔕' : '🎵'}</button>
          {roomCode && <button onClick={() => setShowRoomCode(!showRoomCode)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '2px 7px', fontSize: '10px', fontFamily: "'Cinzel', serif", cursor: 'pointer' }}>🔗{!isMobile && ` ${roomCode}`}</button>}
          <button onClick={() => setShowInventory(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '2px 7px', fontSize: '12px', cursor: 'pointer' }}>🎒</button>
        </div>
      </div>

      {/* ── ROOM CODE BANNER ── */}
      {showRoomCode && roomCode && (
        <div style={{ background: 'linear-gradient(135deg, #1e1830, #2a2045)', borderBottom: '1px solid var(--border)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '2px' }}>INVITE FRIENDS</div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '22px', color: 'var(--gold)', letterSpacing: '6px' }}>{roomCode}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => navigator.clipboard.writeText(roomCode)} style={{ background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold)', padding: '5px 12px', fontFamily: "'Cinzel', serif", fontSize: '9px', cursor: 'pointer' }}>COPY</button>
            <button onClick={() => setShowRoomCode(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', padding: '5px 9px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}

      {/* ── SCENE PANEL ── */}
      {sceneVisible && (
        <div style={{ height: `${scenePct}%`, flexShrink: 0, position: 'relative', borderBottom: '1px solid var(--border)', background: '#050304', overflow: 'hidden' }}>
          {sceneLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#050304', zIndex: 2 }}>
              <div style={{ fontSize: '20px', animation: 'spin 3s linear infinite' }}>⚔</div>
              <div style={{ fontSize: '7px', color: '#4a3a2a', letterSpacing: '3px' }}>SUMMONING VISION...</div>
            </div>
          )}
          {sceneUrl && (
            <img src={sceneUrl} alt={sceneLabel}
              onLoad={() => setSceneLoading(false)}
              onError={() => setSceneLoading(false)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: sceneLoading ? 0 : 1, transition: 'opacity 0.8s', background: '#050304' }}
            />
          )}
          {!sceneLoading && sceneUrl && (
            <>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '14px 10px 5px' }}>
                <div style={{ fontSize: '8px', color: '#c9a84c88', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sceneLabel}</div>
              </div>
              <button onClick={regenerateScene} style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', border: '1px solid #c9a84c33', borderRadius: '4px', color: '#c9a84c88', fontSize: '8px', padding: '2px 7px', cursor: 'pointer' }}>↻</button>
            </>
          )}
        </div>
      )}

      {/* ── STATS BAR ── */}
      <div style={{ padding: '4px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{player?.name} · {player?.class}</span>
        <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text)', whiteSpace: 'nowrap' }}>❤️ {gameState.hp}/{gameState.maxHp}</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--gold)', whiteSpace: 'nowrap' }}>🪙 {gameState.gold}</span>
      </div>

      {dmBusy && !loading && (
        <div style={{ background: 'rgba(201,168,76,0.05)', borderBottom: '1px solid var(--border)', padding: '2px 12px', fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '2px', color: 'var(--text-dim)', textAlign: 'center', flexShrink: 0 }}>
          ⚔️ THE DUNGEON MASTER IS RESPONDING...
        </div>
      )}

      {/* ── MESSAGES ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: msg.role === 'player' ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexDirection: msg.role === 'player' ? 'row-reverse' : 'row' }}>
              {msg.role === 'player' && playerAvatars[msg.playerName || player?.name] && (
                <img src={playerAvatars[msg.playerName || player?.name]} alt={msg.playerName} style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '7px', letterSpacing: '2px', color: 'var(--text-dim)' }}>
                {msg.role === 'dm' ? 'DUNGEON MASTER' : (msg.playerName || player?.name)?.toUpperCase()}
              </div>
            </div>
            <div style={{ maxWidth: '88%', padding: '9px 13px', borderRadius: msg.role === 'dm' ? '0 10px 10px 10px' : '10px 0 10px 10px', background: msg.role === 'dm' ? 'linear-gradient(135deg, #14102a, #1a1535)' : 'linear-gradient(135deg, #0f1a14, #142010)', border: msg.role === 'dm' ? '1px solid var(--border)' : '1px solid rgba(39,174,96,0.2)', borderLeft: msg.role === 'dm' ? '2px solid var(--gold)' : undefined, borderRight: msg.role === 'player' ? '2px solid var(--green)' : undefined, fontSize: '14px', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {msg.text.split(/(@\w+)/g).map((part, j) =>
                part.startsWith('@') ? <span key={j} style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{part}</span> : part
              )}
            </div>
          </div>
        ))}

        {typers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '7px', letterSpacing: '2px', color: 'var(--text-dim)' }}>{typers.join(', ').toUpperCase()}</div>
            <div style={{ padding: '7px 11px', background: 'linear-gradient(135deg, #0f1a14, #142010)', border: '1px solid rgba(39,174,96,0.2)', borderRight: '2px solid var(--green)', borderRadius: '10px 0 10px 10px', display: 'flex', gap: '4px', width: 'fit-content', alignSelf: 'flex-end' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--green)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '7px', letterSpacing: '2px', color: 'var(--text-dim)' }}>DUNGEON MASTER</div>
            <div style={{ padding: '10px 13px', background: 'linear-gradient(135deg, #14102a, #1a1535)', border: '1px solid var(--border)', borderLeft: '2px solid var(--gold)', borderRadius: '0 10px 10px 10px', display: 'flex', gap: '4px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', background: 'var(--gold)', borderRadius: '50%', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ display: 'flex', gap: '4px', padding: '3px 10px', overflowX: 'auto', flexShrink: 0, background: 'var(--bg)' }}>
        {['👁 Look', '⚔️ Attack', '🌑 Sneak', '🔍 Search', '💬 Talk', '💨 Flee'].map(action => (
          <button key={action} onClick={() => quickAction(action.split(' ').slice(1).join(' '))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '3px 10px', color: dmBusy ? '#3a3050' : 'var(--text-dim)', fontSize: '9px', letterSpacing: '1px', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Cinzel', serif", cursor: dmBusy ? 'not-allowed' : 'pointer' }}>
            {action}
          </button>
        ))}
      </div>

      {/* ── @ MENTION DROPDOWN ── */}
      {mentionSearch !== null && filteredPlayers.length > 0 && (
        <div style={{ position: 'absolute', bottom: '65px', left: '10px', background: 'var(--bg3)', border: '1px solid var(--gold)', borderRadius: '8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 0 20px rgba(201,168,76,0.2)' }}>
          {filteredPlayers.map(p => (
            <div key={p} onClick={() => insertMention(p)} style={{ padding: '7px 12px', cursor: 'pointer', fontFamily: "'Cinzel', serif", fontSize: '10px', color: 'var(--gold-light)', letterSpacing: '1px', borderBottom: '1px solid var(--border)' }}>⚔️ {p}</div>
          ))}
        </div>
      )}

      {/* ── INPUT ── */}
      <div style={{ padding: '5px 10px 8px', background: 'rgba(10,8,18,0.98)', borderTop: '1px solid var(--border)', display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0, position: 'relative' }}>
        <textarea ref={inputRef} value={input}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder={dmBusy ? 'The DM is responding...' : 'What do you do...'}
          disabled={dmBusy} rows={1}
          style={{ flex: 1, background: 'var(--bg2)', border: `1px solid ${dmBusy ? 'rgba(201,168,76,0.1)' : 'var(--border)'}`, borderRadius: '16px', padding: '7px 13px', color: dmBusy ? 'var(--text-dim)' : 'var(--text)', fontSize: '14px', outline: 'none', resize: 'none', maxHeight: '70px', lineHeight: 1.4, fontFamily: "'EB Garamond', serif", cursor: dmBusy ? 'not-allowed' : 'text' }}
        />
        <button onClick={sendMessage} disabled={dmBusy}
          style={{ width: '34px', height: '34px', background: dmBusy ? 'var(--bg2)' : 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: `1px solid ${dmBusy ? 'var(--border)' : 'var(--gold)'}`, borderRadius: '50%', color: dmBusy ? 'var(--text-dim)' : 'var(--gold)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: dmBusy ? 'none' : '0 0 12px rgba(201,168,76,0.15)', cursor: dmBusy ? 'not-allowed' : 'pointer', flexShrink: 0 }}>➤</button>
      </div>

      {/* ── INVENTORY MODAL ── */}
      {showInventory && (
        <div onClick={() => setShowInventory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : '420px', maxHeight: isMobile ? '85vh' : '80vh', background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ width: '36px', height: '3px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 14px' }} />
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '15px', color: 'var(--gold)', marginBottom: '12px' }}>⚔ Character</div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {[['items', '🎒 Items'], ['equipment', '🛡️ Equipment'], ['abilities', '✨ Abilities'], ['vault', '🎲 Vault']].map(([tab, label]) => (
                  <button key={tab} onClick={() => setInventoryTab(tab)} style={{ flex: 1, padding: '5px 0', fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '1px', background: inventoryTab === tab ? 'rgba(201,168,76,0.15)' : 'transparent', border: `1px solid ${inventoryTab === tab ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: inventoryTab === tab ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

              {/* ITEMS TAB */}
              {inventoryTab === 'items' && (
                <div>
                  {(gameState.inventory || []).length === 0
                    ? <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center', fontStyle: 'italic' }}>Your pack is empty</div>
                    : (gameState.inventory || []).map((item, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(201,168,76,0.08)', fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{item}</span>
                        </div>
                      ))
                  }
                  <div style={{ padding: '10px 0', fontSize: '13px', color: 'var(--gold)', borderTop: '1px solid rgba(201,168,76,0.15)', marginTop: '6px' }}>🪙 {gameState.gold} Gold</div>
                </div>
              )}

              {/* EQUIPMENT TAB */}
              {inventoryTab === 'equipment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[['mainHand', '🗡️ Main Hand'], ['offHand', '🛡️ Off Hand'], ['armor', '🧥 Armor'], ['accessory', '💍 Accessory']].map(([slot, label]) => {
                    const item = player?.equipment?.[slot]
                    return (
                      <div key={slot} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '3px' }}>{label}</div>
                          <div style={{ fontSize: '13px', color: item ? 'var(--text)' : '#3a3050' }}>{item ? `${item.icon || ''} ${item.name}` : 'Empty'}</div>
                        </div>
                        {item && (
                          <div style={{ fontSize: '9px', color: 'var(--gold)', textAlign: 'right' }}>
                            {Object.entries(item.stats || {}).map(([k, v]) => <div key={k}>+{v} {k.toUpperCase()}</div>)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {/* Attributes */}
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginTop: '4px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '8px' }}>ATTRIBUTES</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      {[['str','💪','#c0392b'],['dex','🏃','#27ae60'],['int','🔮','#2980b9'],['vit','❤️','#e74c3c'],['cha','💬','#f39c12'],['lck','🍀','#1abc9c']].map(([k, icon, color]) => (
                        <div key={k} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: '6px', padding: '5px' }}>
                          <div style={{ fontSize: '12px' }}>{icon}</div>
                          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '7px', color: 'var(--text-dim)' }}>{k.toUpperCase()}</div>
                          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color }}>{player?.attributes?.[k] || 0}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ABILITIES TAB */}
              {inventoryTab === 'abilities' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(player?.abilities || []).length === 0
                    ? <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center', fontStyle: 'italic' }}>No abilities yet — visit the Vault of Fates</div>
                    : (player?.abilities || []).map((ability, i) => {
                        const rar = RARITIES[ability.rarity] || RARITIES.common
                        return (
                          <div key={i} style={{ background: rar.bg, border: `1px solid ${rar.color}44`, borderLeft: `3px solid ${rar.color}`, borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: rar.color }}>{ability.name}</div>
                              <div style={{ fontSize: '8px', color: rar.color, letterSpacing: '1px' }}>{rar.label.toUpperCase()}</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '3px' }}>{ability.effect}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>{ability.flavor_text}</div>
                          </div>
                        )
                      })
                  }
                </div>
              )}

              {/* VAULT TAB */}
              {inventoryTab === 'vault' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '4px' }}>Vault of Fates</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      The mystical vault holds items and abilities of unknown power. From useless trinkets to legendary artifacts — fate decides.
                    </div>
                  </div>

                  {/* Roll buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[['item', '📦 Roll Item'], ['ability', '✨ Roll Ability']].map(([type, label]) => (
                      <button key={type} onClick={() => rollVault(type)} disabled={vaultRolling || (vaultRollsAvailable <= 0 && gameState.gold < 50)}
                        style={{ padding: '12px', background: 'linear-gradient(135deg, #1a1030, #251545)', border: '1px solid var(--gold)', borderRadius: '8px', color: 'var(--gold)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '1px', cursor: vaultRolling ? 'wait' : 'pointer', opacity: vaultRolling ? 0.7 : 1 }}>
                        {vaultRolling ? '🎲 Rolling...' : label}
                      </button>
                    ))}
                  </div>

                  <div style={{ textAlign: 'center', fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)' }}>
                    {vaultRollsAvailable > 0 ? `${vaultRollsAvailable} free roll${vaultRollsAvailable !== 1 ? 's' : ''} available` : '50 🪙 per roll'}
                  </div>

                  {/* Rarity odds */}
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: '8px' }}>RARITY ODDS</div>
                    {Object.entries(RARITIES).map(([key, rar]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: rar.color }}>{rar.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{(rar.chance * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Vault result */}
                  {vaultResult && (
                    <div style={{ background: RARITIES[vaultResult.rarity]?.bg || 'var(--bg2)', border: `2px solid ${RARITIES[vaultResult.rarity]?.color || 'var(--gold)'}`, borderRadius: '10px', padding: '14px', animation: 'fadeIn 0.5s ease' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '13px', color: RARITIES[vaultResult.rarity]?.color }}>{vaultResult.name}</div>
                        <div style={{ fontSize: '8px', letterSpacing: '1px', color: RARITIES[vaultResult.rarity]?.color }}>{RARITIES[vaultResult.rarity]?.label?.toUpperCase()}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '4px' }}>{vaultResult.description}</div>
                      <div style={{ fontSize: '11px', color: '#27ae60', marginBottom: '4px' }}>Effect: {vaultResult.effect}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: '10px' }}>{vaultResult.flavor_text}</div>
                      <button onClick={claimVaultResult} style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: '1px solid var(--gold)', borderRadius: '6px', color: 'var(--gold)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
                        CLAIM {vaultResult.type?.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:2px}
      `}</style>
    </div>
  )
}