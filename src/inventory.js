import { BLOCK, getBlockName } from './world.js';

export const ITEM = {
  // Mirror block IDs for simplicity for placeable items
  GRASS: BLOCK.GRASS,
  DIRT: BLOCK.DIRT,
  STONE: BLOCK.STONE,
  WOOD: BLOCK.WOOD,
  LEAVES: BLOCK.LEAVES,
  PLANKS: BLOCK.PLANKS,
  COBBLE: BLOCK.COBBLE,
  STICK: 1001,
  WOOD_PICKAXE: 2001,
  STONE_PICKAXE: 2002,
};

export const ITEM_NAMES = {
  [ITEM.GRASS]: 'Grass',
  [ITEM.DIRT]: 'Dirt',
  [ITEM.STONE]: 'Stone',
  [ITEM.WOOD]: 'Wood',
  [ITEM.LEAVES]: 'Leaves',
  [ITEM.PLANKS]: 'Planks',
  [ITEM.COBBLE]: 'Cobblestone',
  [ITEM.STICK]: 'Stick',
  [ITEM.WOOD_PICKAXE]: 'Wood Pickaxe',
  [ITEM.STONE_PICKAXE]: 'Stone Pickaxe',
};

export function getItemName(id) {
  return ITEM_NAMES[id] || getBlockName(id) || 'Unknown';
}

export function isPlaceableBlock(itemId) {
  return itemId in ITEM_NAMES && itemId < 1000; // block ids are < 1000
}

export class Inventory {
  constructor() {
    this.hotbarSize = 9;
    this.hotbar = new Array(this.hotbarSize).fill(null); // {id, count}
    this.selectedHotbar = 0;
    this.slots = new Array(27).fill(null); // additional inventory slots

    // Seed inventory with some items
    this.hotbar[0] = { id: ITEM.DIRT, count: 64 };
    this.hotbar[1] = { id: ITEM.STONE, count: 32 };
    this.hotbar[2] = { id: ITEM.WOOD, count: 16 };
    this.hotbar[3] = { id: ITEM.PLANKS, count: 32 };
    this.hotbar[4] = { id: ITEM.COBBLE, count: 16 };
    this.hotbar[5] = { id: ITEM.STICK, count: 16 };
  }

  allSlots() {
    return [...this.hotbar, ...this.slots];
  }

  addItem(itemId, amount = 1) {
    // Try to stack in hotbar then inventory
    const tryAddTo = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const slot = arr[i];
        if (slot && slot.id === itemId && slot.count < 64) {
          const can = Math.min(64 - slot.count, amount);
          slot.count += can;
          amount -= can;
          if (amount <= 0) return true;
        }
      }
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]) {
          const put = Math.min(64, amount);
          arr[i] = { id: itemId, count: put };
          amount -= put;
          if (amount <= 0) return true;
        }
      }
      return amount <= 0;
    };
    if (!tryAddTo(this.hotbar)) tryAddTo(this.slots);
    return amount <= 0;
  }

  consumeFromHotbar(amount = 1) {
    const slot = this.hotbar[this.selectedHotbar];
    if (!slot) return false;
    if (slot.count < amount) return false;
    slot.count -= amount;
    if (slot.count <= 0) this.hotbar[this.selectedHotbar] = null;
    return true;
  }

  removeItems(itemId, amount) {
    // Remove from any slots
    const takeFrom = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const slot = arr[i];
        if (!slot || slot.id !== itemId) continue;
        const take = Math.min(slot.count, amount);
        slot.count -= take;
        amount -= take;
        if (slot.count <= 0) arr[i] = null;
        if (amount <= 0) return true;
      }
      return amount <= 0;
    };
    if (!takeFrom(this.hotbar)) takeFrom(this.slots);
    return amount <= 0;
  }
}

export function renderHotbar(inv) {
  const el = document.getElementById('hotbar');
  el.innerHTML = '';
  for (let i = 0; i < inv.hotbarSize; i++) {
    const slot = inv.hotbar[i];
    const s = document.createElement('div');
    s.className = 'slot' + (i === inv.selectedHotbar ? ' selected' : '');
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    icon.style.background = slot ? slotColor(slot.id) : 'transparent';
    s.appendChild(icon);
    if (slot && slot.count > 1) {
      const c = document.createElement('div');
      c.className = 'count';
      c.textContent = String(slot.count);
      s.appendChild(c);
    }
    el.appendChild(s);
  }
}

export function renderInventory(inv) {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  for (let i = 0; i < inv.slots.length; i++) {
    const slot = inv.slots[i];
    const s = document.createElement('div');
    s.className = 'inv-slot';
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    icon.style.background = slot ? slotColor(slot.id) : 'transparent';
    s.appendChild(icon);
    if (slot && slot.count > 1) {
      const c = document.createElement('div');
      c.className = 'count';
      c.textContent = String(slot.count);
      s.appendChild(c);
    }
    grid.appendChild(s);
  }
}

export function slotColor(itemId) {
  // Simple mapping to colors
  const colors = {
    [ITEM.GRASS]: '#55aa55',
    [ITEM.DIRT]: '#8b5a2b',
    [ITEM.STONE]: '#888888',
    [ITEM.WOOD]: '#8a5c2e',
    [ITEM.LEAVES]: '#3fa73f',
    [ITEM.PLANKS]: '#b48a56',
    [ITEM.COBBLE]: '#777777',
    [ITEM.STICK]: '#cfa77a',
    [ITEM.WOOD_PICKAXE]: '#d2b48c',
    [ITEM.STONE_PICKAXE]: '#9e9e9e',
  };
  return colors[itemId] || '#ffffff';
}


