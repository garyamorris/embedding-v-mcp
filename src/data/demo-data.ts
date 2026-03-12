import type {
  EnhancementCandidate,
  IncidentSummary,
  SupportTicket,
} from "@/lib/demo-types";

export const supportTickets: SupportTicket[] = [
  {
    id: "SUP-101",
    subject: "Finance export looks asleep until the file appears all at once",
    customer: "Northstar Capital",
    summary:
      "Large exports usually finish, but the UI shows almost no progress, so people assume the job stalled and start over.",
    body: "The finance team kicks off a quarterly extract, gets a spinner with no queue state or percent complete, then clicks export again because it feels frozen. Duplicate downloads later show up and make the system look unreliable even when the backend eventually succeeds.",
    tags: ["export", "feedback", "reliability"],
    tone: "frustrated",
  },
  {
    id: "SUP-102",
    subject: "CSV upload waits forever before rejecting one bad header",
    customer: "Bluebird Health",
    summary:
      "The import flow accepts a file, spends several minutes processing it, and only then reports a simple formatting problem.",
    body: "Operations uploaded a vendor CSV and watched the progress area churn for ages before the wizard finally said one column name was wrong. They were more upset about the wasted time and the vague message than the rule itself.",
    tags: ["upload", "validation", "feedback"],
    tone: "frustrated",
  },
  {
    id: "SUP-103",
    subject: "Managers cannot predict who is allowed to approve discounts",
    customer: "Branchline Retail",
    summary:
      "Role names and inherited access rules are hard to understand, so admins reopen the same tickets.",
    body: "Regional leads keep asking why one teammate can edit orders but cannot approve them, while another person can do both. They describe the permission model as a maze rather than a software defect.",
    tags: ["permissions", "feedback"],
    tone: "worried",
  },
  {
    id: "SUP-104",
    subject: "Switching from the queue to analytics feels like wading through syrup",
    customer: "Fleetwise Logistics",
    summary:
      "Heavy screens take long enough to load that users hesitate to navigate around the product.",
    body: "Dispatch users say every tab change triggers a long wait. They do not call it an outage, but they describe the app as exhausting to move around during a busy shift.",
    tags: ["performance"],
    tone: "frustrated",
  },
  {
    id: "SUP-105",
    subject: "Bulk archive confirmation is too vague for nervous operators",
    customer: "Cinder Commerce",
    summary:
      "Users want a clearer review step before destructive bulk actions because the modal does not explain impact or recovery.",
    body: "Ops staff stop when they see 'Archive 148 items?' because it does not list the affected records, what changes next, or whether there is an undo path. The tool feels risky even though it technically works.",
    tags: ["bulk-actions", "feedback"],
    tone: "worried",
  },
  {
    id: "SUP-106",
    subject: "Invited contractor lands in a blank workspace and assumes access is broken",
    customer: "Harbor Energy",
    summary:
      "A new user technically has access, but the default empty screen makes the invite look broken.",
    body: "The contractor can sign in, yet the first view is empty enough that everyone assumes permissions failed. Admins keep reopening tickets because nothing explains what the user should see or why.",
    tags: ["permissions", "feedback"],
    tone: "worried",
  },
  {
    id: "SUP-107",
    subject: "Customer success retries uploads because the screen looks idle",
    customer: "Atlas Learning",
    summary:
      "People start a second upload when the first one appears stuck, then support has to unwind duplicate jobs.",
    body: "A bulk import often finishes eventually, but the interface never shows what stage it is in. Users interpret the silence as failure, hit upload again, and later ask which copy actually counted.",
    tags: ["upload", "feedback", "reliability"],
    tone: "frustrated",
  },
  {
    id: "SUP-108",
    subject: "Supervisors keep clicking Save because nothing confirms success",
    customer: "Metro Supply",
    summary:
      "Lack of clear completion feedback leads to repeated actions and low confidence.",
    body: "The data usually persists, yet the screen does not reassure users. Several notes say 'I pressed it three times because I thought it missed the first click,' which makes the whole product feel brittle.",
    tags: ["feedback", "reliability"],
    tone: "worried",
  },
  {
    id: "SUP-109",
    subject: "Filtered lists pause on every view change",
    customer: "Parkside Services",
    summary:
      "Repeated loading makes ordinary navigation feel sluggish, especially for teams bouncing between tabs all day.",
    body: "Support describes this as 'the page thinking too hard' instead of a clear performance bug. Users switch from queue to search to reports constantly, and every hop feels heavier than it should.",
    tags: ["performance"],
    tone: "frustrated",
  },
  {
    id: "SUP-110",
    subject: "Bulk reassignment needs a safer preview before commit",
    customer: "Westbridge Ops",
    summary:
      "Supervisors want to inspect what a mass change will do before it happens, not after.",
    body: "A lead said the tool is technically powerful but emotionally expensive because there is no dry run, affected-item summary, or short undo window. People delay the task because the flow feels irreversible.",
    tags: ["bulk-actions", "feedback"],
    tone: "curious",
  },
  {
    id: "SUP-111",
    subject: "Store managers say the system feels fragile during long-running jobs",
    customer: "Northwind Grocers",
    summary:
      "Nobody says incident or bug directly, but they describe low trust when work disappears into the background with no visible progress.",
    body: "Managers do not know whether an export is queued, processing, or dead, so they refresh, retry, and call support. The core complaint is uncertainty, not necessarily a hard backend failure.",
    tags: ["export", "feedback", "reliability"],
    tone: "worried",
  },
];

