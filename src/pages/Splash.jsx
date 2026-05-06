import { useNavigate } from 'react-router-dom'

export default function Splash() {
  const navigate = useNavigate()

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #1e1535 0%, #0a0812 70%)',
      gap: '0'
    }}>

      {/* Emblem */}
      <svg width="140" height="140" viewBox="0 0 160 160" fill="none"
        style={{ filter: 'drop-shadow(0 0 20px rgba(201,168,76,0.5))', marginBottom: '-8px' }}>
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5e6c8"/>
            <stop offset="50%" stopColor="#c9a84c"/>
            <stop offset="100%" stopColor="#7a5c1e"/>
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="74" stroke="url(#sg)" strokeWidth="1" opacity="0.35"/>
        <path d="M80 22 L112 38 L112 78 Q112 108 80 126 Q48 108 48 78 L48 38 Z"
          fill="#1e1830" stroke="url(#sg)" strokeWidth="1.5"/>
        <path d="M52 68 Q52 62 58 60 L78 60 L78 96 Q68 94 58 96 Q52 94 52 88 Z"
          fill="#1a1530" stroke="url(#sg)" strokeWidth="1.2"/>
        <path d="M108 68 Q108 62 102 60 L82 60 L82 96 Q92 94 102 96 Q108 94 108 88 Z"
          fill="#1a1530" stroke="url(#sg)" strokeWidth="1.2"/>
        <rect x="78" y="60" width="4" height="36" fill="url(#sg)" rx="1"/>
        <line x1="59" y1="70" x2="75" y2="70" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="59" y1="76" x2="75" y2="76" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="59" y1="82" x2="75" y2="82" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="70" x2="101" y2="70" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="76" x2="101" y2="76" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <line x1="85" y1="82" x2="101" y2="82" stroke="#c9a84c" strokeWidth="0.7" opacity="0.5"/>
        <polygon points="93,89 94.5,92.5 98,94 94.5,95.5 93,99 91.5,95.5 88,94 91.5,92.5" fill="#c9a84c"/>
      </svg>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 4px' }}>
        <div style={{ width: '50px', height: '1px', background: 'linear-gradient(90deg, transparent, #c9a84c)' }}/>
        <div style={{ width: '4px', height: '4px', background: '#c9a84c', transform: 'rotate(45deg)' }}/>
        <div style={{ width: '50px', height: '1px', background: 'linear-gradient(90deg, #c9a84c, transparent)' }}/>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Cinzel Decorative', serif",
        fontWeight: 900,
        fontSize: '38px',
        letterSpacing: '6px',
        background: 'linear-gradient(180deg, #f5e6c8 0%, #c9a84c 50%, #7a5c1e 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 15px rgba(201,168,76,0.3))'
      }}>
        LORECRAFT
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '10px',
        letterSpacing: '10px',
        color: '#8a7040',
        marginTop: '6px'
      }}>
        AI DUNGEON MASTER
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '48px', width: '260px' }}>
        <button
          onClick={() => navigate('/create')}
          style={{
            padding: '14px',
            background: 'linear-gradient(135deg, #1e1830, #2a2045)',
            border: '1px solid #c9a84c',
            borderRadius: '4px',
            color: '#f5e6c8',
            fontSize: '13px',
            letterSpacing: '3px',
            boxShadow: '0 0 20px rgba(201,168,76,0.15)'
          }}>
          NEW GAME
        </button>

        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '14px',
            background: 'transparent',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '4px',
            color: '#8a7040',
            fontSize: '13px',
            letterSpacing: '3px'
          }}>
          JOIN CAMPAIGN
        </button>
      </div>

      <div style={{
        position: 'fixed',
        bottom: '30px',
        fontFamily: "'Cinzel', serif",
        fontSize: '9px',
        letterSpacing: '2px',
        color: '#2a2030'
      }}>
        v1.1 EARLY ACCESS
      </div>
    </div>
  )
}