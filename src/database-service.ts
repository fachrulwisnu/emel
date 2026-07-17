import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { classifyEmail, classifyFolder } from './sqlite-db';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'app_settings.json');
const SQLITE_DB_PATH = path.join(process.cwd(), 'emails.db');

export interface Email {
  id?: number;
  message_id: string;
  subject: string;
  sender: string;
  receiver: string;
  date: string;
  body_text: string;
  html_body: string;
  tags: string[];
  category?: string;
  sub_category?: string;
  folder_parent?: string;
  folder_child?: string;
  api_workflow_status?: string;
  api_workflow_log?: string;
}

export interface CustomFilter {
  id?: number;
  name: string;
  match_from: string;
  match_subject: string;
  match_body: string;
  action_parent: string;
  action_child: string;
  trigger_api?: boolean;
}

export interface AppSettings {
  pop3Host: string;
  pop3Port: number;
  pop3User: string;
  pop3Pass: string;
  citApiToken: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const defaultSettings: AppSettings = {
  pop3Host: 'mail.advantagescm.com',
  pop3Port: 995,
  pop3User: '',
  pop3Pass: '',
  citApiToken: '',
  supabaseUrl: '',
  supabaseKey: ''
};

// Get settings from local app_settings.json
export function getAppSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(defaultSettings, null, 2), 'utf-8');
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (err) {
    console.error('Error reading app_settings.json:', err);
    return defaultSettings;
  }
}

// Save settings to local app_settings.json
export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const updated = { ...current, ...settings };
  fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// Initialize Supabase Client dynamically if configured
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const settings = getAppSettings();
  const url = process.env.SUPABASE_URL || settings.supabaseUrl;
  const key = process.env.SUPABASE_KEY || settings.supabaseKey;

  if (url && key) {
    if (!supabaseInstance) {
      supabaseInstance = createClient(url, key);
    }
    return supabaseInstance;
  }
  return null;
}

// Helper to check if Supabase is connected
export function isSupabaseActive(): boolean {
  return getSupabaseClient() !== null;
}

// Unified Database CRUD Operations
let sqliteDb: sqlite3.Database | null = null;

function getSqliteDb(): sqlite3.Database {
  if (!sqliteDb) {
    sqliteDb = new sqlite3.Database(SQLITE_DB_PATH);
  }
  return sqliteDb;
}

export async function initDatabaseService(): Promise<void> {
  const db = getSqliteDb();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create local SQLite emails table
      db.run(`
        CREATE TABLE IF NOT EXISTS emails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT UNIQUE,
          subject TEXT,
          sender TEXT,
          receiver TEXT,
          date TEXT,
          body_text TEXT,
          html_body TEXT,
          tags TEXT,
          category TEXT,
          sub_category TEXT,
          folder_parent TEXT,
          folder_child TEXT,
          api_workflow_status TEXT,
          api_workflow_log TEXT
        )
      `);

      // Create custom_filters table
      db.run(`
        CREATE TABLE IF NOT EXISTS custom_filters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          match_from TEXT,
          match_subject TEXT,
          match_body TEXT,
          action_parent TEXT,
          action_child TEXT,
          trigger_api INTEGER DEFAULT 0
        )
      `);

      // Ensure api_workflow columns exist in SQLite schema
      db.run('ALTER TABLE emails ADD COLUMN api_workflow_status TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN api_workflow_log TEXT', () => {});
      db.run('ALTER TABLE custom_filters ADD COLUMN trigger_api INTEGER DEFAULT 0', () => {});

      resolve();
    });
  });
}

// Get all emails (merges Supabase and SQLite)
export async function dbGetAllEmails(): Promise<Email[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('date', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          message_id: row.message_id,
          subject: row.subject || '',
          sender: row.sender || '',
          receiver: row.receiver || '',
          date: row.date || '',
          body_text: row.body_text || '',
          html_body: row.html_body || '',
          tags: typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []),
          category: row.category || '',
          sub_category: row.sub_category || '',
          folder_parent: row.folder_parent || '',
          folder_child: row.folder_child || '',
          api_workflow_status: row.api_workflow_status || 'none',
          api_workflow_log: row.api_workflow_log || ''
        }));
      }
      console.warn('Supabase emails query failed, falling back to SQLite:', error);
    } catch (err) {
      console.error('Error connecting to Supabase for emails:', err);
    }
  }

  // Fallback to SQLite
  const db = getSqliteDb();
  return new Promise((resolve) => {
    db.all('SELECT * FROM emails ORDER BY date DESC', (err, rows: any[]) => {
      if (err || !rows) {
        return resolve([]);
      }
      const mapped = rows.map((row) => {
        let parsedTags: string[] = [];
        try {
          parsedTags = JSON.parse(row.tags || '[]');
        } catch {
          parsedTags = row.tags ? row.tags.split(',') : [];
        }
        return {
          id: row.id,
          message_id: row.message_id,
          subject: row.subject || '',
          sender: row.sender || '',
          receiver: row.receiver || '',
          date: row.date || '',
          body_text: row.body_text || '',
          html_body: row.html_body || '',
          tags: parsedTags,
          category: row.category || '',
          sub_category: row.sub_category || '',
          folder_parent: row.folder_parent || '',
          folder_child: row.folder_child || '',
          api_workflow_status: row.api_workflow_status || 'none',
          api_workflow_log: row.api_workflow_log || ''
        };
      });
      resolve(mapped);
    });
  });
}

