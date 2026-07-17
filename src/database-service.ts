import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
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
  // AI and operational fields
  is_read?: boolean;
  tag_type?: string;
  summary?: string;
  action_required?: boolean;
  suggested_tag?: string;
  is_important?: boolean;
  urgency_level?: string;
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

      // Operational & AI Assistant Columns
      db.run('ALTER TABLE emails ADD COLUMN is_read INTEGER DEFAULT 0', () => {});
      db.run('ALTER TABLE emails ADD COLUMN tag_type TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN summary TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN action_required INTEGER DEFAULT 0', () => {});
      db.run('ALTER TABLE emails ADD COLUMN suggested_tag TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN is_important INTEGER DEFAULT 0', () => {});
      db.run('ALTER TABLE emails ADD COLUMN urgency_level TEXT', () => {});

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
          api_workflow_log: row.api_workflow_log || '',
          // AI and operational fields
          is_read: row.is_read === true || row.is_read === 1,
          tag_type: row.tag_type || '',
          summary: row.summary || '',
          action_required: row.action_required === true || row.action_required === 1,
          suggested_tag: row.suggested_tag || '',
          is_important: row.is_important === true || row.is_important === 1,
          urgency_level: row.urgency_level || 'Routine'
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
          api_workflow_log: row.api_workflow_log || '',
          // AI and operational fields
          is_read: row.is_read === 1,
          tag_type: row.tag_type || '',
          summary: row.summary || '',
          action_required: row.action_required === 1,
          suggested_tag: row.suggested_tag || '',
          is_important: row.is_important === 1,
          urgency_level: row.urgency_level || 'Routine'
        };
      });
      resolve(mapped);
    });
  });
}

// AI Processing with @google/genai SDK
export async function processEmailWithAI(subject: string, bodyText: string): Promise<{
  summary: string;
  action_required: boolean;
  suggested_tag: string;
  is_important: boolean;
}> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[AI Processing] GEMINI_API_KEY is not configured. Falling back to rule-based classification.');
    return ruleBasedFallback(subject, bodyText);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = `Anda adalah asisten operasional cerdas untuk memproses email masuk milik Fachrul.
Setiap email harus dianalisis untuk menghasilkan:
1. Ringkasan efektif (maksimal 2 kalimat) mengenai inti email tersebut. Jika ada instruksi atau penugasan, sebutkan secara spesifik siapa yang harus melakukan apa.
2. Klasifikasi kategori (tag_type): harus salah satu dari 'Penugasan', 'Informasi', atau 'Peringatan'.
3. Penentuan apakah ada tindakan yang diperlukan (action_required: true/false).
4. Penentuan apakah email ini penting atau mendesak (is_important: true/false). Email yang mengandung instruksi mendesak, penugasan penting, atau peringatan kegagalan/error kritis harus dianggap penting.`;

    const prompt = `Subject: ${subject}\n\nBody:\n${bodyText}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "Ringkasan email maksimal 2 kalimat. Sebutkan instruksi spesifik jika ada."
            },
            action_required: {
              type: Type.BOOLEAN,
              description: "True jika ada tindakan/penugasan yang harus ditindaklanjuti."
            },
            suggested_tag: {
              type: Type.STRING,
              description: "Kategori email: 'Penugasan', 'Informasi', atau 'Peringatan'."
            },
            is_important: {
              type: Type.BOOLEAN,
              description: "True jika mendesak, mengandung penugasan, atau peringatan kritis."
            }
          },
          required: ["summary", "action_required", "suggested_tag", "is_important"]
        }
      }
    });

    const text = response.text;
    if (text) {
      try {
        const result = JSON.parse(text.trim());
        // Validate suggested_tag
        if (!['Penugasan', 'Informasi', 'Peringatan'].includes(result.suggested_tag)) {
          result.suggested_tag = 'Informasi';
        }
        return result;
      } catch (e) {
        console.error('[AI Processing] Failed to parse JSON response from Gemini:', e, 'Response text:', text);
      }
    }
  } catch (err) {
    console.error('[AI Processing] Exception during Gemini API call:', err);
  }

  return ruleBasedFallback(subject, bodyText);
}

function ruleBasedFallback(subject: string, bodyText: string): {
  summary: string;
  action_required: boolean;
  suggested_tag: string;
  is_important: boolean;
} {
  const subjUpper = (subject || '').toUpperCase();
  const bodyUpper = (bodyText || '').toUpperCase();

  let suggested_tag = 'Informasi';
  let action_required = false;
  let is_important = false;

  // Determine tag
  if (
    subjUpper.includes('TUGAS') || 
    subjUpper.includes('ASSIGN') || 
    subjUpper.includes('APPROVAL') || 
    subjUpper.includes('MOHON') ||
    bodyUpper.includes('TOLONG') ||
    bodyUpper.includes('SILAKAN TINJAU')
  ) {
    suggested_tag = 'Penugasan';
    action_required = true;
    is_important = true;
  } else if (
    subjUpper.includes('WARNING') || 
    subjUpper.includes('ERROR') || 
    subjUpper.includes('PERINGATAN') || 
    subjUpper.includes('FAIL') ||
    subjUpper.includes('ALERT')
  ) {
    suggested_tag = 'Peringatan';
    is_important = true;
  }

  // Generate a simple 1-2 sentence summary
  let summary = `Email dari pengirim mengenai "${subject}".`;
  if (suggested_tag === 'Penugasan') {
    summary += ' Memerlukan tinjauan dan persetujuan atau pengerjaan tugas.';
  } else if (suggested_tag === 'Peringatan') {
    summary += ' Terdapat peringatan sistem atau status peringatan yang memerlukan perhatian.';
  } else {
    summary += ' Berisi penyampaian informasi operasional rutin.';
  }

  return {
    summary,
    action_required,
    suggested_tag,
    is_important
  };
}

/**
 * Processes email text body using NVIDIA API and thinkingmachines/inkling model
 */
export async function processEmailWithNvidia(emailSubject: string, emailBody: string): Promise<{
  summary: string;
  action_required: boolean;
  urgency_level: string;
  suggested_tag: string;
}> {
  const apiKey = process.env.NVIDIA_API_KEY || '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';
  const baseURL = 'https://integrate.api.nvidia.com/v1';

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL,
    });

    const completion = await openai.chat.completions.create({
      model: "thinkingmachines/inkling",
      messages: [
        {
          role: "system",
          content: `Anda adalah AI Asisten Operasional untuk sistem "Workflow Email Ticketing". Tugas Anda adalah menganalisis setiap email masuk dan mengubahnya menjadi data terstruktur untuk database kami.

