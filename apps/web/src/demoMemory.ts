export type ProposalStatus = 'pending' | 'approved' | 'rejected'

export type DemoMemory = {
  proposalStatus: ProposalStatus
  approvedAt: string | null
  auditTrail: Array<{
    action: 'approved' | 'rejected'
    actor: string
    at: string
    sourceMeeting: string
  }>
}

export type OfficeAnswer = {
  text: string
  sources: Array<{ label: string; detail: string; pending?: boolean }>
}

export type TranscriptTurn = {
  speaker: string
  text: string
}

export type MeetingTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type MeetingTask = {
  id: string
  title: string
  owner: string
  dueLabel?: string
  status: MeetingTaskStatus
  milestone?: string
}

export type MeetingDecision = {
  id: string
  text: string
  rationale?: string
  dateLabel?: string
}

export type MeetingRecord = {
  id: string
  title: string
  kind: 'customer' | 'internal'
  occurredAtLabel: string
  participants: string[]
  transcript: TranscriptTurn[]
  summary: string
  decisions: MeetingDecision[]
  tasks: MeetingTask[]
  blockers: string[]
  keywords: string[]
}

const STORAGE_KEY = 'commonplace-hackathon-demo-v1'
const MEETING = 'Acme integration check-in'
const PROPOSED_TASK_ID = 'confirm-integration-delivery-date'

export const MEETING_RECORDS: MeetingRecord[] = [
  {
    id: 'acme-integration-check-in',
    title: MEETING,
    kind: 'customer',
    occurredAtLabel: 'Today, 10:06 AM',
    participants: ['Alex Morgan', 'Jamie Lee', 'Priya Shah (Acme)'],
    transcript: [
      {
        speaker: 'Priya Shah (Acme)',
        text: 'We are planning our rollout around March 15. Can your team confirm the integration will be ready by then?',
      },
      {
        speaker: 'Alex Morgan',
        text: 'We will confirm the date with the delivery team. Please do not treat March 15 as committed until the update is approved.',
      },
      {
        speaker: 'Jamie Lee',
        text: 'The remaining technical risk is end-to-end testing once sandbox access is available.',
      },
    ],
    summary:
      'Acme asked the team to confirm a March 15 integration target. The team did not commit during the call; the delivery update is a proposed record change requiring approval.',
    decisions: [
      {
        id: 'hold-commitment-until-approval',
        text: 'Do not treat March 15 as an external commitment until the delivery update is approved',
        rationale: 'The date still depends on delivery-team confirmation and sandbox testing.',
      },
    ],
    tasks: [
      {
        id: PROPOSED_TASK_ID,
        title: 'Confirm integration delivery by March 15',
        owner: 'Alex Morgan',
        dueLabel: 'March 15',
        status: 'todo',
        milestone: 'Integration launch',
      },
    ],
    blockers: [],
    keywords: ['acme', 'customer', 'integration', 'march', 'delivery', 'commitment'],
  },
  {
    id: 'acme-delivery-standup',
    title: 'Acme delivery standup',
    kind: 'internal',
    occurredAtLabel: 'Yesterday, 4:30 PM',
    participants: ['Alex Morgan', 'Jamie Lee'],
    transcript: [
      {
        speaker: 'Jamie Lee',
        text: 'Acme IT still has not issued the sandbox credentials, so end-to-end testing cannot start yet.',
      },
      {
        speaker: 'Alex Morgan',
        text: 'Keep failed webhook events safe by using exponential backoff rather than dropping them after the first retry.',
      },
    ],
    summary:
      'The delivery team is waiting on Acme IT for sandbox credentials. Webhook delivery will use exponential backoff so failed customer events are retried instead of dropped.',
    decisions: [
      {
        id: 'webhook-retry-backoff',
        text: 'Use exponential backoff for webhook retries',
        rationale: 'Failed customer events must be retried instead of dropped.',
      },
    ],
    tasks: [
      {
        id: 'obtain-sandbox-credentials',
        title: 'Obtain Acme sandbox credentials',
        owner: 'Jamie Lee',
        status: 'blocked',
        milestone: 'Integration launch',
      },
      {
        id: 'implement-webhook-retry-backoff',
        title: 'Implement webhook retry backoff',
        owner: 'Alex Morgan',
        status: 'in_progress',
        milestone: 'Integration launch',
      },
    ],
    blockers: ['Waiting on Acme IT for sandbox credentials'],
    keywords: ['acme', 'delivery', 'standup', 'sandbox', 'credentials', 'webhook', 'testing', 'blocker'],
  },
  {
    id: 'integration-launch-planning',
    title: 'Integration launch planning',
    kind: 'internal',
    occurredAtLabel: 'Monday, 9:00 AM',
    participants: ['Alex Morgan', 'Jamie Lee', 'Sara Chen'],
    transcript: [
      {
        speaker: 'Sara Chen',
        text: 'The release checklist needs to be ready before the internal beta, and scope should freeze on February 21.',
      },
      {
        speaker: 'Alex Morgan',
        text: 'Agreed. The internal beta comes first so the customer rollout does not become the first full test.',
      },
    ],
    summary:
      'The team planned an internal beta before the customer rollout, with a February 21 scope freeze and a release checklist owned by Sara Chen.',
    decisions: [
      {
        id: 'internal-beta-before-rollout',
        text: 'Run an internal beta before the customer rollout',
        rationale: 'The customer rollout should not be the first full test of the integration.',
      },
      {
        id: 'integration-scope-freeze',
        text: 'Freeze integration scope',
        dateLabel: 'February 21',
        rationale: 'The beta and release checklist need a stable scope.',
      },
    ],
    tasks: [
      {
        id: 'prepare-release-checklist',
        title: 'Prepare the integration release checklist',
        owner: 'Sara Chen',
        dueLabel: 'February 28',
        status: 'todo',
        milestone: 'Integration launch',
      },
    ],
    blockers: [],
    keywords: ['launch', 'planning', 'beta', 'rollout', 'scope', 'freeze', 'release', 'checklist'],
  },
]

