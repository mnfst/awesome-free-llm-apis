export interface HermesSkillEntry {
  id: string;
  category: string;
  name: string;
  description: string;
  tags?: string[];
  /** Path relative to external/hermes/, e.g. "software-development/simplify-code" */
  path: string;
}

export interface HermesManifest {
  generatedAt: string;
  skills: HermesSkillEntry[];
}

export interface HermesSkillContent {
  skill: HermesSkillEntry;
  content: string;
  references: Array<{ path: string; content: string }>;
}
