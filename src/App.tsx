import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Boxes, Building2, CalendarDays, Check,
  ChevronDown, CircleDollarSign, CreditCard, LayoutDashboard, LogOut,
  MoreHorizontal, PackagePlus, Pencil, Plus, Search, Settings, ShoppingBag,
  TrendingUp, Truck, Users, X, Trash2,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis,
} from 'recharts'
import { users } from './config'
import { emptyData, loadData, readLocalData, saveData } from './store'
import type { AppData, AppUser, Customer, Delivery, Expense, ExpenseFrequency, PaymentPlan } from './types'
import './App.css'

type Page = 'overview' | 'customers' | 'inventory' | 'expenses' | 'statistics' | 'settings'
type DraftCustomer = Omit<Customer, 'id' | 'createdAt' | 'paidMonths'>

const mountedAt = new Date()
const monthNames = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const shortMonthNames = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
const monthKey = (date = mountedAt) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const monthTitle = (date = mountedAt) => new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(date)
const monthTitleForKey = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return `${monthNames[month - 1]} ${year}`
}
const currency = (value: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const today = () => new Date().toISOString().slice(0, 10)
const monthlyAmounts = [10, 15, 20, 25, 35, 50]
const oneTimeAmounts = [10, 15, 20, 25, 35, 50, 100, 250, 500]

const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'overview', label: 'Przegląd', icon: LayoutDashboard },
  { page: 'customers', label: 'Klienci', icon: Building2 },
  { page: 'inventory', label: 'Magazyn', icon: Boxes },
  { page: 'expenses', label: 'Koszty', icon: CreditCard },
  { page: 'statistics', label: 'Statystyki', icon: TrendingUp },
  { page: 'settings', label: 'Ustawienia', icon: Settings },
]

function inMonth(value: string, month: string) {
  return value.slice(0, 7) === month
}

function inventoryFor(data: AppData, ownerId: string) {
  const deliveries = data.deliveries.filter((item) => item.ownerId === ownerId)
  const customers = data.customers.filter((item) => item.ownerId === ownerId)
  return {
    stickers: deliveries.reduce((sum, item) => sum + item.stickers, 0) - customers.reduce((sum, item) => sum + item.stickers, 0),
    stands: deliveries.reduce((sum, item) => sum + item.stands, 0) - customers.reduce((sum, item) => sum + item.stands, 0),
  }
}

function financials(data: AppData, customers: Customer[], deliveries: Delivery[], expenses: Expense[], month: string) {
  const paidCustomers = customers.filter((customer) => customer.plan === 'one-time'
    ? inMonth(customer.createdAt, month)
    : customer.paidMonths[month])
  const revenue = paidCustomers.reduce((sum, customer) => sum + customer.amount, 0)
  const stripe = paidCustomers.length * data.stripeFee
  const stickerUnits = deliveries.reduce((sum, item) => sum + item.stickers, 0)
  const standUnits = deliveries.reduce((sum, item) => sum + item.stands, 0)
  const stickerUnitCost = stickerUnits ? deliveries.reduce((sum, item) => sum + item.stickerCost, 0) / stickerUnits : 0
  const standUnitCost = standUnits ? deliveries.reduce((sum, item) => sum + item.standCost, 0) / standUnits : 0
  const soldThisMonth = customers.filter((customer) => inMonth(customer.createdAt, month))
  const goodsCost = soldThisMonth.reduce((sum, customer) => sum + customer.stickers * stickerUnitCost + customer.stands * standUnitCost, 0)
  const monthExpenses = expenses.filter((expense) => expense.frequency === 'once'
    ? inMonth(expense.date, month)
    : expense.date.slice(0, 7) <= month)
  const expenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  return { revenue, stripe, goodsCost, expenseTotal, income: revenue - stripe - goodsCost - expenseTotal, transactions: paidCustomers.length }
}

function useMonthSeries(data: AppData, customers: Customer[], deliveries: Delivery[], expenses: Expense[]) {
  return useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const absoluteMonth = mountedAt.getFullYear() * 12 + mountedAt.getMonth() - (5 - index)
    const year = Math.floor(absoluteMonth / 12)
    const month = absoluteMonth % 12
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const result = financials(data, customers, deliveries, expenses, key)
    return { month: shortMonthNames[month], Przychód: result.revenue, Dochód: result.income }
  }), [data, customers, deliveries, expenses])
}

