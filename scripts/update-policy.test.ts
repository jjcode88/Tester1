import { describe, expect, it } from 'vitest';
import { decide } from './update-policy.mjs';

const merges = (title: string) => decide(title).merge;

describe('automatic update policy', () => {
  it('merges patch and minor updates', () => {
    expect(merges('Bump vite from 8.3.8 to 8.3.9')).toBe(true);
    expect(merges('Bump @playwright/test from 1.63.0 to 1.65.1 in the dependencies group')).toBe(true);
    expect(merges('Bump actions/deploy-pages from 4.0.5 to 4.1.0')).toBe(true);
    expect(merges('Bump react from 19.3.1 to 19.4.0 in /')).toBe(true);
  });

  it('merges groups that only hold minor and patch updates', () => {
    expect(merges('Bump the npm-minor-and-patch group with 7 updates')).toBe(true);
    expect(merges('Bump the actions-minor-and-patch group across 1 directory with 3 updates')).toBe(true);
  });

  it('holds major updates for review', () => {
    expect(decide('Bump actions/checkout from 4 to 7')).toEqual({ merge: false, reason: 'major update 4 → 7' });
    expect(merges('Bump react from 19.3.1 to 20.0.0')).toBe(false);
    expect(merges('Bump typescript from v6.0.3 to v7.0.0')).toBe(false);
  });

  it('treats a 0.x minor as breaking', () => {
    expect(merges('Bump some-lib from 0.5.2 to 0.6.0')).toBe(false);
    expect(merges('Bump some-lib from 0.5.2 to 0.5.3')).toBe(true);
  });

  it('holds anything it does not understand', () => {
    expect(merges('Bump the dependencies group with 3 updates')).toBe(false);
    expect(merges('Update README')).toBe(false);
    expect(merges('Bump thing from latest to next')).toBe(false);
  });
});
