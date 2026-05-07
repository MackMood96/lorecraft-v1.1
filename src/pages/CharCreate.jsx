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

const RACES = [
  { id: 'human', name: 'Human', icon: '👤', desc: 'Versatile and ambitious' },
  { id: 'elf', name: 'Elf', icon: '🧝', desc: 'Graceful and long-lived' },
  { id: 'dwarf', name: 'Dwarf', icon: '⛏️', desc: 'Sturdy and resilient' },
  { id: 'orc', name: 'Orc', icon: '💪', desc: 'Powerful and fierce' },
  { id: 'halfling', name: 'Halfling', icon: '🍀', desc: 'Lucky and nimble' },
  { id: 'tiefling', name: 'Tiefling', icon: '😈', desc: 'Infernal and charismatic' },
  { id: 'dragonborn', name: 'Dragonborn', icon: '🐉', desc: 'Draconic and proud' },
  { id: 'undead', name: 'Undead', icon: '💀', desc: 'Cursed and relentless' },
]

const AFFINITIES = [
  { id: 'fire', name: 'Fire', icon: '🔥', color: '#e74c3c' },
  { id: 'shadow', name: 'Shadow', icon: '🌑', color: '#8e44ad' },
  { id: 'nature', name: 'Nature', icon: '🌿', color: '#27ae60' },
  { id: 'arcane', name: 'Arcane', icon: '✨', color: '#2980b9' },
  { id: 'thunder', name: 'Thunder', icon: '⚡', color: '#f39c12' },
  { id: 'ice', name: 'Ice', icon: '❄️', color: '#00bcd4' },
  { id: 'light', name: 'Light', icon: '🌟', color: '#f1c40f' },
  { id: 'blood', name: 'Blood', icon: '🩸', color: '#c0392b' },
]

const STEPS = ['Class', 'Race', 'Affinity', 'Identity']

function buildAvatarPrompt(cls, race, affinity, appearance) {
  const base = `fantasy portrait, ${race.name} ${cls.name}, ${affinity.name} affinity magic`
  const detail = appearance ? `, ${appearance}` : ''
  const style = ', highly detailed, dramatic lighting, dark fantasy art style, digital painting, face focus'
  return encodeURIComponent(base + detail + style)
}

