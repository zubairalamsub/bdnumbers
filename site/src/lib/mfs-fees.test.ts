import { describe, expect, it } from 'vitest';
import { MFS_SERVICES, cashOutFee } from './mfs-fees';

const option = (service: string, id: string) => MFS_SERVICES.find((s) => s.id === service)!.options.find((o) => o.id === id)!;

describe('cashOutFee', () => {
  it('charges per thousand for bKash and Nagad', () => {
    expect(cashOutFee(option('bkash', 'agent'), 5000)).toBe(92.5);
    expect(cashOutFee(option('bkash', 'priyo'), 1000)).toBe(13.95);
    expect(cashOutFee(option('nagad', 'app'), 2500)).toBe(32.48);
  });

  it('charges a percentage for Rocket', () => {
    expect(cashOutFee(option('rocket', 'agent'), 10000)).toBe(167);
    expect(cashOutFee(option('rocket', 'atm'), 3000)).toBe(27);
  });

  it('gives every option exactly one kind of rate', () => {
    for (const s of MFS_SERVICES) for (const o of s.options) expect((o.per1000 === undefined) !== (o.percent === undefined)).toBe(true);
  });
});