function App() {
  const [session, setSession] = useState<AppUser | null>(null)
  const [page, setPage] = useState<Page>('overview')
  const [selectedOwner, setSelectedOwner] = useState('')
  const [data, setData] = useState<AppData>(emptyData)
  const [loaded, setLoaded] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [search, setSearch] = useState('')
  const [customerModal, setCustomerModal] = useState<Customer | 'new' | null>(null)
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)
  const [deliveryModal, setDeliveryModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [mobileMore, setMobileMore] = useState(false)
  const [month, setMonth] = useState(monthKey())

  useEffect(() => {
    let active = true
    loadData().then((value) => {
      if (active) setData(value)
    }).catch(() => {
      if (active) {
        setData(readLocalData())
        setSyncError('Nie udało się połączyć z Supabase. Zmiany zapisują się tylko w tej przeglądarce.')
      }
    }).finally(() => {
      if (active) setLoaded(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!loaded) return
    saveData(data).then(() => setSyncError('')).catch(() => {
      setSyncError('Błąd zapisu w Supabase. Sprawdź konfigurację tabeli i uprawnienia.')
    })
  }, [data, loaded])

  useEffect(() => {
    if (!syncError) return
    const timeout = window.setTimeout(() => setSyncError(''), 6000)
    return () => window.clearTimeout(timeout)
  }, [syncError])

  const ownerIds = useMemo(() => session?.role === 'admin' ? users.filter((user) => user.role === 'seller').map((user) => user.id) : [session?.id ?? ''], [session])
  const visibleCustomers = useMemo(() => data.customers.filter((customer) => ownerIds.includes(customer.ownerId)
    && (session?.role !== 'admin' || selectedOwner === 'all' || customer.ownerId === selectedOwner)), [data.customers, ownerIds, selectedOwner, session])
  const visibleDeliveries = useMemo(() => data.deliveries.filter((item) => ownerIds.includes(item.ownerId)
    && (session?.role !== 'admin' || selectedOwner === 'all' || item.ownerId === selectedOwner)), [data.deliveries, ownerIds, selectedOwner, session])
  const visibleExpenses = useMemo(() => data.expenses.filter((item) => ownerIds.includes(item.ownerId)
    && (session?.role !== 'admin' || selectedOwner === 'all' || item.ownerId === selectedOwner)), [data.expenses, ownerIds, selectedOwner, session])

  const currentOwner = session?.role === 'admin' && selectedOwner !== 'all' ? selectedOwner : session?.id ?? ''
  const currentInventory = session?.role === 'admin' && selectedOwner === 'all'
    ? { stickers: visibleDeliveries.reduce((sum, item) => sum + item.stickers, 0) - visibleCustomers.reduce((sum, item) => sum + item.stickers, 0), stands: visibleDeliveries.reduce((sum, item) => sum + item.stands, 0) - visibleCustomers.reduce((sum, item) => sum + item.stands, 0) }
    : inventoryFor(data, currentOwner)
  const currentStats = financials(data, visibleCustomers, visibleDeliveries, visibleExpenses, month)
  const series = useMonthSeries(data, visibleCustomers, visibleDeliveries, visibleExpenses)
  const activeName = session?.role === 'admin' && selectedOwner === 'all' ? 'Wszyscy użytkownicy' : users.find((user) => user.id === currentOwner)?.name ?? session?.name ?? ''

  function login(username: string, password: string) {
    const found = users.find((user) => user.username === username && user.password === password)
    if (!found) return false
    setSession(found)
    setSelectedOwner(found.role === 'admin' ? 'all' : found.id)
    setMobileNav(false)
    return true
  }

  function logout() {
    setSession(null)
    setPage('overview')
    setSearch('')
    setMobileNav(false)
    setMobileMore(false)
  }

  function saveCustomer(draft: DraftCustomer, existing?: Customer) {
    const inventory = inventoryFor(data, draft.ownerId)
    const previousStickers = existing?.ownerId === draft.ownerId ? existing.stickers : 0
    const previousStands = existing?.ownerId === draft.ownerId ? existing.stands : 0
    if (draft.stickers > inventory.stickers + previousStickers || draft.stands > inventory.stands + previousStands) return false
    const customer: Customer = existing
      ? { ...existing, ...draft }
      : { ...draft, id: crypto.randomUUID(), createdAt: today(), paidMonths: draft.plan === 'one-time' ? { [monthKey()]: true } : {} }
    setData((previous) => ({ ...previous, customers: existing
      ? previous.customers.map((item) => item.id === existing.id ? customer : item)
      : [customer, ...previous.customers] }))
    setCustomerModal(null)
    if (!existing) setPage('customers')
    return true
  }

  function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Usunąć klienta „${customer.name}”?`)) return
    setData((previous) => ({ ...previous, customers: previous.customers.filter((item) => item.id !== customer.id) }))
  }

  function togglePayment(customer: Customer, key = monthKey()) {
    setData((previous) => ({ ...previous, customers: previous.customers.map((item) => item.id === customer.id
      ? { ...item, paidMonths: { ...item.paidMonths, [key]: !item.paidMonths[key] } }
      : item) }))
  }

  function saveDelivery(input: Omit<Delivery, 'id'>) {
    setData((previous) => ({ ...previous, deliveries: [{ ...input, id: crypto.randomUUID() }, ...previous.deliveries] }))
    setDeliveryModal(false)
  }

  function saveExpense(input: Omit<Expense, 'id'>) {
    setData((previous) => ({ ...previous, expenses: [{ ...input, id: crypto.randomUUID() }, ...previous.expenses] }))
    setExpenseModal(false)
  }

  if (!session) return <Login onLogin={login} />
  if (!loaded) return <div className="loading-screen"><span className="loader" />Ładowanie panelu</div>

  const pageTitle = navItems.find((item) => item.page === page)?.label ?? 'Przegląd'
  const filteredCustomers = visibleCustomers.filter((customer) => `${customer.name} ${customer.address} ${customer.phone}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><span /></div><div><strong>nfc.</strong><small>business desk</small></div></div>
        <nav className="main-nav" aria-label="Główna nawigacja">
          {navItems.map(({ page: itemPage, label, icon: Icon }) => (
            <button key={itemPage} type="button" className={`nav-item ${page === itemPage ? 'nav-active' : ''}`} onClick={() => { setPage(itemPage); setMobileNav(false) }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{itemPage === 'customers' && <span className="nav-count">{visibleCustomers.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-row"><div className="avatar avatar-sidebar">{session.initials}</div><div className="profile-copy"><strong>{session.name}</strong><small>{session.role === 'admin' ? 'Administrator' : 'Opiekun klientów'}</small></div><button type="button" className="icon-button sidebar-logout" aria-label="Wyloguj" title="Wyloguj" onClick={logout}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            {session.role === 'admin' && <label className="owner-select"><Users size={15} /><select value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)} aria-label="Wybierz użytkownika"><option value="all">Wszyscy użytkownicy</option>{users.filter((user) => user.role === 'seller').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><ChevronDown size={14} /></label>}
            <button type="button" className="top-logout" title="Wyloguj" aria-label="Wyloguj" onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>
        <div className="page-content">
          {page === 'overview' && <Overview customers={visibleCustomers} stats={currentStats} inventory={currentInventory} series={series} ownerName={activeName} onNavigate={setPage} onAddCustomer={() => setCustomerModal('new')} />}
          {page === 'customers' && <CustomersPage customers={filteredCustomers} search={search} onSearch={setSearch} onAdd={() => setCustomerModal('new')} onEdit={setCustomerModal} onDelete={deleteCustomer} onTogglePayment={togglePayment} onHistory={setPaymentCustomer} />}
          {page === 'inventory' && <InventoryPage deliveries={visibleDeliveries} customers={visibleCustomers} inventory={currentInventory} onAdd={() => setDeliveryModal(true)} />}
          {page === 'expenses' && <ExpensesPage expenses={visibleExpenses} onAdd={() => setExpenseModal(true)} onDelete={(expense) => setData((previous) => ({ ...previous, expenses: previous.expenses.filter((item) => item.id !== expense.id) }))} />}
          {page === 'statistics' && <StatisticsPage stats={currentStats} series={series} month={month} onMonth={setMonth} />}
          {page === 'settings' && <SettingsPage data={data} onChange={(stripeFee) => setData((previous) => ({ ...previous, stripeFee }))} />}
        </div>
      </main>
      {mobileNav && <button className="mobile-scrim" type="button" aria-label="Zamknij menu" onClick={() => setMobileNav(false)} />}
      {mobileMore && <MobileMoreMenu page={page} onNavigate={(nextPage) => { setPage(nextPage); setMobileMore(false) }} onLogout={logout} />}
      <MobileTabBar page={page} onNavigate={setPage} onMore={() => setMobileMore((open) => !open)} moreOpen={mobileMore} />
      {syncError && <div className="sync-toast" role="status">{syncError}</div>}
      {customerModal && <CustomerModal customer={customerModal === 'new' ? undefined : customerModal} ownerId={session.role === 'admin' ? (customerModal !== 'new' ? customerModal.ownerId : selectedOwner === 'all' ? users.find((user) => user.role === 'seller')?.id ?? session.id : selectedOwner) : session.id} inventory={inventoryFor(data, session.role === 'admin' && customerModal !== 'new' ? customerModal.ownerId : session.role === 'admin' && selectedOwner === 'all' ? users.find((user) => user.role === 'seller')?.id ?? session.id : selectedOwner || session.id)} onClose={() => setCustomerModal(null)} onSave={saveCustomer} />}
      {paymentCustomer && <PaymentHistoryModal customer={paymentCustomer} onToggle={(key) => togglePayment(paymentCustomer, key)} onClose={() => setPaymentCustomer(null)} />}
      {deliveryModal && <DeliveryModal ownerId={session.role === 'admin' && selectedOwner === 'all' ? users.find((user) => user.role === 'seller')?.id ?? session.id : currentOwner} onClose={() => setDeliveryModal(false)} onSave={saveDelivery} />}
      {expenseModal && <ExpenseModal ownerId={session.role === 'admin' && selectedOwner === 'all' ? users.find((user) => user.role === 'seller')?.id ?? session.id : currentOwner} onClose={() => setExpenseModal(false)} onSave={saveExpense} />}
    </div>
  )
}

function MobileTabBar({ page, onNavigate, onMore, moreOpen }: { page: Page; onNavigate: (page: Page) => void; onMore: () => void; moreOpen: boolean }) {
  const tabs: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { page: 'overview', label: 'Dziś', icon: LayoutDashboard },
    { page: 'customers', label: 'Klienci', icon: Building2 },
    { page: 'inventory', label: 'Magazyn', icon: Boxes },
    { page: 'statistics', label: 'Wyniki', icon: TrendingUp },
  ]
  return <nav className="mobile-tabbar" aria-label="Nawigacja">
    {tabs.map(({ page: tabPage, label, icon: Icon }) => <button type="button" key={tabPage} className={page === tabPage ? 'mobile-tab-active' : ''} onClick={() => onNavigate(tabPage)}><Icon size={21} strokeWidth={1.9} /><span>{label}</span></button>)}
    <button type="button" className={moreOpen || page === 'expenses' || page === 'settings' ? 'mobile-tab-active' : ''} aria-expanded={moreOpen} onClick={onMore}><MoreHorizontal size={22} /><span>Więcej</span></button>
  </nav>
}

function MobileMoreMenu({ page, onNavigate, onLogout }: { page: Page; onNavigate: (page: Page) => void; onLogout: () => void }) {
  return <><button type="button" className="more-scrim" aria-label="Zamknij menu" onClick={() => onNavigate(page)} /><section className="more-menu" aria-label="Więcej opcji"><button type="button" className={page === 'expenses' ? 'more-menu-active' : ''} onClick={() => onNavigate('expenses')}><CreditCard size={19} /><span>Koszty</span></button><button type="button" className={page === 'settings' ? 'more-menu-active' : ''} onClick={() => onNavigate('settings')}><Settings size={19} /><span>Ustawienia</span></button><button type="button" onClick={onLogout}><LogOut size={19} /><span>Wyloguj</span></button></section></>
}

function Login({ onLogin }: { onLogin: (username: string, password: string) => boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  return <main className="login-page">
    <section className="login-panel"><div className="brand-lockup login-brand"><div className="brand-mark"><span /></div><div><strong>nfc.</strong><small>panel zespołu</small></div></div>
      <h1>Zaloguj się</h1>
      <form className="login-form" onSubmit={(event) => { event.preventDefault(); if (!onLogin(username, password)) setError('Nieprawidłowy login lub hasło.') }}>
        <label>Login<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Twój login" required /></label>
        <label>Hasło<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary login-submit" type="submit">Zaloguj się</button>
      </form>
    </section>
  </main>
}

function Overview({ customers, stats, inventory, series, ownerName, onNavigate, onAddCustomer }: {
  customers: Customer[]; stats: ReturnType<typeof financials>;
  inventory: { stickers: number; stands: number }; series: { month: string; Przychód: number; Dochód: number }[];
  ownerName: string; onNavigate: (page: Page) => void; onAddCustomer: () => void
}) {
  const currentMonth = monthKey()
  const dueCustomers = customers.filter((customer) => customer.plan === 'monthly' && !customer.paidMonths[currentMonth])
  const recentCustomers = [...customers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4)
  return <>
    <div className="page-heading"><div><h1>Dzień dobry, {ownerName.split(' ')[0]}<span className="heading-period">.</span></h1></div><div className="heading-actions"><button type="button" className="button button-quiet" onClick={() => onNavigate('inventory')}><PackagePlus size={16} /> Dostawa</button><button type="button" className="button button-primary" onClick={onAddCustomer}><Plus size={17} /> Dodaj klienta</button></div></div>
    <section className="metric-grid">
      <Metric title="Przychód · ten miesiąc" value={currency(stats.revenue)} hint={`${stats.transactions} opłaconych płatności`} icon={ArrowDownLeft} tone="mint" />
      <Metric title="Dochód · po kosztach" value={currency(stats.income)} hint="Po prowizji, towarze i kosztach" icon={TrendingUp} tone="dark" />
      <Metric title="Klienci aktywni" value={String(customers.length)} hint="Wszystkie zapisane miejsca" icon={Building2} tone="lavender" />
      <Metric title="Do rozliczenia" value={String(dueCustomers.length)} hint={`${monthTitle()} · abonament`} icon={CalendarDays} tone="peach" alert={dueCustomers.length > 0} />
    </section>
    <div className="overview-grid">
      <section className="surface chart-surface"><div className="section-heading"><div><span className="eyebrow">WYNIKI FINANSOWE</span><h2>Przychód i dochód</h2></div><button type="button" className="text-button" onClick={() => onNavigate('statistics')}>Pełne statystyki <ArrowUpRight size={15} /></button></div>
        <div className="chart-legend"><span><i className="legend-income" />Przychód</span><span><i className="legend-profit" />Dochód</span><span className="legend-context">Ostatnie 6 miesięcy</span></div>
        <FinancialChart data={series} className="chart-wrap" height={193} />
      </section>
      <section className="surface inventory-surface"><div className="section-heading"><div><span className="eyebrow">STAN NA TERAZ</span><h2>Magazyn</h2></div><button type="button" className="icon-button" onClick={() => onNavigate('inventory')} aria-label="Otwórz magazyn"><ArrowUpRight size={17} /></button></div>
        <div className="stock-visual"><div className="stock-ring"><div className="ring-inner"><Boxes size={21} /><strong>{Math.max(0, inventory.stickers + inventory.stands)}</strong><small>sztuk razem</small></div></div><div className="stock-legend"><StockLine color="green" name="Naklejki NFC" count={inventory.stickers} /><StockLine color="blue" name="Stojaki" count={inventory.stands} /></div></div>
        <button type="button" className="button button-outline stock-add" onClick={() => onNavigate('inventory')}><Truck size={16} /> Zarządzaj dostawami</button>
      </section>
    </div>
    <div className="overview-bottom-grid">
      <section className="surface table-surface"><div className="section-heading"><div><span className="eyebrow">BAZA KONTAKTÓW</span><h2>Ostatni klienci</h2></div><button type="button" className="text-button" onClick={() => onNavigate('customers')}>Wszyscy klienci <ArrowUpRight size={15} /></button></div>
        {recentCustomers.length ? <div className="compact-list">{recentCustomers.map((customer) => <CustomerCompact key={customer.id} customer={customer} />)}</div> : <EmptyState icon={Building2} title="Tu pojawią się klienci" text="Dodaj pierwsze miejsce, aby zacząć prowadzić bazę." />}
      </section>
      <section className="surface due-surface"><div className="section-heading"><div><span className="eyebrow">PŁATNOŚCI MIESIĘCZNE</span><h2>Do sprawdzenia</h2></div><span className="due-count">{dueCustomers.length}</span></div>
        {dueCustomers.length ? <div className="due-list">{dueCustomers.slice(0, 4).map((customer) => <div className="due-row" key={customer.id}><div className="mini-avatar">{initials(customer.name)}</div><div className="due-copy"><strong>{customer.name}</strong><small>{currency(customer.amount)} · {monthTitle()}</small></div><span className="status status-pending">Oczekuje</span></div>)}</div> : <EmptyState icon={Check} title="Wszystko rozliczone" text="Nie ma oczekujących płatności za ten miesiąc." />}
      </section>
    </div>
  </>
}

function Metric({ title, value, hint, icon: Icon, tone, alert = false }: { title: string; value: string; hint: string; icon: typeof TrendingUp; tone: string; alert?: boolean }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{title}</span><span className="metric-icon"><Icon size={17} /></span></div><strong className="metric-value">{value}</strong><div className={`metric-hint ${alert ? 'hint-alert' : ''}`}>{alert && <span className="alert-dot" />}{hint}</div></article>
}

function StockLine({ color, name, count }: { color: string; name: string; count: number }) {
  return <div className="stock-line"><span className={`stock-dot stock-${color}`} /><span>{name}</span><strong>{count}</strong></div>
}

function FinancialChart({ data, className, height }: { data: { month: string; Przychód: number; Dochód: number }[]; className: string; height: number }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const hasValues = data.some((item) => item.Przychód !== 0 || item.Dochód !== 0)

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div className={className} ref={container}>
    {hasValues && width > 0 ? <BarChart width={width} height={height} data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barGap={4} barCategoryGap="35%"><CartesianGrid vertical={false} stroke="#e8ece8" strokeDasharray="4 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8c958f', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8c958f', fontSize: 11 }} tickFormatter={(value: number) => `${value} zł`} /><Tooltip formatter={(value) => currency(Number(value))} cursor={{ fill: '#f0f4ef' }} contentStyle={{ borderRadius: 8, border: '1px solid #e6ebe6', fontSize: 12 }} /><Bar dataKey="Przychód" fill="#a4d7bf" radius={[4, 4, 0, 0]} /><Bar dataKey="Dochód" fill="#156b52" radius={[4, 4, 0, 0]} /></BarChart>
      : <div className="chart-empty"><span><TrendingUp size={17} /></span><strong>Brak danych do wykresu</strong><small>Wyniki pojawią się po pierwszych płatnościach.</small></div>}
  </div>
}

function CustomersPage({ customers, search, onSearch, onAdd, onEdit, onDelete, onTogglePayment, onHistory }: {
  customers: Customer[]; search: string; onSearch: (value: string) => void; onAdd: () => void;
  onEdit: (customer: Customer) => void; onDelete: (customer: Customer) => void; onTogglePayment: (customer: Customer) => void; onHistory: (customer: Customer) => void
}) {
  return <>
    <div className="page-heading page-heading-compact"><div><div className="eyebrow">RELACJE I ROZLICZENIA</div><h1>Klienci<span className="heading-period">.</span></h1><p className="page-subtitle">{customers.length} {plural(customers.length, 'miejsce w bazie', 'miejsca w bazie', 'miejsc w bazie')}</p></div><button type="button" className="button button-primary" onClick={onAdd}><Plus size={17} /> Dodaj klienta</button></div>
    <section className="surface directory-surface"><div className="directory-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Szukaj miejsca, adresu lub telefonu" /></label><span className="directory-total">{customers.length} {plural(customers.length, 'klient', 'klientów', 'klientów')}</span></div>
      {customers.length ? <><div className="table-scroll customer-desktop-table"><table className="data-table"><thead><tr><th>MIEJSCE</th><th>KONTAKT</th><th>PLAN</th><th>NAKLEJKI / STOJAKI</th><th>ROZLICZENIE</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}>
        <td><div className="customer-cell"><CustomerAvatar customer={customer} /><div><strong>{customer.name}</strong><small>{customer.address}</small></div></div></td>
        <td><a className="contact-link" href={`tel:${customer.phone}`}>{customer.phone}</a><small className="contact-sub">{customer.email || customer.website || '—'}</small></td>
        <td><span className={`plan-pill ${customer.plan === 'monthly' ? 'plan-monthly' : 'plan-once'}`}>{customer.plan === 'monthly' ? 'Miesięczny' : 'Jednorazowy'}</span><small className="amount-sub">{currency(customer.amount)}{customer.plan === 'monthly' ? ' / mies.' : ''}</small></td>
        <td><span className="stock-quantity">{customer.stickers} <small>NFC</small><i>·</i>{customer.stands} <small>stoj.</small></span></td>
        <td>{customer.plan === 'monthly' ? <div className="payment-cell"><button type="button" className={`payment-toggle ${customer.paidMonths[monthKey()] ? 'payment-paid' : ''}`} onClick={() => onTogglePayment(customer)}><span>{customer.paidMonths[monthKey()] ? <Check size={12} /> : null}</span>{customer.paidMonths[monthKey()] ? 'Opłacono' : 'Oznacz wpłatę'}</button><button type="button" className="history-button" onClick={() => onHistory(customer)}>Historia</button></div> : <span className="status status-paid"><Check size={12} /> Opłacono</span>}</td>
        <td><div className="row-actions"><button type="button" className="icon-button" aria-label={`Edytuj ${customer.name}`} onClick={() => onEdit(customer)}><Pencil size={15} /></button><button type="button" className="icon-button danger-hover" aria-label={`Usuń ${customer.name}`} onClick={() => onDelete(customer)}><Trash2 size={15} /></button></div></td>
      </tr>)}</tbody></table></div><div className="customer-mobile-list">{customers.map((customer) => <article className="customer-mobile-row" key={customer.id}>
        <div className="customer-mobile-head"><CustomerAvatar customer={customer} /><div className="customer-mobile-name"><strong>{customer.name}</strong><small>{customer.address}</small></div><button type="button" className="icon-button mobile-row-action" aria-label={`Edytuj ${customer.name}`} onClick={() => onEdit(customer)}><Pencil size={18} /></button><button type="button" className="icon-button mobile-row-action danger-hover" aria-label={`Usuń ${customer.name}`} onClick={() => onDelete(customer)}><Trash2 size={18} /></button></div>
        <a className="customer-mobile-phone" href={`tel:${customer.phone}`}>{customer.phone}</a>
        {(customer.email || customer.website) && <span className="customer-mobile-extra">{customer.email || customer.website}</span>}
        <div className="customer-mobile-meta"><span className={`plan-pill ${customer.plan === 'monthly' ? 'plan-monthly' : 'plan-once'}`}>{customer.plan === 'monthly' ? 'Co miesiąc' : 'Jednorazowo'}</span><strong>{currency(customer.amount)}{customer.plan === 'monthly' ? ' / mies.' : ''}</strong><span className="mobile-stock-count">{customer.stickers} NFC · {customer.stands} stoj.</span></div>
        {customer.plan === 'monthly' ? <div className="customer-mobile-payment"><button type="button" className={`payment-toggle ${customer.paidMonths[monthKey()] ? 'payment-paid' : ''}`} onClick={() => onTogglePayment(customer)}><span>{customer.paidMonths[monthKey()] ? <Check size={14} /> : null}</span>{customer.paidMonths[monthKey()] ? 'Wpłata przyjęta' : 'Oznacz wpłatę'}</button><button type="button" className="mobile-history-button" onClick={() => onHistory(customer)}>Historia wpłat</button></div> : <span className="status status-paid"><Check size={14} /> Opłacono</span>}
      </article>)}</div></> : <EmptyState icon={ShoppingBag} title={search ? 'Nie znaleziono klientów' : 'Brak klientów'} text={search ? 'Zmień wpisaną nazwę, adres lub telefon.' : 'Dodaj pierwsze miejsce, aby zacząć.'}><button type="button" className="button button-primary" onClick={onAdd}><Plus size={16} /> Dodaj klienta</button></EmptyState>}
    </section>
    <div className="page-note"><span className="alert-dot" /> Płatności miesięczne rozliczaj przyciskiem „Oznacz wpłatę”. Nowy miesiąc pojawi się automatycznie.</div>
  </>
}

function InventoryPage({ deliveries, customers, inventory, onAdd }: { deliveries: Delivery[]; customers: Customer[]; inventory: { stickers: number; stands: number }; onAdd: () => void }) {
  const totalStickerCost = deliveries.reduce((sum, item) => sum + item.stickerCost, 0)
  const totalStandCost = deliveries.reduce((sum, item) => sum + item.standCost, 0)
  const soldStickers = customers.reduce((sum, item) => sum + item.stickers, 0)
  const soldStands = customers.reduce((sum, item) => sum + item.stands, 0)
  return <>
    <div className="page-heading page-heading-compact"><div><div className="eyebrow">ZAPASY I DOSTAWY</div><h1>Magazyn<span className="heading-period">.</span></h1><p className="page-subtitle">Stan aktualizuje się razem z nowymi klientami.</p></div><button type="button" className="button button-primary" onClick={onAdd}><PackagePlus size={17} /> Dodaj dostawę</button></div>
    <section className="stock-card-grid"><StockCard icon={ShoppingBag} label="Naklejki NFC" inStock={inventory.stickers} delivered={deliveries.reduce((sum, item) => sum + item.stickers, 0)} sold={soldStickers} cost={totalStickerCost} color="green" /><StockCard icon={Boxes} label="Stojaki" inStock={inventory.stands} delivered={deliveries.reduce((sum, item) => sum + item.stands, 0)} sold={soldStands} cost={totalStandCost} color="blue" /></section>
    <section className="surface inventory-table-surface"><div className="section-heading"><div><span className="eyebrow">HISTORIA UZUPEŁNIEŃ</span><h2>Dostawy</h2></div><span className="directory-total">{deliveries.length} {plural(deliveries.length, 'dostawa', 'dostawy', 'dostaw')}</span></div>
      {deliveries.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>DATA</th><th>NAKLEJKI NFC</th><th>STOJAKI</th><th>KOSZT NAKLEJEK</th><th>KOSZT STOJAKÓW</th><th>RAZEM</th></tr></thead><tbody>{[...deliveries].sort((a, b) => b.date.localeCompare(a.date)).map((delivery) => <tr key={delivery.id}><td>{dateLabel(delivery.date)}</td><td>{delivery.stickers} szt.</td><td>{delivery.stands} szt.</td><td>{currency(delivery.stickerCost)}</td><td>{currency(delivery.standCost)}</td><td className="table-strong">{currency(delivery.stickerCost + delivery.standCost)}</td></tr>)}</tbody></table></div> : <EmptyState icon={Truck} title="Brak dostaw" text="Dodaj pierwsze uzupełnienie, aby prowadzić stan i koszt zakupu." onAction={onAdd} actionLabel="Dodaj dostawę" />}
    </section>
    <div className="page-note"><span className="note-spark">✳</span> Dochód uwzględnia średni koszt jednostkowy zakupionych naklejek i stojaków.</div>
  </>
}

function StockCard({ icon: Icon, label, inStock, delivered, sold, cost, color }: { icon: typeof Boxes; label: string; inStock: number; delivered: number; sold: number; cost: number; color: string }) {
  return <article className={`surface stock-card stock-card-${color}`}><div className="stock-card-head"><span className={`large-stock-icon icon-${color}`}><Icon size={20} /></span><span className="stock-unit">PRODUKT</span></div><div className="stock-card-main"><div><span className="stock-label">{label}</span><div className="stock-count">{inStock}<small> szt.</small></div></div><span className={`stock-status ${inStock <= 5 ? 'stock-low' : ''}`}><i />{inStock <= 5 ? 'Niski stan' : 'Na stanie'}</span></div><div className="stock-progress"><span style={{ width: `${Math.min(100, delivered ? (inStock / delivered) * 100 : 0)}%` }} /></div><div className="stock-card-foot"><span>Przyjęto <strong>{delivered}</strong></span><span>Wydano <strong>{sold}</strong></span><span>Koszt zakupu <strong>{currency(cost)}</strong></span></div></article>
}

function ExpensesPage({ expenses, onAdd, onDelete }: { expenses: Expense[]; onAdd: () => void; onDelete: (expense: Expense) => void }) {
  const monthly = expenses.filter((expense) => expense.frequency === 'monthly').reduce((sum, expense) => sum + expense.amount, 0)
  const once = expenses.filter((expense) => expense.frequency === 'once').reduce((sum, expense) => sum + expense.amount, 0)
  return <>
    <div className="page-heading page-heading-compact"><div><div className="eyebrow">KOSZTY PROWADZENIA</div><h1>Koszty<span className="heading-period">.</span></h1><p className="page-subtitle">Dodaj wydatki, które pomniejszają dochód.</p></div><button type="button" className="button button-primary" onClick={onAdd}><Plus size={17} /> Dodaj koszt</button></div>
    <section className="metric-grid expense-metrics"><Metric title="Koszty miesięczne" value={currency(monthly)} hint="Powtarzają się co miesiąc" icon={CalendarDays} tone="mint" /><Metric title="Koszty jednorazowe" value={currency(once)} hint="Łącznie zapisane" icon={ArrowDownLeft} tone="peach" /><Metric title="Rodzaje kosztów" value={String(new Set(expenses.map((expense) => expense.category)).size)} hint="Kategorie w ewidencji" icon={CreditCard} tone="dark" /><Metric title="Prowizja Stripe" value="Ustawiana osobno" hint="Kwota od każdej wpłaty" icon={CircleDollarSign} tone="lavender" /></section>
    <section className="surface inventory-table-surface"><div className="section-heading"><div><span className="eyebrow">EWIDENCJA</span><h2>Wszystkie pozycje</h2></div><span className="directory-total">{expenses.length} wpisów</span></div>
      {expenses.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>NAZWA</th><th>KATEGORIA</th><th>POWTARZALNOŚĆ</th><th>DATA</th><th>KWOTA</th><th /></tr></thead><tbody>{[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => <tr key={expense.id}><td className="table-strong">{expense.name}</td><td>{expense.category}</td><td><span className={`plan-pill ${expense.frequency === 'monthly' ? 'plan-monthly' : 'plan-once'}`}>{expense.frequency === 'monthly' ? 'Co miesiąc' : 'Jednorazowy'}</span></td><td>{dateLabel(expense.date)}</td><td className="table-strong">{currency(expense.amount)}</td><td><button type="button" className="icon-button danger-hover" aria-label={`Usuń ${expense.name}`} onClick={() => onDelete(expense)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={CreditCard} title="Brak dodanych kosztów" text="Prowizja Stripe i koszty towaru są liczone oddzielnie." onAction={onAdd} actionLabel="Dodaj koszt" />}
    </section>
  </>
}

function StatisticsPage({ stats, series, month, onMonth }: { stats: ReturnType<typeof financials>; series: { month: string; Przychód: number; Dochód: number }[]; month: string; onMonth: (month: string) => void }) {
  return <>
    <div className="page-heading page-heading-compact"><div><div className="eyebrow">PODSUMOWANIE FINANSOWE</div><h1>Statystyki<span className="heading-period">.</span></h1><p className="page-subtitle">Przychód, prowizje i koszty w jednym miejscu.</p></div><label className="month-picker"><CalendarDays size={16} /><input type="month" value={month} onChange={(event) => onMonth(event.target.value)} /></label></div>
    <section className="metric-grid stats-metrics"><Metric title="Przychód" value={currency(stats.revenue)} hint={`${stats.transactions} opłaconych transakcji`} icon={ArrowDownLeft} tone="mint" /><Metric title="Dochód" value={currency(stats.income)} hint="Przychód pomniejszony o koszty" icon={TrendingUp} tone="dark" /><Metric title="Prowizja Stripe" value={currency(stats.stripe)} hint={`${stats.transactions} × ${currency(stats.transactions ? stats.stripe / stats.transactions : 0)}`} icon={CreditCard} tone="lavender" /><Metric title="Koszt towaru i wydatki" value={currency(stats.goodsCost + stats.expenseTotal)} hint="COGS + koszty w wybranym miesiącu" icon={Boxes} tone="peach" /></section>
    <section className="surface chart-surface stats-chart"><div className="section-heading"><div><span className="eyebrow">TREND</span><h2>Ostatnie sześć miesięcy</h2></div><span className="chart-period">{monthTitleForKey(month)}</span></div><div className="chart-legend"><span><i className="legend-income" />Przychód</span><span><i className="legend-profit" />Dochód</span></div><FinancialChart data={series} className="chart-wrap chart-wrap-large" height={300} /></section>
    <section className="surface formula-surface"><div className="formula-mark"><CircleDollarSign size={20} /></div><div><span className="eyebrow">JAK LICZYMY DOCHÓD</span><p><strong>Przychód</strong> − prowizja od opłaconej transakcji − średni koszt sprzedanych produktów − koszty jednorazowe i cykliczne.</p></div></section>
  </>
}

function SettingsPage({ data, onChange }: { data: AppData; onChange: (fee: number) => void }) {
  return <>
    <div className="page-heading page-heading-compact"><div><div className="eyebrow">KONFIGURACJA PANELU</div><h1>Ustawienia<span className="heading-period">.</span></h1><p className="page-subtitle">Wartości używane przy obliczaniu dochodu.</p></div></div>
    <section className="surface settings-surface"><div className="settings-icon"><CreditCard size={20} /></div><div className="settings-copy"><h2>Prowizja Stripe</h2><p>Stała kwota odejmowana od każdej opłaconej transakcji, także miesięcznej.</p></div><label className="currency-input"><input type="number" min="0" step="0.01" value={data.stripeFee} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} /><span>zł / transakcję</span></label></section>
    <section className="surface settings-surface settings-users"><div className="settings-icon settings-icon-muted"><Users size={20} /></div><div className="settings-copy"><h2>Użytkownicy</h2><p>Konta edytujesz w pliku <code>src/config.ts</code>. Zmiany wymagają ponownego wdrożenia.</p></div><div className="user-stack">{users.map((user) => <span key={user.id} className="user-chip"><i>{user.initials}</i>{user.name}<small>{user.role === 'admin' ? 'ADMIN' : 'USER'}</small></span>)}</div></section>
    <div className="security-note"><span>!</span><p><strong>Uwaga o bezpieczeństwie.</strong> Logowanie konfiguracyjne jest tylko ekranem dostępu. Hasła trafiają do publicznego kodu strony i nie chronią danych w Supabase. Do wdrożenia z danymi klientów potrzebne są Supabase Auth i polityki RLS.</p></div>
  </>
}

function CustomerCompact({ customer }: { customer: Customer }) {
  return <div className="compact-row"><CustomerAvatar customer={customer} /><div className="compact-copy"><strong>{customer.name}</strong><small>{customer.address}</small></div><span className={`plan-pill ${customer.plan === 'monthly' ? 'plan-monthly' : 'plan-once'}`}>{customer.plan === 'monthly' ? 'Miesięczny' : 'Jednorazowy'}</span><strong className="compact-amount">{currency(customer.amount)}{customer.plan === 'monthly' ? <small> / mies.</small> : null}</strong></div>
}

function CustomerAvatar({ customer }: { customer: Customer }) {
  return customer.photoUrl ? <img className="customer-avatar" src={customer.photoUrl} alt="" /> : <div className="customer-avatar avatar-placeholder"><Building2 size={18} /></div>
}

function EmptyState({ icon: Icon, title, text, onAction, actionLabel, children }: { icon: typeof Building2; title: string; text: string; onAction?: () => void; actionLabel?: string; children?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={21} /></div><strong>{title}</strong><p>{text}</p>{children ?? (onAction && <button type="button" className="button button-outline" onClick={onAction}><Plus size={16} />{actionLabel}</button>)}</div>
}

function CustomerModal({ customer, ownerId, inventory, onClose, onSave }: { customer?: Customer; ownerId: string; inventory: { stickers: number; stands: number }; onClose: () => void; onSave: (draft: DraftCustomer, existing?: Customer) => boolean }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState(customer?.name ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [website, setWebsite] = useState(customer?.website ?? '')
  const [photoUrl, setPhotoUrl] = useState(customer?.photoUrl ?? '')
  const [plan, setPlan] = useState<PaymentPlan>(customer?.plan ?? 'monthly')
  const [amount, setAmount] = useState(customer?.amount ?? 15)
  const [channel, setChannel] = useState(customer?.channel ?? null)
  const [stickers, setStickers] = useState(customer?.stickers ?? 1)
  const [stands, setStands] = useState(customer?.stands ?? 0)
  const [error, setError] = useState('')
  const [showOptional, setShowOptional] = useState(Boolean(customer?.email || customer?.website || customer?.photoUrl))
  const choices = plan === 'monthly' ? monthlyAmounts : oneTimeAmounts
  const isCustom = !choices.includes(amount)
  const stepNames = ['Dane klienta', 'Płatność', 'Produkty']

  function continueStep() {
    setError('')
    if (step === 1 && (!name.trim() || !address.trim() || !phone.trim())) {
      setError('Uzupełnij nazwę, adres i telefon.')
      return
    }
    if (step === 2 && plan === 'one-time' && !channel) {
      setError('Wybierz płatność na miejscu albo internetową.')
      return
    }
    if (step === 2 && amount <= 0) {
      setError('Wpisz kwotę większą od zera.')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (step < 3) { continueStep(); return }
    const saved = onSave({ ownerId, name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim(), website: website.trim(), photoUrl: photoUrl.trim(), plan, amount, channel, stickers, stands }, customer)
    if (!saved) setError('Brak wystarczającej liczby produktów w magazynie. Dodaj dostawę lub zmniejsz ilość.')
  }
  return <Modal title={customer ? 'Edytuj klienta' : 'Nowy klient'} eyebrow={`${step} z 3 · ${stepNames[step - 1]}`} onClose={onClose} wide>
    <form onSubmit={submit} className="customer-form" noValidate>
      <div className="step-progress" aria-label={`Krok ${step} z 3`}>{stepNames.map((label, index) => <span key={label} className={index < step ? 'step-progress-done' : ''} />)}</div>
      {step === 1 && <div className="form-section step-section"><div className="form-section-title"><span>1</span><div><strong>Gdzie jest naklejka?</strong><small>Podstawowe dane miejsca</small></div></div><div className="form-grid">
        <label className="form-field form-span-two">Nazwa miejsca<input value={name} onChange={(event) => setName(event.target.value)} placeholder="np. Kawiarnia Północ" autoFocus required /></label>
        <label className="form-field form-span-two">Adres<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ulica i miasto" required /></label>
        <label className="form-field form-span-two">Numer telefonu<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+48 000 000 000" required /></label>
      </div><button type="button" className="optional-toggle" aria-expanded={showOptional} onClick={() => setShowOptional((open) => !open)}><ChevronDown size={17} />{showOptional ? 'Ukryj dodatkowe dane' : 'Dodaj e-mail, stronę lub zdjęcie'}</button>
        {showOptional && <div className="form-grid optional-fields"><label className="form-field form-span-two">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="kontakt@firma.pl" /></label><label className="form-field form-span-two">Strona internetowa<input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" /></label><label className="form-field form-span-two">Link do zdjęcia lub logo<input type="url" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="https://..." /></label></div>}
      </div>}
      {step === 2 && <div className="form-section step-section"><div className="form-section-title"><span>2</span><div><strong>Jak klient płaci?</strong><small>Wybierz plan i kwotę</small></div></div>
        <div className="segmented-control payment-segments"><button type="button" className={plan === 'monthly' ? 'segment-active' : ''} onClick={() => { setPlan('monthly'); setAmount(monthlyAmounts.includes(amount) ? amount : 15); setChannel(null) }}><CalendarDays size={18} /> Co miesiąc</button><button type="button" className={plan === 'one-time' ? 'segment-active' : ''} onClick={() => { setPlan('one-time'); setAmount(oneTimeAmounts.includes(amount) ? amount : 25) }}><CircleDollarSign size={18} /> Raz</button></div>
        <label className="form-field payment-amount-field">Kwota {plan === 'monthly' && <span className="optional">miesięcznie</span>}<select value={isCustom ? 'custom' : String(amount)} onChange={(event) => event.target.value === 'custom' ? setAmount(0) : setAmount(Number(event.target.value))}>{choices.map((value) => <option key={value} value={value}>{value} zł</option>)}<option value="custom">Inna kwota</option></select>{isCustom && <span className="custom-amount"><input type="number" min="1" step="0.01" value={amount || ''} onChange={(event) => setAmount(Number(event.target.value))} placeholder="Wpisz kwotę" autoFocus /><span>zł</span></span>}</label>
        {plan === 'one-time' && <fieldset className="channel-field"><legend>Gdzie klient zapłaci?</legend><div className="channel-options"><button type="button" className={channel === 'onsite' ? 'channel-selected' : ''} onClick={() => setChannel('onsite')}>Na miejscu</button><button type="button" className={channel === 'online' ? 'channel-selected' : ''} onClick={() => setChannel('online')}>Internetowo</button></div></fieldset>}
        {plan === 'monthly' && <p className="form-explainer"><CalendarDays size={17} /> Pierwsze rozliczenie: <strong>{monthTitle()}</strong></p>}
      </div>}
      {step === 3 && <div className="form-section step-section"><div className="form-section-title"><span>3</span><div><strong>Co wydajesz?</strong><small>Stan magazynu zmieni się po dodaniu klienta</small></div></div>
        <div className="available-stock"><span>Dostępne teraz</span><strong>{inventory.stickers + (customer?.stickers ?? 0)} naklejek</strong><i>·</i><strong>{inventory.stands + (customer?.stands ?? 0)} stojaków</strong></div>
        <div className="quantity-grid"><QuantityControl label="Naklejki NFC" value={stickers} onChange={setStickers} /><QuantityControl label="Stojaki" value={stands} onChange={setStands} /></div>
        <div className="order-summary"><span className="summary-customer">{name || 'Nowy klient'}<small>{address}</small></span><strong className="summary-price">{plan === 'monthly' ? `${currency(amount)} / mies.` : `${currency(amount)} · raz`}</strong><span className="summary-products">{stickers} {plural(stickers, 'naklejka', 'naklejki', 'naklejek')} · {stands} {plural(stands, 'stojak', 'stojaki', 'stojaków')}</span></div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions step-actions">{step > 1 ? <button type="button" className="button button-quiet" onClick={() => { setError(''); setStep((current) => current - 1) }}>Wstecz</button> : <button type="button" className="button button-quiet" onClick={onClose}>Anuluj</button>}{step < 3 ? <button type="button" className="button button-primary" onClick={continueStep}>Dalej <ArrowUpRight size={17} /></button> : <button type="submit" className="button button-primary">{customer ? 'Zapisz klienta' : 'Dodaj klienta'} <Check size={17} /></button>}</div>
    </form>
  </Modal>
}

function QuantityControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="quantity-control"><span>{label}</span><div><button type="button" aria-label={`Zmniejsz: ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>−</button><input type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} /><button type="button" aria-label={`Zwiększ: ${label}`} onClick={() => onChange(value + 1)}>+</button></div></div>
}

function PaymentHistoryModal({ customer, onToggle, onClose }: { customer: Customer; onToggle: (month: string) => void; onClose: () => void }) {
  const [firstYear, firstMonth] = customer.createdAt.slice(0, 7).split('-').map(Number)
  const firstMonthIndex = firstYear * 12 + firstMonth - 1
  const currentMonthIndex = mountedAt.getFullYear() * 12 + mountedAt.getMonth()
  const months = Array.from({ length: Math.max(0, currentMonthIndex - firstMonthIndex + 1) }, (_, index) => {
    const absoluteMonth = firstMonthIndex + index
    return `${Math.floor(absoluteMonth / 12)}-${String(absoluteMonth % 12 + 1).padStart(2, '0')}`
  })
  return <Modal title={customer.name} eyebrow="MIESIĘCZNA HISTORIA WPŁAT" onClose={onClose}>
    <div className="payment-history"><p className="modal-intro">Zaznacz miesiące, za które płatność została otrzymana. Każdy miesiąc jest rozliczany osobno.</p><div className="month-list">{months.map((key) => {
      const paid = Boolean(customer.paidMonths[key])
      return <div className="month-row" key={key}><div><CalendarDays size={15} /><strong>{monthTitleForKey(key)}</strong></div><span className="month-amount">{currency(customer.amount)}</span><button type="button" className={`payment-toggle ${paid ? 'payment-paid' : ''}`} onClick={() => onToggle(key)}><span>{paid ? <Check size={12} /> : null}</span>{paid ? 'Opłacono' : 'Oczekuje'}</button></div>
    })}</div><div className="modal-actions"><button type="button" className="button button-primary" onClick={onClose}>Gotowe</button></div></div>
  </Modal>
}

function DeliveryModal({ ownerId, onClose, onSave }: { ownerId: string; onClose: () => void; onSave: (input: Omit<Delivery, 'id'>) => void }) {
  const [date, setDate] = useState(today())
  const [stickers, setStickers] = useState(0)
  const [stands, setStands] = useState(0)
  const [stickerCost, setStickerCost] = useState(0)
  const [standCost, setStandCost] = useState(0)
  const [error, setError] = useState('')
  return <Modal title="Nowa dostawa" eyebrow="UZUPEŁNIJ ZAPASY" onClose={onClose}>
    <form className="simple-form" onSubmit={(event) => { event.preventDefault(); if (!stickers && !stands) { setError('Dodaj przynajmniej jeden produkt.'); return } onSave({ ownerId, date, stickers, stands, stickerCost, standCost }) }}>
      <p className="modal-intro">Przyjęte produkty zwiększą stan magazynowy. Koszt dostawy posłuży do wyliczenia średniego kosztu zakupu.</p><label className="form-field">Data dostawy<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <div className="delivery-item"><div className="delivery-item-title"><ShoppingBag size={17} /><strong>Naklejki NFC</strong></div><div className="form-grid"><label className="form-field">Ilość sztuk<input type="number" min="0" value={stickers} onChange={(event) => setStickers(Math.max(0, Number(event.target.value)))} /></label><label className="form-field">Łączny koszt<input type="number" min="0" step="0.01" value={stickerCost} onChange={(event) => setStickerCost(Math.max(0, Number(event.target.value)))} /><span className="field-suffix">zł</span></label></div></div>
      <div className="delivery-item"><div className="delivery-item-title"><Boxes size={17} /><strong>Stojaki</strong></div><div className="form-grid"><label className="form-field">Ilość sztuk<input type="number" min="0" value={stands} onChange={(event) => setStands(Math.max(0, Number(event.target.value)))} /></label><label className="form-field">Łączny koszt<input type="number" min="0" step="0.01" value={standCost} onChange={(event) => setStandCost(Math.max(0, Number(event.target.value)))} /><span className="field-suffix">zł</span></label></div></div>
      {error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Anuluj</button><button type="submit" className="button button-primary"><PackagePlus size={16} /> Zapisz dostawę</button></div>
    </form>
  </Modal>
}

function ExpenseModal({ ownerId, onClose, onSave }: { ownerId: string; onClose: () => void; onSave: (input: Omit<Expense, 'id'>) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Inne')
  const [amount, setAmount] = useState(0)
  const [frequency, setFrequency] = useState<ExpenseFrequency>('once')
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')
  return <Modal title="Dodaj koszt" eyebrow="NOWA POZYCJA" onClose={onClose}>
    <form className="simple-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || amount <= 0) { setError('Podaj nazwę i kwotę większą od zera.'); return } onSave({ ownerId, name: name.trim(), category, amount, frequency, date }) }}>
      <label className="form-field">Nazwa kosztu<input value={name} onChange={(event) => setName(event.target.value)} placeholder="np. Wysyłka materiałów" required /></label>
      <div className="form-grid"><label className="form-field">Kategoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{['Stripe', 'Wysyłka', 'Podatki', 'Materiały', 'Inne'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-field">Kwota<input type="number" min="0.01" step="0.01" value={amount || ''} onChange={(event) => setAmount(Number(event.target.value))} placeholder="0,00" required /><span className="field-suffix">zł</span></label></div>
      <fieldset className="frequency-field"><legend>Powtarzalność</legend><div className="segmented-control"><button type="button" className={frequency === 'once' ? 'segment-active' : ''} onClick={() => setFrequency('once')}>Jednorazowy</button><button type="button" className={frequency === 'monthly' ? 'segment-active' : ''} onClick={() => setFrequency('monthly')}><CalendarDays size={15} /> Co miesiąc</button></div></fieldset>
      <label className="form-field">{frequency === 'monthly' ? 'Pierwszy miesiąc' : 'Data'}<input type={frequency === 'monthly' ? 'month' : 'date'} value={frequency === 'monthly' ? date.slice(0, 7) : date} onChange={(event) => setDate(frequency === 'monthly' ? `${event.target.value}-01` : event.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Anuluj</button><button type="submit" className="button button-primary"><Plus size={16} /> Dodaj koszt</button></div>
    </form>
  </Modal>
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-panel ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Zamknij"><X size={19} /></button></header>{children}</section></div>
}

function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function plural(value: number, one: string, few: string, many: string) {
  if (value === 1) return one
  if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14)) return few
  return many
}

export default App
