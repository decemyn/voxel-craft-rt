import { describe, it, expect } from 'vitest';
import { Inventory, ITEM } from '../src/inventory.js';
import { RECIPES, canCraft, craft } from '../src/crafting.js';

describe('Crafting', () => {
  it('can craft planks from wood', () => {
    const inv = new Inventory();
    // Ensure wood is available
    inv.addItem(ITEM.WOOD, 2);
    const recipe = RECIPES.find(r => r.output.id === ITEM.PLANKS);
    expect(canCraft(inv, recipe)).toBe(true);
    const ok = craft(inv, recipe);
    expect(ok).toBe(true);
  });
  it('cannot craft stone pickaxe without cobble', () => {
    const inv = new Inventory();
    const recipe = RECIPES.find(r => r.output.id === ITEM.STONE_PICKAXE);
    // remove cobble from inventory
    inv.removeItems(ITEM.COBBLE, 999);
    expect(canCraft(inv, recipe)).toBe(false);
  });
});


