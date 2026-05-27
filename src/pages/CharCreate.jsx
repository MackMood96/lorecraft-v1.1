import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { supabase } from '../supabase'

const CLASSES = [
  {
    id: 'warrior', name: 'Warrior', icon: '⚔️', color: '#c0392b',
    desc: 'Mighty fighter, expert in arms and armor', baseHp: 120,
    attrBonus: { str: 15, vit: 10 }, attrCaps: { int: 40, cha: 40 },
    equipment: {
      mainHand: { name: 'Longsword', icon: '⚔️', type: 'weapon', slot: 'mainHand', stats: { str: 8 }, rarity: 'common', description: 'A sturdy steel blade, reliable in battle.', classRestriction: ['warrior'] },
      offHand:  { name: 'Iron Shield', icon: '🛡️', type: 'shield', slot: 'offHand', stats: { vit: 4 }, rarity: 'common', description: 'A heavy iron shield that absorbs blows.', classRestriction: ['warrior'] },
      armor:    { name: 'Chainmail', icon: '🧥', type: 'armor', slot: 'armor', stats: { vit: 6 }, rarity: 'common', description: 'Interlocked rings of steel forged for durability.', classRestriction: ['warrior'] },
      accessory: null,
    },
    consumables: [{ name: 'Rations', icon: '🍞', qty: 3, description: 'Dried bread and salted meat. Restores stamina on long journeys.' }],
    allowedWeapons: ['sword', 'axe', 'mace', 'spear', 'shield', 'bow'],
    allowedArmor: ['light', 'medium', 'heavy'],
  },
  {
    id: 'rogue', name: 'Rogue', icon: '🗡️', color: '#8e44ad',
    desc: 'Shadow walker, master of stealth and cunning', baseHp: 85,
    attrBonus: { dex: 15, lck: 10 }, attrCaps: { str: 50, int: 40 },
    equipment: {
      mainHand: { name: 'Twin Daggers', icon: '🗡️', type: 'weapon', slot: 'mainHand', stats: { dex: 7 }, rarity: 'common', description: 'A matched pair of balanced throwing daggers.', classRestriction: ['rogue'] },
      offHand:  null,
      armor:    { name: 'Shadow Cloak', icon: '🌑', type: 'armor', slot: 'armor', stats: { dex: 4 }, rarity: 'common', description: 'A dark cloak that bends light and muffles sound.', classRestriction: ['rogue'] },
      accessory: { name: 'Thieves Tools', icon: '🔧', type: 'accessory', slot: 'accessory', stats: { lck: 3 }, rarity: 'common', description: 'Lockpicks, wire and wax. A rogue\'s best friends.', classRestriction: ['rogue'] },
    },
    consumables: [{ name: 'Smoke Bomb', icon: '💨', qty: 2, description: 'Throws a cloud of smoke on impact. Creates cover for escape.' }],
    allowedWeapons: ['dagger', 'shortbow', 'shortsword'],
    allowedArmor: ['light'],
  },
  {
    id: 'mage', name: 'Mage', icon: '🔮', color: '#2980b9',
    desc: 'Arcane scholar, wielder of destructive magic', baseHp: 70,
    attrBonus: { int: 20, cha: 10 }, attrCaps: { str: 30, vit: 50 },
    equipment: {
      mainHand: { name: 'Arcane Staff', icon: '🪄', type: 'weapon', slot: 'mainHand', stats: { int: 10 }, rarity: 'common', description: 'A twisted staff crackling with raw arcane energy.', classRestriction: ['mage'] },
      offHand:  { name: 'Arcane Focus', icon: '🔮', type: 'offhand', slot: 'offHand', stats: { int: 5 }, rarity: 'common', description: 'A glass orb that amplifies magical output.', classRestriction: ['mage'] },
      armor:    { name: 'Mage Robes', icon: '👘', type: 'armor', slot: 'armor', stats: { int: 3 }, rarity: 'common', description: 'Silk robes stitched with arcane sigils.', classRestriction: ['mage'] },
      accessory: null,
    },
    consumables: [{ name: 'Mana Potion', icon: '💊', qty: 2, description: 'A shimmering blue vial that restores magical reserves.' }],
    allowedWeapons: ['staff', 'wand', 'orb'],
    allowedArmor: ['robes'],
  },
  {
    id: 'ranger', name: 'Ranger', icon: '🏹', color: '#27ae60',
    desc: 'Wilderness hunter, skilled with bow and beast', baseHp: 95,
    attrBonus: { dex: 15, str: 10 }, attrCaps: { int: 45, cha: 45 },
    equipment: {
      mainHand: { name: 'Longbow', icon: '🏹', type: 'weapon', slot: 'mainHand', stats: { dex: 9 }, rarity: 'common', description: 'A supple yew bow with exceptional range.', classRestriction: ['ranger'] },
      offHand:  { name: 'Quiver', icon: '🪶', type: 'offhand', slot: 'offHand', stats: { dex: 2 }, rarity: 'common', description: 'A quiver of twenty fletched arrows.', classRestriction: ['ranger'] },
      armor:    { name: 'Leather Armor', icon: '🧥', type: 'armor', slot: 'armor', stats: { dex: 3 }, rarity: 'common', description: 'Hardened leather that allows silent movement.', classRestriction: ['ranger'] },
      accessory: { name: 'Animal Bond Scroll', icon: '🐺', type: 'accessory', slot: 'accessory', stats: { lck: 4 }, rarity: 'uncommon', description: 'An ancient scroll that forms a bond with a nearby beast.', classRestriction: ['ranger'] },
    },
    consumables: [{ name: 'Herb Pouch', icon: '🌿', qty: 2, description: 'A pouch of medicinal herbs for wounds and ailments.' }],
    allowedWeapons: ['bow', 'dagger', 'shortsword'],
    allowedArmor: ['light', 'medium'],
  },
]

