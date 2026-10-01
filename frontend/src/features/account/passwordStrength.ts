export type Strength = "too short" | "weak" | "fair" | "strong";

/** Rough hint only; the server enforces the 8-character minimum. */
export function passwordStrength(password: string): Strength {
  if (password.length < 8) return "too short";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 14 || (password.length >= 10 && classes >= 3)) return "strong";
  return classes >= 2 ? "fair" : "weak";
}
