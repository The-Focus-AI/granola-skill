import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Cache file location
const CACHE_PATH = join(
  homedir(),
  "Library/Application Support/Granola/cache-v3.json"
);

export interface Person {
  name?: string;
  email?: string;
  details?: {
    person?: { name?: { fullName?: string }; avatar?: string };
    company?: { name?: string };
  };
}

export interface People {
  title?: string;
  creator?: Person;
  attendees?: Person[];
}

export interface TranscriptSegment {
  id: string;
  document_id: string;
  start_timestamp: string;
  end_timestamp: string;
  text: string;
  source: string;
  is_final: boolean;
}

export interface Document {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  notes_markdown?: string;
  notes_plain?: string;
  summary?: string;
  overview?: string;
  people?: People;
  status?: string;
  type?: string;
  google_calendar_event?: {
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };
}

interface CacheState {
  documents: Record<string, Document>;
  transcripts: Record<string, TranscriptSegment[]>;
  documentPanels: Record<string, Record<string, unknown>>;
}

interface CacheData {
  state: CacheState;
  version: number;
}

export class GranolaCache {
  private data: CacheData | null = null;

  constructor(customPath?: string) {
    const cachePath = customPath || CACHE_PATH;

    if (!existsSync(cachePath)) {
      throw new Error(
        `Granola cache not found at ${cachePath}. Is Granola installed?`
      );
    }

    const raw = readFileSync(cachePath, "utf-8");
    const outer = JSON.parse(raw);

    // Handle double-JSON structure
    if (typeof outer.cache === "string") {
      this.data = JSON.parse(outer.cache);
    } else {
      this.data = outer.cache || outer;
    }
  }

  getDocuments(): Document[] {
    if (!this.data?.state?.documents) return [];
    return Object.values(this.data.state.documents);
  }

  getDocument(id: string): Document | undefined {
    return this.data?.state?.documents?.[id];
  }

  getTranscript(documentId: string): TranscriptSegment[] {
    return this.data?.state?.transcripts?.[documentId] || [];
  }

  searchDocuments(query: string): Document[] {
    const q = query.toLowerCase();
    return this.getDocuments().filter((doc) => {
      const title = doc.title?.toLowerCase() || "";
      const notes = doc.notes_plain?.toLowerCase() || "";
      const attendees =
        doc.people?.attendees
          ?.map((a) => a.details?.person?.name?.fullName || a.email || "")
          .join(" ")
          .toLowerCase() || "";

      return title.includes(q) || notes.includes(q) || attendees.includes(q);
    });
  }

  getRecentDocuments(days: number = 7): Document[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.getDocuments()
      .filter((doc) => new Date(doc.created_at) >= cutoff)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }
}

// Helper to format a document for display
export function formatDocument(doc: Document, includeNotes = false): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push("");
  lines.push(`**ID:** ${doc.id}`);
  lines.push(`**Date:** ${new Date(doc.created_at).toLocaleString()}`);

  if (doc.people) {
    const attendees =
      doc.people.attendees
        ?.map((a) => a.details?.person?.name?.fullName || a.email || "Unknown")
        .filter(Boolean) || [];
    if (attendees.length > 0) {
      lines.push(`**Participants:** ${attendees.join(", ")}`);
    }
  }

  if (doc.summary) {
    lines.push("");
    lines.push("## Summary");
    lines.push(doc.summary);
  }

  if (includeNotes && doc.notes_markdown) {
    lines.push("");
    lines.push("## Notes");
    lines.push(doc.notes_markdown);
  }

  return lines.join("\n");
}

// Helper to format transcript
export function formatTranscript(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return "No transcript available.";

  return segments
    .sort(
      (a, b) =>
        new Date(a.start_timestamp).getTime() -
        new Date(b.start_timestamp).getTime()
    )
    .map((seg) => {
      const time = new Date(seg.start_timestamp).toLocaleTimeString();
      return `[${time}] ${seg.text}`;
    })
    .join("\n");
}
