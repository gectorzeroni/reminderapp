import { parseStoredNote } from "@/lib/note";
import type { Reminder } from "@/lib/types";

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

type SearchDate = { month?: number; day?: number; year?: number };

function monthNumber(name: string): number | undefined {
  if (name.length < 3) return undefined;
  const index = months.findIndex((month) => month.startsWith(name));
  return index < 0 ? undefined : index + 1;
}

export function parseSearchDate(query: string): SearchDate | null {
  const value = query.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
  const named = value.match(/^([a-z]+)\.?(?: (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?| (\d{4}))?$/);
  const dayFirst = value.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/);
  const iso = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  const numeric = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  const yearOnly = value.match(/^\d{4}$/);
  let month: number | undefined, day: number | undefined, year: number | undefined;

  if (named) {
    month = monthNumber(named[1]);
    if (!month) return null;
    day = named[2] ? Number(named[2]) : undefined;
    year = named[3] || named[4] ? Number(named[3] || named[4]) : undefined;
  } else if (dayFirst) {
    day = Number(dayFirst[1]); month = monthNumber(dayFirst[2]);
    if (!month) return null;
    year = dayFirst[3] ? Number(dayFirst[3]) : undefined;
  } else if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = iso[3] ? Number(iso[3]) : undefined;
  } else if (numeric) {
    month = Number(numeric[1]); day = Number(numeric[2]); year = numeric[3] ? Number(numeric[3]) : undefined;
  } else if (yearOnly) {
    year = Number(value);
  } else return null;

  if (year !== undefined && year < 100) return null;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || !month || day > new Date(year ?? 2000, month, 0).getDate())) return null;
  return { ...(month !== undefined && { month }), ...(day !== undefined && { day }), ...(year !== undefined && { year }) };
}

export function searchTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

export function noteMatchesSearch(note: Reminder, query: string): boolean {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const text = parseStoredNote(note.note).plainText.toLocaleLowerCase();
  if (terms.every((term) => text.includes(term))) return true;

  const date = parseSearchDate(query);
  if (!date) return false;
  const created = new Date(note.createdAt);
  return (date.month === undefined || created.getMonth() + 1 === date.month)
    && (date.day === undefined || created.getDate() === date.day)
    && (date.year === undefined || created.getFullYear() === date.year);
}
