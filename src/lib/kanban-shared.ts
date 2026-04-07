export const KANBAN_WORKFLOW_STATUSES = ['none', 'in_progress', 'client_review', 'done'] as const
export type KanbanWorkflowStatus = (typeof KANBAN_WORKFLOW_STATUSES)[number]

export function kanbanStatusLabel(status: KanbanWorkflowStatus): string {
  switch (status) {
    case 'none':
      return 'Kein Status'
    case 'in_progress':
      return 'In Bearbeitung'
    case 'client_review':
      return 'Beim Kunden'
    case 'done':
      return 'Fertig'
    default:
      return status
  }
}
