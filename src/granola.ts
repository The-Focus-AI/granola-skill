#!/usr/bin/env node

import {
  GranolaCache,
  formatDocument,
  formatTranscript,
  Document,
} from "./cache.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const USAGE = `
granola - Access your Granola meeting notes

COMMANDS:
  list [--days N]           List recent meetings (default: 7 days)
  show <id> [--transcript]  Show meeting details
  search <query>            Search meetings by title, notes, or participant
  export <id> [--output DIR] Export meeting to markdown

OPTIONS:
  --days N       Number of days to look back (default: 7)
  --transcript   Include full transcript in output
  --output DIR   Output directory for export (default: ./granola-exports)
  --help         Show this help message

EXAMPLES:
  granola list --days 30
  granola show abc123 --transcript
  granola search "product review"
  granola export abc123 --output ./meetings
`;

function parseArgs(args: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!command && !arg.startsWith("-")) {
      command = arg;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function listMeetings(cache: GranolaCache, days: number): void {
  const docs = cache.getRecentDocuments(days);

  if (docs.length === 0) {
    console.log(`No meetings found in the last ${days} days.`);
    return;
  }

  console.log(`## Recent Meetings (last ${days} days)\n`);

  for (const doc of docs) {
    const date = new Date(doc.created_at).toLocaleDateString();
    const time = new Date(doc.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const attendees =
      doc.people?.attendees
        ?.slice(0, 3)
        .map((a) => a.details?.person?.name?.fullName || a.email?.split("@")[0])
        .filter(Boolean)
        .join(", ") || "";

    console.log(`- **${doc.title}**`);
    console.log(`  ID: \`${doc.id.slice(0, 8)}\` | ${date} ${time}`);
    if (attendees) {
      console.log(`  With: ${attendees}`);
    }
    console.log("");
  }

  console.log(`\nTotal: ${docs.length} meetings`);
}

function showMeeting(
  cache: GranolaCache,
  id: string,
  includeTranscript: boolean
): void {
  // Support partial ID matching
  let doc: Document | undefined;

  if (id.length < 36) {
    const docs = cache.getDocuments();
    const matches = docs.filter((d) => d.id.startsWith(id));
    if (matches.length === 1) {
      doc = matches[0];
    } else if (matches.length > 1) {
      console.error(
        `Multiple meetings match "${id}". Be more specific:\n${matches.map((m) => `  ${m.id.slice(0, 12)} - ${m.title}`).join("\n")}`
      );
      process.exit(1);
    }
  } else {
    doc = cache.getDocument(id);
  }

  if (!doc) {
    console.error(`Meeting not found: ${id}`);
    process.exit(1);
  }

  console.log(formatDocument(doc, true));

  if (includeTranscript) {
    const transcript = cache.getTranscript(doc.id);
    console.log("\n## Transcript\n");
    console.log(formatTranscript(transcript));
  }
}

function searchMeetings(cache: GranolaCache, query: string): void {
  const results = cache.searchDocuments(query);

  if (results.length === 0) {
    console.log(`No meetings found matching "${query}"`);
    return;
  }

  console.log(`## Search Results for "${query}"\n`);

  for (const doc of results.slice(0, 20)) {
    const date = new Date(doc.created_at).toLocaleDateString();
    console.log(`- **${doc.title}**`);
    console.log(`  ID: \`${doc.id.slice(0, 8)}\` | ${date}`);
    console.log("");
  }

  console.log(`\nFound: ${results.length} meetings`);
}

function exportMeeting(
  cache: GranolaCache,
  id: string,
  outputDir: string
): void {
  // Support partial ID matching
  let doc: Document | undefined;

  if (id.length < 36) {
    const docs = cache.getDocuments();
    const matches = docs.filter((d) => d.id.startsWith(id));
    if (matches.length === 1) {
      doc = matches[0];
    } else if (matches.length > 1) {
      console.error(
        `Multiple meetings match "${id}". Be more specific:\n${matches.map((m) => `  ${m.id.slice(0, 12)} - ${m.title}`).join("\n")}`
      );
      process.exit(1);
    }
  } else {
    doc = cache.getDocument(id);
  }

  if (!doc) {
    console.error(`Meeting not found: ${id}`);
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Build markdown content
  const transcript = cache.getTranscript(doc.id);
  const attendees =
    doc.people?.attendees
      ?.map((a) => a.details?.person?.name?.fullName || a.email || "Unknown")
      .filter(Boolean) || [];

  const content = `---
id: ${doc.id}
title: "${doc.title.replace(/"/g, '\\"')}"
date: ${doc.created_at}
participants: [${attendees.map((a) => `"${a}"`).join(", ")}]
---

# ${doc.title}

**Date:** ${new Date(doc.created_at).toLocaleString()}
**Participants:** ${attendees.join(", ") || "Unknown"}

${doc.summary ? `## Summary\n\n${doc.summary}\n` : ""}
## Notes

${doc.notes_markdown || "No notes available."}

## Transcript

${formatTranscript(transcript)}
`;

  const dateStr = new Date(doc.created_at).toISOString().split("T")[0];
  const safeTitle = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const filename = `${dateStr}-${safeTitle}.md`;
  const filepath = join(outputDir, filename);

  writeFileSync(filepath, content);
  console.log(`Exported to: ${filepath}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const { command, positional, flags } = parseArgs(args);

  if (!command || flags.help) {
    console.log(USAGE);
    process.exit(0);
  }

  let cache: GranolaCache;
  try {
    cache = new GranolaCache();
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  switch (command) {
    case "list":
      listMeetings(cache, parseInt(flags.days as string) || 7);
      break;

    case "show":
      if (!positional[0]) {
        console.error("Usage: granola show <meeting-id> [--transcript]");
        process.exit(1);
      }
      showMeeting(cache, positional[0], !!flags.transcript);
      break;

    case "search":
      if (!positional[0]) {
        console.error("Usage: granola search <query>");
        process.exit(1);
      }
      searchMeetings(cache, positional.join(" "));
      break;

    case "export":
      if (!positional[0]) {
        console.error("Usage: granola export <meeting-id> [--output DIR]");
        process.exit(1);
      }
      exportMeeting(
        cache,
        positional[0],
        (flags.output as string) || "./granola-exports"
      );
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main();
