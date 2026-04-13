// This page is never rendered directly — the /api/portal/auth/callback route
// handles the Supabase magic link redirect and redirects to /portal/dashboard.
// This file exists only to satisfy Next.js routing for the /portal/auth/callback path.
export default function PortalAuthCallbackPage() {
  return null
}
