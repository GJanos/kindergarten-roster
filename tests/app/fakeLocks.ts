/** Just enough of the Web Locks API for tests: one exclusive lock, ifAvailable and steal. */
export class FakeLocks {
  private holder?: (reason: unknown) => void

  request(
    _name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: object | null) => unknown,
  ): Promise<unknown> {
    if (options.steal && this.holder) {
      this.holder(new DOMException('stolen', 'AbortError'))
      this.holder = undefined
    }
    if (options.ifAvailable && this.holder) return Promise.resolve(callback(null))
    return new Promise((resolve, reject) => {
      this.holder = reject
      Promise.resolve(callback({})).then(resolve, reject)
    })
  }
}

export const asLocks = (fake: FakeLocks) => fake as unknown as LockManager
