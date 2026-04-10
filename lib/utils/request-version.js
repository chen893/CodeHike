export function createRequestVersionTracker() {
  let currentVersion = 0

  return {
    begin() {
      currentVersion += 1
      return currentVersion
    },
    invalidate() {
      currentVersion += 1
      return currentVersion
    },
    isCurrent(version) {
      return version === currentVersion
    },
    getCurrentVersion() {
      return currentVersion
    },
  }
}