const RACES = [
  { id: 'human',      name: 'Human',      icon: '👤', desc: 'Versatile and ambitious',   bonus: { str: 5, dex: 5, int: 5, vit: 5, cha: 5, lck: 5 } },
  { id: 'elf',        name: 'Elf',        icon: '🧝', desc: 'Graceful and long-lived',   bonus: { dex: 10, int: 5 } },
  { id: 'dwarf',      name: 'Dwarf',      icon: '⛏️', desc: 'Sturdy and resilient',      bonus: { vit: 10, str: 5 } },
  { id: 'orc',        name: 'Orc',        icon: '💪', desc: 'Powerful and fierce',        bonus: { str: 15, cha: -5 } },
  { id: 'halfling',   name: 'Halfling',   icon: '🍀', desc: 'Lucky and nimble',           bonus: { lck: 10, dex: 5 } },
  { id: 'tiefling',   name: 'Tiefling',   icon: '😈', desc: 'Infernal and charismatic',  bonus: { cha: 10, int: 5 } },
  { id: 'dragonborn', name: 'Dragonborn', icon: '🐉', desc: 'Draconic and proud',         bonus: { str: 10, vit: 5 } },
  { id: 'undead',     name: 'Undead',     icon: '💀', desc: 'Cursed and relentless',      bonus: { vit: 10, cha: -10, lck: 5 } },
]

const AFFINITIES = [
  { id: 'fire',    name: 'Fire',    icon: '🔥', color: '#e74c3c', bonus: { str: 5, int: 3 } },
  { id: 'shadow',  name: 'Shadow',  icon: '🌑', color: '#8e44ad', bonus: { dex: 5, lck: 3 } },
  { id: 'nature',  name: 'Nature',  icon: '🌿', color: '#27ae60', bonus: { vit: 5, lck: 3 } },
  { id: 'arcane',  name: 'Arcane',  icon: '✨', color: '#2980b9', bonus: { int: 8 } },
  { id: 'thunder', name: 'Thunder', icon: '⚡', color: '#f39c12', bonus: { str: 4, dex: 4 } },
  { id: 'ice',     name: 'Ice',     icon: '❄️', color: '#00bcd4', bonus: { int: 5, vit: 3 } },
  { id: 'light',   name: 'Light',   icon: '🌟', color: '#f1c40f', bonus: { cha: 5, lck: 3 } },
  { id: 'blood',   name: 'Blood',   icon: '🩸', color: '#c0392b', bonus: { str: 6, vit: 2 } },
]