Instruksi Analisis:
1. Analisis konten email (subject dan body) secara mendalam.
2. Tentukan hal-hal berikut:
   - Summary: Ringkasan inti email dalam 1-2 kalimat (bahasa Indonesia).
   - Action_required: Boolean (true jika email mengandung instruksi, permintaan, atau tugas; false jika hanya informasi).
   - Urgency_level: Klasifikasi menjadi "High", "Medium", atau "Low" berdasarkan konten instruksi/tenggat waktu.
   - Suggested_tag: Berikan tag yang paling relevan (Contoh: "Penugasan", "Informasi", "Geofence", "Rekap", "Update Data").

Format Output:
- Anda WAJIB memberikan jawaban dalam format JSON MURNI tanpa teks pembuka, tanpa penjelasan, dan tanpa markdown (tidak boleh ada \`\`\`json ... \`\`\`).
- Pastikan formatnya selalu valid untuk di-parse oleh JSON.parse().

Contoh Output:
{"summary": "Permintaan droping tunai untuk PT Djarum tanggal 20 Juli 2026.", "action_required": true, "urgency_level": "High", "suggested_tag": "Penugasan"}`
        },
        {
          role: "user",
          content: `Subject: ${emailSubject || "(No Subject)"}\n\nBody:\n${emailBody || "(No Content)"}`
        }
      ],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 8192,
      stream: false
    });

    const rawContent = completion.choices[0]?.message?.content || "";
    if (!rawContent) {
      throw new Error("Empty response from NVIDIA API");
    }

    // Parse JSON robustly
    let cleanJson = rawContent.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(cleanJson);
    return {
      summary: parsed.summary !== undefined ? String(parsed.summary) : "",
      action_required: parsed.action_required === true || parsed.action_required === "true",
      urgency_level: parsed.urgency_level !== undefined ? String(parsed.urgency_level) : "Routine",
      suggested_tag: parsed.suggested_tag !== undefined ? String(parsed.suggested_tag) : "Informasi"
    };
  } catch (err: any) {
    console.error('[AI Copilot] NVIDIA API Error:', err.message || String(err));
    throw err;
  }
}

/**
 * Synchronizes and analyzes emails using NVIDIA API and saves/upserts to Supabase + SQLite
 */
