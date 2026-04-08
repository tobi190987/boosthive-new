import { redirect } from 'next/navigation'

export default function ApprovalsPage() {
  redirect('/tools/kanban?tab=approvals')
}
