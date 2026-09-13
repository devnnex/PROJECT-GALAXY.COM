import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConstellationAvatar, { createConstellation } from '../src/components/ConstellationAvatar';
import { MEMBERSHIP_BADGE_TIER, membershipBadgeTier, membershipForAvatar } from '../src/membership-badges';

const avatarSource = readFileSync(new URL('../src/components/ConstellationAvatar.jsx', import.meta.url), 'utf8');
const avatarStyles = readFileSync(new URL('../src/registration.css', import.meta.url), 'utf8');

describe('Constellation avatar', () => {
  it('is stable for the same user and different across users', () => {
    const first = createConstellation('user-a');
    expect(createConstellation('user-a')).toEqual(first);
    expect(createConstellation('user-b')).not.toEqual(first);
  });

  it('keeps every generated star inside the avatar canvas', () => {
    for (const point of createConstellation('user-a').points) {
      expect(point.x).toBeGreaterThanOrEqual(16);
      expect(point.x).toBeLessThanOrEqual(84);
      expect(point.y).toBeGreaterThanOrEqual(16);
      expect(point.y).toBeLessThanOrEqual(84);
    }
  });

  it('creates a stable portrait variation within safe visual bounds', () => {
    const { portrait } = createConstellation('user-a');
    expect(portrait.haloTilt).toBeGreaterThanOrEqual(-14);
    expect(portrait.haloTilt).toBeLessThanOrEqual(14);
    expect(portrait.faceShift).toBeGreaterThanOrEqual(-2.5);
    expect(portrait.faceShift).toBeLessThanOrEqual(2.5);
  });

  it('maps the five paid plans from entry to elite and gives administrators the elite frame', () => {
    expect(MEMBERSHIP_BADGE_TIER).toEqual({
      MONTHLY: 1,
      QUARTERLY: 2,
      SEMESTER: 3,
      ANNUAL: 4,
      VIP_ANNUAL: 5,
      ADMIN: 5,
    });
  });

  it('renders a browser-compatible badge on the edge of the original avatar', () => {
    expect(avatarSource).toContain('has-membership-badge');
    expect(avatarSource).toContain('membership-tier-${badgeTier}');
    expect(avatarStyles).toContain('.constellation-avatar.has-membership-badge');
    expect(avatarStyles).toContain('.avatar-membership-badge{position:absolute;z-index:4;right:');
    expect(avatarStyles).toContain('.avatar-membership-badge>img');
    expect(avatarStyles).toContain('.admin-user-avatar-shell .avatar-membership-badge,.invite-avatar-shell.online .avatar-membership-badge{right:auto;left:');
    expect(avatarStyles).toContain('.constellation-avatar.has-membership-badge:after');
    expect(avatarStyles).not.toContain(':has(');
  });

  it('recognizes active membership payloads and always assigns Elkin the elite badge', () => {
    expect(membershipBadgeTier({ is_active: true, plan_code: 'quarterly' })).toBe(2);
    expect(membershipBadgeTier({ status: 'ACTIVE', planCode: 'annual' })).toBe(4);
    expect(membershipBadgeTier({ isActive: false, planCode: 'VIP_ANNUAL' })).toBeNull();
    expect(membershipForAvatar({ email: 'Elkin56ty@gmail.com', membership: { isActive: false } })).toEqual(expect.objectContaining({ planCode: 'ADMIN' }));
    expect(membershipForAvatar({ email: 'guest@example.com', isGuest: true, role: 'ADMIN' })).toEqual({ isActive: false });
  });

  it('shows the correct badge for an active member and no badge for a guest', () => {
    const member = renderToStaticMarkup(React.createElement(ConstellationAvatar, {
      seed: 'owner', name: 'Elkin', membership: { isActive: true, planCode: 'ADMIN', planName: 'Acceso administrativo' },
    }));
    const guest = renderToStaticMarkup(React.createElement(ConstellationAvatar, {
      seed: 'guest', name: 'Invitado', membership: { isActive: false },
    }));
    expect(member).toContain('has-membership-badge membership-tier-5');
    expect(member).toContain('avatar-membership-badge tier-5');
    expect(guest).not.toContain('avatar-membership-badge');
  });
});
