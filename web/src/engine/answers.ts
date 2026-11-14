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

/** Fresh default answers: either, any, startup, no lists, tooling on. */
export function defaultAnswers(): Answers {
  return {
    projectType: null,
    languagesPrefer: [],
    languagesAvoid: [],
    capabilities: [],
    hosting: "either",
    budget: "any",
    scale: "startup",
    knownTools: [],
    tooling: true,
  };
}

/**
 * The defaults as a frozen object whose list fields are getters returning a
 * new empty array on every read. `{ ...DEFAULT_ANSWERS }` therefore gets its
 * own lists: pushing to them neither throws nor changes the defaults.
 */
export const DEFAULT_ANSWERS: Readonly<Answers> = Object.freeze<Answers>({
  projectType: null,
  get languagesPrefer(): string[] {
    return [];
  },
  get languagesAvoid(): string[] {
    return [];
  },
  get capabilities(): string[] {
    return [];
  },
  hosting: "either",
  budget: "any",
  scale: "startup",
  get knownTools(): string[] {
    return [];
  },
  tooling: true,
});

/** Answers pre-filled from the matcher; everything it cannot detect keeps its default. */
export function fromDetected(d: Detected): Answers {
  return {
    ...defaultAnswers(),
    projectType: d.projectType,
    languagesPrefer: [...d.languagesPrefer],
    languagesAvoid: [...d.languagesAvoid],
    capabilities: [...d.capabilities],
    knownTools: [...d.knownTools],
  };
}
