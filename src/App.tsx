import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Mail, 
  Folder, 
  FolderOpen, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  User, 
  Inbox, 
  SlidersHorizontal, 
  Settings, 
  Eye, 
  EyeOff,
  Trash2,
  Pencil,
  Info,
  Clock,
  ArrowRight,
  Database,
  Plus,
  Server,
  Link,
  Activity,
  Check,
  Zap,
  ChevronUp,
  Sparkles,
  History,
  Coins,
  MoreVertical
} from 'lucide-react';
import CitDashboard from './components/CitDashboard';
import CitOrderModal from './components/CitOrderModal';

interface Email {
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

  // Frontend map fallbacks
  fromName?: string;
  fromAddress?: string;

  // AI fields
  is_read?: boolean;
  tag_type?: string;
  summary?: string;
  action_required?: boolean;
  suggested_tag?: string;
  is_important?: boolean;
  urgency_level?: string;
  is_cit_order?: boolean;
  cit_type?: string;
  suggested_bank?: string;
  extracted_notes?: string;
  ai_status?: string;
}

interface CustomFilter {
  id?: number;
  name: string;
  match_from: string;
  match_subject: string;
  match_body: string;
  action_parent: string;
  action_child: string;
  trigger_api?: boolean;
}

interface AppSettings {
  pop3Host: string;
  pop3Port: number;
  pop3User: string;
  pop3Pass: string;
  citApiToken: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const stringToColor = (str: string) => {
  if (!str) return '#64748b';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).slice(-2);
  }
  return color;
};

const getBadge = (tag: string | undefined) => {
  if (tag === 'CIT') return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold shadow-xs badge-cit">CIT 💰</span>;
  if (tag === 'ATM') return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold shadow-xs badge-atm">ATM 💳</span>;
  return null;
};

const getTagBadgeStyle = (str: string) => {
  const color = stringToColor(str);
  return {
    backgroundColor: `${color}15`,
    color: color,
    borderColor: `${color}30`
  };
};

