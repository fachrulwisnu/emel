import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import { classifyEmail, classifyFolder } from './sqlite-db';
import { getAiCompletion } from './services/aiService';

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
  suggested_folder_parent?: string;
  suggested_folder_child?: string;
  is_cit_order?: boolean;
  cit_type?: string;
  suggested_bank?: string;
  extracted_notes?: string;
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
      db.run('ALTER TABLE emails ADD COLUMN suggested_folder_parent TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN suggested_folder_child TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN is_cit_order INTEGER DEFAULT 0', () => {});
      db.run('ALTER TABLE emails ADD COLUMN cit_type TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN suggested_bank TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN extracted_notes TEXT', () => {});

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
          urgency_level: row.urgency_level || 'Routine',
          suggested_folder_parent: row.suggested_folder_parent || '',
          suggested_folder_child: row.suggested_folder_child || '',
          is_cit_order: row.is_cit_order === true || row.is_cit_order === 1,
          cit_type: row.cit_type || 'None',
          suggested_bank: row.suggested_bank || '',
          extracted_notes: row.extracted_notes || ''
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
          urgency_level: row.urgency_level || 'Routine',
          suggested_folder_parent: row.suggested_folder_parent || '',
          suggested_folder_child: row.suggested_folder_child || '',
          is_cit_order: row.is_cit_order === 1,
          cit_type: row.cit_type || 'None',
          suggested_bank: row.suggested_bank || '',
          extracted_notes: row.extracted_notes || ''
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
  suggested_folder_parent: string;
  suggested_folder_child: string;
  is_cit_order: boolean;
  cit_type: string;
  suggested_bank: string;
  extracted_notes: string;
}> {
  const messages = [
    {
      role: "system",
      content: `Anda adalah AI Asisten Operasional Ticketing. Tugas utama Anda adalah menganalisis email masuk, memberikan ringkasan, mendeteksi pesanan operasional (CIT/ATM), dan merutekan email tersebut ke Folder Region dan Branch yang tepat.

INSTRUKSI ANALISIS DASAR:
1. Analisis 'subject' and 'body_text' secara mendalam.
2. Tentukan 'summary' (ringkasan 1-2 kalimat bahasa Indonesia).
3. Tentukan 'action_required' (true jika email mengandung instruksi/tugas, false jika hanya notifikasi/rutin).
4. Tentukan 'urgency_level' ("High", "Medium", "Low", atau "Routine").

INSTRUKSI DETEKSI CIT/ATM:
Jika email berhubungan dengan uang (seperti: "CIT", "ATM", "Setor", "Bon", "Delivery", "Geser Vault", "Droping", "Uang Kertas", "Denom"):
- Set "is_cit_order": true
- Set "cit_type": "CIT" atau "ATM" (pilih yang paling relevan dengan isi email).
- Set "suggested_tag": "CIT Order" atau "ATM Order".
- Ekstrak nama bank tujuan jika disebutkan ke dalam "suggested_bank" (contoh: "BCA", "CIMB NIAGA", "MAYBANK"). Kosongkan jika tidak ada.
- Buat ringkasan instruksi khusus untuk operator ke dalam "extracted_notes" (misal: "Droping uang 100k dan 50k untuk KC Asia Afrika").
- Jika tidak terdeteksi, set "is_cit_order": false, "cit_type": "None", "suggested_bank": "", "extracted_notes": "", dan berikan "suggested_tag" yang umum.

INSTRUKSI ROUTING (SUGGESTED FOLDER):
Tentukan 'suggested_folder_parent' (REGION) dan 'suggested_folder_child' (BRANCH) berdasarkan domain/alamat pengirim (sender) atau kata kunci di subject/body. Petakan sesuai aturan berikut:

- REGION 1 -> PALEMBANG, MEDAN, BATAM, RAWAMANGUN, JAMBI, PADANG, PEKANBARU
- REGION 2 -> PONTIANAK, BALIKPAPAN, SAMARINDA, BANJARMASIN, SINGKAWANG
- REGION 3 -> MERUYA, BENGKULU, LAMPUNG, SERANG
- REGION 4 -> DENPASAR, KUPANG, BANDUNG, MATARAM, MANADO, CIREBON
- REGION 5 -> SEMARANG, SOLO, TEGAL, YOGYAKARTA, PURWOKERTO, KUDUS
- REGION 6 -> MAKASSAR, KEDIRI, JEMBER, SURABAYA, MALANG
- REGION 10 -> BENGKULU (Jika subject mengandung "ADV Bengkulu")

*PENTING: FORMAT OUTPUT HARUS JSON MURNI TANPA MARKDOWN DAN TANPA TEKS PEMBUKA.*

CONTOH OUTPUT YANG DIHARAPKAN:
{
  "summary": "Permintaan bon CIT dan Setor Uang ATM Reguler SLA Medan tanggal 20 Juli 2026.",
  "action_required": true,
  "urgency_level": "High",
  "suggested_tag": "CIT Order",
  "is_cit_order": true,
  "cit_type": "CIT",
  "suggested_folder_parent": "REGION 1",
  "suggested_folder_child": "MEDAN",
  "suggested_bank": "BCA",
  "extracted_notes": "Revisi setor ACMD & AVBT Reguler SLA Medan"
}`
    },
    {
      role: "user",
      content: `Subject: ${emailSubject || "(No Subject)"}\n\nBody:\n${emailBody || "(No Content)"}`
    }
  ];

  try {
    const rawContent = await getAiCompletion(messages);
    if (!rawContent) {
      throw new Error("Empty response returned from rotated AI services");
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
      suggested_tag: parsed.suggested_tag !== undefined ? String(parsed.suggested_tag) : "Informasi",
      suggested_folder_parent: parsed.suggested_folder_parent !== undefined ? String(parsed.suggested_folder_parent) : "Operation",
      suggested_folder_child: parsed.suggested_folder_child !== undefined ? String(parsed.suggested_folder_child) : "General",
      is_cit_order: parsed.is_cit_order === true || parsed.is_cit_order === "true",
      cit_type: parsed.cit_type !== undefined ? String(parsed.cit_type) : "None",
      suggested_bank: parsed.suggested_bank !== undefined ? String(parsed.suggested_bank) : "",
      extracted_notes: parsed.extracted_notes !== undefined ? String(parsed.extracted_notes) : ""
    };
  } catch (err: any) {
    console.error('[AI Copilot] All rotated models failed or JSON parse error. Falling back to default values. Error:', err.message || String(err));
    // Return graceful defaults so the worker keeps running without crashing
    return {
      summary: "Gagal menganalisis email (semua model AI rotator gagal atau format tidak valid).",
      action_required: false,
      urgency_level: "Routine",
      suggested_tag: "Informasi",
      suggested_folder_parent: "Operation",
      suggested_folder_child: "General",
      is_cit_order: false,
      cit_type: "None",
      suggested_bank: "",
      extracted_notes: ""
    };
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
  let suggested_folder_parent = "Operation";
  let suggested_folder_child = "General";
  let is_cit_order = false;
  let cit_type = "None";
  let suggested_bank = "";
  let extracted_notes = "";

  try {
    const aiResult = await processEmailWithNvidia(email.subject || "", email.body_text || "");
    summary = aiResult.summary || `Email from ${email.sender} regarding ${email.subject}.`;
    action_required = !!aiResult.action_required;
    urgency_level = aiResult.urgency_level || "Routine";
    suggested_tag = aiResult.suggested_tag || "Informasi";
    suggested_folder_parent = aiResult.suggested_folder_parent || "Operation";
    suggested_folder_child = aiResult.suggested_folder_child || "General";
    is_cit_order = !!aiResult.is_cit_order;
    cit_type = aiResult.cit_type || "None";
    suggested_bank = aiResult.suggested_bank || "";
    extracted_notes = aiResult.extracted_notes || "";

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
    suggested_folder_parent = "Operation";
    suggested_folder_child = "General";
    is_cit_order = false;
    cit_type = "None";
    suggested_bank = "";
    extracted_notes = "";
  }

  // Combine results and ensure no undefined values are written
  const analyzedEmail: Email = {
    ...email,
    summary,
    action_required,
    urgency_level,
    tag_type: suggested_tag,
    suggested_tag,
    suggested_folder_parent,
    suggested_folder_child,
    is_cit_order,
    cit_type,
    suggested_bank,
    extracted_notes,
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
  let suggestedFolderParent = email.suggested_folder_parent;
  let suggestedFolderChild = email.suggested_folder_child;
  let isCitOrder = email.is_cit_order;
  let citType = email.cit_type !== undefined && email.cit_type !== null ? email.cit_type : 'None';
  let suggestedBank = email.suggested_bank !== undefined && email.suggested_bank !== null ? email.suggested_bank : '';
  let extractedNotes = email.extracted_notes !== undefined && email.extracted_notes !== null ? email.extracted_notes : '';
  let tags = email.tags || [];
  let isRead = email.is_read !== undefined ? email.is_read : false;

  const db = getSqliteDb();
  const existing: any = await new Promise((resolve) => {
    db.get('SELECT is_read, tag_type, summary, action_required, suggested_tag, is_important, tags, urgency_level, suggested_folder_parent, suggested_folder_child, is_cit_order, cit_type, suggested_bank, extracted_notes FROM emails WHERE message_id = ?', [email.message_id], (err, row) => {
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
    if (!suggestedFolderParent) suggestedFolderParent = existing.suggested_folder_parent;
    if (!suggestedFolderChild) suggestedFolderChild = existing.suggested_folder_child;
    if (isCitOrder === undefined) isCitOrder = existing.is_cit_order === 1;
    if (email.cit_type === undefined) citType = existing.cit_type || 'None';
    if (email.suggested_bank === undefined) suggestedBank = existing.suggested_bank !== undefined ? existing.suggested_bank : '';
    if (email.extracted_notes === undefined) extractedNotes = existing.extracted_notes !== undefined ? existing.extracted_notes : '';
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
        is_read, tag_type, summary, action_required, suggested_tag, is_important, urgency_level,
        suggested_folder_parent, suggested_folder_child, is_cit_order, cit_type, suggested_bank, extracted_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        urgency_level = excluded.urgency_level,
        suggested_folder_parent = excluded.suggested_folder_parent,
        suggested_folder_child = excluded.suggested_folder_child,
        is_cit_order = excluded.is_cit_order,
        cit_type = excluded.cit_type,
        suggested_bank = excluded.suggested_bank,
        extracted_notes = excluded.extracted_notes
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
        urgencyLevel || null,
        suggestedFolderParent || null,
        suggestedFolderChild || null,
        isCitOrder ? 1 : 0,
        citType || 'None',
        suggestedBank || '',
        extractedNotes || ''
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
        is_read: !!isRead,
        tag_type: tagType || null,
        summary: summary || null,
        action_required: !!actionRequired,
        suggested_tag: suggestedTag || null,
        is_important: !!isImportant,
        urgency_level: urgencyLevel || null,
        suggested_folder_parent: suggestedFolderParent || null,
        suggested_folder_child: suggestedFolderChild || null,
        is_cit_order: !!isCitOrder,
        cit_type: citType || 'None',
        suggested_bank: suggestedBank || '',
        extracted_notes: extractedNotes || ''
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

// Granular fields update for "Smart Apply" and "Edit Suggestion" actions
export async function dbUpdateEmailFields(
  message_id: string, 
  fields: {
    folder_parent?: string;
    folder_child?: string;
    tags?: string[];
    is_important?: boolean;
    urgency_level?: string;
    suggested_tag?: string;
    summary?: string;
    action_required?: boolean;
    is_cit_order?: boolean;
    cit_type?: string;
    suggested_bank?: string;
    extracted_notes?: string;
  }
): Promise<void> {
  // SQLite update
  const db = getSqliteDb();
  const sets: string[] = [];
  const params: any[] = [];
  
  if (fields.folder_parent !== undefined) { sets.push('folder_parent = ?'); params.push(fields.folder_parent); }
  if (fields.folder_child !== undefined) { sets.push('folder_child = ?'); params.push(fields.folder_child); }
  if (fields.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(fields.tags)); }
  if (fields.is_important !== undefined) { sets.push('is_important = ?'); params.push(fields.is_important ? 1 : 0); }
  if (fields.urgency_level !== undefined) { sets.push('urgency_level = ?'); params.push(fields.urgency_level); }
  if (fields.suggested_tag !== undefined) { sets.push('suggested_tag = ?'); params.push(fields.suggested_tag); sets.push('tag_type = ?'); params.push(fields.suggested_tag); }
  if (fields.summary !== undefined) { sets.push('summary = ?'); params.push(fields.summary); }
  if (fields.action_required !== undefined) { sets.push('action_required = ?'); params.push(fields.action_required ? 1 : 0); }
  if (fields.is_cit_order !== undefined) { sets.push('is_cit_order = ?'); params.push(fields.is_cit_order ? 1 : 0); }
  if (fields.cit_type !== undefined) { sets.push('cit_type = ?'); params.push(fields.cit_type); }
  if (fields.suggested_bank !== undefined) { sets.push('suggested_bank = ?'); params.push(fields.suggested_bank); }
  if (fields.extracted_notes !== undefined) { sets.push('extracted_notes = ?'); params.push(fields.extracted_notes); }
  
  if (sets.length > 0) {
    params.push(message_id);
    await new Promise<void>((resolve, reject) => {
      db.run(`UPDATE emails SET ${sets.join(', ')} WHERE message_id = ?`, params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
  
  // Supabase update
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const updatePayload: any = {};
      if (fields.folder_parent !== undefined) updatePayload.folder_parent = fields.folder_parent;
      if (fields.folder_child !== undefined) updatePayload.folder_child = fields.folder_child;
      if (fields.tags !== undefined) updatePayload.tags = fields.tags;
      if (fields.is_important !== undefined) updatePayload.is_important = fields.is_important;
      if (fields.urgency_level !== undefined) updatePayload.urgency_level = fields.urgency_level;
      if (fields.suggested_tag !== undefined) {
        updatePayload.suggested_tag = fields.suggested_tag;
        updatePayload.tag_type = fields.suggested_tag;
      }
      if (fields.summary !== undefined) updatePayload.summary = fields.summary;
      if (fields.action_required !== undefined) updatePayload.action_required = fields.action_required;
      if (fields.is_cit_order !== undefined) updatePayload.is_cit_order = fields.is_cit_order;
      if (fields.cit_type !== undefined) updatePayload.cit_type = fields.cit_type;
      if (fields.suggested_bank !== undefined) updatePayload.suggested_bank = fields.suggested_bank;
      if (fields.extracted_notes !== undefined) updatePayload.extracted_notes = fields.extracted_notes;
      
      if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
          .from('emails')
          .update(updatePayload)
          .eq('message_id', message_id);
        if (error) {
          console.error('[Supabase Update Email Error]:', error);
        }
      }
    } catch (err) {
      console.error('[Supabase Update Email Exception]:', err);
    }
  }
}

// Historical Data Backfill for unsummarized emails
export async function dbRunHistoricalBackfill(): Promise<{ processedCount: number; failedCount: number; skippedCount: number }> {
  const db = getSqliteDb();
  
  // 1. Get all emails that are unsummarized
  const oldEmails: any[] = await new Promise((resolve, reject) => {
    db.all(
      "SELECT message_id, subject, body_text FROM emails WHERE summary IS NULL OR summary = '' OR summary = 'No summary generated'",
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const email of oldEmails) {
    const text = email.body_text || '';
    
    // Check length of body
    if (!text || text.trim().length < 10) {
      console.log(`[Backfill] Skipping/setting default for message_id ${email.message_id}: Body too short or empty`);
      await dbUpdateEmailFields(email.message_id, {
        summary: "Data historis tidak terbaca jelas",
        action_required: false,
        urgency_level: "Routine",
        suggested_tag: "Informasi",
        folder_parent: "Operation",
        folder_child: "General",
        is_important: false
      });
      skippedCount++;
      continue;
    }

    try {
      console.log(`[Backfill] Processing email: ${email.subject || '(No Subject)'}`);
      const aiResult = await processEmailWithNvidia(email.subject || "", text);
      
      if (aiResult && aiResult.summary && aiResult.summary.trim() !== "") {
        await dbUpdateEmailFields(email.message_id, {
          summary: aiResult.summary,
          action_required: !!aiResult.action_required,
          urgency_level: aiResult.urgency_level || "Routine",
          suggested_tag: aiResult.suggested_tag || "Informasi",
          folder_parent: aiResult.suggested_folder_parent || "Operation",
          folder_child: aiResult.suggested_folder_child || "General",
          is_important: aiResult.urgency_level === "High"
        });
        processedCount++;
      } else {
        console.warn(`[Backfill] AI returned empty summary for message_id: ${email.message_id}. Fallback applied.`);
        await dbUpdateEmailFields(email.message_id, {
          summary: "Data historis tidak terbaca jelas",
          action_required: false,
          urgency_level: "Routine",
          suggested_tag: "Informasi",
          is_important: false
        });
        failedCount++;
      }
    } catch (err: any) {
      console.error(`[Backfill] Error processing message_id ${email.message_id}:`, err.message || err);
      // Fail gracefully and keep trying the rest
      await dbUpdateEmailFields(email.message_id, {
        summary: "Data historis tidak terbaca jelas",
        action_required: false,
        urgency_level: "Routine",
        suggested_tag: "Informasi",
        is_important: false
      });
      failedCount++;
    }

    // Add a tiny delay to respect rate limit of NVIDIA API
    await new Promise((r) => setTimeout(r, 200));
  }

  return { processedCount, failedCount, skippedCount };
}

