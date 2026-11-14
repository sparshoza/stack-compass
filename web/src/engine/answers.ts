import type { Detected } from "./match";

export type Answers = {
  projectType: string | null;
  languagesPrefer: string[];
  languagesAvoid: string[];
  capabilities: string[];
  hosting: "managed" | "self-hosted" | "either";
  budget: "free" | "low" | "any";
  scale: "prototype" | "startup" | "high";
  knownTools: string[];
  tooling: boolean;
};

/** Frozen down to the arrays, so spreading it never shares a mutable list. */
const none = (): string[] => Object.freeze([]) as unknown as string[];

export const DEFAULT_ANSWERS: Readonly<Answers> = Object.freeze({
  projectType: null,
  languagesPrefer: none(),
  languagesAvoid: none(),
  capabilities: none(),
  hosting: "either",
  budget: "any",
  scale: "startup",
  knownTools: none(),
  tooling: true,
});

/** Answers pre-filled from the matcher; everything it cannot detect keeps its default. */
export function fromDetected(d: Detected): Answers {
  return {
    ...DEFAULT_ANSWERS,
    projectType: d.projectType,
    languagesPrefer: [...d.languagesPrefer],
    languagesAvoid: [...d.languagesAvoid],
    capabilities: [...d.capabilities],
    knownTools: [...d.knownTools],
  };
}
