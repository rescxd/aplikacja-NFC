# Findings

- Workspace had no application code, only `.agents/` and `.claude/` skill installation directories plus `skills-lock.json`.
- Installed `apple-design` skill emphasizes immediate feedback, responsive/interruptible springs for gestures, spatial consistency, reduced-motion/accessibility, hierarchy, and disciplined typography.
- User chose Supabase for shared data after noting Vercel-only static storage is not shared/persistent.
- User explicitly retained hardcoded frontend config passwords and accepted the acknowledged security weakness; avoid describing this as secure authentication.
- Monthly customers need payment status checkboxes by calendar month, beginning in the month the customer was created.
- One-time sales are only added after payment, per user clarification.
- Costs need a configurable Stripe fee per transaction; inventory unit costs come from deliveries; other costs can recur monthly or be one-time.
- Security limitation: frontend-only passwords do not secure Supabase rows. True isolation requires Supabase Auth/RLS or a server-side API.
