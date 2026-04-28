import type { LDrawLibraryManager } from './LDrawLibraryManager'

let _manager: LDrawLibraryManager | null = null

export function setLDrawManager(manager: LDrawLibraryManager | null): void {
  _manager = manager
}

export function getLDrawManager(): LDrawLibraryManager | null {
  return _manager
}
