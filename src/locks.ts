const locks = {};

export function hasLock(lockName: string) {
  return lockName in locks;
}

export function addLock(lockName: string, timeout = 20_000) {
  if (hasLock(lockName)) {
    throw new Error(`Lock ${lockName} already exists`);
  }
  locks[lockName] = setTimeout(() => {
    releaseLock(lockName);
  }, timeout);
}

export function releaseLock(lockName: string) {
  if (lockName in locks) {
    clearTimeout(locks[lockName]);
    delete locks[lockName];
  }
}
