import type { DirectoryHandle, Permission } from '../../src/state/autosave'

/** A folder in memory, shaped like the parts of a FileSystemDirectoryHandle that autosave uses. */
export type FakeFolder = DirectoryHandle & {
  files: Map<string, string>
  permission: Permission
  grantOnRequest: boolean // what she answers when the browser asks again
  failWrites: boolean // a full disk, a removed USB stick
}

export function fakeFolder(name = 'Mentések', permission: Permission = 'granted'): FakeFolder {
  const folder: FakeFolder = {
    name,
    files: new Map(),
    permission,
    grantOnRequest: true,
    failWrites: false,
    async queryPermission() {
      return folder.permission
    },
    async requestPermission() {
      if (folder.permission === 'prompt')
        folder.permission = folder.grantOnRequest ? 'granted' : 'denied'
      return folder.permission
    },
    async getFileHandle(fileName) {
      return {
        async createWritable() {
          if (folder.permission !== 'granted')
            throw new DOMException('no access', 'NotAllowedError')
          let text = ''
          return {
            async write(data: string) {
              text += data
            },
            async close() {
              if (folder.failWrites) throw new DOMException('disk full', 'QuotaExceededError')
              folder.files.set(fileName, text)
            },
          }
        },
      }
    },
  }
  return folder
}
