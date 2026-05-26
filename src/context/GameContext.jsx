import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const GameContext = createContext()

export function GameProvider({ children }) {
  const [player, setPlayerState] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [messages, setMessages] = useState([])
  const [currentRoll, setCurrentRoll] = useState(null)
  const [gameState, setGameState] = useState({
    hp: 100,
    maxHp: 100,
    gold: 10,
    level: 1,
    inventory: [],
    equipment: {},
    attributes: {},
    abilities: [],
  })

  // ─── SET PLAYER + SYNC STATE FROM DB ─────────────────────────────────────
  const setPlayer = useCallback(async (playerData) => {
    if (!playerData) { setPlayerState(null); return }
    setPlayerState(playerData)
    setGameState({
      hp: playerData.hp ?? 100,
      maxHp: playerData.max_hp ?? 100,
      gold: playerData.gold ?? 10,
      level: playerData.level ?? 1,
      inventory: playerData.inventory ?? [],
      equipment: playerData.equipment ?? {},
      attributes: playerData.attributes ?? {},
      abilities: playerData.abilities ?? [],
    })
  }, [])

  // ─── PERSIST EVERY STATE CHANGE TO SUPABASE ───────────────────────────────
  const persistToDb = useCallback(async (playerId, updates) => {
    if (!playerId) return
    const dbUpdates = {}
    if (updates.hp !== undefined) dbUpdates.hp = updates.hp
    if (updates.maxHp !== undefined) dbUpdates.max_hp = updates.maxHp
    if (updates.gold !== undefined) dbUpdates.gold = updates.gold
    if (updates.level !== undefined) dbUpdates.level = updates.level
    if (updates.inventory !== undefined) dbUpdates.inventory = updates.inventory
    if (updates.equipment !== undefined) dbUpdates.equipment = updates.equipment
    if (updates.attributes !== undefined) dbUpdates.attributes = updates.attributes
    if (updates.abilities !== undefined) dbUpdates.abilities = updates.abilities
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('players').update(dbUpdates).eq('id', playerId)
      if (error) console.error('Failed to persist state:', error)
    }
  }, [])

  // ─── UPDATE GAME STATE + PERSIST ─────────────────────────────────────────
  const updateGameState = useCallback((updates, playerId = null) => {
    setGameState(prev => {
      const next = { ...prev, ...updates }
      const id = playerId || player?.id
      if (id) persistToDb(id, updates)
      return next
    })
  }, [player, persistToDb])

  // ─── ADD ITEM TO INVENTORY ────────────────────────────────────────────────
  const addInventoryItem = useCallback(async (item, playerId = null) => {
    const id = playerId || player?.id
    setGameState(prev => {
      const newInventory = [...(prev.inventory || []), item]
      if (id) persistToDb(id, { inventory: newInventory })
      return { ...prev, inventory: newInventory }
    })
  }, [player, persistToDb])

  // ─── REMOVE ITEM FROM INVENTORY ───────────────────────────────────────────
  const removeInventoryItem = useCallback(async (itemName, playerId = null) => {
    const id = playerId || player?.id
    setGameState(prev => {
      const newInventory = (prev.inventory || []).filter(i =>
        !i.toLowerCase().includes(itemName.toLowerCase())
      )
      if (id) persistToDb(id, { inventory: newInventory })
      return { ...prev, inventory: newInventory }
    })
  }, [player, persistToDb])

  // ─── GIVE ITEM TO ANOTHER PLAYER (direct Supabase transfer) ──────────────
  const giveItemToPlayer = useCallback(async (itemName, toPlayerName, campaignId) => {
    if (!player || !campaignId) return { success: false, error: 'No player or campaign' }

    // Find item in current player inventory
    const currentInventory = gameState.inventory || []
    const itemIndex = currentInventory.findIndex(i =>
      i.toLowerCase().includes(itemName.toLowerCase())
    )
    if (itemIndex === -1) return { success: false, error: 'Item not found in inventory' }

    const item = currentInventory[itemIndex]

    // Remove from current player
    const newInventory = currentInventory.filter((_, i) => i !== itemIndex)
    setGameState(prev => ({ ...prev, inventory: newInventory }))
    await supabase.from('players').update({ inventory: newInventory }).eq('id', player.id)

    // Find recipient player in same campaign
    const { data: recipient, error } = await supabase
      .from('players')
      .select('id, inventory, name')
      .eq('name', toPlayerName)
      .eq('campaign_id', campaignId)
      .single()

    if (error || !recipient) {
      // Rollback
      setGameState(prev => ({ ...prev, inventory: currentInventory }))
      await supabase.from('players').update({ inventory: currentInventory }).eq('id', player.id)
      return { success: false, error: 'Recipient not found' }
    }

    // Add to recipient
    const recipientInventory = [...(recipient.inventory || []), item]
    await supabase.from('players').update({ inventory: recipientInventory }).eq('id', recipient.id)

    return { success: true, item, recipient: recipient.name }
  }, [player, gameState.inventory])

  // ─── GIVE GOLD TO ANOTHER PLAYER ─────────────────────────────────────────
  const giveGoldToPlayer = useCallback(async (amount, toPlayerName, campaignId) => {
    if (!player || !campaignId) return { success: false, error: 'No player or campaign' }
    const amt = parseInt(amount)
    if (isNaN(amt) || amt <= 0) return { success: false, error: 'Invalid amount' }
    if ((gameState.gold || 0) < amt) return { success: false, error: 'Not enough gold' }

    // Deduct from current player
    const newGold = (gameState.gold || 0) - amt
    setGameState(prev => ({ ...prev, gold: newGold }))
    await supabase.from('players').update({ gold: newGold }).eq('id', player.id)

    // Find recipient
    const { data: recipient, error } = await supabase
      .from('players')
      .select('id, gold, name')
      .eq('name', toPlayerName)
      .eq('campaign_id', campaignId)
      .single()

    if (error || !recipient) {
      // Rollback
      setGameState(prev => ({ ...prev, gold: gameState.gold }))
      await supabase.from('players').update({ gold: gameState.gold }).eq('id', player.id)
      return { success: false, error: 'Recipient not found' }
    }

    // Add to recipient
    const recipientGold = (recipient.gold || 0) + amt
    await supabase.from('players').update({ gold: recipientGold }).eq('id', recipient.id)

    return { success: true, amount: amt, recipient: recipient.name }
  }, [player, gameState.gold])

  // ─── DICE ROLL ────────────────────────────────────────────────────────────
  const rollDice = useCallback((sides = 20, modifier = 0, reason = '') => {
    const result = Math.floor(Math.random() * sides) + 1
    const total = result + modifier
    const roll = { result, total, sides, modifier, reason, timestamp: Date.now() }
    setCurrentRoll(roll)
    setTimeout(() => setCurrentRoll(null), 3500)
    return roll
  }, [])

  function addMessage(message) {
    setMessages(prev => [...prev, message])
  }

  return (
    <GameContext.Provider value={{
      player, setPlayer,
      campaign, setCampaign,
      messages, setMessages,
      gameState, updateGameState,
      addInventoryItem, removeInventoryItem,
      giveItemToPlayer, giveGoldToPlayer,
      currentRoll, rollDice, setCurrentRoll,
      addMessage,
    }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  return useContext(GameContext)
}