#!/usr/bin/env node
// The `lump` command (see "bin" in package.json). The scripts are TypeScript, run directly by tsx, so this
// registers tsx and then loads the real entry point. (When lump is linked, node follows the link, so these paths
// are in lump's own folder, wherever the command is run from.)
import { register } from 'tsx/esm/api';

register();
await import('../scripts/lump.ts');
