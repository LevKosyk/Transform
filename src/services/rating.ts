const DAY = 86_400_000;

export const RATING_MIN_USES = 10;
export const RATING_MIN_AGE = 3 * DAY;
export const RATING_SNOOZE = 14 * DAY;

export interface RatingState {
  uses: number;
  firstUse: number;
  snoozedUntil?: number;
  done?: boolean;
}

export type RatingChoice = "rate" | "later" | "never" | undefined;

export function recordUse(
  state: RatingState | undefined,
  now: number,
): RatingState {
  return state
    ? { ...state, uses: state.uses + 1 }
    : { uses: 1, firstUse: now };
}

export function shouldAskForRating(state: RatingState, now: number): boolean {
  return (
    !state.done &&
    state.uses >= RATING_MIN_USES &&
    now - state.firstUse >= RATING_MIN_AGE &&
    now >= (state.snoozedUntil ?? 0)
  );
}

export function applyRatingChoice(
  state: RatingState,
  choice: RatingChoice,
  now: number,
): RatingState {
  if (choice === "rate" || choice === "never") return { ...state, done: true };
  return { ...state, snoozedUntil: now + RATING_SNOOZE };
}

export function reviewUrl(appName: string, extensionId: string): string {
  const [publisher, name] = extensionId.split(".");
  return /visual studio code/i.test(appName)
    ? `https://marketplace.visualstudio.com/items?itemName=${extensionId}&ssr=false#review-details`
    : `https://open-vsx.org/extension/${publisher}/${name}/reviews`;
}
