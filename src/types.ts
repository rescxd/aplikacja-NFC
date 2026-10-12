export type UserRole = 'admin' | 'seller'
export type PaymentPlan = 'monthly' | 'one-time'
export type PaymentChannel = 'onsite' | 'online'
export type ExpenseFrequency = 'once' | 'monthly'

export interface AppUser {
  id: string
  name: string
  username: string
  password: string
  role: UserRole
  initials: string
}

export interface Customer {
  id: string
  ownerId: string
  name: string
  address: string
  phone: string
  email: string
  website: string
  photoUrl: string
  plan: PaymentPlan
  amount: number
  channel: PaymentChannel | null
  stickers: number
  stands: number
  createdAt: string
  paidMonths: Record<string, boolean>
}

export interface Delivery {
  id: string
  ownerId: string
  date: string
  stickers: number
  stands: number
  stickerCost: number
  standCost: number
}

export interface Expense {
  id: string
  ownerId: string
  name: string
  category: string
  amount: number
  frequency: ExpenseFrequency
  date: string
}

export interface AppData {
  customers: Customer[]
  deliveries: Delivery[]
  expenses: Expense[]
  stripeFee: number
}
