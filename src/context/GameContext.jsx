import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const GameContext = createContext()

export function GameProvider({ children }) {
  const [player, setPlayerState] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [messages, setMessages] = useState([])
  const [currentRoll, setCurrentRoll] = useState(null)
  const [pendingGoldChange, setPendingGoldChange] = useState(null) // { amount, reason, currentGold }
  const [goldToast, setGoldToast] = useState(null) // { amount, reason } shown after confirmation
  const [gameState, setGameState] = useState({
    hp: 100,
    maxHp: 100,
    gold: 10,
    level: 1,
    inventory: [],   // array of item objects
    equipment: {     // equipped item objects by slot
      mainHand: null,
      offHand: null,
      armor: null,
      accessory: null,
    },
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
      equipment: playerData.equipment ?? { mainHand: null, offHand: null, armor: null, accessory: null },
      attributes: playerData.attributes ?? {},
      abilities: playerData.abilities ?? [],
    })
  }, [])

  // ─── PERSIST TO SUPABASE ──────────────────────────────────────────────────
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

  // ─── GOLD DELTA SYSTEM ────────────────────────────────────────────────────
  // Called by Game.jsx when DM fires <gold_change> tag
  // Reads fresh from DB, shows confirmation prompt to player
  const requestGoldChange = useCallback(async (amount, reason) => {
    if (!player?.id) return
    // Always read fresh from DB — never trust local state for gold
    const { data, error } = await supabase
      .from('players')
      .select('gold')
      .eq('id', player.id)
      .single()
    if (error || !data) { console.error('Failed to read gold from DB:', error); return }
    const currentGold = data.gold
    setPendingGoldChange({ amount, reason, currentGold })
  }, [player])

  // Player confirms the gold change
  const confirmGoldChange = useCallback(async () => {
    if (!pendingGoldChange || !player?.id) return
    const { amount, currentGold } = pendingGoldChange
    const newGold = Math.max(0, currentGold + amount)
    // Write directly to DB
    const { error } = await supabase
      .from('players')
      .update({ gold: newGold })
      .eq('id', player.id)
    if (error) { console.error('Failed to update gold:', error); return }
    // Update local state from confirmed DB value
    setGameState(prev => ({ ...prev, gold: newGold }))
    // Show toast
    setGoldToast({ amount: pendingGoldChange.amount, reason: pendingGoldChange.reason })
    setTimeout(() => setGoldToast(null), 3000)
    setPendingGoldChange(null)
  }, [pendingGoldChange, player])

  // Player declines the gold change
  const declineGoldChange = useCallback(() => {
    setPendingGoldChange(null)
  }, [])

  // ─── HP CHANGE — also reads fresh from DB ────────────────────────────────
  const applyHpChange = useCallback(async (amount) => {
    if (!player?.id) return
    const { data, error } = await supabase
      .from('players')
      .select('hp, max_hp')
      .eq('id', player.id)
      .single()
    if (error || !data) return
    const newHp = Math.max(0, Math.min(data.max_hp, data.hp + amount))
    await supabase.from('players').update({ hp: newHp }).eq('id', player.id)
    setGameState(prev => ({ ...prev, hp: newHp }))
  }, [player])

  // ─── INVENTORY — UNIFIED ITEM OBJECT SYSTEM ───────────────────────────────

  // Add item object to inventory (unequipped)
  const addInventoryItem = useCallback(async (item, playerId = null) => {
    const id = playerId || player?.id
    if (!id) return
    // Ensure item is a proper object
    const itemObj = typeof item === 'string'
      ? { id: crypto.randomUUID(), name: item, icon: '📦', type: 'misc', slot: null, stats: {}, rarity: 'common', equipped: false, source: 'unknown', description: '' }
      : { ...item, id: item.id || crypto.randomUUID(), equipped: false }

    setGameState(prev => {
      const newInventory = [...(prev.inventory || []), itemObj]
      persistToDb(id, { inventory: newInventory })
      return { ...prev, inventory: newInventory }
    })
  }, [player, persistToDb])

  // Remove item from inventory by id or name
  const removeInventoryItem = useCallback(async (itemIdOrName, playerId = null) => {
    const id = playerId || player?.id
    if (!id) return
    setGameState(prev => {
      const newInventory = (prev.inventory || []).filter(item => {
        if (typeof item === 'string') return !item.toLowerCase().includes(itemIdOrName.toLowerCase())
        return item.id !== itemIdOrName && !item.name?.toLowerCase().includes(itemIdOrName.toLowerCase())
      })
      persistToDb(id, { inventory: newInventory })
      return { ...prev, inventory: newInventory }
    })
  }, [player, persistToDb])

  // Equip an item from inventory into its slot
  const equipItem = useCallback(async (itemId) => {
    if (!player?.id) return
    setGameState(prev => {
      const inventory = [...(prev.inventory || [])]
      const equipment = { ...prev.equipment }

      // Find item in inventory
      const itemIndex = inventory.findIndex(i => i.id === itemId)
      if (itemIndex === -1) return prev

      const item = { ...inventory[itemIndex] }
      const slot = item.slot
      if (!slot) return prev // no slot — can't equip

      // If something is already in that slot, move it to inventory
      const currentEquipped = equipment[slot]
      if (currentEquipped) {
        inventory.push({ ...currentEquipped, equipped: false })
      }

      // Equip the new item
      equipment[slot] = { ...item, equipped: true }
      inventory.splice(itemIndex, 1)

      const newState = { ...prev, inventory, equipment }
      persistToDb(player.id, { inventory, equipment })
      return newState
    })
  }, [player, persistToDb])

  // Unequip an item from a slot back to inventory
  const unequipItem = useCallback(async (slot) => {
    if (!player?.id) return
    setGameState(prev => {
      const equipment = { ...prev.equipment }
      const inventory = [...(prev.inventory || [])]

      const item = equipment[slot]
      if (!item) return prev

      equipment[slot] = null
      inventory.push({ ...item, equipped: false })

      const newState = { ...prev, inventory, equipment }
      persistToDb(player.id, { inventory, equipment })
      return newState
    })
  }, [player, persistToDb])

  // ─── GIVE ITEM TO ANOTHER PLAYER ─────────────────────────────────────────
  const giveItemToPlayer = useCallback(async (itemIdOrName, toPlayerName, campaignId) => {
    if (!player || !campaignId) return { success: false, error: 'No player or campaign' }

    const currentInventory = gameState.inventory || []
    const itemIndex = currentInventory.findIndex(i => {
      if (typeof i === 'string') return i.toLowerCase().includes(itemIdOrName.toLowerCase())
      return i.id === itemIdOrName || i.name?.toLowerCase().includes(itemIdOrName.toLowerCase())
    })
    if (itemIndex === -1) return { success: false, error: 'Item not found in inventory' }

    const item = currentInventory[itemIndex]
    const newInventory = currentInventory.filter((_, i) => i !== itemIndex)
    setGameState(prev => ({ ...prev, inventory: newInventory }))
    await supabase.from('players').update({ inventory: newInventory }).eq('id', player.id)

    const { data: recipient, error } = await supabase
      .from('players')
      .select('id, inventory, name')
      .eq('name', toPlayerName)
      .eq('campaign_id', campaignId)
      .single()

    if (error || !recipient) {
      setGameState(prev => ({ ...prev, inventory: currentInventory }))
      await supabase.from('players').update({ inventory: currentInventory }).eq('id', player.id)
      return { success: false, error: 'Recipient not found' }
    }

    const recipientInventory = [...(recipient.inventory || []), { ...item, equipped: false }]
    await supabase.from('players').update({ inventory: recipientInventory }).eq('id', recipient.id)

    const itemName = typeof item === 'string' ? item : item.name
    return { success: true, item: itemName, recipient: recipient.name }
  }, [player, gameState.inventory])

  // ─── GIVE GOLD TO ANOTHER PLAYER ─────────────────────────────────────────
  const giveGoldToPlayer = useCallback(async (amount, toPlayerName, campaignId) => {
    if (!player || !campaignId) return { success: false, error: 'No player or campaign' }
    const amt = parseInt(amount)
    if (isNaN(amt) || amt <= 0) return { success: false, error: 'Invalid amount' }

    // Read fresh from DB
    const { data: freshData } = await supabase
      .from('players')
      .select('gold')
      .eq('id', player.id)
      .single()
    const currentGold = freshData?.gold ?? 0
    if (currentGold < amt) return { success: false, error: 'Not enough gold' }

    const newGold = currentGold - amt
    setGameState(prev => ({ ...prev, gold: newGold }))
    await supabase.from('players').update({ gold: newGold }).eq('id', player.id)

    const { data: recipient, error } = await supabase
      .from('players')
      .select('id, gold, name')
      .eq('name', toPlayerName)
      .eq('campaign_id', campaignId)
      .single()

    if (error || !recipient) {
      // Rollback
      setGameState(prev => ({ ...prev, gold: currentGold }))
      await supabase.from('players').update({ gold: currentGold }).eq('id', player.id)
      return { success: false, error: 'Recipient not found' }
    }

    const recipientGold = (recipient.gold || 0) + amt
    await supabase.from('players').update({ gold: recipientGold }).eq('id', recipient.id)

    return { success: true, amount: amt, recipient: recipient.name }
  }, [player])

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
      // Gold system
      pendingGoldChange,
      goldToast,
      requestGoldChange,
      confirmGoldChange,
      declineGoldChange,
      // HP
      applyHpChange,
      // Inventory
      addInventoryItem,
      removeInventoryItem,
      equipItem,
      unequipItem,
      // Trading
      giveItemToPlayer,
      giveGoldToPlayer,
      // Dice
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