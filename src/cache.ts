import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Cache file location
const CACHE_PATH = join(
  homedir(),
  "Library/Application Support/Granola/cache-v4.json"
);

// Decode HTML entities in strings from the cache
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

export interface Person {
  name?: string;
  email?: string;
  details?: {
    person?: { name?: { fullName?: string }; avatar?: string };
    company?: { name?: string };
  };
}

export interface Conferencing {
  type?: string | null;
  title?: string;
  url?: string | null;
}

export interface People {
  title?: string;
  creator?: Person;
  attendees?: Person[];
  conferencing?: Conferencing;
  url?: string | null;
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
  creation_source?: string;
  valid_meeting?: boolean | null;
  visibility?: string | null;
  deleted_at?: string | null;
  google_calendar_event?: {
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };
}

export interface DocumentListMetadata {
  id: string;
  title: string;
  description?: string | null;
  icon?: { type?: string; color?: string; value?: string };
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

interface CacheState {
  documents: Record<string, Document>;
  transcripts: Record<string, TranscriptSegment[]>;
  documentLists?: Record<string, string[]>;
  documentListsMetadata?: Record<string, DocumentListMetadata>;
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
    return Object.values(this.data.state.documents).filter(
      (doc) => !doc.deleted_at
    );
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
      const summary = doc.summary?.toLowerCase() || "";
      const overview = doc.overview?.toLowerCase() || "";
      const attendees =
        doc.people?.attendees
          ?.map((a) => a.details?.person?.name?.fullName || a.email || "")
          .join(" ")
          .toLowerCase() || "";

      return (
        title.includes(q) ||
        notes.includes(q) ||
        summary.includes(q) ||
        overview.includes(q) ||
        attendees.includes(q)
      );
    });
  }

  getFolders(): { metadata: DocumentListMetadata; documentIds: string[] }[] {
    const lists = this.data?.state?.documentLists || {};
    const meta = this.data?.state?.documentListsMetadata || {};

    return Object.entries(meta)
      .filter(([, m]) => !m.deleted_at)
      .map(([id, m]) => ({
        metadata: m,
        documentIds: lists[id] || [],
      }));
  }

  getFolderDocuments(folderId: string): Document[] {
    const lists = this.data?.state?.documentLists || {};
    const docIds = lists[folderId] || [];
    return docIds
      .map((id) => this.getDocument(id))
      .filter((d): d is Document => d !== undefined);
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

// Get display title, handling null/empty titles and HTML entities
export function getDisplayTitle(doc: Document): string {
  const raw = doc.title || "Untitled Meeting";
  return decodeHtmlEntities(raw);
}

// Helper to format a document for display
export function formatDocument(doc: Document, includeNotes = false): string {
  const lines: string[] = [];
  const title = getDisplayTitle(doc);

  lines.push(`# ${title}`);
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

    if (doc.people.conferencing?.type) {
      const conf = doc.people.conferencing;
      const confStr = conf.url
        ? `${conf.type} ([link](${conf.url}))`
        : conf.type;
      lines.push(`**Conferencing:** ${confStr}`);
    }
  }

  if (doc.google_calendar_event?.start?.dateTime) {
    const start = new Date(
      doc.google_calendar_event.start.dateTime
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const end = doc.google_calendar_event.end?.dateTime
      ? new Date(
          doc.google_calendar_event.end.dateTime
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    lines.push(`**Scheduled:** ${start}${end ? ` - ${end}` : ""}`);
  }

  if (doc.summary) {
    lines.push("");
    lines.push("## Summary");
    lines.push(doc.summary);
  }

  if (doc.overview) {
    lines.push("");
    lines.push("## Overview");
    lines.push(doc.overview);
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
