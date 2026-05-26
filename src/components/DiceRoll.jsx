import { useEffect, useState } from 'react'

const FACE_DOTS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
}

function getOutcome(result, sides) {
  const pct = result / sides
  if (pct <= 0.15) return { label: 'CRITICAL FAIL', color: '#c0392b', glow: 'rgba(192,57,43,0.6)' }
  if (pct <= 0.35) return { label: 'FAIL', color: '#e74c3c', glow: 'rgba(231,76,60,0.4)' }
  if (pct <= 0.60) return { label: 'PARTIAL', color: '#f39c12', glow: 'rgba(243,156,18,0.4)' }
  if (pct <= 0.85) return { label: 'SUCCESS', color: '#27ae60', glow: 'rgba(39,174,96,0.4)' }
  return { label: 'CRITICAL HIT', color: '#ffd700', glow: 'rgba(255,215,0,0.6)' }
}

export default function DiceRoll({ roll, onDismiss }) {
  const [phase, setPhase] = useState('rolling') // 'rolling' | 'landing' | 'result' | 'fading'
  const [displayNumber, setDisplayNumber] = useState('?')

  useEffect(() => {
    if (!roll) return
    setPhase('rolling')
    setDisplayNumber('?')

    // Rapid number cycling during roll
    let count = 0
    const cycle = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * roll.sides) + 1)
      count++
      if (count > 12) {
        clearInterval(cycle)
        setPhase('landing')
        setDisplayNumber(roll.result)
        setTimeout(() => setPhase('result'), 400)
        setTimeout(() => setPhase('fading'), 2800)
        setTimeout(() => onDismiss?.(), 3200)
      }
    }, 80)

    return () => clearInterval(cycle)
  }, [roll])

  if (!roll || phase === 'fading' && false) return null

  const outcome = getOutcome(roll.result, roll.sides)
  const isD20 = roll.sides === 20

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500, pointerEvents: phase === 'result' ? 'auto' : 'none',
      background: phase === 'result' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
      transition: 'background 0.4s',
      opacity: phase === 'fading' ? 0 : 1,
      transition: 'opacity 0.4s, background 0.4s',
    }} onClick={() => { setPhase('fading'); setTimeout(() => onDismiss?.(), 400) }}>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        animation: phase === 'rolling' ? 'diceRoll 0.15s linear infinite' :
                   phase === 'landing' ? 'diceLand 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards' : 'none',
      }}>

        {/* Reason */}
        {roll.reason && (
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px',
            color: 'var(--text-dim)', textTransform: 'uppercase',
            opacity: phase === 'result' ? 1 : 0, transition: 'opacity 0.3s'
          }}>
            {roll.reason}
          </div>
        )}

        {/* Die */}
        <div style={{
          width: '120px', height: '120px', position: 'relative',
          filter: phase === 'result' ? `drop-shadow(0 0 30px ${outcome.glow})` : 'drop-shadow(0 0 10px rgba(201,168,76,0.3))',
          transition: 'filter 0.4s',
        }}>
          {isD20 ? (
            // D20 — triangle shape
            <svg viewBox="0 0 120 120" width="120" height="120">
              <defs>
                <linearGradient id="diceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={phase === 'result' ? outcome.color : '#c9a84c'} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={phase === 'result' ? outcome.color : '#7a5c1e'} stopOpacity="0.6"/>
                </linearGradient>
              </defs>
              <polygon points="60,8 112,98 8,98"
                fill="url(#diceGrad)"
                stroke={phase === 'result' ? outcome.color : '#c9a84c'}
                strokeWidth="2"/>
              <polygon points="60,22 98,88 22,88"
                fill="none"
                stroke={phase === 'result' ? outcome.color : '#c9a84c'}
                strokeWidth="0.8" opacity="0.5"/>
              <text x="60" y="72" textAnchor="middle"
                fontFamily="'Cinzel', serif" fontWeight="bold"
                fontSize={displayNumber >= 10 ? '26' : '30'}
                fill={phase === 'result' ? outcome.color : '#c9a84c'}>
                {displayNumber}
              </text>
              <text x="60" y="86" textAnchor="middle"
                fontFamily="'Cinzel', serif" fontSize="8" fill="#c9a84c44">
                d{roll.sides}
              </text>
            </svg>
          ) : (
            // D6 — square with dots
            <svg viewBox="0 0 100 100" width="120" height="120">
              <defs>
                <linearGradient id="diceGrad6" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={phase === 'result' ? outcome.color : '#c9a84c'} stopOpacity="0.2"/>
                  <stop offset="100%" stopColor={phase === 'result' ? outcome.color : '#7a5c1e'} stopOpacity="0.5"/>
                </linearGradient>
              </defs>
              <rect x="8" y="8" width="84" height="84" rx="14"
                fill="url(#diceGrad6)"
                stroke={phase === 'result' ? outcome.color : '#c9a84c'}
                strokeWidth="2"/>
              {(FACE_DOTS[Math.min(displayNumber, 6)] || FACE_DOTS[1]).map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="7"
                  fill={phase === 'result' ? outcome.color : '#c9a84c'}/>
              ))}
            </svg>
          )}
        </div>

        {/* Outcome label */}
        {phase === 'result' && (
          <div style={{
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: '18px',
            color: outcome.color,
            letterSpacing: '3px',
            textShadow: `0 0 20px ${outcome.glow}`,
            animation: 'fadeInUp 0.3s ease forwards'
          }}>
            {outcome.label}
          </div>
        )}

        {/* Result number + modifier */}
        {phase === 'result' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              fontFamily: "'Cinzel', serif", fontSize: '13px',
              color: 'var(--text-dim)', letterSpacing: '2px'
            }}>
              {roll.modifier !== 0 && (
                <span>{roll.result} {roll.modifier > 0 ? '+' : ''}{roll.modifier} = </span>
              )}
              <span style={{ color: outcome.color, fontSize: '16px' }}>{roll.total}</span>
            </div>
            {roll.reason && (
              <div style={{
                fontFamily: "'EB Garamond', serif", fontSize: '12px',
                color: 'var(--text-dim)', fontStyle: 'italic'
              }}>
                tap to continue
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes diceRoll {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(8deg) scale(1.05); }
          75% { transform: rotate(-8deg) scale(0.95); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes diceLand {
          0% { transform: scale(1.2) rotate(5deg); }
          60% { transform: scale(0.9) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}