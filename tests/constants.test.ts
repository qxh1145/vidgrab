import { describe, it, expect } from 'vitest';
import { isBlockedDomain } from '../shared/constants';

describe('isBlockedDomain', () => {
  it('blocks youtube.com', () => {
    expect(isBlockedDomain('youtube.com')).toBe(true);
  });

  it('blocks www.youtube.com', () => {
    expect(isBlockedDomain('www.youtube.com')).toBe(true);
  });

  it('blocks subdomain of googlevideo.com', () => {
    expect(isBlockedDomain('r1---sn-abc.googlevideo.com')).toBe(true);
  });

  it('blocks youtu.be', () => {
    expect(isBlockedDomain('youtu.be')).toBe(true);
  });

  it('allows other domains', () => {
    expect(isBlockedDomain('vimeo.com')).toBe(false);
    expect(isBlockedDomain('example.com')).toBe(false);
  });

  it('case insensitive', () => {
    expect(isBlockedDomain('YouTube.COM')).toBe(true);
  });
});
