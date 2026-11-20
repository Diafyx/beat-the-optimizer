import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Level } from '../../src/engine/level.ts';
import { validateLevel } from '../../src/engine/validate.ts';

/** Every problem with one level file's text; empty if the level is valid. */
export type LevelChecker = (text: string) => string[];

/**
 * A checker for level files: the JSON Schema first, then, if the schema
 * passes, the rules in docs/level-format.md that it cannot express.
 */
export function levelChecker(schemaText: string): LevelChecker {
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(
    JSON.parse(schemaText) as object,
  );
  return (text) => {
    let level: unknown;
    try {
      level = JSON.parse(text);
    } catch (error) {
      return [`not valid JSON: ${(error as Error).message}`];
    }
    // Ajv sets errors to null when the level is valid.
    validate(level);
    if (validate.errors) {
      return validate.errors.map(({ instancePath, message, params }) => {
        const extra =
          'additionalProperty' in params ? `: ${String(params['additionalProperty'])}` : '';
        return `schema: level${instancePath} ${String(message)}${extra}`;
      });
    }
    return validateLevel(level as Level).map(
      ({ rule, message }) => `rule ${String(rule)}: ${message}`,
    );
  };
}
