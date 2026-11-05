import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../src/config', () => ({ CONFIG: { SUPABASE_URL: 'https://galaxy.supabase.co' } }));
import ConstellationAvatar from '../src/components/ConstellationAvatar';

it('renders a saved administrative photo while keeping external and invalid paths blocked', () => {
  const id = '00000000-0000-4000-8000-000000000002';
  const path = `${id}/admin-00000000-0000-4000-8000-000000000099?v=1793870000000`;
  const render = (src) => renderToStaticMarkup(<ConstellationAvatar seed={id} name="Member" src={src} />);
  expect(render(path)).toContain(`https://galaxy.supabase.co/storage/v1/object/public/profile-avatars/${path}`);
  expect(render(`${id}/profile?v=1793870000000`)).toContain('/profile?v=1793870000000');
  expect(render('https://evil.test/photo.png')).not.toContain('<img');
  expect(render(`${id}/../photo`)).not.toContain('<img');
});
