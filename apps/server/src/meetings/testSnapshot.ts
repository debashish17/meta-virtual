import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_TASKS,
} from "@office/shared";
import type { RecordsSnapshot } from "./map.js";

/** A records snapshot over the shared demo data, for the mapping and pipeline tests. */
export function demoSnapshot(): RecordsSnapshot {
  return {
    accounts: [structuredClone(DEMO_ACCOUNT)],
    projects: [structuredClone(DEMO_PROJECT)],
    milestones: [structuredClone(DEMO_MILESTONE)],
    tasks: structuredClone(DEMO_TASKS),
    commitments: [structuredClone(DEMO_COMMITMENT)],
    people: DEMO_PEOPLE.map((p) => ({ id: p.key, name: p.name })),
  };
}