// Upsert Email in SQLite and Supabase
export async function dbUpsertEmail(email: Email): Promise<void> {
  // Classify dynamically if not provided
  let emailCategory = email.category;
  let emailSubCategory = email.sub_category;
  if (!emailCategory || !emailSubCategory) {
    const classification = classifyEmail(email.subject);
    if (!emailCategory) emailCategory = classification.category;
    if (!emailSubCategory) emailSubCategory = classification.subCategory;
  }

  let folderParent = email.folder_parent;
  let folderChild = email.folder_child;

  // Apply custom filters
  if (!folderParent || !folderChild) {
    const filters = await dbGetCustomFilters();
    for (const filter of filters) {
      if (!filter.match_from && !filter.match_subject && !filter.match_body) {
        continue;
      }
      let isMatch = true;
      if (filter.match_from && !email.sender.toLowerCase().includes(filter.match_from.toLowerCase())) isMatch = false;
      if (filter.match_subject && !email.subject.toLowerCase().includes(filter.match_subject.toLowerCase())) isMatch = false;
      if (filter.match_body && !email.body_text.toLowerCase().includes(filter.match_body.toLowerCase())) isMatch = false;

      if (isMatch) {
        folderParent = filter.action_parent;
        folderChild = filter.action_child;
        break;
      }
    }
  }

  // Fallback to auto-rules
  if (!folderParent || !folderChild) {
    const classification = classifyFolder(email.sender, email.subject);
    if (!folderParent) folderParent = classification.folder_parent;
    if (!folderChild) folderChild = classification.folder_child;
  }

  const normalizedEmail = {
    ...email,
    category: emailCategory,
    sub_category: emailSubCategory,
    folder_parent: folderParent,
    folder_child: folderChild,
    api_workflow_status: email.api_workflow_status || 'pending',
    api_workflow_log: email.api_workflow_log || ''
  };

  // Upsert to SQLite
  const db = getSqliteDb();
  await new Promise<void>((resolve, reject) => {
    db.run(
      `
      INSERT INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags, category, sub_category, folder_parent, folder_child, api_workflow_status, api_workflow_log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        receiver = excluded.receiver,
        date = excluded.date,
        body_text = excluded.body_text,
        html_body = excluded.html_body,
        tags = excluded.tags,
        category = excluded.category,
        sub_category = excluded.sub_category,
        folder_parent = excluded.folder_parent,
        folder_child = excluded.folder_child,
        api_workflow_status = excluded.api_workflow_status,
        api_workflow_log = excluded.api_workflow_log
      `,
      [
        normalizedEmail.message_id,
        normalizedEmail.subject,
        normalizedEmail.sender,
        normalizedEmail.receiver,
        normalizedEmail.date,
        normalizedEmail.body_text,
        normalizedEmail.html_body,
        JSON.stringify(normalizedEmail.tags),
        normalizedEmail.category,
        normalizedEmail.sub_category,
        normalizedEmail.folder_parent,
        normalizedEmail.folder_child,
        normalizedEmail.api_workflow_status,
        normalizedEmail.api_workflow_log
      ],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  // Upsert to Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const message_id = normalizedEmail.message_id;
      let dateIso = new Date().toISOString();
      if (normalizedEmail.date) {
        try {
          dateIso = new Date(normalizedEmail.date).toISOString();
        } catch (e) {
          console.warn('[Supabase Worker] Invalid date value, defaulting to now:', normalizedEmail.date);
        }
      }

      const payload = {
        message_id: normalizedEmail.message_id !== undefined ? normalizedEmail.message_id : null,
        subject: normalizedEmail.subject !== undefined ? normalizedEmail.subject : null,
        sender: normalizedEmail.sender !== undefined ? normalizedEmail.sender : null,
        receiver: normalizedEmail.receiver !== undefined ? normalizedEmail.receiver : null,
        date: dateIso,
        body_text: normalizedEmail.body_text !== undefined ? normalizedEmail.body_text : null,
        html_body: normalizedEmail.html_body !== undefined ? normalizedEmail.html_body : null,
        tags: normalizedEmail.tags !== undefined ? normalizedEmail.tags : null,
        category: normalizedEmail.category !== undefined ? normalizedEmail.category : null,
        sub_category: normalizedEmail.sub_category !== undefined ? normalizedEmail.sub_category : null,
        folder_parent: normalizedEmail.folder_parent !== undefined ? normalizedEmail.folder_parent : null,
        folder_child: normalizedEmail.folder_child !== undefined ? normalizedEmail.folder_child : null,
        api_workflow_status: normalizedEmail.api_workflow_status !== undefined ? normalizedEmail.api_workflow_status : null,
        api_workflow_log: normalizedEmail.api_workflow_log !== undefined ? normalizedEmail.api_workflow_log : null
      };

      const { error } = await supabase.from('emails').upsert(payload, { onConflict: 'message_id' });
      if (error) {
          console.error(`[Supabase Error] Failed to insert message ${message_id}:`, error.message, error.details);
      } else {
          // trigger real-time notification
      }
    } catch (err) {
      console.error('[Supabase Upsert Exception]:', err);
    }
  }
}

// Get all custom filters (from Supabase if configured, fallback to SQLite)
export async function dbGetCustomFilters(): Promise<CustomFilter[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('custom_filters')
        .select('*')
        .order('id', { ascending: true });

      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          name: row.name || '',
          match_from: row.match_from || '',
          match_subject: row.match_subject || '',
          match_body: row.match_body || '',
          action_parent: row.action_parent || '',
          action_child: row.action_child || '',
          trigger_api: !!row.trigger_api
        }));
      }
    } catch (err) {
      console.error('Error connecting to Supabase for custom filters:', err);
    }
  }

  // Fallback to SQLite
  const db = getSqliteDb();
  return new Promise((resolve) => {
    db.all('SELECT * FROM custom_filters ORDER BY id ASC', (err, rows: any[]) => {
      if (err || !rows) {
        return resolve([]);
      }
      const mapped = rows.map((row) => ({
        id: row.id,
        name: row.name || '',
        match_from: row.match_from || '',
        match_subject: row.match_subject || '',
        match_body: row.match_body || '',
        action_parent: row.action_parent || '',
        action_child: row.action_child || '',
        trigger_api: row.trigger_api === 1
      }));
      resolve(mapped);
    });
  });
}

