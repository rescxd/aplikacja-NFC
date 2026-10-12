import type { AppUser } from './types'

// These credentials are bundled into the public frontend. Change them before any deployment.
export const users: AppUser[] = [
  { id: 'aleksandra', name: 'Aleksandra Nowak', username: 'aleksandra', password: 'zmien-to-1', role: 'seller', initials: 'AN' },
  { id: 'mateusz', name: 'Mateusz Zieliński', username: 'mateusz', password: 'zmien-to-2', role: 'seller', initials: 'MZ' },
  { id: 'admin', name: 'Administrator', username: 'admin', password: 'zmien-to-admin', role: 'admin', initials: 'AD' },
]

export const storageKey = 'nfc-manager-data-v1'
