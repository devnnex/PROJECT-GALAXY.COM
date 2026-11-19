import { expect,it } from 'vitest';
import { initialSection,isTelegramReturn } from '../src/services/route-intent';
it('returns directly to Black Galaxy Trade without requiring a notification recipient',()=>{
  expect(initialSection('?section=black-trade&telegram=1',['dashboard','meetings','black-trade'],'dashboard')).toBe('black-trade');
  expect(initialSection('?telegram=1',['meetings','black-trade'],'meetings')).toBe('black-trade');
  expect(isTelegramReturn('?section=black-trade&telegram=1')).toBe(true);
});
it('keeps direct bot links useful and respects navigation permissions and normal defaults',()=>{
  expect(initialSection('?section=black-trade',['black-trade','meetings'],'meetings')).toBe('black-trade');
  expect(initialSection('?telegram=1',['meetings'],'meetings')).toBe('meetings');
  expect(initialSection('?section=https://outside.invalid',['black-trade'],'meetings')).toBe('meetings');
  expect(initialSection('',['black-trade','meetings'],'meetings')).toBe('meetings');
  expect(isTelegramReturn('?telegram=0')).toBe(false);
});
