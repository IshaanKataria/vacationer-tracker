export type Category = "big4" | "bank" | "quant" | "tech" | "consulting";

export type Status = "open" | "rolling" | "soon" | "closed";

export type WorkRights =
  | "citizen-pr"
  | "visa-friendly"
  | "sponsors-visa"
  | "role-dependent";

export interface Program {
  id: string;
  firm: string;
  program: string;
  category: Category;
  status: Status;
  /** ISO date of a hard close deadline, if one exists */
  deadline?: string;
  /** e.g. "12pm AEST" */
  deadlineNote?: string;
  /** ISO date the program opens (for status: "soon") */
  opens?: string;
  /** freetext when the open date is fuzzy, e.g. "Aug–Oct 2026" */
  opensNote?: string;
  locations: string[];
  melbourne: boolean;
  workRights: WorkRights;
  applyUrl: string;
  notes: string;
  /** ISO date this entry was last verified against the source */
  verified: string;
}

export type PipelineStage =
  | "none"
  | "saved"
  | "applied"
  | "oa"
  | "interview"
  | "offer"
  | "rejected";

export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "none", label: "Not started" },
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "oa", label: "Online assessment" },
  { value: "interview", label: "Interview / AC" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  big4: "Big 4",
  bank: "Banks",
  quant: "Quant",
  tech: "Tech",
  consulting: "Consulting",
};

export const WORK_RIGHTS_LABELS: Record<WorkRights, string> = {
  "citizen-pr": "Citizen / PR only",
  "visa-friendly": "Visa-friendly",
  "sponsors-visa": "Sponsors visa",
  "role-dependent": "Role-dependent",
};
