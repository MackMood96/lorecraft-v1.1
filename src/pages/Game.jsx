import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'
import DiceRoll from '../components/DiceRoll'

// ─── VOICE CONFIG ────────────────────────────────────────────────────────────
const NARRATOR_VOICE = 'Charon'
const NARRATOR_LABEL = 'Narrator'
const NARRATOR_STYLE = 'Speak as a measured, authoritative fantasy story narrator. Deep and calm with deliberate pacing. Convey gravitas and wonder. Consistent tone throughout.'
const TTS_MODELS = [
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
]

// ─── RARITY CONFIG ───────────────────────────────────────────────────────────
const RARITIES = {
  cursed:    { label: 'Cursed',    color: '#8b0000', bg: 'rgba(139,0,0,0.15)',    chance: 0.10 },
  common:    { label: 'Common',    color: '#9e9e9e', bg: 'rgba(158,158,158,0.1)', chance: 0.40 },
  uncommon:  { label: 'Uncommon',  color: '#4caf50', bg: 'rgba(76,175,80,0.1)',   chance: 0.25 },
  rare:      { label: 'Rare',      color: '#2196f3', bg: 'rgba(33,150,243,0.1)',  chance: 0.15 },
  epic:      { label: 'Epic',      color: '#9c27b0', bg: 'rgba(156,39,176,0.1)',  chance: 0.08 },
  legendary: { label: 'Legendary', color: '#ffd700', bg: 'rgba(255,215,0,0.1)',   chance: 0.02 },
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

// ─── ITEM SLOT MAPPING ────────────────────────────────────────────────────────
const SLOT_LABELS = {
  mainHand: '🗡️ Main Hand',
  offHand: '🛡️ Off Hand',
  armor: '🧥 Armor',
  accessory: '💍 Accessory',
}

// Guess slot from item type for DM-given items
function guessSlot(type) {
  if (!type) return null
  const t = type.toLowerCase()
  if (['weapon', 'sword', 'axe', 'staff', 'bow', 'dagger', 'wand'].some(w => t.includes(w))) return 'mainHand'
  if (['shield', 'offhand', 'focus', 'quiver'].some(w => t.includes(w))) return 'offHand'
  if (['armor', 'robe', 'cloak', 'mail', 'leather'].some(w => t.includes(w))) return 'armor'
  if (['accessory', 'ring', 'amulet', 'tool', 'scroll'].some(w => t.includes(w))) return 'accessory'
  return null
}

// ─── GROQ CALL ───────────────────────────────────────────────────────────────
async function callGroq(system, user, maxTokens = 300) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens, temperature: 0.8
    })
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function generateScenePrompt(dmText) {
  const prompt = await callGroq(
    `You generate image prompts for a 2D pixel art fantasy RPG game.
Return ONLY the image prompt. No explanation. Max 25 words.
ALWAYS start with: "2D pixel art, 16-bit SNES RPG style,"
Describe the location. Match lighting to context — taverns warm, outdoors bright, dungeons torch-lit. Never always dark.`,
    dmText, 60
  )
  const base = '2D pixel art, 16-bit SNES RPG style, '
  const clean = prompt.replace(/^2D pixel art.*?style,?\s*/i, '').trim()
  return base + (clean || 'fantasy village square, warm sunny daytime, cobblestone streets, no characters')
}

async function generateSceneWithNpcPrompt(npc, dmText) {
  const prompt = await callGroq(
    `You generate image prompts for a 2D pixel art fantasy RPG game in classic JRPG dialogue style.
Return ONLY the image prompt. Max 35 words.
ALWAYS start with: "2D pixel art, 16-bit SNES JRPG style,"
Show the NPC character portrait on the left or right foreground, environment as background.
Match lighting to context. Not always dark.`,
    `NPC: ${npc.name}, ${npc.race} ${npc.role}. ${npc.description || ''}
Scene: ${dmText.slice(0, 150)}`, 80
  )
  const base = '2D pixel art, 16-bit SNES JRPG style, '
  const clean = prompt.replace(/^2D pixel art.*?style,?\s*/i, '').trim()
  return base + (clean || `${npc.race} ${npc.role} portrait foreground, fantasy scene background, warm lighting`)
}

async function generateVaultRoll(playerClass, playerRace, rarity, type) {
  const raw = await callGroq(
    `You generate unique fantasy RPG ${type}s for a fantasy game.
Return ONLY valid JSON with no markdown, no backticks. Format:
{"name":"string","description":"string","effect":"string","flavor_text":"string","rarity":"${rarity}","type":"${type}","slot":"mainHand|offHand|armor|accessory|null","icon":"emoji"}
slot should be the equipment slot this item fits, or null for non-equippable items.
For cursed items: dark humor, negative twist. For legendary: mythic, awe-inspiring.`,
    `Generate a ${rarity} ${type} for a ${playerRace} ${playerClass}.`, 250
  )
  try { return JSON.parse(raw) }
  catch { return { name: 'Mystery Shard', description: 'Its purpose is unclear.', effect: 'Unknown', flavor_text: 'Some things defy explanation.', rarity, type, slot: null, icon: '💎' } }
}

// ─── GEMINI IMAGE ─────────────────────────────────────────────────────────────
async function generateGeminiImage(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${import.meta.env.VITE_GEMINI_TTS_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    }
  )
  const data = await response.json()
  const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (!imagePart) throw new Error('No image in response')
  const blob = base64ToBlob(imagePart.inlineData.data, imagePart.inlineData.mimeType)
  return URL.createObjectURL(blob)
}

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert Dungeon Master for a text-based fantasy RPG. Create immersive, dynamic adventures.

