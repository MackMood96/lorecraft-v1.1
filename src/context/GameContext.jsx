import { createContext, useContext, useState } from 'react'

const GameContext = createContext()

export function GameProvider({ children }) {
  const [player, setPlayer] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [messages, setMessages] = useState([])
  const [gameState, setGameState] = useState({
    hp: 100,
    maxHp: 100,
    gold: 10,
    level: 1,
    inventory: [],
    location: 'Unknown',
    turn: 0
  })

  function updateGameState(updates) {
    setGameState(prev => ({ ...prev, ...updates }))
  }

  function addMessage(message) {
    setMessages(prev => [...prev, message])
  }

  return (
    <GameContext.Provider value={{
      player, setPlayer,
      campaign, setCampaign,
      messages, setMessages,
      gameState, updateGameState,
      addMessage
    }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  return useContext(GameContext)
}
