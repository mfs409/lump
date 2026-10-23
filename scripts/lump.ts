/**
 * lump: Transform a markdown-based document or slideshow into PDF
 *
 * This is the command-line entry point: `lump <command> <file.md>` (when lump is linked), or
 * `npm run lump <command> <file.md>` in lump's own folder.
 * It finds the command, checks its file argument, and runs it. Each command
 * lives in `scripts/commands/`; `lump help` lists them.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { LumpError } from './lib/config.ts';
import type { Command } from './lib/command.ts';
import { md2pdf } from './commands/md2pdf.ts';
import { slides2pdf } from './commands/slides2pdf.ts';
import { notes2pdf } from './commands/notes2pdf.ts';
import { slides2website, start } from './commands/slidev.ts';

/**
 * Every lump command, in the order `help` lists them. A new command is added
 * by importing it above and adding it here.
 */
const commands: Command[] = [md2pdf, slides2pdf, notes2pdf, slides2website, start];

/** Print the list of commands, with their arguments and summaries. */
function printHelp(): void {
  console.log('lump: Transform a markdown-based document or slideshow into PDF.\n');
  console.log('Usage: lump <command> <file.md> -o <output>\n');
  // One row per command, plus `help`, with the summaries lined up
  const rows = [
    ...commands.map((c) => [`${c.name} ${c.arg}${c.output ? ` -o ${c.output}` : ''}`, c.summary]),
    ['help', 'Show this list of commands'],
  ];
  const width = Math.max(...rows.map(([synopsis]) => synopsis.length));
  for (const [synopsis, summary] of rows) {
    console.log(`  ${synopsis.padEnd(width)}   ${summary}`);
  }
  console.log('\n-o says where the output goes (a relative path is from the current folder).');
  console.log('Example: lump slides2pdf talk.md -o talk.slides.pdf');
}

/**
 * Split a command's arguments into its file arguments and its `-o` option
 * (also spelled `--output`, with the path as the next argument or after an
 * `=`).
 *
 * @param args The arguments after the command's name.
 *
 * @returns The arguments that are not part of the option, and the option's
 *          path (undefined if it was not given).
 *
 * @throws {LumpError} If the option has no path, or is given twice.
 */
function splitOutput(args: string[]): { files: string[]; out?: string } {
  const files: string[] = [];
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^(?:-o|--output)(?:=(.*))?$/);
    if (!m) {
      files.push(args[i]);
      continue;
    }
    const value = m[1] ?? args[++i];
    if (!value) throw new LumpError(`${args[i - 1] ?? '-o'} needs a path after it.`);
    if (out !== undefined) throw new LumpError('-o was given twice.');
    out = value;
  }
  return { files, out };
}

/**
 * Run the command named on the command line.
 *
 * With no command, or `help`, prints the list of commands. Otherwise checks
 * that the command exists, and was given exactly one file that exists and, if
 * it writes anything, the `-o` option naming where, then runs it.
 *
 * @param argv The command-line arguments after `lump`.
 *
 * @returns The process exit status: the command's own, 0 for help, or 1 for an
 *          unknown command.
 *
 * @throws {LumpError} If the file argument is missing, extra, or doesn't
 *         exist, if `-o` is missing (or given to a command that has no
 *         output) or names the Markdown file or a folder where a file is
 *         wanted, or if the command finds a problem the user should fix.
 */
async function main(argv: string[]): Promise<number> {
  const [name = 'help', ...args] = argv;
  if (name === 'help') {
    printHelp();
    return 0;
  }
  const command = commands.find((c) => c.name === name);
  if (!command) {
    console.log(`Unknown command: ${name}\n`);
    printHelp();
    return 1;
  }

  // Every command takes exactly one file: the path to a Markdown file, which
  // is given to the command as an absolute path plus its name without .md
  // (e.g. talks/01_example.md -> 01_example). A command that writes something
  // also needs -o, saying where.
  const usage = `Usage: lump ${command.name} ${command.arg}${command.output ? ` -o ${command.output}` : ''}`;
  const { files, out } = splitOutput(args);
  if (files.length !== 1) throw new LumpError(usage);
  if (command.output ? out === undefined : out !== undefined) {
    throw new LumpError(command.output ? usage : `${command.name} writes nothing, so it has no -o option.\n${usage}`);
  }
  const file = path.resolve(process.cwd(), files[0]);
  if (!fs.existsSync(file)) {
    throw new LumpError(`No such file: ${file}`);
  }
  const outPath = out === undefined ? '' : path.resolve(process.cwd(), out);
  if (outPath === file) {
    throw new LumpError(`-o names the Markdown file itself (${file}), which would overwrite it.`);
  }
  if (outPath && command.output?.endsWith('.pdf>') && fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
    throw new LumpError(`${outPath} is a folder, but ${command.name} writes a PDF file.\n${usage}`);
  }
  return command.run({ file, name: path.basename(file).replace(/\.md$/, ''), out: outPath });
}

// Run, and set the exit status. A LumpError is a problem for the user to fix,
// so only its message is printed; any other error is a bug, so it is rethrown
// and Node prints its stack trace.
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  if (err instanceof LumpError) {
    console.log(err.message);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