export async function syncAndAnalyzeEmail(email: Email): Promise<void> {
  let summary = "";
  let action_required = false;
  let urgency_level = "Routine";
  let suggested_tag = "Informasi";

  try {
    const aiResult = await processEmailWithNvidia(email.subject || "", email.body_text || "");
    summary = aiResult.summary || `Email from ${email.sender} regarding ${email.subject}.`;
    action_required = !!aiResult.action_required;
    urgency_level = aiResult.urgency_level || "Routine";
    suggested_tag = aiResult.suggested_tag || "Informasi";

    // 4. TAMPILAN TERMINAL:
    // Saat AI selesai memproses email, tampilkan log:
    // "[AI Copilot] Email processed: [Subject Email] | Category: [Hasil AI]"
    console.log(`[AI Copilot] Email processed: ${email.subject} | Category: ${urgency_level}`);
  } catch (err: any) {
    // 3. ERROR HANDLING & LOGGING:
    // Jika NVIDIA API gagal (misalnya rate limit), berikan pesan log di terminal bahwa AI sedang tidak tersedia 
    // dan tetap masukkan email ke database dengan status action_required: false agar aplikasi tidak berhenti.
    console.log('[AI Copilot] AI sedang tidak tersedia');
    
    // Fallback: rule-based summary but action_required: false
    const fallbackInfo = ruleBasedFallback(email.subject, email.body_text || "");
    summary = fallbackInfo.summary || `Email from ${email.sender}.`;
    action_required = false;
    urgency_level = "Routine";
    suggested_tag = "Informasi";
  }

  // Combine results and ensure no undefined values are written
  const analyzedEmail: Email = {
    ...email,
    summary,
    action_required,
    urgency_level,
    tag_type: suggested_tag,
    suggested_tag,
    is_important: urgency_level === 'High' || urgency_level === 'Peringatan'
  };

  // Upsert to SQLite and Supabase using existing robust pipeline
  await dbUpsertEmail(analyzedEmail);
}

