import { config, type CommandDef } from "../config";

/** Built-in commands come straight from config. Add one there, not here. */
export const COMMANDS: CommandDef[] = config.commands;

const COMMAND_MAP = new Map(COMMANDS.map((c) => [c.name, c]));

export function getCommand(name: string): CommandDef | undefined {
  return COMMAND_MAP.get(name);
}

/** Stable hue for any tag: registry hue if known, else hashed from the name. */
export function hueForTag(tag: string): number {
  const known = COMMAND_MAP.get(tag);
  if (known) return known.hue;
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}