// Add/Save Custom Filter
export async function dbSaveCustomFilter(filter: CustomFilter): Promise<void> {
  const isTriggerApiInt = filter.trigger_api ? 1 : 0;

  // Save to SQLite
  const db = getSqliteDb();
  await new Promise<void>((resolve, reject) => {
    if (filter.id) {
      db.run(
        `UPDATE custom_filters SET 
          name = ?, match_from = ?, match_subject = ?, match_body = ?, action_parent = ?, action_child = ?, trigger_api = ?
         WHERE id = ?`,
        [filter.name, filter.match_from, filter.match_subject, filter.match_body, filter.action_parent, filter.action_child, isTriggerApiInt, filter.id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    } else {
      db.run(
        `INSERT INTO custom_filters (name, match_from, match_subject, match_body, action_parent, action_child, trigger_api)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [filter.name, filter.match_from, filter.match_subject, filter.match_body, filter.action_parent, filter.action_child, isTriggerApiInt],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    }
  });

  // Save to Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const payload: any = {
        name: filter.name,
        match_from: filter.match_from,
        match_subject: filter.match_subject,
        match_body: filter.match_body,
        action_parent: filter.action_parent,
        action_child: filter.action_child,
        trigger_api: !!filter.trigger_api
      };
      if (filter.id) {
        payload.id = filter.id;
      }
      const { error } = await supabase.from('custom_filters').upsert(payload);
      if (error) {
        console.error('[Supabase Custom Filter Save Error]:', error);
      }
    } catch (err) {
      console.error('[Supabase Custom Filter Save Exception]:', err);
    }
  }
}

// Delete Custom Filter
export async function dbDeleteCustomFilter(id: number): Promise<void> {
  const db = getSqliteDb();
  await new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM custom_filters WHERE id = ?', [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('custom_filters').delete().eq('id', id);
      if (error) {
        console.error('[Supabase Custom Filter Delete Error]:', error);
      }
    } catch (err) {
      console.error('[Supabase Custom Filter Delete Exception]:', err);
    }
  }
}

// Clear Database Cache
export async function dbClearEmails(): Promise<void> {
  const db = getSqliteDb();
  await new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM emails', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('emails').delete().neq('id', 0); // deletes all rows
      if (error) {
        console.error('[Supabase Clear Emails Error]:', error);
      }
    } catch (err) {
      console.error('[Supabase Clear Emails Exception]:', err);
    }
  }
}