const ATTRS = [
  { id: 'str', name: 'Strength',     icon: '💪', color: '#c0392b', desc: 'Melee damage, carrying capacity' },
  { id: 'dex', name: 'Dexterity',    icon: '🏃', color: '#27ae60', desc: 'Speed, stealth, ranged accuracy' },
  { id: 'int', name: 'Intelligence', icon: '🔮', color: '#2980b9', desc: 'Spell power, knowledge checks' },
  { id: 'vit', name: 'Vitality',     icon: '❤️', color: '#e74c3c', desc: 'Max HP, stamina' },
  { id: 'cha', name: 'Charisma',     icon: '💬', color: '#f39c12', desc: 'NPC persuasion, trading prices' },
  { id: 'lck', name: 'Luck',         icon: '🍀', color: '#1abc9c', desc: 'Critical hit chance, loot quality' },
]

const RARITY_COLORS = {
  common: '#9e9e9e', uncommon: '#4caf50', rare: '#2196f3',
  epic: '#9c27b0', legendary: '#ffd700', cursed: '#8b0000'
}

const BASE_POINTS = 100
const ATTR_MIN = 5
const ATTR_MAX_BASE = 60
const STEPS = ['Class', 'Race', 'Affinity', 'Attributes', 'Identity']

// ─── BUILD STARTING ITEM OBJECTS ─────────────────────────────────────────────
function buildStartingItems(cls) {
  const equipment = {}
  const inventory = []

  // Equipment slots — proper item objects, all equipped: true
  Object.entries(cls.equipment).forEach(([slot, item]) => {
    if (item) {
      equipment[slot] = {
        ...item,
        id: crypto.randomUUID(),
        equipped: true,
        source: 'starting',
      }
    } else {
      equipment[slot] = null
    }
  })

  // Consumables go to inventory as item objects, unequipped
  cls.consumables.forEach(c => {
    inventory.push({
      id: crypto.randomUUID(),
      name: `${c.name} x${c.qty}`,
      icon: c.icon,
      type: 'consumable',
      slot: null,
      stats: {},
      rarity: 'common',
      equipped: false,
      source: 'starting',
      description: c.description || '',
      qty: c.qty,
    })
  })

  return { equipment, inventory }
}

async function callGroq(systemPrompt, userPrompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 200, temperature: 0.7
    })
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function generateAvatarPrompt(cls, race, affinity, appearance) {
  const system = `You are an expert image prompt engineer for a fantasy pixel art RPG game.
Generate a Pollinations.ai image prompt for a character portrait.
Return ONLY the prompt text, nothing else. No quotes, no explanation.
Style must always include: 2D pixel art, 16-bit RPG style, character portrait, fantasy, face and upper body, clean pixel lines, dramatic lighting`
  const user = `Character: ${race.name} ${cls.name} with ${affinity.name} affinity.
${appearance ? `Appearance: ${appearance}` : ''}
Generate a detailed pixel art portrait prompt.`
  const prompt = await callGroq(system, user)
  return prompt || `2D pixel art RPG portrait, ${race.name} ${cls.name}, ${affinity.name} magic aura, fantasy, 16-bit style, face and upper body, dramatic lighting`
}