RESPONSE LENGTH — CRITICAL:
- Player speaks directly to an NPC → NPC replies ONLY. No narration unless something physical happens. 1-3 lines maximum.
- Simple actions (look around, pick up item, open door) → 1 sentence only.
- Movement to new area → 2-3 sentences. Stop.
- Combat round → dice roll + 1 sentence outcome. Stop.
- Major story moment → 2 short paragraphs maximum. Stop.
- NEVER pad. NEVER add suggested actions unless major decision or combat.
- Suggested actions: *italics* max 3 options on one line.

NPC CONVERSATION RULE — CRITICAL:
- Player talks to NPC → NPC speaks. That is the entire response.
- Format ALWAYS: NpcName: "dialogue here"
- One NPC per response. Never two.

CLASS RESTRICTIONS:
- Warrior: swords, axes, maces, spears, shields, bows. No spells.
- Rogue: daggers, shortbows, shortswords. Light armor only. No magic.
- Mage: staves, wands, orbs. Robes only. No heavy armor or physical weapons.
- Ranger: bows, daggers, shortswords. Light/medium armor. Nature magic only.

ATTRIBUTES:
- STR: Melee attacks, breaking things, intimidation
- DEX: Stealth, ranged attacks, dodging, lockpicking
- INT: Spells, knowledge, puzzles, arcane detection
- VIT: Endurance, resisting poison/disease
- CHA: Persuasion, deception, NPC reactions, trading
- LCK: Critical hits, finding items, random events

DICE ROLLING:
- Roll for ALL uncertain outcomes. Format: "Rolling d20... [X]!"
- 18-20: critical success | 11-17: success | 6-10: partial | 1-5: failure

INVENTORY — only valid triggers:
1. Quest completion with explicit reward
2. Container looted AFTER successful search roll
3. Enemy defeated — loot roll required
4. Merchant purchase with sufficient gold confirmed
5. Item found AFTER successful search roll

GOLD RULE — CRITICAL:
- NEVER calculate gold totals. NEVER mention current gold amounts.
- NEVER say "your new total is X gold".
- When gold changes (purchase, reward, finding coins) use ONLY:
<gold_change>{"amount": -5, "reason": "healing potion purchase"}</gold_change>
- amount is ALWAYS a delta: negative for spending, positive for receiving.
- The game engine handles all gold math. You only report what changed and why.

Valid inventory event:
<inventory_add>{"player":"Name","item":"item name","icon":"emoji","type":"weapon|armor|shield|accessory|consumable|misc","slot":"mainHand|offHand|armor|accessory|null","description":"brief description","reason":"loot|quest_reward|purchase|found"}</inventory_add>
<inventory_remove>{"player":"Name","item":"item name"}</inventory_remove>
<grant_roll>{"player":"Name"}</grant_roll>

HP changes:
<hp_change>{"amount": -15, "reason": "sword strike"}</hp_change>

NPC DATA — first appearance only, at END of response:
<npc_data>{"name":"NpcName","gender":"male|female","voice":"VoiceName","race":"Race","role":"Role","description":"brief appearance and personality"}</npc_data>
Male voices: Fenrir (warrior/villain), Orus (merchant/elder), Achird (mysterious/mage)
Female voices: Kore (mysterious/mage), Aoede (noble/elf), Leda (warrior/ranger)

DIALOGUE FORMAT:
- NpcName: "words here" — always its own paragraph
- NEVER use asterisks around tags. XML angle brackets ONLY.
- npc_data MUST be: <npc_data>{...}</npc_data>
- NEVER invent voice names. Use ONLY the six listed.