export const enhancementCandidates: EnhancementCandidate[] = [
  {
    id: "ENH-201",
    name: "Visible Job Progress",
    summary:
      "Expose queued, running, and completed states for long-running exports and imports.",
    description:
      "Add stage labels, percent complete when available, and a durable activity center so users stop retrying background work that is already in progress.",
    tags: ["export", "upload", "feedback", "reliability"],
    linkedSignals: ["frozen exports", "idle-looking uploads", "duplicate retries"],
  },
  {
    id: "ENH-202",
    name: "Preflight Upload Validation",
    summary:
      "Check file shape and obvious schema problems before the full upload begins.",
    description:
      "Validate headers, required columns, and simple row issues immediately so users do not wait through a long import only to learn about a preventable formatting error.",
    tags: ["upload", "validation", "feedback"],
    linkedSignals: ["late failures", "wasted processing time", "unclear import errors"],
  },
  {
    id: "ENH-203",
    name: "Permission Preview and Role Simplification",
    summary:
      "Explain who can do what before an admin saves or sends an invite.",
    description:
      "Replace overlapping roles with clearer capability bundles and show a preview of the resulting access so blank states do not look like broken permissions.",
    tags: ["permissions", "feedback"],
    linkedSignals: ["role confusion", "mystery blank screens", "repeat admin tickets"],
  },
  {
    id: "ENH-204",
    name: "Faster View Switching",
    summary:
      "Reduce repeated loading when users move between adjacent screens.",
    description:
      "Cache recent data, trim redundant refetching, and make queue-to-report navigation feel immediate instead of sticky.",
    tags: ["performance"],
    linkedSignals: ["sluggish tab changes", "heavy screen transitions"],
  },
  {
    id: "ENH-205",
    name: "Bulk Action Review and Undo",
    summary:
      "Show affected items, clarify consequences, and provide a short undo window.",
    description:
      "Turn risky mass actions into a safer review flow with clearer confirmations and a recovery path for accidental changes.",
    tags: ["bulk-actions", "feedback"],
    linkedSignals: ["vague confirmations", "fear of destructive changes"],
  },
  {
    id: "ENH-206",
    name: "Unified Feedback Layer",
    summary:
      "Standardize progress, success, and error messaging across asynchronous workflows.",
    description:
      "Use the same visible status patterns for save, import, export, and background jobs so users know whether the system is working, waiting, or finished.",
    tags: ["feedback", "reliability", "export", "upload"],
    linkedSignals: ["repeated clicks", "uncertainty", "indirect reliability complaints"],
  },
];

export const incidentSummaries: IncidentSummary[] = [
  {
    id: "INC-301",
    title: "March 4 export worker backlog",
    date: "2026-03-04",
    summary:
      "Background export jobs completed eventually, but queue depth was invisible in the UI and users launched duplicates.",
    details:
      "The service recovered on its own, yet the front end exposed only a spinner. Support volume spiked because people could not tell whether the export was queued, running, or dead.",
    tags: ["export", "reliability", "feedback"],
  },
  {
    id: "INC-302",
    title: "Late-stage import rejection spike",
    date: "2026-02-19",
    summary:
      "A parser change increased cases where uploads failed after most processing had already finished.",
    details:
      "Users saw long waits followed by vague column errors. The technical issue was small, but the delayed feedback made the whole flow feel brittle.",
    tags: ["upload", "validation", "reliability"],
  },
  {
    id: "INC-303",
    title: "Workspace migration role confusion",
    date: "2026-01-28",
    summary:
      "Inherited permissions hid why newly invited users saw empty screens after migration.",
    details:
      "Access was technically correct in many cases, but the mental model and default landing experience made it look broken to both admins and end users.",
    tags: ["permissions", "feedback"],
  },
  {
    id: "INC-304",
    title: "Client refetch storm on screen changes",
    date: "2026-02-07",
    summary:
      "Switching between the queue and analytics triggered redundant data loading and visible lag.",
    details:
      "The system did not fully fail, but the repeated loading made everyday navigation feel sticky and inefficient.",
    tags: ["performance"],
  },
];

export const exampleQueries = [
  "Based on our support emails, what product and system enhancements should we prioritise to reduce support volume and user frustration?",
  "What recurring user pain points appear to come from the same underlying design issue?",
  "Which improvements would likely reduce the most operational friction based on how users describe their problems?",
  "Are users describing reliability concerns indirectly, even when they don't use words like bug, incident, or failure?",
  "What enhancements are implied by our support tickets, even if no one explicitly requested them?",
  "Which complaints seem to point to poor feedback, poor visibility, or poor UX rather than actual backend failures?",
  "What themes connect confusing permissions, failed uploads, and repeated retries?",
  "Which support issues sound different on the surface but are probably symptoms of the same system weakness?",
];

export const datasetStats = {
  support: supportTickets.length,
  enhancements: enhancementCandidates.length,
  incidents: incidentSummaries.length,
};
