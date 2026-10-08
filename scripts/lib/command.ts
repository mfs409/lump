/**
 * A lump command. Each one lives in its own file in `scripts/commands/` and is
 * registered in the `commands` list in `scripts/lump.ts`.
 *
 * Every command takes exactly one Markdown file.  {@link Command.run} expects
 * its caller to check that argument before calling it.
 */
export interface Command {
  /** The name typed after `npm run lump`, e.g. `"md2pdf"`. */
  name: string;

  /**
   * The file argument, as shown in help and usage messages: `"<file.md>"` for a
   * plain document, or `"<deck.md>"` for a Slidev deck.
   */
  arg: string;

  /** A one-line description, shown by `npm run lump help`. */
  summary: string;

  /**
   * Runs the command.
   *
   * @param input The Markdown file to work on.
   * @returns The process exit status (0 for success).
   * @throws {LumpError} For problems the user should fix
   */
  run(input: MarkdownFile): Promise<number>;
}

/** The Markdown file a {@link Command} works on. */
export interface MarkdownFile {
  /** Absolute path to the file. */
  file: string;

  /** The file's base name without `.md`, used to name outputs in `out/`. */
  name: string;
}
