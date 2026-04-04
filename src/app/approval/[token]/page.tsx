import { ApprovalPublicPage } from '@/components/approval-public-page'

interface ApprovalPageProps {
  params: Promise<{ token: string }>
}

export default async function ApprovalPage({ params }: ApprovalPageProps) {
  const { token } = await params
  return <ApprovalPublicPage token={token} />
}
