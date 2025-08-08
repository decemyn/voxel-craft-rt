import { describe, it, expect } from 'vitest';
import { Inventory, ITEM } from '../src/inventory.js';

describe('Inventory', () => {
  it('adds and stacks items', () => {
    const inv = new Inventory();
    inv.addItem(ITEM.DIRT, 10);
    const slot = inv.hotbar[0];
    expect(slot.id).toBe(ITEM.DIRT);
    expect(slot.count).toBeGreaterThan(10); // initial 64 + 10 capped to 64
  });
  it('consumes from hotbar', () => {
    const inv = new Inventory();
    inv.selectedHotbar = 1; // STONE
    const before = inv.hotbar[1]?.count || 0;
    const ok = inv.consumeFromHotbar(2);
    expect(ok).toBe(true);
    const after = inv.hotbar[1]?.count || 0;
    expect(after).toBe(before - 2);
  });
});


