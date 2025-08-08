import { ITEM } from './inventory.js';

// Simple list-based crafting (no grid): click to craft if you have ingredients

export const RECIPES = [
  {
    name: 'Planks x4',
    output: { id: ITEM.PLANKS, count: 4 },
    inputs: [ { id: ITEM.WOOD, count: 1 } ],
  },
  {
    name: 'Sticks x4',
    output: { id: ITEM.STICK, count: 4 },
    inputs: [ { id: ITEM.PLANKS, count: 2 } ],
  },
  {
    name: 'Wood Pickaxe',
    output: { id: ITEM.WOOD_PICKAXE, count: 1 },
    inputs: [ { id: ITEM.PLANKS, count: 3 }, { id: ITEM.STICK, count: 2 } ],
  },
  {
    name: 'Stone Pickaxe',
    output: { id: ITEM.STONE_PICKAXE, count: 1 },
    inputs: [ { id: ITEM.COBBLE, count: 3 }, { id: ITEM.STICK, count: 2 } ],
  },
];

export function canCraft(inv, recipe) {
  // Count items across hotbar + inventory
  const counts = new Map();
  for (const slot of inv.allSlots()) {
    if (!slot) continue;
    counts.set(slot.id, (counts.get(slot.id) || 0) + slot.count);
  }
  return recipe.inputs.every(inp => (counts.get(inp.id) || 0) >= inp.count);
}

export function craft(inv, recipe) {
  if (!canCraft(inv, recipe)) return false;
  for (const inp of recipe.inputs) {
    inv.removeItems(inp.id, inp.count);
  }
  inv.addItem(recipe.output.id, recipe.output.count);
  return true;
}

export function renderCrafting(inv) {
  const list = document.getElementById('crafting-list');
  list.innerHTML = '';
  for (const r of RECIPES) {
    const card = document.createElement('div');
    card.className = 'recipe';
    const title = document.createElement('div');
    title.textContent = r.name;
    const inputs = document.createElement('div');
    inputs.style.fontSize = '12px';
    inputs.style.opacity = '0.9';
    inputs.textContent = 'Needs: ' + r.inputs.map(i => `${i.count} x ${itemName(i.id)}`).join(', ');
    const btn = document.createElement('button');
    btn.textContent = canCraft(inv, r) ? 'Craft' : 'Missing items';
    btn.disabled = !canCraft(inv, r);
    btn.onclick = () => {
      if (craft(inv, r)) {
        renderCrafting(inv);
        const ev = new CustomEvent('inventory-changed');
        window.dispatchEvent(ev);
      }
    };
    card.appendChild(title);
    card.appendChild(inputs);
    card.appendChild(btn);
    list.appendChild(card);
  }
}

function itemName(id) {
  const names = {
    [ITEM.PLANKS]: 'Planks',
    [ITEM.WOOD]: 'Wood',
    [ITEM.STICK]: 'Stick',
    [ITEM.WOOD_PICKAXE]: 'Wood Pickaxe',
    [ITEM.STONE_PICKAXE]: 'Stone Pickaxe',
    [ITEM.COBBLE]: 'Cobblestone',
  };
  return names[id] || String(id);
}