export default function App() {
  // Navigation
  const [currentMenu, setCurrentMenu] = useState<'inbox' | 'settings' | 'cit-dashboard'>('inbox');
  const [settingsTab, setSettingsTab] = useState<'filters' | 'api' | 'mail' | 'backfill'>('filters');
  const [prefillEmail, setPrefillEmail] = useState<Email | null>(null);

  // Loaders and State
  const [tickets, setTickets] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [dynamicFolders, setDynamicFolders] = useState<{ folder_parent: string; folder_child: string; count: number }[]>([]);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  
  // Custom Filters State
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [filterRules, setFilterRules] = useState<CustomFilter[]>([]);
  const [filterMsg, setFilterMsg] = useState('');
  const [editingFilterId, setEditingFilterId] = useState<number | null>(null);
  const [filterForm, setFilterForm] = useState<CustomFilter>({
    name: '',
    match_from: '',
    match_subject: '',
    match_body: '',
    action_parent: '',
    action_child: '',
    trigger_api: false
  });

  // Global Config Settings
  const [appSettings, setAppSettings] = useState<AppSettings>({
    pop3Host: 'mail.advantagescm.com',
    pop3Port: 995,
    pop3User: '',
    pop3Pass: '',
    citApiToken: '',
    supabaseUrl: '',
    supabaseKey: ''
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Connection/Manual sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ processed: number; failed: number; skipped: number } | null>(null);

  // Floating Toasts
  const [toasts, setToasts] = useState<{ id: number; title: string; message: string }[]>([]);

  // Simple search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Smart Apply and Edit Suggestion Modal State
  const [isEditSuggestionOpen, setIsEditSuggestionOpen] = useState(false);
  const [suggestionForm, setSuggestionForm] = useState({
    message_id: '',
    folder_parent: '',
    folder_child: '',
    suggested_tag: '',
    urgency_level: 'Routine',
    is_important: false,
    summary: '',
    action_required: false,
    create_filter_rule: false,
    filter_rule_name: '',
    filter_rule_match_from: '',
    filter_rule_match_subject: '',
    filter_rule_match_body: '',
    filter_rule_trigger_api: false
  });

  const [isCitOrderModalOpen, setIsCitOrderModalOpen] = useState(false);
  const [citOrderPrefillEmail, setCitOrderPrefillEmail] = useState<Email | null>(null);
  const [activeContextMenuId, setActiveContextMenuId] = useState<string | null>(null);

  const toggleCitOrderMark = async (email: Email) => {
    try {
      const nextIsCitOrder = !email.is_cit_order;
      // Optimistically update local state first
      setTickets(prev => prev.map(t => t.message_id === email.message_id ? { 
        ...t, 
        is_cit_order: nextIsCitOrder,
        cit_type: nextIsCitOrder ? (t.cit_type === 'None' || !t.cit_type ? 'CIT' : t.cit_type) : 'None'
      } : t));
      
      if (selectedEmail?.message_id === email.message_id) {
        setSelectedEmail(prev => prev ? {
          ...prev,
          is_cit_order: nextIsCitOrder,
          cit_type: nextIsCitOrder ? (prev.cit_type === 'None' || !prev.cit_type ? 'CIT' : prev.cit_type) : 'None'
        } : null);
      }

      // API call to update the fields
      const response = await fetch('/api/emails/update-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: email.message_id,
          fields: {
            is_cit_order: nextIsCitOrder,
            cit_type: nextIsCitOrder ? (email.cit_type === 'None' || !email.cit_type ? 'CIT' : email.cit_type) : 'None'
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        addToast(
          nextIsCitOrder ? 'Marked as CIT Order' : 'Unmarked as CIT Order', 
          `Email "${email.subject}" successfully updated.`
        );
        await loadEmails(); // Refresh list to get all synced data
      } else {
        addToast('Error Updating CIT Mark', data.message || 'Unknown error occurred.');
      }
    } catch (err: any) {
      console.error('Failed to toggle CIT order status:', err);
      addToast('Error', err.message || 'Failed to update CIT order status.');
    }
  };

  const handleSmartApply = async (
    emailId: string, 
    payload: {
      folder_parent: string;
      folder_child: string;
      tags: string[];
      suggested_tag: string;
      is_important: boolean;
      urgency_level: string;
      summary: string;
      action_required: boolean;
      create_filter_rule: boolean;
      filter_rule?: {
        name: string;
        match_from: string;
        match_subject: string;
        match_body: string;
        action_parent: string;
        action_child: string;
        trigger_api: boolean;
      }
    }
  ) => {
    try {
      const response = await fetch('/api/emails/smart-apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message_id: emailId,
          folder_parent: payload.folder_parent,
          folder_child: payload.folder_child,
          tags: payload.tags,
          suggested_tag: payload.suggested_tag,
          is_important: payload.is_important,
          urgency_level: payload.urgency_level,
          summary: payload.summary,
          action_required: payload.action_required,
          create_filter_rule: payload.create_filter_rule,
          filter_rule: payload.filter_rule
        })
      });

      const data = await response.json();
      if (data.success) {
        addToast('Smart Apply Successful', `Suggestion applied successfully. Email routed to ${payload.folder_parent} / ${payload.folder_child}.`);
        await loadEmails();
      } else {
        addToast('Smart Apply Failed', data.message || 'Unknown error occurred.');
      }
    } catch (err: any) {
      console.error('Failed to apply suggestion:', err);
      addToast('Error', err.message || 'Failed to apply AI suggestion.');
    }
  };

  const addToast = (title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const selectedEmailRef = React.useRef(selectedEmail);
  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  // Connect to SSE Events for Background Auto-Sync Notifications
  useEffect(() => {
    const eventSource = new EventSource('/api/events');
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'email_synced' || payload.event === 'email_added') {
          addToast('Email Terbaca', payload.data.message || 'Email baru telah masuk.');
          loadEmails();
        } else if (payload.event === 'email_analyzing') {
          const targetMsgId = payload.data.message_id;
          setTickets(prev => prev.map(t => t.message_id === targetMsgId ? { ...t, ai_status: 'ANALYZING' } : t));
          if (selectedEmailRef.current && selectedEmailRef.current.message_id === targetMsgId) {
            setSelectedEmail(prev => prev ? { ...prev, ai_status: 'ANALYZING' } : null);
          }
        } else if (payload.event === 'email_updated') {
          const updatedEmail = payload.data.email;
          if (updatedEmail) {
            let fromName = '';
            let fromAddress = updatedEmail.sender || '';
            if (updatedEmail.sender && updatedEmail.sender.includes('<')) {
              const match = updatedEmail.sender.match(/^(.*?)\s*<(.*?)>/);
              if (match) {
                fromName = match[1].trim();
                fromAddress = match[2].trim();
              }
            }
            const mappedEmail = {
              ...updatedEmail,
              fromName: fromName || fromAddress,
              fromAddress: fromAddress,
              tags: Array.isArray(updatedEmail.tags) ? updatedEmail.tags : []
            };

            setTickets(prev => prev.map(t => t.message_id === mappedEmail.message_id ? mappedEmail : t));
            if (selectedEmailRef.current && selectedEmailRef.current.message_id === mappedEmail.message_id) {
              setSelectedEmail(mappedEmail);
            }
            addToast('Analisis AI Selesai', `Analisis untuk email "${mappedEmail.subject}" telah selesai.`);
          } else {
            loadEmails();
          }
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE connection disconnected. Retrying...');
    };

    return () => {
      eventSource.close();
    };
  }, [appSettings]);

  // Fetch Settings
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setAppSettings(data.settings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  // Fetch Emails
  const loadEmails = async (providedSettings?: AppSettings) => {
    const activeSettings = providedSettings || appSettings;
    const url = activeSettings.supabaseUrl;
    const key = activeSettings.supabaseKey;

    if (url && key) {
      try {
        const supabase = createClient(url, key);
        const { data, error } = await supabase.from('emails').select('*').order('date', { ascending: false });
        if (!error && data) {
          const mapped: Email[] = data.map((email: any) => {
            let fromName = '';
            let fromAddress = email.sender || '';
            if (email.sender && email.sender.includes('<')) {
              const match = email.sender.match(/^(.*?)\s*<(.*?)>/);
              if (match) {
                fromName = match[1].trim();
                fromAddress = match[2].trim();
              }
            }
            return {
              ...email,
              fromName: fromName || fromAddress,
              fromAddress: fromAddress,
              tags: typeof email.tags === 'string' ? JSON.parse(email.tags || '[]') : (email.tags || [])
            };
          });

          setTickets(mapped);

          // Retain selection if valid, otherwise select the first email
          if (mapped.length > 0) {
            setSelectedEmail(prev => {
              if (prev) {
                const current = mapped.find(e => e.message_id === prev.message_id);
                if (current) return current;
              }
              return mapped[0];
            });
          } else {
            setSelectedEmail(null);
          }
          await loadFolders();
          return;
        } else if (error) {
          console.warn('Direct Supabase fetch failed, falling back to local API', error);
        }
      } catch (err) {
        console.error('Direct Supabase fetch exception:', err);
      }
    }

    try {
      const res = await fetch('/api/emails');
      const data = await res.json();
      if (data.success && data.emails) {
        // Map raw database emails to frontend schema (e.g. fromName, fromAddress)
        const mapped: Email[] = data.emails.map((email: any) => {
          let fromName = '';
          let fromAddress = email.sender || '';
          if (email.sender && email.sender.includes('<')) {
            const match = email.sender.match(/^(.*?)\s*<(.*?)>/);
            if (match) {
              fromName = match[1].trim();
              fromAddress = match[2].trim();
            }
          }
          return {
            ...email,
            fromName: fromName || fromAddress,
            fromAddress: fromAddress,
            tags: typeof email.tags === 'string' ? JSON.parse(email.tags || '[]') : (email.tags || [])
          };
        });

        setTickets(mapped);

        // Retain selection if valid, otherwise select the first email
        if (mapped.length > 0) {
          setSelectedEmail(prev => {
            if (prev) {
              const current = mapped.find(e => e.message_id === prev.message_id);
              if (current) return current;
            }
            return mapped[0];
          });
        } else {
          setSelectedEmail(null);
        }
      }
      await loadFolders();
    } catch (err) {
      console.error('Failed to load emails:', err);
    }
  };

  // Load dynamic folder list
  const loadFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      if (data.success && data.folders) {
        setDynamicFolders(data.folders);
        setExpandedParents(prev => {
          const next = { ...prev };
          data.folders.forEach((f: any) => {
            const parent = f.folder_parent || 'Lainnya';
            if (next[parent] === undefined) {
              next[parent] = true; // expanded by default
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  // Load custom filters
  const loadCustomFilters = async (providedSettings?: AppSettings) => {
    const activeSettings = providedSettings || appSettings;
    const url = activeSettings.supabaseUrl;
    const key = activeSettings.supabaseKey;

    if (url && key) {
      try {
        const supabase = createClient(url, key);
        const { data, error } = await supabase.from('custom_filters').select('*');
        if (!error && data) {
          setCustomFilters(data);
          setFilterRules(data);
          return;
        } else if (error) {
          console.warn('Direct Supabase custom_filters fetch failed, falling back to local API', error);
        }
      } catch (err) {
        console.error('Direct Supabase custom_filters fetch exception:', err);
      }
    }

    try {
      const res = await fetch('/api/custom-filters');
      const data = await res.json();
      if (data.success && data.filters) {
        setCustomFilters(data.filters);
        setFilterRules(data.filters);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  // Explicitly requested loadFilterRules helper to fetch filter rules in ASC order from Supabase
  const loadFilterRules = async (providedSettings?: AppSettings) => {
    const activeSettings = providedSettings || appSettings;
    const url = activeSettings.supabaseUrl;
    const key = activeSettings.supabaseKey;

    if (url && key) {
      try {
        const supabase = createClient(url, key);
        const { data, error } = await supabase
          .from('custom_filters')
          .select('*')
          .order('created_at', { ascending: true });
        
        if (!error && data) {
          setFilterRules(data);
          setCustomFilters(data);
          return;
        } else if (error) {
          console.warn('Direct Supabase custom_filters fetch failed for filterRules, falling back to local API', error);
        }
      } catch (err) {
        console.error('Direct Supabase custom_filters fetch for filterRules exception:', err);
      }
    }

    try {
      const res = await fetch('/api/custom-filters');
      const data = await res.json();
      if (data.success && data.filters) {
        setFilterRules(data.filters);
        setCustomFilters(data.filters);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  // Initial Fetch & State Update from Supabase on Mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        const settingsData = await settingsRes.json();
        let finalUrl = '';
        let finalKey = '';
        let finalSettings = null;
        
        if (settingsData.success && settingsData.settings) {
          setAppSettings(settingsData.settings);
          finalUrl = settingsData.settings.supabaseUrl;
          finalKey = settingsData.settings.supabaseKey;
          finalSettings = settingsData.settings;
        }

        if (finalUrl && finalKey) {
          // Mount initial fetch to Supabase
          const supabase = createClient(finalUrl, finalKey);
          const { data, error } = await supabase.from('emails').select('*').order('date', { ascending: false });
          if (!error && data) {
            const mapped: Email[] = data.map((email: any) => {
              let fromName = '';
              let fromAddress = email.sender || '';
              if (email.sender && email.sender.includes('<')) {
                const match = email.sender.match(/^(.*?)\s*<(.*?)>/);
                if (match) {
                  fromName = match[1].trim();
                  fromAddress = match[2].trim();
                }
              }
              return {
                ...email,
                fromName: fromName || fromAddress,
                fromAddress: fromAddress,
                tags: typeof email.tags === 'string' ? JSON.parse(email.tags || '[]') : (email.tags || [])
              };
            });
            setTickets(mapped);
            if (mapped.length > 0) {
              setSelectedEmail(mapped[0]);
            }
            await loadFolders();
          } else {
            console.error('Supabase initial fetch error, using local fallback:', error);
            await loadEmails(settingsData.settings);
          }
        } else {
          await loadEmails(settingsData.settings);
        }
        await loadFilterRules(finalSettings || undefined);
      } catch (err) {
        console.error('Error in initial mount fetch:', err);
        await loadEmails();
        await loadFilterRules();
      }
      await loadFilterRules();
    };

    fetchInitialData();
  }, []);

  // Save Config Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving config...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('Settings updated successfully!');
        addToast('Settings Updated', 'Email Server and API settings saved securely.');
        setTimeout(() => setSaveStatus(''), 4000);
      } else {
        setSaveStatus('Failed to update: ' + data.message);
      }
    } catch (err: any) {
      setSaveStatus('Save Error: ' + err.message);
    }
  };

  // POP3 connection diagnostic
  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: appSettings.pop3Host,
          port: appSettings.pop3Port,
          username: appSettings.pop3User,
          password: appSettings.pop3Pass
        })
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Network connection failed: ' + err.message
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  // Historical Backfill Trigger
  const handleFetchHistoricalData = async () => {
    if (!confirm("Proses ini akan merangkum ribuan email lama. Yakin ingin melanjutkan?")) return;

    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      addToast('Backfill Started', 'Proses Backfill dimulai di background worker...');
      const res = await fetch('/api/emails/backfill', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        setBackfillResult({
          processed: data.processed,
          failed: data.failed,
          skipped: data.skipped
        });
        addToast('Backfill Completed', `Backfill selesai. Sukses: ${data.processed}, Gagal: ${data.failed}, Skipped: ${data.skipped}`);
        await loadEmails();
      } else {
        addToast('Backfill Failed', data.message || 'Gagal memicu backfill.');
      }
    } catch (err: any) {
      console.error("Gagal memicu backfill:", err);
      addToast('Backfill Error', err.message || 'Failed to complete backfill process.');
    } finally {
      setIsBackfilling(false);
    }
  };

  // Manual Trigger Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Connecting to POP3 Server...');
    try {
      const res = await fetch('/api/fetch-emails', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncStatus(`Sync successful! Imported ${data.count} new emails.`);
        addToast('POP3 Sync Finished', `Found and cataloged ${data.count} new items.`);
        await loadEmails();
      } else {
        setSyncStatus('Sync Alert: ' + data.message);
        addToast('Sync Alert', data.message);
      }
    } catch (err: any) {
      setSyncStatus('Network Error: ' + err.message);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 8000);
    }
  };

  // Handle email selection and mark as read reactively
  const handleSelectEmail = async (email: Email) => {
    setSelectedEmail(email);
    if (!email.is_read) {
      // Optimistically update local tickets state
      setTickets(prev => prev.map(t => t.message_id === email.message_id ? { ...t, is_read: true } : t));
      
      // Update selected email state as well
      setSelectedEmail({ ...email, is_read: true });

      // Non-blocking api call
      try {
        await fetch('/api/emails/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: email.message_id, is_read: true })
        });
        await loadFolders(); // Refresh folders count since unread state counts might be updated
      } catch (err) {
        console.error('Failed to update read state on backend:', err);
      }
    }
  };

  // Apply retroactive filter to existing 'Lainnya' emails
  const applyFilterToExistingEmails = async (newFilter: CustomFilter) => {
    const url = appSettings.supabaseUrl;
    const key = appSettings.supabaseKey;

    if (!url || !key) {
      console.warn('Supabase not fully configured. Skipping retroactive filter execution.');
      return;
    }

    try {
      const supabase = createClient(url, key);
      // 1. Fetch emails with folder_parent = 'Lainnya'
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('folder_parent', 'Lainnya');

      if (error) {
        console.error('Failed to fetch retroactive emails from Supabase:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.log('No existing emails in "Lainnya" folder for retroactive filtering.');
        return;
      }

      // 2. Filter matching ones
      const matchedIds = data.filter((email: any) => {
        let isMatch = true;
        const senderLower = (email.sender || '').toLowerCase();
        const subjectLower = (email.subject || '').toLowerCase();
        const bodyLower = (email.body_text || '').toLowerCase();

        if (!newFilter.match_from && !newFilter.match_subject && !newFilter.match_body) {
          return false;
        }

        if (newFilter.match_from && !senderLower.includes(newFilter.match_from.toLowerCase())) {
          isMatch = false;
        }
        if (newFilter.match_subject && !subjectLower.includes(newFilter.match_subject.toLowerCase())) {
          isMatch = false;
        }
        if (newFilter.match_body && !bodyLower.includes(newFilter.match_body.toLowerCase())) {
          isMatch = false;
        }

        return isMatch;
      }).map((email: any) => email.message_id);

      // 3. Update Supabase
      if (matchedIds.length > 0) {
        const { error: updateErr } = await supabase
          .from('emails')
          .update({
            folder_parent: newFilter.action_parent,
            folder_child: newFilter.action_child
          })
          .in('message_id', matchedIds);

        if (updateErr) {
          console.error('Failed to perform retroactive bulk update in Supabase:', updateErr);
          addToast('Retroactive Sync Error', 'Failed to update matched tickets in Supabase.');
        } else {
          addToast('Retroactive Filter Applied', `Successfully re-classified ${matchedIds.length} ticket(s) to "${newFilter.action_parent} > ${newFilter.action_child}".`);
        }
      } else {
        console.log('No matches found for retroactive filtering.');
      }

      // Also call local endpoint to sync SQLite
      try {
        await fetch('/api/retroactive-filter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: newFilter })
        });
      } catch (localErr) {
        console.error('Failed to sync retroactive updates to SQLite:', localErr);
      }

      // 4. Refresh state list email in Inbox
      await loadEmails();
    } catch (err) {
      console.error('Error during retroactive filtering:', err);
    }
  };

  // Add/Edit Filter Rule
  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterForm.name.trim() || !filterForm.action_parent.trim() || !filterForm.action_child.trim()) {
      setFilterMsg('Name, Action Folder Parent, and Action Folder Child are required.');
      return;
    }

    const url = appSettings.supabaseUrl;
    const key = appSettings.supabaseKey;
    let savedToSupabase = false;
    let newFilterObj: any = null;

    if (url && key) {
      try {
        const supabase = createClient(url, key);
        const payload: any = {
          name: filterForm.name.trim(),
          match_from: filterForm.match_from?.trim() || null,
          match_subject: filterForm.match_subject?.trim() || null,
          match_body: filterForm.match_body?.trim() || null,
          action_parent: filterForm.action_parent.trim(),
          action_child: filterForm.action_child.trim(),
          trigger_api: filterForm.trigger_api
        };
        if (editingFilterId !== null) {
          payload.id = editingFilterId;
        }

        const { data, error } = editingFilterId !== null
          ? await supabase.from('custom_filters').upsert([payload]).select()
          : await supabase.from('custom_filters').insert([payload]).select();

        if (!error && data && data[0]) {
          newFilterObj = data[0];
          savedToSupabase = true;
        } else if (error) {
          console.error('[Supabase Save Filter Error]:', error);
          setFilterMsg('Supabase Save Error: ' + error.message);
          return;
        }
      } catch (err: any) {
        console.error('[Supabase Save Filter Exception]:', err);
        setFilterMsg('Supabase Exception: ' + err.message);
        return;
      }
    }

    try {
      const localPayload = {
        ...filterForm,
        id: editingFilterId || undefined
      };
      const res = await fetch('/api/custom-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: localPayload })
      });
      const data = await res.json();
      if (data.success) {
        setFilterMsg(editingFilterId !== null ? 'Filter rule updated successfully!' : 'Filter rule saved successfully!');
        
        const filterToApply: CustomFilter = {
          name: filterForm.name.trim(),
          match_from: filterForm.match_from?.trim() || '',
          match_subject: filterForm.match_subject?.trim() || '',
          match_body: filterForm.match_body?.trim() || '',
          action_parent: filterForm.action_parent.trim(),
          action_child: filterForm.action_child.trim(),
          trigger_api: filterForm.trigger_api
        };

        setFilterForm({
          name: '',
          match_from: '',
          match_subject: '',
          match_body: '',
          action_parent: '',
          action_child: '',
          trigger_api: false
        });
        const prevEditingId = editingFilterId;
        setEditingFilterId(null);

        addToast(prevEditingId !== null ? 'Rule Updated' : 'Rule Saved', prevEditingId !== null ? 'Dynamic workflow tag filter updated.' : 'Dynamic workflow tag filter registered.');
        
        if (savedToSupabase && newFilterObj) {
          if (prevEditingId !== null) {
            setFilterRules(prev => prev.map(f => f.id === prevEditingId ? newFilterObj : f));
            setCustomFilters(prev => prev.map(f => f.id === prevEditingId ? newFilterObj : f));
          } else {
            setFilterRules(prev => [...prev, newFilterObj]);
            setCustomFilters(prev => [...prev, newFilterObj]);
          }
        } else {
          await loadFilterRules();
        }

        // Apply retroactive filter!
        await applyFilterToExistingEmails(filterToApply);
        
      } else {
        if (!savedToSupabase) {
          setFilterMsg('Failed to save: ' + data.message);
        } else {
          setFilterMsg('Filter rule saved to Supabase!');
          setFilterForm({
            name: '',
            match_from: '',
            match_subject: '',
            match_body: '',
            action_parent: '',
            action_child: '',
            trigger_api: false
          });
          setEditingFilterId(null);
          await loadFilterRules();
          await loadEmails();
        }
      }
    } catch (err: any) {
      if (!savedToSupabase) {
        setFilterMsg('Error: ' + err.message);
      } else {
        setFilterMsg('Saved to Supabase. Local sync error: ' + err.message);
      }
    }
  };

  // Delete Filter Rule
  const handleDeleteFilter = async (id: number) => {
    if (!confirm('Are you sure you want to delete this custom routing filter?')) return;
    
    const url = appSettings.supabaseUrl;
    const key = appSettings.supabaseKey;
    let deletedFromSupabase = false;

    if (url && key) {
      try {
        const supabase = createClient(url, key);
        const { error } = await supabase.from('custom_filters').delete().eq('id', id);
        if (!error) {
          deletedFromSupabase = true;
          setFilterRules(prev => prev.filter(f => f.id !== id));
          setCustomFilters(prev => prev.filter(f => f.id !== id));
        } else {
          console.error('[Supabase Delete Filter Error]:', error);
          addToast('Delete Error', 'Failed to delete from Supabase: ' + error.message);
          return;
        }
      } catch (err: any) {
        console.error('[Supabase Delete Filter Exception]:', err);
        addToast('Delete Error', 'Supabase exception: ' + err.message);
        return;
      }
    }

    try {
      const res = await fetch('/api/custom-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Rule Deleted', 'Dynamic filter removed.');
        if (!deletedFromSupabase) {
          setFilterRules(prev => prev.filter(f => f.id !== id));
          setCustomFilters(prev => prev.filter(f => f.id !== id));
        }
      } else {
        if (!deletedFromSupabase) {
          addToast('Delete Alert', 'Failed to delete locally: ' + data.message);
        }
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
      if (!deletedFromSupabase) {
        addToast('Delete Error', 'Network error deleting rule.');
      }
    }
  };

  // Soft clear emails view state (Flush Inbox)
  const handleClearDatabase = async () => {
    setTickets([]);
    setSelectedEmail(null);
    addToast('Inbox Flushed', 'Inbox view cleared. Select any folder in the sidebar to re-fetch tickets.');
  };

  // Filters logic helper
  const getFilteredEmails = () => {
    return tickets.filter(email => {
      // 1. Folder filter
      if (selectedFolder === 'all') {
        // Show all
      } else if (selectedFolder.startsWith('parent:')) {
        const parent = selectedFolder.substring('parent:'.length);
        if ((email.folder_parent || 'Lainnya') !== parent) return false;
      } else if (selectedFolder.startsWith('child:')) {
        const parts = selectedFolder.substring('child:'.length).split('|||');
        const parent = parts[0];
        const child = parts[1];
        if ((email.folder_parent || 'Lainnya') !== parent || (email.folder_child || 'Uncategorized') !== child) return false;
      }

      // 2. Search Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const subMatch = (email.subject || '').toLowerCase().includes(query);
        const fromMatch = (email.sender || '').toLowerCase().includes(query);
        const textMatch = (email.body_text || '').toLowerCase().includes(query);
        if (!subMatch && !fromMatch && !textMatch) return false;
      }

      return true;
    });
  };

  const filteredEmails = getFilteredEmails();

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return isoString;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'EM';
    const clean = name.replace(/<.*?>/, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex h-screen w-full bg-[#FAFBFD] font-sans text-slate-800 overflow-hidden" id="applet_canvas">
      
      {/* 1. LEFT-MOST NAVIGATION RAIL (Inbox vs Settings) */}
      <aside className="w-[72px] bg-slate-900 flex flex-col items-center py-6 justify-between text-white shrink-0 z-10" id="nav_rail">
        <div className="flex flex-col items-center space-y-6 w-full">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 text-white cursor-pointer hover:scale-105 transition-transform">
            <Zap className="h-6 w-6 text-white" />
          </div>
          
          <div className="w-8 border-b border-slate-800 my-1"></div>

          {/* Inbox Nav button */}
          <button 
            onClick={() => setCurrentMenu('inbox')}
            className={`p-3.5 rounded-xl transition-all relative group cursor-pointer ${
              currentMenu === 'inbox' 
                ? 'bg-slate-800 text-blue-400 font-bold' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
            title="Inbox"
          >
            <Inbox className="h-5.5 w-5.5" />
            <span className="absolute left-16 bg-slate-950 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20 pointer-events-none">
              Tickets Inbox
            </span>
          </button>

          {/* CIT Dispatch Dashboard button */}
          <button 
            onClick={() => setCurrentMenu('cit-dashboard')}
            className={`p-3.5 rounded-xl transition-all relative group cursor-pointer ${
              currentMenu === 'cit-dashboard' 
                ? 'bg-slate-800 text-blue-400 font-bold' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
            title="CIT Dashboard"
          >
            <Coins className="h-5.5 w-5.5" />
            <span className="absolute left-16 bg-slate-950 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20 pointer-events-none">
              CIT Dispatch Control
            </span>
          </button>

          {/* Settings Nav button */}
          <button 
            onClick={() => setCurrentMenu('settings')}
            className={`p-3.5 rounded-xl transition-all relative group cursor-pointer ${
              currentMenu === 'settings' 
                ? 'bg-slate-800 text-blue-400 font-bold' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
            title="Settings"
          >
            <Settings className="h-5.5 w-5.5" />
            <span className="absolute left-16 bg-slate-950 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20 pointer-events-none">
              Workflow Settings
            </span>
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4 w-full text-slate-500 font-mono text-[9px]">
          <span className="font-bold">v2.0</span>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="flex flex-col flex-1 overflow-hidden" id="workspace_container">
        
        {/* TOP SYSTEM & ACTIONS BAR */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0" id="workspace_header">
          <div className="flex items-center space-x-3">
            <h1 className="text-base font-bold text-slate-800 tracking-tight">
              {currentMenu === 'inbox' ? 'Workflow Email Ticketing System' : 'Automation Rule & Mail Config'}
            </h1>
            <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded-full font-mono font-medium flex items-center gap-1.5 border border-slate-200">
              <span className={`h-2 w-2 rounded-full ${appSettings.supabaseUrl ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></span>
              {appSettings.supabaseUrl ? 'Supabase Active' : 'SQLite Standalone'}
            </span>
          </div>

          <div className="flex items-center space-x-2.5">
            {currentMenu === 'inbox' && (
              <>
                <div className="relative w-64 text-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search sender, subject..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8.5 pr-3 py-1.5 bg-slate-100 hover:bg-slate-150 border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg focus:outline-none transition-all leading-normal"
                  />
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing POP3...' : 'Sync Mail'}</span>
                </button>

                <button
                  onClick={handleClearDatabase}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  title="Flush cached inbox data"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Flush Inbox</span>
                </button>
              </>
            )}
          </div>
        </header>

        {syncStatus && (
          <div className="px-6 py-2 bg-blue-50 text-blue-800 border-b border-blue-100 text-xs font-medium flex items-center justify-between animate-fade-in animate-pulse">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {syncStatus}
            </span>
          </div>
        )}

        {/* 3. INBOX: THREE-PANE LAYOUT */}
        {currentMenu === 'inbox' && (
          <div className="flex flex-row flex-1 overflow-hidden w-full" id="inbox_three_pane">
            
            {/* PANE 1: VIRTUAL FOLDERS TREE (LEFT) */}
            <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto" id="pane_folders">
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2.5">Virtual Folders</p>
                
                <nav className="space-y-1 text-xs">
                  {/* All Folders selection */}
                  <button
                    onClick={async () => {
                      setSelectedFolder('all');
                      await loadEmails();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                      selectedFolder === 'all' 
                        ? 'bg-blue-50 text-blue-700 font-semibold' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Inbox className={`h-4 w-4 ${selectedFolder === 'all' ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>All Tickets</span>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold font-mono">
                      {tickets.length}
                    </span>
                  </button>

                  <div className="border-b border-slate-100 my-2"></div>

                  {/* Grouped Dynamic folder tree */}
                  {(() => {
                    const grouped: Record<string, { child: string; count: number }[]> = {};
                    dynamicFolders.forEach(item => {
                      const parent = item.folder_parent || 'Lainnya';
                      if (!grouped[parent]) grouped[parent] = [];
                      grouped[parent].push({ child: item.folder_child || 'Uncategorized', count: item.count });
                    });

                    return Object.keys(grouped).map(parent => {
                      const children = grouped[parent];
                      const totalCount = children.reduce((sum, c) => sum + c.count, 0);
                      const isExpanded = expandedParents[parent] !== false;

                      return (
                        <div key={parent} className="space-y-0.5">
                          {/* Parent Category Row */}
                          <div
                            onClick={async () => {
                              setSelectedFolder(`parent:${parent}`);
                              await loadEmails();
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer group ${
                              selectedFolder === `parent:${parent}`
                                ? 'bg-slate-100 text-slate-900 font-bold'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedParents(prev => ({ ...prev, [parent]: !isExpanded }));
                                }}
                                className="p-0.5 hover:bg-slate-200 rounded text-slate-400 cursor-pointer"
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                              <Folder className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
                              <span className="truncate">{parent}</span>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border" style={getTagBadgeStyle(parent)}>
                              {totalCount}
                            </span>
                          </div>

                          {/* Children List */}
                          {isExpanded && (
                            <div className="pl-6 space-y-0.5 border-l border-slate-100 ml-5.5 py-0.5">
                              {children.map(ch => {
                                const isSelected = selectedFolder === `child:${parent}|||${ch.child}`;
                                return (
                                  <button
                                    key={ch.child}
                                    onClick={async () => {
                                      setSelectedFolder(`child:${parent}|||${ch.child}`);
                                      await loadEmails();
                                    }}
                                    className={`w-full flex items-center justify-between py-1.5 px-2.5 rounded transition-all text-left truncate cursor-pointer ${
                                      isSelected
                                        ? 'bg-blue-50 text-blue-700 font-semibold'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                                  >
                                    <span className="truncate text-[11px]">{ch.child}</span>
                                    <span className="text-[8px] px-1 py-0.1 font-bold rounded border" style={getTagBadgeStyle(ch.child)}>
                                      {ch.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </nav>
              </div>
            </aside>

            {/* PANE 2: TICKETS EMAIL LIST (MIDDLE) */}
            <section className="w-[380px] border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto" id="pane_email_list">
              <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Tickets List ({filteredEmails.length})
                </span>
                <span className="text-[9px] text-slate-400 italic font-medium">Sorted by date</span>
              </div>

              {filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center flex-1 text-slate-400">
                  <Mail className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs font-semibold">No tickets found</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal max-w-[200px]">
                    No emails match the selected folder or search query.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 overflow-y-auto flex-1 select-none">
                  {filteredEmails.map(email => {
                    const isSelected = selectedEmail?.message_id === email.message_id;
                    const isBankOrder = email.folder_parent === 'Bank Order';

                    return (
                      <div
                        key={email.message_id}
                        onClick={() => handleSelectEmail(email)}
                        className={`p-4 transition-all cursor-pointer border-l-4 text-left relative group ${
                          isSelected 
                            ? 'bg-blue-50/70 border-blue-600' 
                            : 'hover:bg-slate-50 border-transparent'
                        }`}
                      >
                        {/* Context Action Menu (Three dots) */}
                        <div className="absolute right-3 top-3.5 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveContextMenuId(activeContextMenuId === email.message_id ? null : email.message_id);
                            }}
                            className="p-1 hover:bg-slate-200/80 rounded-full text-slate-400 hover:text-slate-700 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="CIT Actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                          
                          {activeContextMenuId === email.message_id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveContextMenuId(null);
                                }}
                              />
                              <div 
                                className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden text-xs py-1 animate-fade-in text-left font-sans"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCitOrderPrefillEmail(email);
                                    setIsCitOrderModalOpen(true);
                                    setActiveContextMenuId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Coins className="h-4 w-4 text-blue-600 shrink-0" />
                                  <span>Create CIT/ATM Order</span>
                                </button>
                                
                                <div className="border-t border-slate-100 my-1" />
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleCitOrderMark(email);
                                    setActiveContextMenuId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                                  <span>{email.is_cit_order ? 'Unmark as CIT Order' : 'Mark as CIT Order'}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-between mb-1.5 pr-6">
                          <span className="font-bold text-slate-800 text-xs truncate max-w-[140px] flex items-center gap-1.5">
                            {!email.is_read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 inline-block" title="Unread" />
                            )}
                            {email.fromName}
                          </span>
                          <span className="text-[9px] text-slate-400 shrink-0 font-mono">
                            {formatTimestamp(email.date)}
                          </span>
                        </div>

                        <p className={`text-xs font-semibold leading-snug truncate mb-1 pr-4 ${
                          isSelected ? 'text-blue-800' : 'text-slate-700'
                        }`}>
                          {email.subject}
                        </p>

                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2 pr-2">
                          {email.body_text}
                        </p>

                        {/* Folder tags */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getBadge(email.suggested_tag)}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border" style={getTagBadgeStyle(email.folder_parent || 'Lainnya')}>
                            {email.folder_parent || 'Lainnya'}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border" style={getTagBadgeStyle(email.folder_child || 'Uncategorized')}>
                            {email.folder_child || 'Uncategorized'}
                          </span>

                          {email.is_cit_order && (
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border shadow-xs flex items-center gap-1 ${
                              email.cit_type === 'ATM' 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              <Coins className="h-2.5 w-2.5 shrink-0" />
                              <span>{email.cit_type || 'CIT'} {email.suggested_bank ? `(${email.suggested_bank})` : 'Order'}</span>
                            </span>
                          )}

                          {email.tag_type && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              email.tag_type === 'Penugasan' 
                                ? 'bg-amber-50/60 text-amber-700 border-amber-200' 
                                : email.tag_type === 'Peringatan'
                                ? 'bg-rose-50/60 text-rose-700 border-rose-200'
                                : 'bg-indigo-50/60 text-indigo-700 border-indigo-200'
                            }`}>
                              {email.tag_type}
                            </span>
                          )}

                          {email.api_workflow_status && email.api_workflow_status !== 'none' && (
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-full border flex items-center gap-1 ${
                              email.api_workflow_status === 'triggered' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : email.api_workflow_status === 'failed'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                            }`}>
                              <Zap className="h-2 w-2 fill-current" />
                              CIT {email.api_workflow_status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* PANE 3: DETAILED EMAIL & AUTOMATION STATUS VIEW (RIGHT) */}
            <section className="flex-1 bg-white flex flex-col overflow-y-auto" id="pane_email_detail">
              {selectedEmail ? (
                <div className="flex flex-col h-full overflow-y-auto">
                  
                  {/* AI Analysis Status Banner */}
                  {selectedEmail.ai_status === 'ANALYZING' && (
                    <div className="bg-sky-50 border-b border-sky-100 px-6 py-2.5 flex items-center justify-between shrink-0">
                      <div className="flex items-center space-x-2 text-sky-700">
                        <Sparkles className="h-4 w-4 animate-spin shrink-0" />
                        <span className="text-xs font-semibold">AI Operasional sedang mengekstrak detail CIT/ATM...</span>
                      </div>
                      <span className="text-[10px] font-bold text-sky-600 bg-sky-100/80 px-2 py-0.5 rounded-md animate-pulse font-mono">GLM-5.2 ACTIVATED</span>
                    </div>
                  )}
                  {selectedEmail.ai_status === 'FAILED' && (
                    <div className="bg-rose-50 border-b border-rose-100 px-6 py-2.5 flex items-center justify-between shrink-0">
                      <div className="flex items-center space-x-2 text-rose-700">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-semibold">Analisis AI gagal atau mengalami timeout.</span>
                      </div>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-md font-mono">FAILED</span>
                    </div>
                  )}
                  
                  {/* Email Detail Header */}
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3.5 select-text">
                        <div className="h-10 w-10 bg-gradient-to-tr from-slate-200 to-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600 text-sm shadow-inner border border-slate-200 shrink-0">
                          {getInitials(selectedEmail.fromName || '')}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-none flex items-center gap-1.5">
                            <span>{selectedEmail.fromName}</span>
                            <span className="text-[10px] font-normal text-slate-400 font-mono">({selectedEmail.fromAddress})</span>
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>Received: {new Date(selectedEmail.date).toLocaleString()}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 justify-end">
                        {selectedEmail.is_cit_order && (
                          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1 shadow-xs ${
                            selectedEmail.cit_type === 'ATM' 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            <Coins className="h-3 w-3 shrink-0" />
                            <span>{selectedEmail.cit_type || 'CIT'} {selectedEmail.suggested_bank ? `(${selectedEmail.suggested_bank})` : 'Order'}</span>
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border inline-block" style={getTagBadgeStyle(selectedEmail.folder_parent || 'Lainnya')}>
                          Folder: {selectedEmail.folder_parent || 'Lainnya'}
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border inline-block" style={getTagBadgeStyle(selectedEmail.folder_child || 'Uncategorized')}>
                          Sub: {selectedEmail.folder_child || 'Uncategorized'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-200/50 pt-4">
                      <h2 className="text-sm font-bold text-slate-800 leading-snug select-text">
                        {selectedEmail.subject}
                      </h2>
                    </div>
                  </div>

                  {/* Body Viewer */}
                  <div className="p-6 flex-1 select-text border-b border-slate-100">
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[160px]">
                      {selectedEmail.body_text}
                    </div>

                    {/* Attachments Section */}
                    {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                      <div className="mt-4 border-t border-slate-200/50 pt-4 text-left">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <span>📎</span> Lampiran Dokumen ({selectedEmail.attachments.length})
                        </h4>
                        <div className="flex flex-wrap gap-2.5">
                          {selectedEmail.attachments.map((att: any, idx: number) => (
                            <div 
                              key={idx} 
                              className="flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-600 transition-all hover:border-slate-300 hover:shadow-sm"
                            >
                              <span className="text-lg">📄</span>
                              <div className="flex flex-col text-left">
                                <span className="font-semibold text-slate-700 max-w-[200px] truncate">{att.filename}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{(att.size / 1024).toFixed(1)} KB • {att.contentType || 'unknown'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Operational Assistant Copilot Panel */}
                  <div className="px-6 py-5 border-b border-slate-100 bg-blue-50/15" id="ai_operational_assistant_panel">
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="h-4.5 w-4.5 text-indigo-600 animate-pulse" />
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">AI Operational Assistant Copilot</h3>
                      </div>
                      
                      {selectedEmail.tag_type ? (
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          selectedEmail.tag_type === 'Penugasan' 
                            ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm' 
                            : selectedEmail.tag_type === 'Peringatan'
                            ? 'bg-rose-100 text-rose-800 border-rose-300 shadow-sm'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300 shadow-sm'
                        }`}>
                          Kategori: {selectedEmail.tag_type}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Not analyzed by AI</span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Effective Summary */}
                      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-left">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Effective Summary</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          {selectedEmail.summary || 'Summary is not generated yet. Analysis will run on next sync/simulation.'}
                        </p>
                      </div>

                      {/* Action Required & Urgent markings */}
                      <div className="flex gap-3">
                        <div className={`flex-1 p-3 rounded-lg border flex items-center gap-2.5 ${
                          selectedEmail.action_required 
                            ? 'bg-amber-50/75 border-amber-200 text-amber-900' 
                            : 'bg-slate-50/70 border-slate-200 text-slate-500'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${selectedEmail.action_required ? 'bg-amber-500 animate-ping' : 'bg-slate-300'}`} />
                          <div className="text-left">
                            <span className="text-[10px] block font-bold uppercase text-slate-400">Action Required</span>
                            <span className="text-[11px] font-semibold">{selectedEmail.action_required ? 'Yes (Tindakan Diperlukan)' : 'No (Hanya Informasi)'}</span>
                          </div>
                        </div>

                        <div className={`flex-1 p-3 rounded-lg border flex items-center gap-2.5 ${
                          selectedEmail.is_important || selectedEmail.urgency_level === 'High' || selectedEmail.urgency_level === 'Peringatan'
                            ? 'bg-rose-50/70 border-rose-200 text-rose-900' 
                            : 'bg-slate-50/70 border-slate-200 text-slate-500'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${selectedEmail.is_important || selectedEmail.urgency_level === 'High' ? 'bg-rose-500 animate-ping' : 'bg-slate-300'}`} />
                          <div className="text-left">
                            <span className="text-[10px] block font-bold uppercase text-slate-400">Marking / Urgency</span>
                            <span className="text-[11px] font-semibold">
                              {selectedEmail.is_important ? 'Urgent / Task' : 'Routine'} ({selectedEmail.urgency_level || 'Routine'})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* AI Operational Summary & Classification Card (Replaces Raw JSON per instructions) */}
                      <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm text-left font-sans ai-result-card">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3.5">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                            <span>Ringkasan Operasional</span>
                          </h4>
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-bold font-mono px-2 py-0.5 rounded-full uppercase">
                            AI Analyzed
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed font-medium mb-4">
                          {selectedEmail.summary || 'Belum dianalisis. Silakan jalankan simulasi atau sinkronisasi.'}
                        </p>

                        <div className="grid grid-cols-2 gap-3.5 mb-4">
                          <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase mb-1">Klasifikasi Tag</span>
                            <div className="flex items-center gap-1.5">
                              {selectedEmail.suggested_tag === 'CIT' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[11px] font-bold shadow-xs badge tag-cit">
                                  <span>💰</span> CIT
                                </span>
                              ) : selectedEmail.suggested_tag === 'ATM' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold shadow-xs badge tag-atm">
                                  <span>💳</span> ATM
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[11px] font-bold shadow-xs badge tag-lainnya">
                                  <span>📁</span> {selectedEmail.suggested_tag || 'Lainnya'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase mb-1">Tingkat Urgensi</span>
                            <div className="flex items-center gap-1.5">
                              {selectedEmail.urgency_level === 'High' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[11px] font-bold shadow-xs badge urgency-high">
                                  High / Mendesak
                                </span>
                              ) : selectedEmail.urgency_level === 'Medium' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[11px] font-bold shadow-xs badge urgency-medium">
                                  Medium / Sedang
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[11px] font-bold shadow-xs badge urgency-routine">
                                  Routine / Normal
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {selectedEmail.is_cit_order && (
                          <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-3 text-xs mb-3 text-left">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="font-bold text-blue-800 text-[10px] uppercase">Deteksi Order Khusus</span>
                              {selectedEmail.suggested_bank && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-bold rounded-sm border border-blue-200">
                                  Bank: {selectedEmail.suggested_bank}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600 font-medium text-[11px] leading-relaxed">
                              {selectedEmail.extracted_notes || 'Tidak ada catatan khusus.'}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2.5">
                          <span>Saran Folder: <strong className="text-slate-700">{selectedEmail.suggested_folder_parent} &gt; {selectedEmail.suggested_folder_child}</strong></span>
                        </div>

                        {/* Integration Action Buttons */}
                        <div className="mt-3.5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3 font-sans">
                          <button
                            type="button"
                            onClick={async () => {
                              const payload = {
                                folder_parent: selectedEmail.suggested_folder_parent || selectedEmail.folder_parent || 'Operation',
                                folder_child: selectedEmail.suggested_folder_child || selectedEmail.folder_child || 'General',
                                tags: [selectedEmail.tag_type || selectedEmail.suggested_tag || 'Lainnya'],
                                suggested_tag: selectedEmail.tag_type || selectedEmail.suggested_tag || 'Lainnya',
                                is_important: selectedEmail.urgency_level === 'High' || !!selectedEmail.is_important,
                                urgency_level: selectedEmail.urgency_level || 'Routine',
                                summary: selectedEmail.summary || '',
                                action_required: !!selectedEmail.action_required,
                                create_filter_rule: false
                              };
                              await handleSmartApply(selectedEmail.message_id, payload);
                            }}
                            className="flex-1 py-2 px-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg text-center cursor-pointer flex items-center justify-center gap-1.5 shadow-sm transition-all text-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Smart Apply</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSuggestionForm({
                                message_id: selectedEmail.message_id,
                                folder_parent: selectedEmail.suggested_folder_parent || selectedEmail.folder_parent || 'Operation',
                                folder_child: selectedEmail.suggested_folder_child || selectedEmail.folder_child || 'General',
                                suggested_tag: selectedEmail.tag_type || selectedEmail.suggested_tag || 'Lainnya',
                                urgency_level: selectedEmail.urgency_level || 'Routine',
                                is_important: !!selectedEmail.is_important,
                                summary: selectedEmail.summary || '',
                                action_required: !!selectedEmail.action_required,
                                create_filter_rule: false,
                                filter_rule_name: `Rule: ${selectedEmail.fromName || 'Sender'} Routing`,
                                filter_rule_match_from: selectedEmail.fromAddress || '',
                                filter_rule_match_subject: '',
                                filter_rule_match_body: '',
                                filter_rule_trigger_api: false
                              });
                              setIsEditSuggestionOpen(true);
                            }}
                            className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 rounded-lg text-center cursor-pointer transition-all text-xs flex items-center gap-1.5"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Edit Suggestion</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CIT Automation Status Panel (Highly Visible) */}
                  <div className="p-6 bg-slate-50/80 shrink-0 border-t border-slate-100" id="cit_automation_panel">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4.5 w-4.5 text-blue-600" />
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active ATM CIT API Automation</h3>
                      </div>
                      
                      {selectedEmail.api_workflow_status && selectedEmail.api_workflow_status !== 'none' ? (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                          selectedEmail.api_workflow_status === 'triggered'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : selectedEmail.api_workflow_status === 'failed'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                        }`}>
                          Workflow: {selectedEmail.api_workflow_status}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No Automation Triggered for this Folder</span>
                      )}
                    </div>

                    {/* Parser Extracted Preview if Bank Order */}
                    {(selectedEmail.folder_parent === 'Bank Order' || (selectedEmail.api_workflow_status && selectedEmail.api_workflow_status !== 'none')) && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4.5 mb-3 shadow-sm text-xs">
                        <p className="font-bold text-slate-700 mb-2">Variables Extracted by Parser Engine:</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-2.5 bg-slate-50 rounded-lg">
                            <span className="text-[10px] text-slate-400 block mb-0.5">Order Amount</span>
                            <span className="font-bold font-mono text-slate-800 text-sm">
                              {(() => {
                                const match = (selectedEmail.body_text || '').match(/(?:Amount|Nilai)\s*[:=]\s*([\d,.]+)/i);
                                return match ? match[1] : '0';
                              })()}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-lg">
                            <span className="text-[10px] text-slate-400 block mb-0.5">Currency Code</span>
                            <span className="font-bold font-mono text-slate-800 text-sm">
                              {(() => {
                                const match = (selectedEmail.body_text || '').match(/(?:Currency|Mata\s+Uang|Currency\s+Code)\s*[:=]\s*([a-zA-Z]{3})/i);
                                return match ? match[1].toUpperCase() : 'IDR';
                              })()}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-lg">
                            <span className="text-[10px] text-slate-400 block mb-0.5">Target Branch</span>
                            <span className="font-bold font-mono text-blue-700 text-sm">
                              {(() => {
                                const match = (selectedEmail.body_text || '').match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
                                return match ? match[1].trim() : 'Purwokerto';
                              })()}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setPrefillEmail(selectedEmail);
                              setCurrentMenu('cit-dashboard');
                            }}
                            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-center cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 transition-all text-xs"
                          >
                            <Coins className="h-4 w-4 text-white" />
                            <span>Create Order CIT 💰 (Auto-fill Form)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* API Logs Output Terminal */}
                    {selectedEmail.api_workflow_log && (
                      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 font-mono text-[10px] text-slate-300 leading-snug">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-2 border-b border-slate-800 pb-1.5">
                          <span>SYSTEM EXECUTION LOGS</span>
                          <span>Sequential API Chaining</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap select-text pr-2">
                          {selectedEmail.api_workflow_log}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 flex-1">
                  <Mail className="h-12 w-12 text-slate-200 mb-3" />
                  <p className="font-bold text-sm">No ticket selected</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[280px] leading-normal">
                    Select a ticket from the list to view its contents, extracted variables, and CIT API execution state.
                  </p>
                </div>
              )}
            </section>

          </div>
        )}

        {/* CIT DASHBOARD SECTION */}
        {currentMenu === 'cit-dashboard' && (
          <CitDashboard 
            onAddToast={addToast}
            prefillEmail={prefillEmail}
            onClearPrefill={() => setPrefillEmail(null)}
          />
        )}

        {/* 4. SETTINGS SECTION */}
        {currentMenu === 'settings' && (
          <div className="flex flex-row flex-1 overflow-hidden w-full bg-slate-50" id="settings_workspace">
            
            {/* SETTINGS MENU TABS SELECTOR (LEFT) */}
            <aside className="w-56 border-r border-slate-200 bg-white flex flex-col shrink-0" id="pane_settings_tabs">
              <div className="p-4 space-y-1 text-xs">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-3 mb-2">Configure</p>

                <button
                  onClick={() => setSettingsTab('filters')}
                  className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg transition-all text-left font-semibold cursor-pointer ${
                    settingsTab === 'filters' 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Dynamic Filters</span>
                </button>

                <button
                  onClick={() => setSettingsTab('api')}
                  className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg transition-all text-left font-semibold cursor-pointer ${
                    settingsTab === 'api' 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Link className="h-4 w-4" />
                  <span>API Integrations</span>
                </button>

                <button
                  onClick={() => setSettingsTab('mail')}
                  className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg transition-all text-left font-semibold cursor-pointer ${
                    settingsTab === 'mail' 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Server className="h-4 w-4" />
                  <span>Mail & DB Config</span>
                </button>

                <button
                  onClick={() => setSettingsTab('backfill')}
                  className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg transition-all text-left font-semibold cursor-pointer ${
                    settingsTab === 'backfill' 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <History className="h-4 w-4" />
                  <span>Data Backfill</span>
                </button>
              </div>
            </aside>

            {/* SETTINGS PANEL CONTENTS (RIGHT) */}
            <section className="flex-1 p-8 overflow-y-auto" id="settings_main_panel">
              <div className="max-w-3xl bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                
                {/* TAB 1: DYNAMIC FILTERS CRUD BUILDER */}
                {settingsTab === 'filters' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Dynamic Filter Routing</h2>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Configure logic rules to dynamically tag incoming tickets and trigger automated workflows based on matching criteria.
                      </p>
                    </div>

                    {/* Rule builder form */}
                    <form onSubmit={handleSaveFilter} className="bg-slate-50 rounded-xl p-5 border border-slate-200/60 text-xs space-y-3.5">
                      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        {editingFilterId !== null ? 'Edit Filter Rule' : 'Create New Filter Rule'}
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Filter Name</label>
                          <input 
                            type="text"
                            value={filterForm.name}
                            onChange={(e) => setFilterForm({ ...filterForm, name: e.target.value })}
                            placeholder="e.g. Bank Order Auto Router"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Match Sender (From contains)</label>
                          <input 
                            type="text"
                            value={filterForm.match_from}
                            onChange={(e) => setFilterForm({ ...filterForm, match_from: e.target.value })}
                            placeholder="e.g. treasury@bank.com"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Match Subject (contains)</label>
                          <input 
                            type="text"
                            value={filterForm.match_subject}
                            onChange={(e) => setFilterForm({ ...filterForm, match_subject: e.target.value })}
                            placeholder="e.g. CIT Delivery Order"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Match Body Text (contains)</label>
                          <input 
                            type="text"
                            value={filterForm.match_body}
                            onChange={(e) => setFilterForm({ ...filterForm, match_body: e.target.value })}
                            placeholder="e.g. signoff requested"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Action: Assign Folder Parent</label>
                          <input 
                            type="text"
                            value={filterForm.action_parent}
                            onChange={(e) => setFilterForm({ ...filterForm, action_parent: e.target.value })}
                            placeholder="e.g. Bank Order"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-blue-700"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold mb-1">Action: Assign Folder Child</label>
                          <input 
                            type="text"
                            value={filterForm.action_child}
                            onChange={(e) => setFilterForm({ ...filterForm, action_child: e.target.value })}
                            placeholder="e.g. Purwokerto"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-blue-700"
                          />
                        </div>
                      </div>

                      {/* Trigger API Checkbox */}
                      <div className="flex items-center space-x-2.5 pt-1.5 select-none">
                        <input
                          type="checkbox"
                          id="trigger_api_chk"
                          checked={!!filterForm.trigger_api}
                          onChange={(e) => setFilterForm({ ...filterForm, trigger_api: e.target.checked })}
                          className="h-4.5 w-4.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <label htmlFor="trigger_api_chk" className="text-slate-700 font-bold flex items-center gap-1.5 cursor-pointer">
                          <Zap className="h-4 w-4 text-blue-600 fill-blue-100" />
                          <span>Trigger Sequential CIT API Chaining Workflow for matched tickets</span>
                        </label>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                          >
                            {editingFilterId !== null ? 'Update Rule' : 'Add Rule'}
                          </button>
                          {editingFilterId !== null && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFilterId(null);
                                setFilterForm({
                                  name: '',
                                  match_from: '',
                                  match_subject: '',
                                  match_body: '',
                                  action_parent: '',
                                  action_child: '',
                                  trigger_api: false
                                });
                                setFilterMsg('');
                              }}
                              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer text-xs"
                            >
                              Cancel Edit
                            </button>
                          )}
                        </div>
                        {filterMsg && (
                          <span className="text-slate-600 italic font-semibold">{filterMsg}</span>
                        )}
                      </div>
                    </form>

                    {/* Existing Rules CRUD Table */}
                    <div className="space-y-3">
                      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Configured Filter Rules ({filterRules.length})</p>

                      {filterRules.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No custom filter rules defined yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filterRules.map(rule => (
                            <div key={rule.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between">
                              <div>
                                <div className="flex justify-between items-start">
                                  <h4 className="font-bold text-slate-800 text-sm">{rule.name || '-'}</h4>
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (rule.id) {
                                          setEditingFilterId(rule.id);
                                          setFilterForm({
                                            name: rule.name || '',
                                            match_from: rule.match_from || '',
                                            match_subject: rule.match_subject || '',
                                            match_body: rule.match_body || '',
                                            action_parent: rule.action_parent || '',
                                            action_child: rule.action_child || '',
                                            trigger_api: !!rule.trigger_api
                                          });
                                          setFilterMsg('');
                                        }
                                      }}
                                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                      title="Edit rule"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => rule.id && handleDeleteFilter(rule.id)}
                                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                      title="Delete rule"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-3 space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                                  <p className="flex justify-between gap-2">
                                    <span className="font-semibold text-slate-500">Match Sender (From):</span>
                                    <span className="font-mono text-slate-700 break-all">{rule.match_from || '-'}</span>
                                  </p>
                                  <p className="flex justify-between gap-2">
                                    <span className="font-semibold text-slate-500">Match Subject:</span>
                                    <span className="text-slate-700">{rule.match_subject || '-'}</span>
                                  </p>
                                  <p className="flex justify-between gap-2">
                                    <span className="font-semibold text-slate-500">Match Body Text:</span>
                                    <span className="text-slate-700">{rule.match_body || '-'}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">Routing:</span>
                                  <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-bold font-mono text-[10px] border border-blue-100">
                                    {rule.action_parent || '-'} &gt; {rule.action_child || '-'}
                                  </span>
                                </div>
                                {rule.trigger_api ? (
                                  <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                    <Zap className="h-3 w-3 fill-current" /> Active
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-bold uppercase text-[9px]">Disabled</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: ACTIVE ATM CIT API INTEGRATIONS */}
                {settingsTab === 'api' && (
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Active ATM CIT API Integration</h2>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Configure the HTTP Header Auth Bearer token used to authorize automated delivery creations on the sequential CIT client workflow.
                      </p>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div>
                        <label className="block text-slate-500 font-bold mb-1.5">CIT API Authorization Token (Bearer Token)</label>
                        <textarea
                          rows={4}
                          value={appSettings.citApiToken}
                          onChange={(e) => setAppSettings({ ...appSettings, citApiToken: e.target.value })}
                          placeholder="Paste your Bearer token or API key here..."
                          className="w-full p-3 font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 leading-relaxed text-xs"
                        />
                      </div>

                      <div className="bg-blue-50 rounded-xl p-4.5 border border-blue-200/50 flex items-start space-x-3 text-slate-700 leading-normal">
                        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-blue-900">Chained API Workflow Actions:</p>
                          <ul className="list-decimal pl-4 mt-1.5 space-y-1 text-[11px] text-blue-800">
                            <li>Check matched ticket folder (Folder Parent = <strong>Bank Order</strong>).</li>
                            <li>Extract amount, currency code, and branch name dynamically using regex parsing on raw body.</li>
                            <li>Authorize with Bearer Token and map parameters to Active ATM System IDs.</li>
                            <li>POST to create delivery header followed by POST to insert itemized details automatically.</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                      >
                        Save API Configuration
                      </button>
                      {saveStatus && (
                        <span className="text-slate-600 italic font-semibold">{saveStatus}</span>
                      )}
                    </div>
                  </form>
                )}

                {/* TAB 3: POP3 SECURE MAIL CONFIG & SUPABASE CREDS */}
                {settingsTab === 'mail' && (
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Mail Connection & Supabase Client Config</h2>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Input POP3 credentials securely. The background cron auto-fetch routine runs every 3 minutes using these specifications.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-500 font-bold mb-1">POP3 Hostname</label>
                        <input
                          type="text"
                          value={appSettings.pop3Host}
                          onChange={(e) => setAppSettings({ ...appSettings, pop3Host: e.target.value })}
                          placeholder="mail.advantagescm.com"
                          className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold mb-1">POP3 TLS Port</label>
                        <input
                          type="number"
                          value={appSettings.pop3Port}
                          onChange={(e) => setAppSettings({ ...appSettings, pop3Port: parseInt(e.target.value, 10) || 995 })}
                          placeholder="995"
                          className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-500 font-bold mb-1">POP3 Username / Email</label>
                        <input
                          type="text"
                          value={appSettings.pop3User}
                          onChange={(e) => setAppSettings({ ...appSettings, pop3User: e.target.value })}
                          placeholder="fachrul.wisnu@advantagescm.com"
                          className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold mb-1">POP3 Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={appSettings.pop3Pass}
                            onChange={(e) => setAppSettings({ ...appSettings, pop3Pass: e.target.value })}
                            placeholder="POP3 Account Password"
                            className="w-full pl-3 pr-10 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* POP3 Diagnostic Button */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between select-none">
                      <div>
                        <p className="font-bold text-slate-700">POP3 Server Connection Diagnostic</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Attempt to connect and authorize with POP3 server immediately.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTestingConn}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition-colors text-xs"
                      >
                        {isTestingConn ? 'Testing...' : 'Test Mail Server'}
                      </button>
                    </div>

                    {testResult && (
                      <div className={`p-3.5 rounded-xl text-xs border ${
                        testResult.success 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        <div className="flex items-start space-x-2">
                          {testResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />}
                          <div>
                            <p className="font-bold leading-none">{testResult.success ? "POP3 Connection Succeeded" : "POP3 Connection Failed"}</p>
                            <p className="opacity-90 leading-normal mt-1 text-[11px]">{testResult.message}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-200/50 pt-5 mt-4">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Database className="h-4 w-4 text-slate-400" />
                        Optional Supabase PostgreSQL Credentials
                      </p>
                      <p className="text-[10px] text-slate-400 mb-4 leading-normal">
                        Provide a Supabase REST endpoint URL and API key to replicate cached database actions. If left blank, the system automatically runs fully standalone on local SQLite database store.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-500 font-bold mb-1">Supabase API Endpoint (URL)</label>
                        <input
                          type="text"
                          value={appSettings.supabaseUrl}
                          onChange={(e) => setAppSettings({ ...appSettings, supabaseUrl: e.target.value })}
                          placeholder="https://xxxx.supabase.co"
                          className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold mb-1">Supabase Anon Key / Service Role Key</label>
                        <input
                          type="password"
                          value={appSettings.supabaseKey}
                          onChange={(e) => setAppSettings({ ...appSettings, supabaseKey: e.target.value })}
                          placeholder="eyJhbGciOi..."
                          className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                      >
                        Save Configuration
                      </button>
                      {saveStatus && (
                        <span className="text-slate-600 italic font-semibold">{saveStatus}</span>
                      )}
                    </div>
                  </form>
                )}

                {/* TAB 4: HISTORICAL DATA BACKFILL */}
                {settingsTab === 'backfill' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Historical Data Backfill</h2>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Proses ini akan merangkum ribuan email lama yang tersimpan di database agar sistem workflow kembali aktif dan terstruktur.
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-4">
                      <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Backfill Parameters & Rules:</p>
                      
                      <ul className="list-disc pl-4 space-y-1.5 text-slate-600 leading-normal">
                        <li>System analyzes the content of <strong>body_text</strong> of unsummarized emails deeply.</li>
                        <li>If the email content is operational, it generates a highly descriptive <strong>summary</strong>.</li>
                        <li>If the email is a simple system notification (such as Geofence), it generates a compact summary.</li>
                        <li>All processed results are cleanly parsed and stored.</li>
                        <li>If the email is system/technical, <strong>action_required</strong> is set to false unless there are clear repair actions.</li>
                        <li>Emails that are not readable will automatically fallback to <strong>"Data historis tidak terbaca jelas"</strong> and <strong>action_required: false</strong>.</li>
                      </ul>

                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center justify-between mt-2">
                        <div>
                          <p className="font-bold text-blue-900">Trigger Historical Sync Workflow</p>
                          <p className="text-[10px] text-blue-700/80 mt-0.5">Launches the LLM backend processor on unsummarized records.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleFetchHistoricalData}
                          disabled={isBackfilling}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-400 text-white font-bold rounded-lg cursor-pointer transition-all shadow-sm flex items-center gap-1.5 text-xs"
                        >
                          {isBackfilling ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Backfilling...</span>
                            </>
                          ) : (
                            <>
                              <History className="h-3.5 w-3.5" />
                              <span>Fetch & Process Historical Data</span>
                            </>
                          )}
                        </button>
                      </div>

                      {backfillResult && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 mt-4">
                          <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Historical Backfill Completed Successfully!
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-center mt-2">
                            <div className="p-2.5 bg-white border border-emerald-100 rounded-lg shadow-sm">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Success</span>
                              <span className="text-lg font-bold text-emerald-700">{backfillResult.processed}</span>
                            </div>
                            <div className="p-2.5 bg-white border border-emerald-100 rounded-lg shadow-sm">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Fallback / Err</span>
                              <span className="text-lg font-bold text-rose-600">{backfillResult.failed}</span>
                            </div>
                            <div className="p-2.5 bg-white border border-emerald-100 rounded-lg shadow-sm">
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Skipped</span>
                              <span className="text-lg font-bold text-slate-500">{backfillResult.skipped}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </section>

          </div>
        )}

      </main>

      {/* 5. EDIT SUGGESTION MODAL OVERLAY */}
      {isEditSuggestionOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4.5 w-4.5 text-blue-600 animate-pulse" />
                <h3 className="text-sm font-bold text-slate-800">Review & Apply AI Penanganan Suggestion</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditSuggestionOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none cursor-pointer p-1 rounded"
              >
                &times;
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs select-text text-left">
              
              {/* Folder Mapping (Editable) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Folder Parent (Induk)</label>
                  <input
                    type="text"
                    value={suggestionForm.folder_parent}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, folder_parent: e.target.value })}
                    placeholder="e.g. Bank Maybank"
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Folder Child (Anak)</label>
                  <input
                    type="text"
                    value={suggestionForm.folder_child}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, folder_child: e.target.value })}
                    placeholder="e.g. Collection"
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

              {/* Tag and Urgency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Suggested Tag (Category)</label>
                  <input
                    type="text"
                    value={suggestionForm.suggested_tag}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, suggested_tag: e.target.value })}
                    placeholder="e.g. Collection, Penugasan, Informasi"
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Urgency Level</label>
                  <select
                    value={suggestionForm.urgency_level}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, urgency_level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              {/* Checkboxes (Action Required, Important) */}
              <div className="flex gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                <label className="flex-1 flex items-center space-x-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={suggestionForm.action_required}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, action_required: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                  />
                  <span>Action Required (Tindakan)</span>
                </label>
                <label className="flex-1 flex items-center space-x-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={suggestionForm.is_important}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, is_important: e.target.checked })}
                    className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-slate-300 rounded"
                  />
                  <span>Is Important (Penting)</span>
                </label>
              </div>

              {/* Summary Textarea */}
              <div>
                <label className="block text-slate-500 font-bold mb-1">Effective Summary</label>
                <textarea
                  value={suggestionForm.summary}
                  onChange={(e) => setSuggestionForm({ ...suggestionForm, summary: e.target.value })}
                  rows={3}
                  placeholder="Review the AI generated summary..."
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium leading-relaxed"
                />
              </div>

              {/* Automate: Create Filter Routing Rule (Optional checkbox) */}
              <div className="pt-3 border-t border-slate-100">
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={suggestionForm.create_filter_rule}
                    onChange={(e) => setSuggestionForm({ ...suggestionForm, create_filter_rule: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                  />
                  <span>Create automated Filter Rule from this suggestion</span>
                </label>
                <p className="text-[10px] text-slate-400 mt-1 ml-6 leading-relaxed">
                  Checking this will automatically create a dynamic filter rule, routing all future incoming emails matching these rules to the exact folders configured above.
                </p>
              </div>

              {/* Collapsible rule settings if create_filter_rule checked */}
              {suggestionForm.create_filter_rule && (
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4.5 ml-6 space-y-3">
                  <p className="font-bold text-blue-800 text-[10px] uppercase tracking-wider">Automated Filter Logic Settings</p>
                  
                  <div>
                    <label className="block text-slate-500 font-semibold mb-0.5">Filter Rule Name</label>
                    <input
                      type="text"
                      value={suggestionForm.filter_rule_name}
                      onChange={(e) => setSuggestionForm({ ...suggestionForm, filter_rule_name: e.target.value })}
                      placeholder="e.g. Bank Maybank Auto Router"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-0.5">Match Sender Address (Contains)</label>
                      <input
                        type="text"
                        value={suggestionForm.filter_rule_match_from}
                        onChange={(e) => setSuggestionForm({ ...suggestionForm, filter_rule_match_from: e.target.value })}
                        placeholder="e.g. collection@bankmaybank.co.id"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-0.5">Match Subject (Contains)</label>
                      <input
                        type="text"
                        value={suggestionForm.filter_rule_match_subject}
                        onChange={(e) => setSuggestionForm({ ...suggestionForm, filter_rule_match_subject: e.target.value })}
                        placeholder="Optional"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center space-x-2 cursor-pointer text-slate-600 font-semibold mt-1">
                      <input
                        type="checkbox"
                        checked={suggestionForm.filter_rule_trigger_api}
                        onChange={(e) => setSuggestionForm({ ...suggestionForm, filter_rule_trigger_api: e.target.checked })}
                        className="h-3.5 w-3.5 text-blue-600 border-slate-300 rounded"
                      />
                      <span>Trigger active Cash In Transit (CIT) API for this filter</span>
                    </label>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsEditSuggestionOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-lg cursor-pointer transition-all text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const payload = {
                    folder_parent: suggestionForm.folder_parent,
                    folder_child: suggestionForm.folder_child,
                    tags: [suggestionForm.suggested_tag],
                    suggested_tag: suggestionForm.suggested_tag,
                    is_important: suggestionForm.is_important,
                    urgency_level: suggestionForm.urgency_level,
                    summary: suggestionForm.summary,
                    action_required: suggestionForm.action_required,
                    create_filter_rule: suggestionForm.create_filter_rule,
                    filter_rule: {
                      name: suggestionForm.filter_rule_name,
                      match_from: suggestionForm.filter_rule_match_from,
                      match_subject: suggestionForm.filter_rule_match_subject,
                      match_body: suggestionForm.filter_rule_match_body,
                      action_parent: suggestionForm.folder_parent,
                      action_child: suggestionForm.folder_child,
                      trigger_api: suggestionForm.filter_rule_trigger_api
                    }
                  };
                  await handleSmartApply(suggestionForm.message_id, payload);
                  setIsEditSuggestionOpen(false);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer shadow-sm transition-all text-xs"
              >
                Apply suggestion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CIT Order Creation Modal Overlay */}
      <CitOrderModal
        isOpen={isCitOrderModalOpen}
        onClose={() => {
          setIsCitOrderModalOpen(false);
          setCitOrderPrefillEmail(null);
        }}
        onAddToast={addToast}
        prefillEmail={citOrderPrefillEmail}
        onOrderCreated={async () => {
          setIsCitOrderModalOpen(false);
          setCitOrderPrefillEmail(null);
          await loadEmails(); // Reload emails to show updated state
        }}
      />

      {/* Floating Toast Notification Area */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none w-80">
        {toasts.map(t => (
          <div key={t.id} className="p-4 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl flex items-start space-x-3 pointer-events-auto transition-all animate-fade-in relative overflow-hidden select-text">
            <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-500"></div>
            <Zap className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-xs">{t.title}</p>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal">{t.message}</p>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-slate-500 hover:text-white shrink-0 self-start p-0.5 cursor-pointer rounded"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