export const initialDemoMemory: DemoMemory = {
  proposalStatus: 'pending',
  approvedAt: null,
  auditTrail: [],
}

export function loadDemoMemory(): DemoMemory {
  if (typeof window === 'undefined') return initialDemoMemory
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialDemoMemory
    const value = JSON.parse(saved) as Partial<DemoMemory>
    if (!['pending', 'approved', 'rejected'].includes(value.proposalStatus ?? '')) return initialDemoMemory
    return {
      proposalStatus: value.proposalStatus as ProposalStatus,
      approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
      auditTrail: Array.isArray(value.auditTrail) ? value.auditTrail : [],
    }
  } catch {
    return initialDemoMemory
  }
}

export function saveDemoMemory(memory: DemoMemory) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // The live interaction still works for this session if storage is unavailable.
  }
}

export function resetDemoMemory() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
  return initialDemoMemory
}

export function decideProposal(memory: DemoMemory, action: 'approved' | 'rejected', at = new Date().toISOString()): DemoMemory {
  const next: DemoMemory = {
    proposalStatus: action,
    approvedAt: action === 'approved' ? at : null,
    auditTrail: [...memory.auditTrail, { action, actor: 'Alex Morgan', at, sourceMeeting: MEETING }],
  }
  saveDemoMemory(next)
  return next
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'about', 'by', 'did', 'do', 'does', 'for', 'from', 'have', 'is', 'it',
  'me', 'of', 'on', 'or', 'our', 'that', 'the', 'this', 'to', 'was', 'we', 'what', 'when', 'who',
  'why', 'with', 'yet',
])

function questionTokens(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  )
}

function overlapScore(tokens: Set<string>, text: string): number {
  const normalized = text.toLowerCase()
  let score = 0
  tokens.forEach((token) => {
    if (normalized.includes(token)) score += 1
  })
  return score
}

function sourceFor(meeting: MeetingRecord, memory: DemoMemory): OfficeAnswer['sources'][number] {
  if (meeting.id !== 'acme-integration-check-in') {
    return {
      label: meeting.title,
      detail: `${meeting.occurredAtLabel} - approved meeting record`,
    }
  }

  return {
    label: meeting.title,
    detail:
      memory.proposalStatus === 'approved'
        ? `${meeting.occurredAtLabel} - approved by Alex Morgan`
        : memory.proposalStatus === 'rejected'
          ? `${meeting.occurredAtLabel} - proposal rejected by Alex Morgan`
          : `${meeting.occurredAtLabel} - proposed update, not yet approved`,
    pending: memory.proposalStatus === 'pending',
  }
}

function answerFrom(text: string, meetings: MeetingRecord[], memory: DemoMemory): OfficeAnswer {
  return {
    text,
    sources: meetings.map((meeting) => sourceFor(meeting, memory)),
  }
}

