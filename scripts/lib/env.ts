/** A required environment variable; throws a clear error if it is missing or empty. */
export function env(name: string, environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}
