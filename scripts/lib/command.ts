/**
 * A lump command. Each one lives in its own file in `scripts/commands/` and is
 * registered in the `commands` list in `scripts/lump.ts`.
 *
 * Every command takes exactly one Markdown file.  {@link Command.run} expects
 * its caller to check that argument before calling it.
 */
export interface Command {
  /** The name typed after `lump`, e.g. `"md2pdf"`. */
  name: string;

  /**
   * The file argument, as shown in help and usage messages: `"<file.md>"` for a
   * plain document, or `"<deck.md>"` for a Slidev deck.
   */
  arg: string;

  /** A one-line description, shown by `lump help`. */
  summary: string;

  /**
   * What the command's required `-o` option names, as shown in help and usage messages: `"<out.pdf>"` for a file,
   * `"<out-folder>"` for a folder. Absent for a command that writes nothing (and so takes no `-o`).
   */
  output?: string;

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

  /** The file's base name without `.md`, used in messages. */
  name: string;

  /**
   * Absolute path of the `-o` option: where the command writes its output. (The empty string for a command without
   * `output`.) It is not the Markdown file itself, and, for a command whose output is a file, not a folder.
   */
  out: string;
}
