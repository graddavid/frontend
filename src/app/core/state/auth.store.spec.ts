import { AuthStore } from './auth.store';
import { UserDto } from '../../../api/users/user.dto';

describe('AuthStore', () => {
  const storageKey = 'prpo.auth.user';

  beforeEach(() => {
    localStorage.removeItem(storageKey);
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
  });

  it('loads stored user on init', () => {
    const saved: UserDto = { id: 'user-1', username: 'casey' };
    localStorage.setItem(storageKey, JSON.stringify(saved));

    const store = new AuthStore();

    expect(store.snapshot).toEqual(saved);
  });

  it('persists and clears user changes', () => {
    const store = new AuthStore();
    const user: UserDto = { id: 'user-2', username: 'marin' };

    store.setUser(user);

    expect(store.snapshot).toEqual(user);
    expect(JSON.parse(localStorage.getItem(storageKey) || '')).toEqual(user);

    store.clear();

    expect(store.snapshot).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