// Upsert Email in SQLite and Supabase with AI-driven tagging and summary analysis
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

  // Preserve existing operational fields if updating
  let tagType = email.tag_type;
  let summary = email.summary;
  let actionRequired = email.action_required;
  let suggestedTag = email.suggested_tag;
  let isImportant = email.is_important;
  let urgencyLevel = email.urgency_level || 'Routine';
  let tags = email.tags || [];
  let isRead = email.is_read !== undefined ? email.is_read : false;

  const db = getSqliteDb();
  const existing: any = await new Promise((resolve) => {
    db.get('SELECT is_read, tag_type, summary, action_required, suggested_tag, is_important, tags, urgency_level FROM emails WHERE message_id = ?', [email.message_id], (err, row) => {
      resolve(row || null);
    });
  });

  if (existing) {
    isRead = email.is_read !== undefined ? email.is_read : (existing.is_read === 1);
    if (!tagType) tagType = existing.tag_type;
    if (!summary) summary = existing.summary;
    if (actionRequired === undefined) actionRequired = existing.action_required === 1;
    if (!suggestedTag) suggestedTag = existing.suggested_tag;
    if (isImportant === undefined) isImportant = existing.is_important === 1;
    if (!urgencyLevel || urgencyLevel === 'Routine') urgencyLevel = existing.urgency_level || 'Routine';
    try {
      if (tags.length === 0 && existing.tags) {
        tags = JSON.parse(existing.tags);
      }
    } catch (e) {}
  } else {
    // New email: Run AI Assistant if not already supplied
    if (!summary) {
      try {
        console.log(`[AI Copilot] Processing new email with Gemini: "${email.subject}"`);
        const aiResult = await processEmailWithAI(email.subject, email.body_text);
        summary = aiResult.summary;
        actionRequired = aiResult.action_required;
        suggestedTag = aiResult.suggested_tag;
        tagType = aiResult.suggested_tag;
        isImportant = aiResult.is_important;
        urgencyLevel = aiResult.suggested_tag === 'Penugasan' ? 'High' : (aiResult.is_important ? 'Medium' : 'Routine');

        // Tag backfilling: Jika mengandung instruksi mendesak atau penugasan, berikan label khusus 'Urgent/Task' pada tags
        if (isImportant || suggestedTag === 'Penugasan') {
          if (!tags.includes('Urgent/Task')) {
            tags = [...tags.filter(t => t !== 'Other'), 'Urgent/Task'];
          }
        }
      } catch (aiErr) {
        console.error('[AI Copilot] Error analyzing new email:', aiErr);
      }
    }
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
  await new Promise<void>((resolve, reject) => {
    db.run(
      `
      INSERT INTO emails (
        message_id, subject, sender, receiver, date, body_text, html_body, tags, 
        category, sub_category, folder_parent, folder_child, api_workflow_status, api_workflow_log,
        is_read, tag_type, summary, action_required, suggested_tag, is_important, urgency_level
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        api_workflow_log = excluded.api_workflow_log,
        is_read = excluded.is_read,
        tag_type = excluded.tag_type,
        summary = excluded.summary,
        action_required = excluded.action_required,
        suggested_tag = excluded.suggested_tag,
        is_important = excluded.is_important,
        urgency_level = excluded.urgency_level
      `,
      [
        normalizedEmail.message_id,
        normalizedEmail.subject,
        normalizedEmail.sender,
        normalizedEmail.receiver,
        normalizedEmail.date,
        normalizedEmail.body_text,
        normalizedEmail.html_body,
        JSON.stringify(tags),
        normalizedEmail.category,
        normalizedEmail.sub_category,
        normalizedEmail.folder_parent,
        normalizedEmail.folder_child,
        normalizedEmail.api_workflow_status,
        normalizedEmail.api_workflow_log,
        isRead ? 1 : 0,
        tagType || null,
        summary || null,
        actionRequired ? 1 : 0,
        suggestedTag || null,
        isImportant ? 1 : 0,
        urgencyLevel || null
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
        tags: tags,
        category: normalizedEmail.category !== undefined ? normalizedEmail.category : null,
        sub_category: normalizedEmail.sub_category !== undefined ? normalizedEmail.sub_category : null,
        folder_parent: normalizedEmail.folder_parent !== undefined ? normalizedEmail.folder_parent : null,
        folder_child: normalizedEmail.folder_child !== undefined ? normalizedEmail.folder_child : null,
        api_workflow_status: normalizedEmail.api_workflow_status !== undefined ? normalizedEmail.api_workflow_status : null,
        api_workflow_log: normalizedEmail.api_workflow_log !== undefined ? normalizedEmail.api_workflow_log : null,
        // AI fields
        is_read: isRead,
        tag_type: tagType || null,
        summary: summary || null,
        action_required: actionRequired,
        suggested_tag: suggestedTag || null,
        is_important: isImportant,
        urgency_level: urgencyLevel || null
      };

      const { error } = await supabase.from('emails').upsert(payload, { onConflict: 'message_id' });
      if (error) {
        console.error(`[Supabase Error] Failed to insert message ${message_id}:`, error.message, error.details);
      }
    } catch (err) {
      console.error('[Supabase Upsert Exception]:', err);
    }
  }
}

// Mark email as read or unread on SQLite and Supabase databases
export async function dbMarkEmailAsRead(message_id: string, is_read: boolean): Promise<void> {
  const isReadInt = is_read ? 1 : 0;
  
  // SQLite
  const db = getSqliteDb();
  await new Promise<void>((resolve, reject) => {
    db.run('UPDATE emails SET is_read = ? WHERE message_id = ?', [isReadInt, message_id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('emails')
        .update({ is_read: is_read })
        .eq('message_id', message_id);
      if (error) {
        console.error('[Supabase Update is_read Error]:', error);
      }
    } catch (err) {
      console.error('[Supabase Update is_read Exception]:', err);
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

// Apply retroactive filter to local SQLite database
export async function dbApplyRetroactiveFilter(filter: CustomFilter): Promise<number> {
  const db = getSqliteDb();
  return new Promise<number>((resolve, reject) => {
    db.all("SELECT * FROM emails WHERE folder_parent = 'Lainnya'", (err, rows: any[]) => {
      if (err) return reject(err);
      if (!rows || rows.length === 0) return resolve(0);

      let matchedCount = 0;
      const stmt = db.prepare("UPDATE emails SET folder_parent = ?, folder_child = ? WHERE message_id = ?");

      for (const row of rows) {
        let isMatch = true;
        const senderLower = (row.sender || '').toLowerCase();
        const subjectLower = (row.subject || '').toLowerCase();
        const bodyLower = (row.body_text || '').toLowerCase();

        if (!filter.match_from && !filter.match_subject && !filter.match_body) {
          continue;
        }

        if (filter.match_from && !senderLower.includes(filter.match_from.toLowerCase())) isMatch = false;
        if (filter.match_subject && !subjectLower.includes(filter.match_subject.toLowerCase())) isMatch = false;
        if (filter.match_body && !bodyLower.includes(filter.match_body.toLowerCase())) isMatch = false;

        if (isMatch) {
          matchedCount++;
          stmt.run(filter.action_parent, filter.action_child, row.message_id);
        }
      }

      stmt.finalize();
      resolve(matchedCount);
    });
  });
}

