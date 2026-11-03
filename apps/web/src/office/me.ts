import { create } from 'zustand'
import { AvatarLook, DEFAULT_LOOK } from '@office/shared'

/**
 * The local person's name and look. Kept in this browser's storage until players carry their look
 * through the server (M3); `?name=` still sets the name for screenshots and quick checks.
 * `chosen` says whether the name came from the person (the link, this browser's storage or a pick)
 * rather than the 'Maya' fallback; the deployed dev-auth build asks for a name until it is true.
 */

const KEY = 'office.me'

type Saved = { name: string; look: AvatarLook }

function load(): Saved & { chosen: boolean } {
  let saved: Partial<Saved> = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {} } catch { /* unreadable or blocked storage: use the defaults */ }
  const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('name') : null
  const look = AvatarLook.safeParse(saved.look)
  const savedName = typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : null
  return {
    name: fromUrl?.trim() || savedName || 'Maya',
    look: look.success ? look.data : DEFAULT_LOOK,
    chosen: Boolean(fromUrl?.trim() || savedName),
  }
}

function save(me: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify({ name: me.name, look: me.look })) } catch { /* storage unavailable: keep it for this visit only */ }
}

type Me = Saved & {
  chosen: boolean
  editing: boolean
  setName: (name: string) => void
  setLook: (look: AvatarLook) => void
  setEditing: (editing: boolean) => void
}

export const useMe = create<Me>((set, get) => ({
  ...load(),
  editing: false,
  setName: (name) => { set({ name, chosen: true }); save(get()) },
  setLook: (look) => { set({ look }); save(get()) },
  setEditing: (editing) => set({ editing }),
}))
