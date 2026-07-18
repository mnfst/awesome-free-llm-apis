import { TaskType } from '../pipeline/middleware.js';

const TASK_TYPE_TO_PERSONA: Partial<Record<TaskType, string>> = {
  [TaskType.Coding]: 'coder',
  [TaskType.SemanticSearch]: 'researcher',
  [TaskType.Cyber]: 'cyber',
};

export function taskTypeToPersona(taskType?: TaskType | string): string | undefined {
  if (!taskType) return undefined;
  return TASK_TYPE_TO_PERSONA[taskType as TaskType];
}
