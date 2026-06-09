import { describe, expect, it } from 'vitest';
import { getBrPhoneVariations } from '@/lib/integrations/evolution/webhook-helpers';

describe('Evolution Webhook Phone Variations', () => {
  it('correctly generates 13-digit variation for a 12-digit Brazilian number', () => {
    const phone = '+558173190131';
    const variations = getBrPhoneVariations(phone);
    expect(variations).toContain('+558173190131');
    expect(variations).toContain('+5581973190131');
    expect(variations.length).toBe(2);
  });

  it('correctly generates 12-digit variation for a 13-digit Brazilian number', () => {
    const phone = '+5581973190131';
    const variations = getBrPhoneVariations(phone);
    expect(variations).toContain('+5581973190131');
    expect(variations).toContain('+558173190131');
    expect(variations.length).toBe(2);
  });

  it('preserves foreign numbers without generating variations', () => {
    const phone = '+14155552671';
    const variations = getBrPhoneVariations(phone);
    expect(variations).toEqual(['+14155552671']);
  });

  it('handles empty input gracefully', () => {
    expect(getBrPhoneVariations('')).toEqual([]);
  });
});