export default function CharCreate() {
  const navigate = useNavigate()
  const { setPlayer, updateGameState } = useGame()
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
  const [campaignData, setCampaignData] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  async function handleBegin() {
    if (!name.trim() || !selectedClass || !selectedRace || !selectedAffinity) return
    setLoading(true)

    const cls = CLASSES.find(c => c.id === selectedClass)
    const race = RACES.find(r => r.id === selectedRace)
    const affinity = AFFINITIES.find(a => a.id === selectedAffinity)
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    try {
      const { data: campaign, error: campError } = await supabase
        .from('campaigns')
        .insert({ room_code: roomCode, name: `${name}'s Campaign` })
        .select()
        .single()

      if (campError) throw campError

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          class: cls.name,
          race: race.name,
          affinity: affinity.name,
          appearance: appearance.trim(),
          backstory: backstory.trim(),
          hp: cls.hp,
          max_hp: cls.hp,
          gold: 10,
          level: 1,
          inventory: cls.inventory
        })
        .select()
        .single()

      if (playerError) throw playerError

      setPlayer(player)
      updateGameState({
        hp: cls.hp,
        maxHp: cls.hp,
        inventory: cls.inventory,
        gold: 10,
        level: 1
      })

      const prompt = buildAvatarPrompt(cls, race, affinity, appearance)
const url = `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&nologo=true&seed=${Date.now()}`
console.log('Avatar URL:', url)

try {
  const imgResponse = await fetch(url)
  const blob = await imgResponse.blob()
  const blobUrl = URL.createObjectURL(blob)
  setAvatarUrl(blobUrl)
} catch {
  setAvatarUrl(url)
}
      setCampaignData({ id: campaign.id, roomCode })
      setShowReveal(true)
      setLoading(false)

    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (step === 0) return !!selectedClass
    if (step === 1) return !!selectedRace
    if (step === 2) return !!selectedAffinity
    if (step === 3) return !!name.trim()
    return false
  }

  if (showReveal) {
    const cls = CLASSES.find(c => c.id === selectedClass)
    const race = RACES.find(r => r.id === selectedRace)
    const affinity = AFFINITIES.find(a => a.id === selectedAffinity)

    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #1e1535 0%, #0a0812 70%)',
        gap: '24px',
        animation: 'fadeIn 1s ease forwards',
        padding: '32px'
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          letterSpacing: '4px',
          color: 'var(--text-dim)'
        }}>
          YOUR HERO AWAKENS
        </div>

        <div style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid var(--gold)',
          boxShadow: '0 0 40px rgba(201,168,76,0.4)',
          animation: 'glowPulse 2s ease-in-out infinite',
          background: 'var(--bg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {!imageLoaded && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '10px',
              letterSpacing: '2px',
              color: 'var(--text-dim)',
              textAlign: 'center',
              padding: '16px',
              zIndex: 1
            }}>
              ✨<br/>CONJURING<br/>YOUR FORM...
            </div>
          )}
          <img
            src={avatarUrl}
            alt="Your character"
            onLoad={() => setImageLoaded(true)}
            onError={e => console.log('Image failed to load:', e)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.8s ease',
              position: 'absolute',
              top: 0,
              left: 0
            }}
          />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: '28px',
            color: 'var(--gold-light)',
            letterSpacing: '4px',
            marginBottom: '8px'
          }}>
            {name}
          </div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            letterSpacing: '3px',
            color: 'var(--text-dim)'
          }}>
            {race?.name} {cls?.name} · {affinity?.icon} {affinity?.name}
          </div>
        </div>

        {appearance && (
          <div style={{
            fontStyle: 'italic',
            color: 'var(--text-dim)',
            fontSize: '14px',
            textAlign: 'center',
            maxWidth: '300px',
            lineHeight: 1.6
          }}>
            "{appearance}"
          </div>
        )}

        <button
          onClick={() => navigate(`/game/${campaignData.id}?room=${campaignData.roomCode}&host=true`)}
          style={{
            marginTop: '8px',
            padding: '14px 40px',
            background: 'linear-gradient(135deg, #2a1f0a, #3d2e10)',
            border: '1px solid var(--gold)',
            borderRadius: '4px',
            color: 'var(--gold-light)',
            fontFamily: "'Cinzel', serif",
            fontSize: '13px',
            letterSpacing: '3px',
            cursor: 'pointer',
            boxShadow: '0 0 30px rgba(201,168,76,0.2)'
          }}>
          ENTER THE REALM →
        </button>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes glowPulse {
            0%, 100% { box-shadow: 0 0 40px rgba(201,168,76,0.4); }
            50% { box-shadow: 0 0 60px rgba(201,168,76,0.7); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflowY: 'auto'
    }}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '20px', color: 'var(--gold-light)', letterSpacing: '2px' }}>
          Create Your Hero
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '4px' }}>
          Who will you become in the realm of Lorecraft?
        </div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: '12px', opacity: 0.4 }}/>
      </div>

      <div style={{ padding: '16px 24px 0', display: 'flex', gap: '8px' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '100%', height: '3px', borderRadius: '2px',
              background: i <= step ? 'var(--gold)' : 'var(--border)',
              transition: 'background 0.3s'
            }}/>
            <div style={{
              fontFamily: "'Cinzel', serif", fontSize: '9px', letterSpacing: '1px',
              color: i === step ? 'var(--gold)' : i < step ? 'var(--text-dim)' : '#3a3050'
            }}>
              {s.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {step === 0 && (
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
                  borderTop: selectedClass === cls.id ? `2px solid ${cls.color}` : `1px solid var(--border)`,
                  borderRadius: '8px', padding: '16px 12px', cursor: 'pointer',
                  boxShadow: selectedClass === cls.id ? `0 0 20px ${cls.color}22` : 'none'
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
      )}

      {step === 1 && (
        <div style={{ padding: '20px 24px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
            CHOOSE YOUR RACE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {RACES.map(race => (
              <div
                key={race.id}
                onClick={() => setSelectedRace(race.id)}
                style={{
                  background: selectedRace === race.id ? 'var(--bg3)' : 'var(--bg2)',
                  border: `1px solid ${selectedRace === race.id ? 'var(--gold)' : 'var(--border)'}`,
                  borderTop: selectedRace === race.id ? `2px solid var(--gold)` : `1px solid var(--border)`,
                  borderRadius: '8px', padding: '16px 12px', cursor: 'pointer',
                  boxShadow: selectedRace === race.id ? `0 0 20px rgba(201,168,76,0.15)` : 'none'
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{race.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '1px', color: 'var(--gold-light)', marginBottom: '4px' }}>
                  {race.name.toUpperCase()}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  {race.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: '20px 24px 0', flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
            CHOOSE YOUR AFFINITY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {AFFINITIES.map(aff => (
              <div
                key={aff.id}
                onClick={() => setSelectedAffinity(aff.id)}
                style={{
                  background: selectedAffinity === aff.id ? 'var(--bg3)' : 'var(--bg2)',
                  border: `1px solid ${selectedAffinity === aff.id ? aff.color : 'var(--border)'}`,
                  borderTop: selectedAffinity === aff.id ? `2px solid ${aff.color}` : `1px solid var(--border)`,
                  borderRadius: '8px', padding: '16px 12px', cursor: 'pointer',
                  boxShadow: selectedAffinity === aff.id ? `0 0 20px ${aff.color}33` : 'none'
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{aff.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '1px', color: 'var(--gold-light)' }}>
                  {aff.name.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: '20px 24px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px' }}>
              YOUR NAME
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={24}
              style={{
                width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '12px 16px', color: 'var(--gold-light)',
                fontSize: '18px', outline: 'none'
              }}
            />
          </div>

          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px' }}>
              APPEARANCE <span style={{ color: '#3a3050' }}>— OPTIONAL</span>
            </div>
            <textarea
              value={appearance}
              onChange={e => setAppearance(e.target.value)}
              placeholder="Describe how your character looks... (hair, eyes, build, clothing, scars etc.)"
              maxLength={300}
              rows={3}
              style={{
                width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '12px 16px', color: 'var(--text)',
                fontSize: '14px', outline: 'none', resize: 'none', lineHeight: 1.5,
                fontFamily: "'EB Garamond', serif"
              }}
            />
          </div>

          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '8px' }}>
              BACKSTORY <span style={{ color: '#3a3050' }}>— OPTIONAL</span>
            </div>
            <textarea
              value={backstory}
              onChange={e => setBackstory(e.target.value)}
              placeholder="Who are you? What drives you? What secrets do you carry..."
              maxLength={500}
              rows={4}
              style={{
                width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '12px 16px', color: 'var(--text)',
                fontSize: '14px', outline: 'none', resize: 'none', lineHeight: 1.5,
                fontFamily: "'EB Garamond', serif"
              }}
            />
          </div>

          {selectedClass && selectedRace && selectedAffinity && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '16px'
            }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--text-dim)', marginBottom: '12px' }}>
                CHARACTER SUMMARY
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--bg3)', borderRadius: '4px', padding: '6px 12px', fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)' }}>
                  {CLASSES.find(c => c.id === selectedClass)?.icon} {CLASSES.find(c => c.id === selectedClass)?.name}
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: '4px', padding: '6px 12px', fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)' }}>
                  {RACES.find(r => r.id === selectedRace)?.icon} {RACES.find(r => r.id === selectedRace)?.name}
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: '4px', padding: '6px 12px', fontFamily: "'Cinzel', serif", fontSize: '11px', color: 'var(--gold)' }}>
                  {AFFINITIES.find(a => a.id === selectedAffinity)?.icon} {AFFINITIES.find(a => a.id === selectedAffinity)?.name}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '20px 24px 32px', display: 'flex', gap: '12px' }}>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              padding: '14px 20px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-dim)',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              letterSpacing: '2px'
            }}>
            BACK
          </button>
        )}

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            style={{
              flex: 1, padding: '14px',
              background: canProceed() ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)',
              border: `1px solid ${canProceed() ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: '4px',
              color: canProceed() ? 'var(--gold-light)' : 'var(--text-dim)',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              letterSpacing: '3px',
              boxShadow: canProceed() ? '0 0 30px rgba(201,168,76,0.2)' : 'none',
              transition: 'all 0.3s'
            }}>
            NEXT →
          </button>
        ) : (
          <button
            onClick={handleBegin}
            disabled={!canProceed() || loading}
            style={{
              flex: 1, padding: '14px',
              background: canProceed() ? 'linear-gradient(135deg, #2a1f0a, #3d2e10)' : 'var(--bg2)',
              border: `1px solid ${canProceed() ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: '4px',
              color: canProceed() ? 'var(--gold-light)' : 'var(--text-dim)',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              letterSpacing: '3px',
              boxShadow: canProceed() ? '0 0 30px rgba(201,168,76,0.2)' : 'none',
              transition: 'all 0.3s'
            }}>
            {loading ? 'FORGING YOUR LEGEND...' : 'ENTER THE REALM'}
          </button>
        )}
      </div>
    </div>
  )
}