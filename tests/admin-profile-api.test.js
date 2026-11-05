import { beforeEach, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}));
vi.mock('../src/services/supabase', () => ({ authorizeRealtime: vi.fn(), supabase: {
  rpc: backend.rpc,
  storage: { from: () => ({ upload: backend.upload, remove: backend.remove }) },
} }));
const { api } = await import('../src/services/api.js');
const id = '00000000-0000-4000-8000-000000000002';
beforeEach(() => { vi.resetAllMocks(); backend.upload.mockResolvedValue({ error: null }); backend.remove.mockResolvedValue({ error: null }); backend.rpc.mockResolvedValue({ data: { id, name: 'Member' }, error: null }); });

it('updates the name without changing the avatar when no photo was chosen', async () => {
  await api.adminUpdateUserProfile({ userId: id, name: '  Member  ' });
  expect(backend.rpc).toHaveBeenCalledWith('admin_update_user_profile', { p_user_id: id, p_name: 'Member' });
  expect(backend.upload).not.toHaveBeenCalled();
});
it('uploads a unique target image and removes it when the profile update fails', async () => {
  backend.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Not allowed' } });
  await expect(api.adminUpdateUserProfile({ userId: id, name: 'Member', file: new File(['image'], 'photo.png', { type: 'image/png' }) })).rejects.toThrow('Not allowed');
  const path = backend.upload.mock.calls[0][0];
  expect(path).toMatch(new RegExp(`^${id}/admin-[a-f0-9-]{36}$`));
  expect(backend.upload.mock.calls[0][2].upsert).toBe(false);
  expect(backend.remove).toHaveBeenCalledWith([path]);
});
it('rejects invalid images before touching storage and only explicitly removes avatars', async () => {
  await expect(api.adminUpdateUserProfile({ userId: id, name: 'Member', file: new File(['x'], 'x.svg', { type: 'image/svg+xml' }) })).rejects.toThrow();
  expect(backend.upload).not.toHaveBeenCalled();
  await api.adminUpdateUserProfile({ userId: id, name: 'Member', remove: true });
  expect(backend.rpc).toHaveBeenLastCalledWith('admin_update_user_profile', { p_user_id: id, p_name: 'Member', p_avatar: '' });
});