function noRecordAnswer(): OfficeAnswer {
  return {
    text: 'I do not have an approved record that answers that yet. Try asking about the Acme integration, its blockers, decisions, tasks, or owners.',
    sources: [],
  }
}

function bestMeeting(tokens: Set<string>): { meeting: MeetingRecord; score: number } {
  let result = { meeting: MEETING_RECORDS[0], score: -1 }
  for (const meeting of MEETING_RECORDS) {
    const searchable = [
      meeting.title,
      meeting.summary,
      meeting.keywords.join(' '),
      meeting.participants.join(' '),
      meeting.decisions.map((decision) => decision.text).join(' '),
      meeting.tasks.map((task) => `${task.title} ${task.owner} ${task.milestone ?? ''}`).join(' '),
      meeting.blockers.join(' '),
    ].join(' ')
    const score = overlapScore(tokens, searchable)
    if (score > result.score) result = { meeting, score }
  }
  return result
}

export function answerOfficeQuestion(question: string, memory: DemoMemory): OfficeAnswer {
  const normalized = question.trim().toLowerCase()
  if (!normalized) return noRecordAnswer()

  const tokens = questionTokens(normalized)
  const asksForOwner = /\bwho\b|owner|owns|responsible|assigned/.test(normalized)
  const asksForDate = /when|date|deadline|deliver|due|freeze|march|february|\b15\b|\b21\b|\b28\b/.test(normalized)
  const asksForDecision = /decid|decision|agreed|why did|rationale/.test(normalized)
  const asksForBlocker = /block|blocked|blocking|risk|waiting|stuck/.test(normalized)
  const asksForTasks = /task|tasks|todo|to do|action item/.test(normalized)
  const asksForSummary = /summar|summary|what happened|recap/.test(normalized)
  const asksAboutAcme = /acme|integration|project|status|progress/.test(normalized)

  if (asksForDecision) {
    const decisions = MEETING_RECORDS.flatMap((meeting) =>
      meeting.decisions.map((decision) => ({
        meeting,
        decision,
        score: overlapScore(tokens, `${decision.text} ${decision.rationale ?? ''} ${meeting.title}`),
      })),
    ).sort((a, b) => b.score - a.score)

    const best = decisions[0]
    if (best && best.score >= 2) {
      // The March 15 hold is a governance decision, not an approved delivery commitment.
      if (best.decision.id === 'hold-commitment-until-approval' && memory.proposalStatus !== 'approved') {
        return answerFrom(
          `The team decided not to treat March 15 as an external commitment until the delivery update is approved. ${best.decision.rationale ?? ''}`.trim(),
          [best.meeting],
          memory,
        )
      }
      return answerFrom(
        `${best.decision.text}.${best.decision.dateLabel ? ` Date: ${best.decision.dateLabel}.` : ''}${best.decision.rationale ? ` Reason: ${best.decision.rationale}` : ''}`,
        [best.meeting],
        memory,
      )
    }
    if (/acme|integration/.test(normalized) && memory.proposalStatus !== 'approved') {
      const meeting = MEETING_RECORDS[0]
      return answerFrom(
        'The only recorded decision about the Acme date is to hold the external commitment until the delivery update is approved.',
        [meeting],
        memory,
      )
    }
    return noRecordAnswer()
  }

  if (asksForOwner) {
    const tasks = MEETING_RECORDS.flatMap((meeting) =>
      meeting.tasks.map((task) => ({
        meeting,
        task,
        score: overlapScore(tokens, `${task.title} ${task.milestone ?? ''} ${meeting.title}`),
      })),
    ).sort((a, b) => b.score - a.score)

    const best = tasks[0]
    if (best && best.score >= 1) {
      if (best.task.id === PROPOSED_TASK_ID && memory.proposalStatus !== 'approved') {
        return answerFrom(
          memory.proposalStatus === 'rejected'
            ? 'Alex Morgan was assigned to confirm the integration date, but the March 15 proposal was rejected, so it is not part of the approved project record.'
            : 'Alex Morgan is assigned to confirm the integration date. The March 15 delivery commitment is still awaiting approval.',
          [best.meeting],
          memory,
        )
      }
      return answerFrom(
        `${best.task.owner} owns "${best.task.title}"${best.task.milestone ? `, linked to the ${best.task.milestone} milestone` : ''}${best.task.dueLabel ? ` (due ${best.task.dueLabel})` : ''}.`,
        [best.meeting],
        memory,
      )
    }
    return noRecordAnswer()
  }

  if (asksForBlocker) {
    const relevant = MEETING_RECORDS.filter((meeting) => meeting.blockers.length > 0)
      .map((meeting) => ({ meeting, score: overlapScore(tokens, `${meeting.title} ${meeting.keywords.join(' ')}`) }))
      .sort((a, b) => b.score - a.score)

    const best = relevant[0]
    if (best && best.score >= 1) {
      const blockers = [...best.meeting.blockers]
      if (asksAboutAcme && memory.proposalStatus !== 'approved') {
        blockers.unshift(
          memory.proposalStatus === 'rejected'
            ? 'The March 15 delivery proposal was rejected'
            : 'The March 15 delivery commitment is awaiting approval',
        )
      }
      return answerFrom(
        `Current blocker${blockers.length > 1 ? 's' : ''}: ${blockers.join('; ')}.`,
        [best.meeting],
        memory,
      )
    }
    return noRecordAnswer()
  }

  if (asksForTasks) {
    const { meeting, score } = bestMeeting(tokens)
    if (score < 1) return noRecordAnswer()
    const taskText = meeting.tasks
      .map((task) => `${task.title} - ${task.owner} (${task.status.replace('_', ' ')})`)
      .join('; ')
    return answerFrom(`Recorded tasks from ${meeting.title}: ${taskText}.`, [meeting], memory)
  }
  if (asksForSummary) {
    const { meeting, score } = bestMeeting(tokens)
    if (score < 1) return noRecordAnswer()
    return answerFrom(meeting.summary, [meeting], memory)
  }
  if (asksForDate && asksAboutAcme && !/(freeze|scope)/.test(normalized)) {
    const meeting = MEETING_RECORDS[0]
    if (memory.proposalStatus !== 'approved') {
      return answerFrom(
        memory.proposalStatus === 'rejected'
          ? 'I do not have an approved delivery commitment. The March 15 proposal from the customer check-in was rejected.'
          : 'I do not have an approved delivery commitment yet. The customer check-in proposed March 15, but that update has not been approved.',
        [meeting],
        memory,
      )
    }
    return answerFrom(
      'The Acme integration is targeting March 15. Alex Morgan owns the confirmation task, linked to the Integration launch milestone.',
      [meeting],
      memory,
    )
  }

  if (asksForDate) {
    const dated = MEETING_RECORDS.flatMap((meeting) => [
      ...meeting.tasks
        .filter((task) => task.dueLabel)
        .map((task) => ({
          meeting,
          score: overlapScore(tokens, `${task.title} ${meeting.title}`),
          text: `"${task.title}" is due ${task.dueLabel} and is owned by ${task.owner}.`,
        })),
      ...meeting.decisions
        .filter((decision) => decision.dateLabel)
        .map((decision) => ({
          meeting,
          score: overlapScore(tokens, `${decision.text} ${meeting.title}`),
          text: `${decision.text} is set for ${decision.dateLabel}.`,
        })),
    ]).sort((a, b) => b.score - a.score)

    const best = dated[0]
    if (best && best.score >= 1) return answerFrom(best.text, [best.meeting], memory)
    return noRecordAnswer()
  }



  if (asksAboutAcme) {
    const checkIn = MEETING_RECORDS[0]
    const standup = MEETING_RECORDS[1]

    if (memory.proposalStatus !== 'approved') {
      return answerFrom(
        memory.proposalStatus === 'rejected'
          ? 'I do not have an approved delivery commitment for Acme. The March 15 proposal was rejected. Separately, the delivery team recorded a blocker: waiting on Acme IT for sandbox credentials.'
          : 'I do not have an approved delivery commitment for Acme yet. The customer check-in proposed March 15, but that update is awaiting approval. Separately, the delivery team recorded a blocker: waiting on Acme IT for sandbox credentials.',
        [checkIn, standup],
        memory,
      )
    }

    if (asksForOwner) {
      return answerFrom(
        'Alex Morgan owns the integration date confirmation. The customer delivery target is March 15, and the approved task is linked to the Integration launch milestone.',
        [checkIn],
        memory,
      )
    }

    return answerFrom(
      'The Acme integration is targeting March 15. The date came from today\'s customer check-in and is now approved in the project record. Alex Morgan owns the follow-up task. Current blocker: waiting on Acme IT for sandbox credentials.',
      [checkIn, standup],
      memory,
    )
  }

  return noRecordAnswer()
}


