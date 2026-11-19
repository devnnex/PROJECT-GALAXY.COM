import { afterEach,expect,it,vi } from 'vitest';
const backend=vi.hoisted(()=>({invoke:vi.fn(),signOut:vi.fn(),refreshSession:vi.fn()}));
vi.mock('../src/services/supabase',()=>({authorizeRealtime:vi.fn(),supabase:{functions:{invoke:backend.invoke},auth:{signOut:backend.signOut,refreshSession:backend.refreshSession}}}));
const {api}=await import('../src/services/api');
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks()});
it('times out a stuck Telegram request without signing out or replacing the session',async()=>{
  vi.useFakeTimers();
  backend.invoke.mockImplementation((_name,{signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({error:new Error('Aborted')}))));
  const result=expect(api.telegramAccess('status')).rejects.toThrow('No fue posible conectar');
  await vi.advanceTimersByTimeAsync(15000);await result;
  expect(backend.signOut).not.toHaveBeenCalled();expect(backend.refreshSession).not.toHaveBeenCalled();
});
it('preserves the backend error and cancels its timer after a normal response',async()=>{
  vi.useFakeTimers();backend.invoke.mockResolvedValue({data:{enabled:true,state:'PROPOSED'}});
  expect((await api.telegramAccess()).state).toBe('PROPOSED');expect(vi.getTimerCount()).toBe(0);
  backend.invoke.mockResolvedValue({error:{context:{json:async()=>({error:'Vuelve a tu pestaña original'})}}});
  await expect(api.telegramAccess()).rejects.toThrow('Vuelve a tu pestaña original');expect(backend.signOut).not.toHaveBeenCalled();
});
