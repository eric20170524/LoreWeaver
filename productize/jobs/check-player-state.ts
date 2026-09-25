import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_PLAYER_STATE,
  clearStoredPlayerState,
  playerStateStorageKey,
  readStoredPlayerState,
  writeStoredPlayerState
} from '../../src/runtime/playerState.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    data
  };
}

test('workspace save keys stay isolated', () => {
  assert.equal(playerStateStorageKey(), 'loreweaver_player_state');
  assert.equal(playerStateStorageKey('xuanjie-shimu-local'), 'loreweaver_player_state_xuanjie-shimu-local');
  const storage = memoryStorage();
  writeStoredPlayerState(storage, { ...INITIAL_PLAYER_STATE, currentRealmIndex: 2, mainCurrencyCount: 40 }, 'ws-a');
  writeStoredPlayerState(storage, { ...INITIAL_PLAYER_STATE, currentRealmIndex: 0, mainCurrencyCount: 7 }, 'ws-b');
  assert.equal(readStoredPlayerState(storage, 'ws-a').mainCurrencyCount, 40);
  assert.equal(readStoredPlayerState(storage, 'ws-b').mainCurrencyCount, 7);
  assert.equal(readStoredPlayerState(storage, 'ws-a').currentRealmIndex, 2);
  assert.equal(readStoredPlayerState(storage, 'missing').mainCurrencyCount, 0);
  clearStoredPlayerState(storage, 'ws-a');
  assert.equal(readStoredPlayerState(storage, 'ws-a').mainCurrencyCount, 0);
  assert.equal(readStoredPlayerState(storage, 'ws-b').mainCurrencyCount, 7);
});
