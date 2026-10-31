import type { DemoMemory, MeetingRecord } from './demoMemory'

type MeetingRecordCardProps = {
  meeting: MeetingRecord
  memory: DemoMemory
}

function taskStatus(taskId: string, fallback: string, memory: DemoMemory): string {
  if (taskId !== 'confirm-integration-delivery-date') return fallback.replace('_', ' ')
  if (memory.proposalStatus === 'approved') return 'approved'
  if (memory.proposalStatus === 'rejected') return 'rejected'
  return 'awaiting approval'
}

export default function MeetingRecordCard({ meeting, memory }: MeetingRecordCardProps) {
  return (
    <section className="meeting-record" aria-label={`${meeting.title} meeting record`}>
      <div className="meeting-record-head">
        <span>Meeting record</span>
        <time>{meeting.occurredAtLabel}</time>
      </div>
      <h2>{meeting.title}</h2>
      <p>{meeting.summary}</p>

      {meeting.decisions.length > 0 && (
        <div className="meeting-record-section">
          <h3>Decisions</h3>
          <ul>
            {meeting.decisions.map((decision) => (
              <li key={decision.id}>
                {decision.text}
                {decision.dateLabel ? ` (${decision.dateLabel})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {meeting.tasks.length > 0 && (
        <div className="meeting-record-section">
          <h3>Tasks</h3>
          <ul>
            {meeting.tasks.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <small>
                  {task.owner} - {taskStatus(task.id, task.status, memory)}
                  {task.dueLabel ? ` - due ${task.dueLabel}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meeting.blockers.length > 0 && (
        <div className="meeting-record-blocker">
          <strong>Blocker</strong>
          <span>{meeting.blockers.join('; ')}</span>
        </div>
      )}

      <details className="meeting-transcript">
        <summary>Transcript excerpts</summary>
        {meeting.transcript.map((turn) => (
          <p key={`${turn.speaker}-${turn.text}`}>
            <strong>{turn.speaker}:</strong> {turn.text}
          </p>
        ))}
      </details>
    </section>
  )
}