KNOWN NPCS:
{{NPC_ROSTER}}`

// ─── MUSIC ──────────────────────────────────────────────────────────────────
const MUSIC_TRACKS = {
  exploration: '/music/exploration.mp3', combat: '/music/combat.mp3',
  mystery: '/music/mystery.mp3', tavern: '/music/tavern.mp3',
  dungeon: '/music/dungeon.mp3', inn: '/music/inn.mp3'
}

function detectMood(text) {
  const lower = text.toLowerCase()
  if (lower.includes('attack') || lower.includes('combat') || lower.includes('fight') || lower.includes('battle') || lower.includes('blood') || lower.includes('damage')) return 'combat'
  if (lower.includes('tavern') || lower.includes('inn') || lower.includes('bar') || lower.includes('ale') || lower.includes('bard')) return 'tavern'
  if (lower.includes('dungeon') || lower.includes('cave') || lower.includes('shadow') || lower.includes('undead') || lower.includes('crypt')) return 'dungeon'
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

function parseGoldChange(text) {
  const match = text.match(/<gold_change>([\s\S]*?)<\/gold_change>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function parseHpChange(text) {
  const match = text.match(/<hp_change>([\s\S]*?)<\/hp_change>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

// Keep state_update as fallback for backwards compat
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

function parseDiceRoll(text) {
  const match = text.match(/[Rr]olling d(\d+)\.\.\.?\s*\[(\d+)\]/i)
  if (!match) return null
  return { sides: parseInt(match[1]), result: parseInt(match[2]) }
}

function cleanText(text) {
  return text
    .replace(/<gold_change>[\s\S]*?<\/gold_change>/g, '')
    .replace(/<hp_change>[\s\S]*?<\/hp_change>/g, '')
    .replace(/<state_update>[\s\S]*?<\/state_update>/g, '')
    .replace(/<npc_data>[\s\S]*?<\/npc_data>/g, '')
    .replace(/<inventory_add>[\s\S]*?<\/inventory_add>/g, '')
    .replace(/<inventory_remove>[\s\S]*?<\/inventory_remove>/g, '')
    .replace(/<grant_roll>[\s\S]*?<\/grant_roll>/g, '')
    .replace(/\*npc_data[>\(][\s\S]*?(<\/npc_data>|\*)/g, '')
    .replace(/\*state_update[>\(][\s\S]*?(<\/state_update>|\*)/g, '')
    .replace(/\*inventory_add[>\(][\s\S]*?(<\/inventory_add>|\*)/g, '')
    .replace(/\*inventory_remove[>\(][\s\S]*?(<\/inventory_remove>|\*)/g, '')
    .replace(/\*grant_roll[>\(][\s\S]*?(<\/grant_roll>|\*)/g, '')
    .replace(/\*?(npc_data|state_update|inventory_add|inventory_remove|grant_roll|gold_change|hp_change)[\s\S]{0,500}?(>|\*)/g, '')
    .trim()
}

function buildNpcRoster(npcData) {
  const npcs = Object.values(npcData)
  if (npcs.length === 0) return 'None yet.'
  return npcs.map(n => `- ${n.name} (${n.race || 'Unknown'}, ${n.role || 'Unknown'}, voice: ${n.voice}): ${n.description || 'No description.'}`).join('\n')
}

// ─── NPC DETECTION ────────────────────────────────────────────────────────────
function detectNpcInText(text, npcData) {
  if (!npcData || Object.keys(npcData).length === 0) return null
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    for (const [name, data] of Object.entries(npcData)) {
      if (new RegExp(`^${name}\\s*:`, 'i').test(line)) {
        const voice = typeof data === 'string' ? data : data.voice
        if (voice && typeof voice === 'string') return { npcName: name, npcVoice: voice }
      }
    }
  }
  return null
}

// ─── SPLIT INTO 2 CHUNKS ─────────────────────────────────────────────────────
// Split response into exactly 2 chunks:
// Chunk 1: everything before the first NPC line (or first half if no NPC)
// Chunk 2: NPC dialogue + any narration after (or second half)
// Chunk 1 starts playing immediately while chunk 2 generates in parallel.
function splitIntoTwoChunks(text, npcData) {
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l && !(l.startsWith('<') && l.includes('>')) && !(l.startsWith('*') && l.endsWith('*')))

  if (lines.length === 0) return []
  if (lines.length === 1) return [lines[0]]

  const npcMatch = detectNpcInText(lines.join('\n'), npcData)

  if (npcMatch) {
    // Find where NPC lines start
    const firstNpcIdx = lines.findIndex(l => new RegExp(`^${npcMatch.npcName}\\s*:`, 'i').test(l))
    if (firstNpcIdx > 0) {
      // Chunk 1: narration before NPC
      // Chunk 2: NPC dialogue + anything after
      return [
        lines.slice(0, firstNpcIdx).join('\n'),
        lines.slice(firstNpcIdx).join('\n'),
      ]
    }
    // NPC is the first line — no split needed, single chunk
    return [lines.join('\n')]
  }

  // No NPC — split at midpoint if long enough
  if (lines.length >= 4) {
    const mid = Math.ceil(lines.length / 2)
    return [
      lines.slice(0, mid).join('\n'),
      lines.slice(mid).join('\n'),
    ]
  }

  return [lines.join('\n')]
}

// ─── MULTI-SPEAKER TTS PAYLOAD ────────────────────────────────────────────────
function buildTtsPayload(text, npcData) {
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l && !(l.startsWith('<') && l.includes('>')) && !(l.startsWith('*') && l.endsWith('*')))

  if (lines.length === 0) return null

  const npcMatch = detectNpcInText(lines.join('\n'), npcData)
  const npcName = npcMatch?.npcName || null
  const npcVoice = npcMatch?.npcVoice || null
  const hasNpc = npcName !== null
  const hasNarration = hasNpc ? lines.some(l => !new RegExp(`^${npcName}\\s*:`, 'i').test(l)) : true

  if (!hasNpc) {
    return { type: 'single', voice: NARRATOR_VOICE, text: lines.join('\n'), isNarrator: true }
  }

  if (hasNpc && !hasNarration) {
    const npcLines = lines.map(l => l.replace(new RegExp(`^${npcName}\\s*:\\s*"?`, 'i'), '').replace(/"$/, '').trim()).join(' ')
    return { type: 'single', voice: npcVoice, text: npcLines, isNarrator: false }
  }

  const labeled = lines.map(l => {
    if (new RegExp(`^${npcName}\\s*:`, 'i').test(l)) {
      return `${npcName}: ${l.replace(new RegExp(`^${npcName}\\s*:\\s*"?`, 'i'), '').replace(/"$/, '').trim()}`
    }
    return `${NARRATOR_LABEL}: ${l}`
  }).join('\n')

  return { type: 'multi', npcName, npcVoice, text: labeled }
}

// ─── TTS API WITH FALLBACK CHAIN ──────────────────────────────────────────────
async function callTtsApi(body) {
  for (const model of TTS_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${import.meta.env.VITE_GEMINI_TTS_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const data = await response.json()
      if (data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') { console.log(`TTS ${model} quota exhausted`); continue }
      if (data.error) throw new Error(data.error.message)
      const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
      if (!audioPart) throw new Error('No audio in response')
      return audioPart.inlineData.data
    } catch (e) {
      if (e.message?.includes('quota') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED')) { continue }
      throw e
    }
  }
  return null
}

async function generateChunkTTS(chunkText, npcData) {
  const payload = buildTtsPayload(chunkText, npcData)
  if (!payload) return null

  let body
  if (payload.type === 'single') {
    body = {
      contents: [{ parts: [{ text: payload.text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: payload.voice } } } }
    }
    if (payload.isNarrator) body.systemInstruction = { parts: [{ text: NARRATOR_STYLE }] }
  } else {
    body = {
      contents: [{ parts: [{ text: payload.text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: NARRATOR_LABEL, voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATOR_VOICE } } },
              { speaker: payload.npcName, voiceConfig: { prebuiltVoiceConfig: { voiceName: payload.npcVoice } } }
            ]
          }
        }
      }
    }
  }
  return await callTtsApi(body)
}

function browserTtsFallback(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return }
    const clean = text.replace(/\*.*?\*/g, '').replace(/\w+:\s*/g, '').trim()
    const utt = new SpeechSynthesisUtterance(clean)
    utt.rate = 0.85; utt.pitch = 0.8
    utt.onend = resolve; utt.onerror = resolve
    window.speechSynthesis.speak(utt)
  })
}

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
  const {
    player, gameState, updateGameState,
    addInventoryItem, removeInventoryItem, equipItem, unequipItem,
    giveItemToPlayer, giveGoldToPlayer,
    requestGoldChange, confirmGoldChange, declineGoldChange,
    pendingGoldChange, goldToast, applyHpChange,
    currentRoll, rollDice, setCurrentRoll,
    messages, addMessage, setMessages
  } = useGame()

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  const [sceneUrl, setSceneUrl] = useState('')
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneLabel, setSceneLabel] = useState('Adventure Begins')
  const [sceneVisible, setSceneVisible] = useState(true)
  const lastDmTextRef = useRef('')

  const [showInventory, setShowInventory] = useState(false)
  const [inventoryTab, setInventoryTab] = useState('equipped')
  const [selectedItem, setSelectedItem] = useState(null) // item detail popup
  const [vaultRolling, setVaultRolling] = useState(false)
  const [vaultResult, setVaultResult] = useState(null)
  const [vaultRollsAvailable, setVaultRollsAvailable] = useState(1)
  const [tradeInput, setTradeInput] = useState('')
  const [tradeMsg, setTradeMsg] = useState('')
  const [tradeLoading, setTradeLoading] = useState(false)

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
  const hostGenerateAndBroadcastScene = useCallback(async (dmText, activeNpc = null) => {
    try {
      lastDmTextRef.current = dmText
      const scenePrompt = activeNpc ? await generateSceneWithNpcPrompt(activeNpc, dmText) : await generateScenePrompt(dmText)
      const imageUrl = await generateGeminiImage(scenePrompt)
      sceneChannelRef.current?.send({ type: 'broadcast', event: 'scene_update', payload: { url: imageUrl, label: scenePrompt.slice(0, 50) } })
      setSceneLoading(true)
      setSceneLabel(activeNpc ? activeNpc.name : scenePrompt.slice(0, 50))
      setSceneUrl(imageUrl)
    } catch (e) { console.log('Scene error:', e) }
  }, [])

  const regenerateScene = () => { if (lastDmTextRef.current) hostGenerateAndBroadcastScene(lastDmTextRef.current) }

  // ─── CHANNELS ─────────────────────────────────────────────────────────────
  function subscribeToSceneAndAudio() {
    const sceneChannel = supabase.channel(`scene:${campaignId}`, { config: { broadcast: { self: false } } })
    if (!isHost) {
      sceneChannel.on('broadcast', { event: 'scene_update' }, ({ payload }) => {
        setSceneLoading(true); setSceneLabel(payload.label || 'Scene'); setSceneUrl(payload.url)
      })
    }
    sceneChannel.subscribe()
    sceneChannelRef.current = sceneChannel

    const audioChannel = supabase.channel(`audio:${campaignId}`, { config: { broadcast: { self: false } } })
    if (!isHost) {
      const audioQueue = []
      let isPlaying = false
      const playNext = async () => {
        if (isPlaying || audioQueue.length === 0) return
        isPlaying = true
        const base64Pcm = audioQueue.shift()
        try {
          const audio = playBase64Audio(base64Pcm, currentAudioRef)
          setTtsStatus('playing')
          await new Promise((resolve) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', resolve); audio.play().catch(resolve) })
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

  // ─── HOST TTS — 2 CHUNKS, PLAY FIRST WHILE SECOND LOADS ──────────────────
  async function hostGenerateAndBroadcastAudio(text) {
    if (mutedRef.current) return
    const clean = cleanText(text)
    if (!clean) return

    audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_start', payload: {} })
    setTtsStatus('loading')

    const chunks = splitIntoTwoChunks(clean, npcDataRef.current)
    if (chunks.length === 0) { setTtsStatus('idle'); return }

    // Start generating chunk 2 immediately in background
    let chunk2Promise = null
    let chunk2Audio = null
    let chunk2Failed = false

    if (chunks.length > 1) {
      chunk2Promise = generateChunkTTS(chunks[1], npcDataRef.current)
        .then(b => { chunk2Audio = b })
        .catch(e => { console.log('Chunk 2 TTS failed:', e); chunk2Failed = true })
    }

    // Generate and play chunk 1
    try {
      const chunk1Audio = await generateChunkTTS(chunks[0], npcDataRef.current)
      if (mutedRef.current) { setTtsStatus('idle'); return }

     if (!chunk1Audio) {
        setTtsStatus('idle')
      } else {
        audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_chunk', payload: { base64Pcm: chunk1Audio } })
        const audio = playBase64Audio(chunk1Audio, currentAudioRef)
        setTtsStatus('playing')
        // While chunk 1 plays, chunk 2 is generating in background
        await new Promise((resolve) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', resolve); audio.play().catch(resolve) })
      }
    } catch (e) {
      console.log('Chunk 1 TTS failed:', e)
      try { setTtsStatus('playing'); await browserTtsFallback(chunks[0]) } catch {}
    }

    // Play chunk 2 once it's ready (should already be done by now)
    if (chunks.length > 1 && !mutedRef.current) {
      // Wait for chunk 2 to finish generating if it hasn't yet
      if (chunk2Promise) await chunk2Promise

      if (chunk2Audio && !chunk2Failed) {
        audioChannelRef.current?.send({ type: 'broadcast', event: 'audio_chunk', payload: { base64Pcm: chunk2Audio } })
        const audio = playBase64Audio(chunk2Audio, currentAudioRef)
        setTtsStatus('playing')
        await new Promise((resolve) => { audio.addEventListener('ended', resolve); audio.addEventListener('error', resolve); audio.play().catch(resolve) })
   } else if (chunk2Failed) {
        // silently skip — no browser fallback
      }
    }

    setTtsStatus('idle')
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
    if (isHost) hostGenerateAndBroadcastScene('A fantasy adventure begins, open countryside, ancient ruins, bright daytime')
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
          const activeNpc = detectNpcInText(lastMsg.text, npcDataRef.current)
          const npcObj = activeNpc ? npcDataRef.current[activeNpc.npcName] : null
          hostGenerateAndBroadcastScene(lastMsg.text, npcObj)
        }
        return newMessages
      })
      hasStarted.current = true
    }
  }

  async function loadPlayers() {
    const { data } = await supabase.from('players').select('name').eq('campaign_id', campaignId)
    if (data) setPlayers(data.map(p => p.name).filter(Boolean))
  }

  async function loadPlayerAvatars() {
    const { data } = await supabase.from('players').select('name, avatar_url').eq('campaign_id', campaignId).not('avatar_url', 'is', null)
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
        const activeNpc = detectNpcInText(msg.content, npcDataRef.current)
        const npcObj = activeNpc ? npcDataRef.current[activeNpc.npcName] : null
        hostGenerateAndBroadcastScene(msg.content, npcObj)
        const roll = parseDiceRoll(msg.content)
        if (roll) rollDice(roll.sides, 0, 'Fate decides...')
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
    const equipment = gameState.equipment || {}
    const abilities = player?.abilities || []

    // Build inventory summary for DM — names only, keep it short
    const inventoryNames = (gameState.inventory || [])
      .map(i => typeof i === 'string' ? i : `${i.icon || ''} ${i.name}`)
      .join(', ')

    const equippedNames = Object.entries(equipment)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : v.name}`)
      .join(', ')

    const systemContent = SYSTEM_PROMPT.replace('{{NPC_ROSTER}}', npcRoster) +
      `\n\nPlayers in this campaign: ${players.length > 0 ? players.join(', ') : player?.name}.` +
      `\nActing player: ${player?.name} the ${player?.race || ''} ${player?.class}.` +
      `\nHP: ${gameState.hp}/${gameState.maxHp}. Gold: ${gameState.gold}.` +
      `\nAttributes: STR ${attrs.str || 0}, DEX ${attrs.dex || 0}, INT ${attrs.int || 0}, VIT ${attrs.vit || 0}, CHA ${attrs.cha || 0}, LCK ${attrs.lck || 0}.` +
      `\nEquipped: ${equippedNames || 'Nothing'}.` +
      `\nInventory: ${inventoryNames || 'Empty'}.` +
      `\nAbilities: ${abilities.map(a => a.name).join(', ') || 'None'}.` +
      (hasMention ? '\n\nCRITICAL: This message contains an @mention. ONE sentence only. Stop immediately after.' : '')

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemContent }, ...history], max_tokens: 600 })
    })
    const data = await response.json()
    if (!data.choices?.[0]?.message?.content) throw new Error('No response from DM')
    return data.choices[0].message.content
  }

  async function processDmResponse(raw) {
    // NPC data first so npcDataRef is populated before TTS
    const npc = parseNpcData(raw)
    if (npc && npc.name && npc.voice) {
      const updated = { ...npcDataRef.current, [npc.name]: { ...npc } }
      setNpcData(updated); npcDataRef.current = updated
      await saveNpcData(updated)
      if (isHost) hostGenerateAndBroadcastScene(raw, npc)
    }

    // Gold change — request confirmation from player
    const goldChange = parseGoldChange(raw)
    if (goldChange && typeof goldChange.amount === 'number') {
      await requestGoldChange(goldChange.amount, goldChange.reason || '')
    }

    // HP change
    const hpChange = parseHpChange(raw)
    if (hpChange && typeof hpChange.amount === 'number') {
      await applyHpChange(hpChange.amount)
    }

    // Legacy state_update fallback (hp/gold together)
    const stateUpdate = parseStateUpdate(raw)
    if (stateUpdate) {
      if (stateUpdate.hp !== undefined) await applyHpChange(stateUpdate.hp - gameState.hp)
      // Gold from state_update still goes through confirmation
      if (stateUpdate.gold !== undefined) {
        const delta = stateUpdate.gold - gameState.gold
        if (delta !== 0) await requestGoldChange(delta, 'transaction')
      }
    }

    // Inventory adds — build proper item objects
    const adds = parseInventoryAdd(raw)
    for (const add of adds) {
      if (add.player === player?.name) {
        const itemObj = {
          id: crypto.randomUUID(),
          name: add.item,
          icon: add.icon || '📦',
          type: add.type || 'misc',
          slot: add.slot || guessSlot(add.type),
          stats: {},
          rarity: 'common',
          equipped: false,
          source: add.reason || 'loot',
          description: add.description || '',
        }
        await addInventoryItem(itemObj)
      }
    }

    // Inventory removes
    const removes = parseInventoryRemove(raw)
    for (const remove of removes) {
      if (remove.player === player?.name) await removeInventoryItem(remove.item)
    }

    // Grant vault roll
    const grantRoll = parseGrantRoll(raw)
    if (grantRoll?.player === player?.name) setVaultRollsAvailable(v => v + 1)

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

  async function handleTrade() {
    const trimmed = tradeInput.trim()
    if (!trimmed.startsWith('/give')) { setTradeMsg('Use: /give @PlayerName item name'); return }
    const parts = trimmed.match(/\/give\s+@(\w+)\s+(.+)/i)
    if (!parts) { setTradeMsg('Use: /give @PlayerName item name'); return }
    const toName = parts[1]; const what = parts[2].trim()
    if (toName === player?.name) { setTradeMsg("You can't give items to yourself."); return }
    setTradeLoading(true); setTradeMsg('')
    const goldMatch = what.match(/^(\d+)\s+gold$/i)
    if (goldMatch) {
      const amount = parseInt(goldMatch[1])
      const result = await giveGoldToPlayer(amount, toName, campaignId)
      if (result.success) { setTradeMsg(`✓ Gave ${amount} gold to ${toName}`); await saveMessage('player', `${player?.name} gives ${amount} 🪙 gold to ${toName}`, player?.name) }
      else setTradeMsg(`✗ ${result.error}`)
    } else {
      const result = await giveItemToPlayer(what, toName, campaignId)
      if (result.success) { setTradeMsg(`✓ Gave ${result.item} to ${toName}`); await saveMessage('player', `${player?.name} gives ${result.item} to ${toName}`, player?.name) }
      else setTradeMsg(`✗ ${result.error}`)
    }
    setTradeLoading(false); setTradeInput('')
  }

  async function rollVault(type) {
    if (vaultRolling) return
    if (vaultRollsAvailable <= 0 && gameState.gold < 50) return
    setVaultRolling(true); setVaultResult(null)
    const rarity = rollRarity()
    const result = await generateVaultRoll(player?.class || 'Warrior', player?.race || 'Human', rarity, type)
    setVaultResult(result); setVaultRolling(false)
    if (vaultRollsAvailable > 0) setVaultRollsAvailable(v => v - 1)
    else await requestGoldChange(-50, 'Vault of Fates roll')
  }

  async function claimVaultResult() {
    if (!vaultResult) return
    if (vaultResult.type === 'item' || vaultResult.type === 'weapon' || vaultResult.type === 'armor') {
      const itemObj = {
        id: crypto.randomUUID(),
        name: vaultResult.name,
        icon: vaultResult.icon || '✨',
        type: vaultResult.type,
        slot: vaultResult.slot || guessSlot(vaultResult.type),
        stats: vaultResult.stats || {},
        rarity: vaultResult.rarity,
        equipped: false,
        source: 'vault',
        description: vaultResult.description || '',
        effect: vaultResult.effect || '',
        flavor_text: vaultResult.flavor_text || '',
      }
      await addInventoryItem(itemObj)
    } else {
      const abilities = player?.abilities || []
      await supabase.from('players').update({ abilities: [...abilities, vaultResult] }).eq('id', player?.id)
    }
    setVaultResult(null)
  }

  const hpPct = Math.max(0, (gameState.hp / gameState.maxHp) * 100)
  const hpColor = hpPct > 50 ? '#27ae60' : hpPct > 25 ? '#f39c12' : '#c0392b'
  const scenePct = isMobile ? 32 : 38

  // ─── INVENTORY HELPERS ────────────────────────────────────────────────────
  const equippedItems = gameState.equipment || {}
  const backpackItems = (gameState.inventory || []).filter(i => typeof i === 'object' && !i.equipped && i.slot)
  const consumableItems = (gameState.inventory || []).filter(i => typeof i === 'object' && (i.type === 'consumable' || !i.slot))
  const legacyItems = (gameState.inventory || []).filter(i => typeof i === 'string')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {currentRoll && <DiceRoll roll={currentRoll} onDismiss={() => setCurrentRoll(null)} />}

      {/* ── GOLD CONFIRMATION MODAL ── */}
      {pendingGoldChange && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: `2px solid ${pendingGoldChange.amount < 0 ? '#c0392b' : '#27ae60'}`, borderRadius: '12px', padding: '24px', width: '280px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🪙</div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '13px', color: 'var(--gold)', marginBottom: '6px', letterSpacing: '2px' }}>GOLD TRANSACTION</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px', fontStyle: 'italic' }}>{pendingGoldChange.reason}</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px' }}>CURRENT</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: 'var(--gold)' }}>{pendingGoldChange.currentGold} 🪙</div>
              </div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: pendingGoldChange.amount < 0 ? '#c0392b' : '#27ae60' }}>
                {pendingGoldChange.amount > 0 ? '+' : ''}{pendingGoldChange.amount}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px' }}>AFTER</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: 'var(--gold)' }}>
                  {Math.max(0, pendingGoldChange.currentGold + pendingGoldChange.amount)} 🪙
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={declineGoldChange} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #c0392b', borderRadius: '6px', color: '#c0392b', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
                DECLINE ✗
              </button>
              <button onClick={confirmGoldChange} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #0a1f0a, #102010)', border: '1px solid #27ae60', borderRadius: '6px', color: '#27ae60', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
                ACCEPT ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GOLD TOAST ── */}
      {goldToast && (
        <div style={{ position: 'fixed', top: '70px', right: '12px', background: goldToast.amount > 0 ? 'rgba(39,174,96,0.9)' : 'rgba(192,57,43,0.9)', border: `1px solid ${goldToast.amount > 0 ? '#27ae60' : '#c0392b'}`, borderRadius: '8px', padding: '8px 14px', zIndex: 250, fontFamily: "'Cinzel', serif", fontSize: '12px', color: 'white', letterSpacing: '1px', animation: 'fadeIn 0.3s ease' }}>
          {goldToast.amount > 0 ? '+' : ''}{goldToast.amount} 🪙 {goldToast.reason}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding: '7px 12px', background: 'rgba(10,8,18,0.98)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 10 }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: isMobile ? '12px' : '14px', color: 'var(--gold)', letterSpacing: '2px' }}>⚔ LORECRAFT</div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', fontFamily: "'Cinzel', serif", letterSpacing: '1px', padding: '2px 6px', color: ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : 'var(--text-dim)', border: `1px solid ${ttsStatus === 'playing' ? '#27ae60' : ttsStatus === 'loading' ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px' }}>
            {ttsStatus === 'playing' ? '🔊' : ttsStatus === 'loading' ? '⏳' : '💤'}
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
            <img src={sceneUrl} alt={sceneLabel} onLoad={() => setSceneLoading(false)} onError={() => setSceneLoading(false)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: sceneLoading ? 0 : 1, transition: 'opacity 0.8s', background: '#050304' }} />
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
        <div onClick={() => { setShowInventory(false); setSelectedItem(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : '420px', maxHeight: isMobile ? '88vh' : '82vh', background: 'linear-gradient(180deg, #1a1530, #110e1c)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            <div style={{ padding: '14px 20px 0' }}>
              <div style={{ width: '36px', height: '3px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 12px' }} />
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '14px', color: 'var(--gold)', marginBottom: '10px' }}>⚔ Character</div>
              <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                {[['equipped', '🛡️ Equipped'], ['backpack', '🎒 Pack'], ['abilities', '✨ Skills'], ['trade', '🤝 Trade'], ['vault', '🎲 Vault']].map(([tab, label]) => (
                  <button key={tab} onClick={() => { setInventoryTab(tab); setSelectedItem(null) }} style={{ flex: 1, padding: '5px 0', fontFamily: "'Cinzel', serif", fontSize: '7px', letterSpacing: '1px', background: inventoryTab === tab ? 'rgba(201,168,76,0.15)' : 'transparent', border: `1px solid ${inventoryTab === tab ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: inventoryTab === tab ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

              {/* ── EQUIPPED TAB ── */}
              {inventoryTab === 'equipped' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(SLOT_LABELS).map(([slot, label]) => {
                    const item = equippedItems[slot]
                    const rarColor = item ? (RARITIES[item.rarity]?.color || '#9e9e9e') : 'var(--border)'
                    return (
                      <div key={slot} style={{ background: 'var(--bg2)', border: `1px solid ${rarColor}44`, borderLeft: `3px solid ${rarColor}`, borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
                        {item ? (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                                <div>
                                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: rarColor }}>{item.name}</div>
                                  {item.description && <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '1px' }}>{item.description}</div>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {Object.keys(item.stats || {}).length > 0 && (
                                  <div style={{ textAlign: 'right' }}>
                                    {Object.entries(item.stats).map(([k, v]) => (
                                      <div key={k} style={{ fontSize: '9px', color: '#27ae60' }}>+{v} {k.toUpperCase()}</div>
                                    ))}
                                  </div>
                                )}
                                <button onClick={() => unequipItem(slot)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #c0392b44', borderRadius: '4px', color: '#c0392b', fontFamily: "'Cinzel', serif", fontSize: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  UNEQUIP
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#3a3050', fontStyle: 'italic' }}>Empty slot</div>
                        )}
                      </div>
                    )
                  })}

                  {/* Attributes */}
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginTop: '4px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: '8px' }}>ATTRIBUTES</div>
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

                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)', textAlign: 'center', padding: '6px 0' }}>🪙 {gameState.gold} Gold</div>
                </div>
              )}

              {/* ── BACKPACK TAB ── */}
              {inventoryTab === 'backpack' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {backpackItems.length === 0 && consumableItems.length === 0 && legacyItems.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center', fontStyle: 'italic' }}>Your pack is empty</div>
                  ) : null}

                  {/* Equippable items */}
                  {backpackItems.map(item => {
                    const rarColor = RARITIES[item.rarity]?.color || '#9e9e9e'
                    return (
                      <div key={item.id} style={{ background: 'var(--bg2)', border: `1px solid ${rarColor}33`, borderLeft: `3px solid ${rarColor}`, borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: rarColor }}>{item.name}</div>
                              <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>{RARITIES[item.rarity]?.label?.toUpperCase()} · {SLOT_LABELS[item.slot] || item.slot}</div>
                              {item.description && <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {Object.keys(item.stats || {}).length > 0 && (
                              <div style={{ textAlign: 'right' }}>
                                {Object.entries(item.stats).map(([k, v]) => (
                                  <div key={k} style={{ fontSize: '9px', color: '#27ae60' }}>+{v} {k.toUpperCase()}</div>
                                ))}
                              </div>
                            )}
                            {item.slot && (
                              <button onClick={() => equipItem(item.id)} style={{ padding: '4px 8px', background: 'linear-gradient(135deg, #0a1f0a, #102010)', border: `1px solid ${rarColor}66`, borderRadius: '4px', color: rarColor, fontFamily: "'Cinzel', serif", fontSize: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                EQUIP
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Consumables */}
                  {consumableItems.map(item => {
                    const isObj = typeof item === 'object'
                    return (
                      <div key={isObj ? item.id : item} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{isObj ? item.icon : '📦'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', color: 'var(--text)' }}>{isObj ? item.name : item}</div>
                          {isObj && item.description && <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic' }}>{item.description}</div>}
                        </div>
                      </div>
                    )
                  })}

                  {/* Legacy string items */}
                  {legacyItems.map((item, i) => (
                    <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>{item}</div>
                  ))}
                </div>
              )}

              {/* ── ABILITIES TAB ── */}
              {inventoryTab === 'abilities' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(player?.abilities || []).length === 0
                    ? <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center', fontStyle: 'italic' }}>No abilities yet — visit the Vault of Fates</div>
                    : (player?.abilities || []).map((ability, i) => {
                        const rar = RARITIES[ability.rarity] || RARITIES.common
                        return (
                          <div key={i} style={{ background: rar.bg, border: `1px solid ${rar.color}44`, borderLeft: `3px solid ${rar.color}`, borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: rar.color }}>{ability.name}</div>
                              <div style={{ fontSize: '8px', color: rar.color }}>{rar.label.toUpperCase()}</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '3px' }}>{ability.effect}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>{ability.flavor_text}</div>
                          </div>
                        )
                      })
                  }
                </div>
              )}

              {/* ── TRADE TAB ── */}
              {inventoryTab === 'trade' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: '4px' }}>GIVE ITEMS OR GOLD</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--gold)' }}>/give @PlayerName Iron Sword</span><br/>
                    <span style={{ color: 'var(--gold)' }}>/give @PlayerName 10 gold</span>
                  </div>
                  <input value={tradeInput} onChange={e => { setTradeInput(e.target.value); setTradeMsg('') }} onKeyDown={e => { if (e.key === 'Enter') handleTrade() }} placeholder="/give @PlayerName item or gold"
                    style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: "'EB Garamond', serif", boxSizing: 'border-box' }} />
                  {tradeMsg && <div style={{ fontSize: '11px', color: tradeMsg.startsWith('✓') ? '#27ae60' : '#e74c3c', fontStyle: 'italic' }}>{tradeMsg}</div>}
                  <button onClick={handleTrade} disabled={tradeLoading || !tradeInput.trim()} style={{ padding: '10px', background: tradeInput.trim() ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)', border: `1px solid ${tradeInput.trim() ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '6px', color: tradeInput.trim() ? 'var(--gold)' : 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: tradeInput.trim() ? 'pointer' : 'not-allowed' }}>
                    {tradeLoading ? 'TRADING...' : 'SEND →'}
                  </button>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '8px' }}>PLAYERS IN PARTY</div>
                    {players.filter(p => p !== player?.name).length === 0
                      ? <div style={{ fontSize: '11px', color: '#3a3050', fontStyle: 'italic' }}>No other players in party</div>
                      : players.filter(p => p !== player?.name).map(p => (
                          <div key={p} onClick={() => setTradeInput(`/give @${p} `)} style={{ padding: '6px 0', fontSize: '12px', color: 'var(--gold-light)', cursor: 'pointer', borderBottom: '1px solid rgba(201,168,76,0.08)' }}>⚔️ {p}</div>
                        ))
                    }
                  </div>
                </div>
              )}

              {/* ── VAULT TAB ── */}
              {inventoryTab === 'vault' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '4px' }}>Vault of Fates</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>From useless trinkets to legendary artifacts — fate decides.</div>
                  </div>
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
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: '8px' }}>RARITY ODDS</div>
                    {Object.entries(RARITIES).map(([key, rar]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: rar.color }}>{rar.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{(rar.chance * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  {vaultResult && (
                    <div style={{ background: RARITIES[vaultResult.rarity]?.bg || 'var(--bg2)', border: `2px solid ${RARITIES[vaultResult.rarity]?.color || 'var(--gold)'}`, borderRadius: '10px', padding: '14px', animation: 'fadeIn 0.5s ease' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '22px' }}>{vaultResult.icon || '✨'}</span>
                          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '12px', color:RARITIES[vaultResult.rarity]?.color }}>{vaultResult.name}</div>
                        </div>
                        <div style={{ fontSize: '8px', color: RARITIES[vaultResult.rarity]?.color, letterSpacing: '1px' }}>{RARITIES[vaultResult.rarity]?.label?.toUpperCase()}</div>
                      </div>
                      {vaultResult.slot && (
                        <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginBottom: '4px', fontFamily: "'Cinzel', serif", letterSpacing: '1px' }}>
                          {SLOT_LABELS[vaultResult.slot] || vaultResult.slot}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '4px' }}>{vaultResult.description}</div>
                      <div style={{ fontSize: '11px', color: '#27ae60', marginBottom: '4px' }}>✦ {vaultResult.effect}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: '10px' }}>{vaultResult.flavor_text}</div>
                      <button onClick={claimVaultResult} style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: '1px solid var(--gold)', borderRadius: '6px', color: 'var(--gold)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
                        CLAIM {vaultResult.slot ? 'ITEM' : vaultResult.type?.toUpperCase()}
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