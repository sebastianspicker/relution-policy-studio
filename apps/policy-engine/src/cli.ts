#!/usr/bin/env node
/** Implements the command-line entry point and top-level error boundary. */
import { main } from "./cli/entrypoint.js";

void main(process.argv.slice(2));
