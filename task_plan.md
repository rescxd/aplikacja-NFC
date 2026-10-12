# NFC Business Manager

## Goal
Build a responsive Polish-language web app for managing NFC sticker customers, inventory, monthly and one-time payments, expenses, and per-user/admin views. Use the apple-design skill and Supabase for shared persistence.

## Decisions
- React + Vite SPA hosted on Vercel; Supabase database stores shared records.
- Local config-based login (2 normal users + admin defaults); this is convenience-only and not secure authentication.
- Normal users see/manage only their own records in the UI; admin selects a user.
- One-time sales are registered as paid; recurring plans track paid status month by month.
- Stock deliveries store quantities and item costs; expense entries support one-time or monthly recurrence.
- Income is revenue minus fixed Stripe fee per paid transaction, cost of sold inventory, and applicable expenses.

## Phases
1. Scaffold app, dependencies, and Supabase integration/configuration.
2. Build dashboard, navigation, customers and customer/payment workflows.
3. Build inventory, deliveries, expenses, statistics, and admin/user filtering.
4. Validate production build and document Supabase/Vercel setup and security caveat.

## Status
- Original app build: complete
- Mobile UX redesign: complete

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Vite refused to scaffold in non-empty root | 1 | Scaffolded in a temporary folder, copied app files, removed temporary folder |
| Browser couldn't resolve Supabase host | 1 | Kept localStorage fallback; documented that remote sync needs reachable project, Auth, and RLS |
| `git check-ignore` unavailable | 1 | Workspace is not a Git repository; confirmed `.env.local` matches `.gitignore`'s `*.local` rule |

## Mobile UX Redesign
- Removed the decorative login split panel, static sync badge, and sidebar filler copy.
- Added bottom navigation on phone/small tablet and mobile-more menu for secondary destinations.
- Added a three-step customer flow (contact, payment, products), a clear stock availability line, and larger touch targets.
- Replaced the mobile customer table with touch-friendly customer rows/actions.
- Verified responsive width at 320, 390, and 820 CSS px; tested monthly history, one-time channel validation, navigation, and create/delete flow.
