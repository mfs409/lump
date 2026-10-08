/**
 * lump: Transform a markdown-based document or slideshow into PDF
 *
 * This is the command-line entry point: `npm run lump <command> <file.md>`.
 * It finds the command, checks its file argument, and runs it. Each command
 * lives in `scripts/commands/`; `npm run lump help` lists them.
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
  console.log('Usage: npm run lump <command> <file.md>\n');
  // One row per command, plus `help`, with the summaries lined up
  const rows = [
    ...commands.map((c) => [`${c.name} ${c.arg}`, c.summary]),
    ['help', 'Show this list of commands'],
  ];
  const width = Math.max(...rows.map(([synopsis]) => synopsis.length));
  for (const [synopsis, summary] of rows) {
    console.log(`  ${synopsis.padEnd(width)}   ${summary}`);
  }
  console.log('\nOutput goes to out/. Decks must live in slides/ so Slidev finds style.css and public/.');
  console.log('Example: npm run lump slides2pdf slides/01_example.md');
}

/**
 * Run the command named on the command line.
 *
 * With no command, or `help`, prints the list of commands. Otherwise checks
 * that the command exists and was given exactly one file that exists, then
 * runs it.
 *
 * @param argv The command-line arguments after `npm run lump`.
 *
 * @returns The process exit status: the command's own, 0 for help, or 1 for an
 *          unknown command.
 *
 * @throws {LumpError} If the file argument is missing, extra, or doesn't
 *         exist, or if the command finds a problem the user should fix.
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

  // Every command takes exactly one argument: the path to a Markdown file,
  // which is given to the command as an absolute path plus its name without
  // .md (e.g. slides/01_example.md -> 01_example)
  if (args.length !== 1) {
    throw new LumpError(`Usage: npm run lump ${command.name} ${command.arg}`);
  }
  const file = path.resolve(process.cwd(), args[0]);
  if (!fs.existsSync(file)) {
    throw new LumpError(`No such file: ${file}`);
  }
  return command.run({ file, name: path.basename(file).replace(/\.md$/, '') });
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
