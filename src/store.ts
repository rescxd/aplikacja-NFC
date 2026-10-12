import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppData } from './types'
import { storageKey } from './config'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const remoteEnabled = Boolean(supabaseUrl && supabasePublishableKey)
const supabase: SupabaseClient | null = remoteEnabled
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

export const persistenceMode = remoteEnabled ? 'supabase' : 'local'

export const emptyData: AppData = {
  customers: [],
  deliveries: [],
  expenses: [],
  stripeFee: 1.5,
}

export function readLocalData(): AppData {
  try {
    const value = localStorage.getItem(storageKey)
    return value ? { ...emptyData, ...JSON.parse(value) } : emptyData
  } catch {
    return emptyData
  }
}

export async function loadData(): Promise<AppData> {
  if (!supabase) return readLocalData()
  const { data, error } = await supabase
    .from('workspace_state')
    .select('payload')
    .eq('workspace_key', 'main')
    .maybeSingle()
  if (error) throw error
  return data?.payload ? { ...emptyData, ...data.payload } as AppData : readLocalData()
}

export async function saveData(value: AppData): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(value))
  if (!supabase) return
  const { error } = await supabase.from('workspace_state').upsert({
    workspace_key: 'main',
    payload: value,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
