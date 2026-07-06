import fs from 'fs';
import path from 'path';
import { getSeedEmails } from './seed';

export interface EmailRecord {
  uid: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;
  body: string;
  bodyHtml: string;
  tags: string[];
}

const DB_FILE_PATH = path.join(process.cwd(), 'emails_db.json');

/**
 * Reads all emails from the local JSON file database.
 * If the file doesn't exist, initializes it with seed emails.
 */
export function getEmails(): EmailRecord[] {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      const seed = getSeedEmails();
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }

    const data = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    if (!data.trim()) {
      const seed = getSeedEmails();
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }

    return JSON.parse(data) as EmailRecord[];
  } catch (err) {
    console.error('Error reading local JSON database:', err);
    return getSeedEmails();
  }
}

/**
 * Saves a single email record to the local JSON database.
 * Avoids duplicates by matching UID.
 */
export function saveEmail(email: EmailRecord): void {
  try {
    const emails = getEmails();
    if (emails.some(e => e.uid === email.uid)) {
      return; // Already exists
    }
    emails.unshift(email); // Put latest on top
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(emails, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving email to local JSON database:', err);
  }
}

/**
 * Saves multiple email records to the local JSON database.
 * Avoids duplicates by matching UID.
 */
export function saveEmails(newEmails: EmailRecord[]): void {
  try {
    const emails = getEmails();
    const existingUids = new Set(emails.map(e => e.uid));
    const filtered = newEmails.filter(e => !existingUids.has(e.uid));
    
    if (filtered.length > 0) {
      const updated = [...filtered, ...emails];
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error saving emails to local JSON database:', err);
  }
}

/**
 * Retrieve all email UIDs from the database.
 */
export function getEmailUids(): string[] {
  const emails = getEmails();
  return emails.map(e => e.uid);
}

/**
 * Completely clears the local JSON database file.
 */
export function clearDatabase(): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
  } catch (err) {
    console.error('Error clearing local JSON database:', err);
  }
}