export default function CharCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const campaignId = searchParams.get('campaignId')
  const isHost = searchParams.get('host') === 'true'
  const joinRoomCode = searchParams.get('room')

  const { setPlayer } = useGame()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [selectedClass, setSelectedClass] = useState(null)
  const [selectedRace, setSelectedRace] = useState(null)
  const [selectedAffinity, setSelectedAffinity] = useState(null)
  const [appearance, setAppearance] = useState('')
  const [backstory, setBackstory] = useState('')
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [showReveal, setShowReveal] = useState(false)
  const [createdPlayer, setCreatedPlayer] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [baseAttrs, setBaseAttrs] = useState({ str: 5, dex: 5, int: 5, vit: 5, cha: 5, lck: 5 })

  const cls = CLASSES.find(c => c.id === selectedClass)
  const race = RACES.find(r => r.id === selectedRace)
  const affinity = AFFINITIES.find(a => a.id === selectedAffinity)

  const finalAttrs = useMemo(() => {
    const result = { ...baseAttrs }
    if (cls) Object.entries(cls.attrBonus).forEach(([k, v]) => { result[k] = (result[k] || 0) + v })
    if (race) Object.entries(race.bonus).forEach(([k, v]) => { result[k] = (result[k] || 0) + v })
    if (affinity) Object.entries(affinity.bonus).forEach(([k, v]) => { result[k] = (result[k] || 0) + v })
    return result
  }, [baseAttrs, cls, race, affinity])

  const pointsSpent = useMemo(() =>
    Object.values(baseAttrs).reduce((a, b) => a + b, 0) - (ATTR_MIN * 6)
  , [baseAttrs])

  const pointsLeft = BASE_POINTS - pointsSpent
  const computedHp = cls ? cls.baseHp + ((finalAttrs.vit || 0) * 2) : 0

  function getCap(attrId) {
    if (!cls) return ATTR_MAX_BASE
    return cls.attrCaps?.[attrId] ?? ATTR_MAX_BASE
  }

  function handleSlider(attrId, newVal) {
    const cap = getCap(attrId)
    const clamped = Math.max(ATTR_MIN, Math.min(cap, newVal))
    const current = baseAttrs[attrId]
    const delta = clamped - current
    if (delta === 0) return
    if (delta < 0) { setBaseAttrs(prev => ({ ...prev, [attrId]: clamped })); return }
    if (delta > 0 && pointsLeft >= delta) setBaseAttrs(prev => ({ ...prev, [attrId]: clamped }))
  }

  async function handleBegin() {
    if (!name.trim() || !cls || !race || !affinity) return
    setLoading(true)
    try {
      // Build proper item objects for equipment and inventory
      const { equipment, inventory } = buildStartingItems(cls)

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          class: cls.name,
          race: race.name,
          affinity: affinity.name,
          appearance: appearance.trim(),
          backstory: backstory.trim(),
          hp: computedHp,
          max_hp: computedHp,
          gold: 10,
          level: 1,
          inventory,      // array of item objects
          equipment,      // object with slot keys, each a proper item object
          attributes: finalAttrs,
          abilities: [],
          campaign_id: campaignId || null,
        })
        .select().single()

      if (playerError) throw playerError

      await setPlayer(player)
      setCreatedPlayer(player)

      const avatarPrompt = await generateAvatarPrompt(cls, race, affinity, appearance)
      const seed = Math.abs(
        name.trim().split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 997 +
        cls.id.length * 31 + race.id.length * 17
      ) % 99999
      const avatarPollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(avatarPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`
      await supabase.from('players').update({
        avatar_url: avatarPollUrl, avatar_seed: seed, avatar_prompt: avatarPrompt
      }).eq('id', player.id)

      setAvatarUrl(avatarPollUrl)
      setShowReveal(true)
      setLoading(false)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  function handleEnterRealm() {
    if (!createdPlayer || !campaignId) return
    if (isHost) {
      navigate(`/lobby?campaignId=${campaignId}`)
    } else {
      navigate(`/lobby?campaignId=${campaignId}&room=${joinRoomCode}&guest=true`)
    }
  }

  const canProceed = () => {
    if (step === 0) return !!selectedClass
    if (step === 1) return !!selectedRace
    if (step === 2) return !!selectedAffinity
    if (step === 3) return pointsLeft === 0
    if (step === 4) return !!name.trim()
    return false
  }

  // ─── REVEAL ───────────────────────────────────────────────────────────────
  if (showReveal) {
    const { equipment } = cls ? buildStartingItems(cls) : { equipment: {} }
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 30%, #1e1535 0%, #0a0812 70%)', gap: '20px', padding: '32px', overflowY: 'auto' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '4px', color: 'var(--text-dim)' }}>YOUR HERO AWAKENS</div>

        <div style={{ width: '180px', height: '180px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--gold)', boxShadow: '0 0 40px rgba(201,168,76,0.4)', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
          {!imageLoaded && <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '2px', color: 'var(--text-dim)', textAlign: 'center', padding: '16px' }}>✨<br/>CONJURING<br/>YOUR FORM...</div>}
          <img src={avatarUrl} alt="Character" onLoad={() => setImageLoaded(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imageLoaded ? 1 : 0, transition: 'opacity 0.8s', position: 'absolute', inset: 0 }} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '26px', color: 'var(--gold-light)', letterSpacing: '4px', marginBottom: '6px' }}>{name}</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '3px', color: 'var(--text-dim)' }}>{race?.name} {cls?.name} · {affinity?.icon} {affinity?.name}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%', maxWidth: '320px' }}>
          {ATTRS.map(attr => (
            <div key={attr.id} style={{ background: 'var(--bg2)', border: `1px solid ${attr.color}44`, borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px' }}>{attr.icon}</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>{attr.name.slice(0, 3).toUpperCase()}</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: attr.color, fontWeight: 'bold' }}>{finalAttrs[attr.id] || 0}</div>
            </div>
          ))}
        </div>

        {/* Starting equipment preview */}
        <div style={{ width: '100%', maxWidth: '320px' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px', textAlign: 'center' }}>STARTING EQUIPMENT</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.values(equipment).filter(Boolean).map(item => (
              <div key={item.id} style={{ background: 'var(--bg2)', border: `1px solid ${RARITY_COLORS[item.rarity] || '#9e9e9e'}44`, borderRadius: '6px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: RARITY_COLORS[item.rarity] || 'var(--text-dim)' }}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)', letterSpacing: '2px' }}>❤️ {computedHp} HP · 🪙 10 Gold</div>

        <button onClick={handleEnterRealm} style={{ padding: '14px 40px', background: 'linear-gradient(135deg, #2a1f0a, #3d2e10)', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold-light)', fontFamily: "'Cinzel', serif", fontSize: '13px', letterSpacing: '3px', cursor: 'pointer', boxShadow: '0 0 30px rgba(201,168,76,0.2)' }}>
          BACK TO LOBBY →
        </button>
      </div>
    )
  }

  // ─── MAIN FLOW ────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflowY: 'auto' }}>

      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '18px', color: 'var(--gold-light)', letterSpacing: '2px' }}>Create Your Hero</div>
        <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '4px' }}>Forge your legend in the realm of Lorecraft</div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '10px', opacity: 0.4 }} />
      </div>

      <div style={{ padding: '14px 20px 0', display: 'flex', gap: '6px' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '100%', height: '3px', borderRadius: '2px', background: i <= step ? 'var(--gold)' : 'var(--border)', transition: 'background 0.3s' }} />
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '8px', letterSpacing: '1px', color: i === step ? 'var(--gold)' : i < step ? 'var(--text-dim)' : '#3a3050' }}>{s.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 0: CLASS ── */}
      {step === 0 && (
        <div style={{ padding: '16px 20px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '10px' }}>CHOOSE YOUR CLASS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {CLASSES.map(c => (
              <div key={c.id} onClick={() => setSelectedClass(c.id)} style={{ background: selectedClass === c.id ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${selectedClass === c.id ? c.color : 'var(--border)'}`, borderTop: selectedClass === c.id ? `2px solid ${c.color}` : `1px solid var(--border)`, borderRadius: '8px', padding: '14px 10px', cursor: 'pointer', boxShadow: selectedClass === c.id ? `0 0 20px ${c.color}22` : 'none' }}>
                <div style={{ fontSize: '26px', marginBottom: '6px' }}>{c.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '1px', color: 'var(--gold-light)', marginBottom: '3px' }}>{c.name.toUpperCase()}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: '6px' }}>{c.desc}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: c.color }}>❤️ {c.baseHp} base HP</div>
                <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {Object.entries(c.attrBonus).map(([k, v]) => (
                    <span key={k} style={{ fontSize: '8px', color: '#27ae60', background: 'rgba(39,174,96,0.1)', borderRadius: '3px', padding: '1px 4px' }}>+{v} {k.toUpperCase()}</span>
                  ))}
                </div>
                {Object.keys(c.attrCaps).length > 0 && (
                  <div style={{ marginTop: '3px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {Object.entries(c.attrCaps).map(([k, v]) => (
                      <span key={k} style={{ fontSize: '8px', color: '#c0392b', background: 'rgba(192,57,43,0.1)', borderRadius: '3px', padding: '1px 4px' }}>max {v} {k.toUpperCase()}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 1: RACE ── */}
      {step === 1 && (
        <div style={{ padding: '16px 20px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '10px' }}>CHOOSE YOUR RACE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {RACES.map(r => (
              <div key={r.id} onClick={() => setSelectedRace(r.id)} style={{ background: selectedRace === r.id ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${selectedRace === r.id ? 'var(--gold)' : 'var(--border)'}`, borderTop: selectedRace === r.id ? `2px solid var(--gold)` : `1px solid var(--border)`, borderRadius: '8px', padding: '14px 10px', cursor: 'pointer', boxShadow: selectedRace === r.id ? `0 0 20px rgba(201,168,76,0.15)` : 'none' }}>
                <div style={{ fontSize: '26px', marginBottom: '6px' }}>{r.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '1px', color: 'var(--gold-light)', marginBottom: '3px' }}>{r.name.toUpperCase()}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: '6px' }}>{r.desc}</div>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                  {Object.entries(r.bonus).map(([k, v]) => (
                    <span key={k} style={{ fontSize: '8px', color: v > 0 ? '#27ae60' : '#c0392b', background: v > 0 ? 'rgba(39,174,96,0.1)' : 'rgba(192,57,43,0.1)', borderRadius: '3px', padding: '1px 4px' }}>{v > 0 ? '+' : ''}{v} {k.toUpperCase()}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: AFFINITY ── */}
      {step === 2 && (
        <div style={{ padding: '16px 20px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '10px' }}>CHOOSE YOUR AFFINITY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {AFFINITIES.map(a => (
              <div key={a.id} onClick={() => setSelectedAffinity(a.id)} style={{ background: selectedAffinity === a.id ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${selectedAffinity === a.id ? a.color : 'var(--border)'}`, borderTop: selectedAffinity === a.id ? `2px solid ${a.color}` : `1px solid var(--border)`, borderRadius: '8px', padding: '14px 10px', cursor: 'pointer', boxShadow: selectedAffinity === a.id ? `0 0 20px ${a.color}33` : 'none' }}>
                <div style={{ fontSize: '26px', marginBottom: '6px' }}>{a.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '1px', color: 'var(--gold-light)', marginBottom: '6px' }}>{a.name.toUpperCase()}</div>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                  {Object.entries(a.bonus).map(([k, v]) => (
                    <span key={k} style={{ fontSize: '8px', color: '#27ae60', background: 'rgba(39,174,96,0.1)', borderRadius: '3px', padding: '1px 4px' }}>+{v} {k.toUpperCase()}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 3: ATTRIBUTES ── */}
      {step === 3 && cls && (
        <div style={{ padding: '16px 20px 0', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)' }}>DISTRIBUTE ATTRIBUTES</div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '1px', color: pointsLeft === 0 ? '#27ae60' : pointsLeft < 15 ? '#f39c12' : 'var(--gold)', padding: '3px 10px', borderRadius: '4px', background: pointsLeft === 0 ? 'rgba(39,174,96,0.1)' : 'rgba(201,168,76,0.1)', border: `1px solid ${pointsLeft === 0 ? '#27ae60' : 'rgba(201,168,76,0.3)'}` }}>
              {pointsLeft === 0 ? '✓ ALL SPENT' : `${pointsLeft} pts left`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ATTRS.map(attr => {
              const base = baseAttrs[attr.id]
              const final = finalAttrs[attr.id] || 0
              const cap = getCap(attr.id)
              const bonus = final - base
              const fillPct = cap === ATTR_MIN ? 0 : ((base - ATTR_MIN) / (cap - ATTR_MIN)) * 100
              return (
                <div key={attr.id} style={{ background: 'var(--bg2)', border: `1px solid ${attr.color}33`, borderLeft: `3px solid ${attr.color}`, borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{attr.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: 'var(--gold-light)', letterSpacing: '1px' }}>{attr.name.toUpperCase()}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic' }}>{attr.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: attr.color, fontWeight: 'bold' }}>{final}</span>
                      {bonus !== 0 && <span style={{ fontSize: '10px', color: bonus > 0 ? '#27ae60' : '#c0392b', marginLeft: '4px' }}>{bonus > 0 ? `+${bonus}` : bonus}</span>}
                    </div>
                  </div>
                  <input type="range" min={ATTR_MIN} max={cap} value={base}
                    onChange={e => handleSlider(attr.id, parseInt(e.target.value))}
                    className="attr-slider"
                    style={{ width: '100%', height: '6px', WebkitAppearance: 'none', appearance: 'none', borderRadius: '3px', outline: 'none', cursor: 'pointer', background: `linear-gradient(to right, ${attr.color} 0%, ${attr.color} ${fillPct}%, rgba(255,255,255,0.08) ${fillPct}%, rgba(255,255,255,0.08) 100%)` }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>{ATTR_MIN}</span>
                    {cls.attrCaps?.[attr.id] && <span style={{ fontSize: '8px', color: '#c0392b88' }}>cap: {cap}</span>}
                    <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>{cap}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px' }}>COMPUTED HP</div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#e74c3c' }}>❤️ {computedHp}</div>
          </div>

          {pointsLeft > 0 && (
            <div style={{ marginTop: '10px', fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#f39c12', letterSpacing: '1px', textAlign: 'center', padding: '8px', background: 'rgba(243,156,18,0.05)', borderRadius: '6px', border: '1px solid rgba(243,156,18,0.2)' }}>
              Drag the sliders to spend all {pointsLeft} remaining point{pointsLeft !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: IDENTITY ── */}
      {step === 4 && (
        <div style={{ padding: '16px 20px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '7px' }}>YOUR NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name..." maxLength={24}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 14px', color: 'var(--gold-light)', fontSize: '17px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '7px' }}>APPEARANCE <span style={{ color: '#3a3050' }}>— OPTIONAL</span></div>
            <textarea value={appearance} onChange={e => setAppearance(e.target.value)} placeholder="Describe your character's looks..." maxLength={300} rows={3}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none', resize: 'none', lineHeight: 1.5, fontFamily: "'EB Garamond', serif", boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '7px' }}>BACKSTORY <span style={{ color: '#3a3050' }}>— OPTIONAL</span></div>
            <textarea value={backstory} onChange={e => setBackstory(e.target.value)} placeholder="Who are you? What drives you?" maxLength={500} rows={4}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none', resize: 'none', lineHeight: 1.5, fontFamily: "'EB Garamond', serif", boxSizing: 'border-box' }} />
          </div>
          {cls && race && affinity && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '10px' }}>CHARACTER SUMMARY</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {[{ icon: cls.icon, label: cls.name, color: cls.color }, { icon: race.icon, label: race.name, color: 'var(--gold)' }, { icon: affinity.icon, label: affinity.name, color: affinity.color }].map(item => (
                  <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: '4px', padding: '5px 10px', fontFamily: "'Cinzel', serif", fontSize: '10px', color: item.color }}>{item.icon} {item.label}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {ATTRS.map(attr => (
                  <div key={attr.id} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{attr.icon} {attr.name.slice(0, 3).toUpperCase()}</div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: attr.color }}>{finalAttrs[attr.id]}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '8px', fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#e74c3c', textAlign: 'center' }}>❤️ {computedHp} HP · 🪙 10 Gold</div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={{ padding: '16px 20px 28px', display: 'flex', gap: '10px' }}>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} style={{ padding: '12px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>BACK</button>
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canProceed()} style={{ flex: 1, padding: '12px', background: canProceed() ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)', border: `1px solid ${canProceed() ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: canProceed() ? 'var(--gold-light)' : 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '3px', boxShadow: canProceed() ? '0 0 30px rgba(201,168,76,0.2)' : 'none', transition: 'all 0.3s', cursor: canProceed() ? 'pointer' : 'not-allowed' }}>NEXT →</button>
        ) : (
          <button onClick={handleBegin} disabled={!canProceed() || loading} style={{ flex: 1, padding: '12px', background: canProceed() ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)', border: `1px solid ${canProceed() ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', color: canProceed() ? 'var(--gold-light)' : 'var(--text-dim)', fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '3px', boxShadow: canProceed() ? '0 0 30px rgba(201,168,76,0.2)' : 'none', transition: 'all 0.3s', cursor: canProceed() && !loading ? 'pointer' : 'not-allowed' }}>
            {loading ? 'FORGING YOUR LEGEND...' : 'ENTER THE REALM'}
          </button>
        )}
      </div>

      <style>{`
        input[type=range].attr-slider { -webkit-appearance: none; appearance: none; }
        input[type=range].attr-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; }
        input[type=range].attr-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--gold); cursor: pointer; border: 2px solid #0a0812; box-shadow: 0 0 10px rgba(201,168,76,0.7); margin-top: -7px; }
        input[type=range].attr-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: var(--gold); cursor: pointer; border: 2px solid #0a0812; box-shadow: 0 0 10px rgba(201,168,76,0.7); }
        input[type=range].attr-slider::-moz-range-track { height: 6px; border-radius: 3px; background: transparent; }
        input[type=range].attr-slider:focus { outline: none; }
      `}</style>
    </div>
  )
}