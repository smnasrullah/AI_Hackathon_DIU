export const PASSWORD_MIN = 8;

export type Strength = "weak" | "fair" | "good" | "strong";

/** Hint only (the server enforces the 8-character minimum): length plus character variety. */
export function passwordStrength(pw: string): Strength {
  if (pw.length < PASSWORD_MIN) return "weak";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const score = kinds + (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 ? 1 : 0);
  if (score >= 5) return "strong";
  if (score >= 3) return "good";
  return "fair";
}

export const STRENGTH_STEPS: Record<Strength, number> = { weak: 1, fair: 2, good: 3, strong: 4 };
