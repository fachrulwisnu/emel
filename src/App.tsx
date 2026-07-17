import React, { useState, useEffect } from 'react';
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
  ChevronUp
} from 'lucide-react';

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

export default function App() {
  // Navigation
  const [currentMenu, setCurrentMenu] = useState<'inbox' | 'settings'>('inbox');
  const [settingsTab, setSettingsTab] = useState<'filters' | 'api' | 'mail'>('filters');

  // Loaders and State
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [dynamicFolders, setDynamicFolders] = useState<{ folder_parent: string; folder_child: string; count: number }[]>([]);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  
  // Custom Filters State
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [filterMsg, setFilterMsg] = useState('');
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

  // Floating Toasts
  const [toasts, setToasts] = useState<{ id: number; title: string; message: string }[]>([]);

  // Simple search filter state
  const [searchQuery, setSearchQuery] = useState('');

  const addToast = (title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  // Connect to SSE Events for Background Auto-Sync Notifications
  useEffect(() => {
    const eventSource = new EventSource('/api/events');
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'email_synced') {
          addToast('Email Auto-Synced & Classified', payload.data.message || 'A new ticket has arrived.');
          loadEmails();
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
  }, []);

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
  const loadEmails = async () => {
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
            fromAddress: fromAddress
          };
        });

        setEmails(mapped);

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
  const loadCustomFilters = async () => {
    try {
      const res = await fetch('/api/custom-filters');
      const data = await res.json();
      if (data.success && data.filters) {
        setCustomFilters(data.filters);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  useEffect(() => {
    loadSettings();
    loadEmails();
    loadCustomFilters();
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

  // Add/Edit Filter Rule
  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterForm.name.trim() || !filterForm.action_parent.trim() || !filterForm.action_child.trim()) {
      setFilterMsg('Name, Action Folder Parent, and Action Folder Child are required.');
      return;
    }
    try {
      const res = await fetch('/api/custom-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: filterForm })
      });
      const data = await res.json();
      if (data.success) {
        setFilterMsg('Filter rule saved successfully!');
        setFilterForm({
          name: '',
          match_from: '',
          match_subject: '',
          match_body: '',
          action_parent: '',
          action_child: '',
          trigger_api: false
        });
        addToast('Rule Saved', 'Dynamic workflow tag filter registered.');
        await loadCustomFilters();
        await loadEmails(); // reclassify
      } else {
        setFilterMsg('Failed to save: ' + data.message);
      }
    } catch (err: any) {
      setFilterMsg('Error: ' + err.message);
    }
  };

  // Delete Filter Rule
  const handleDeleteFilter = async (id: number) => {
    if (!confirm('Are you sure you want to delete this custom routing filter?')) return;
    try {
      const res = await fetch('/api/custom-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Rule Deleted', 'Dynamic filter removed.');
        await loadCustomFilters();
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  // Clear Emails Database Cache
  const handleClearDatabase = async () => {
    if (confirm('Are you sure you want to completely flush your mail list cache? (SQLite and Supabase)')) {
      try {
        const res = await fetch('/api/clear-emails', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          addToast('Inbox Flushed', 'Cached tickets cleared.');
          setEmails([]);
          setSelectedEmail(null);
          await loadFolders();
        }
      } catch (err) {
        console.error('Failed to clear emails:', err);
      }
    }
  };

  // Filters logic helper
  const getFilteredEmails = () => {
    return emails.filter(email => {
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
                    onClick={() => setSelectedFolder('all')}
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
                      {emails.length}
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
                            onClick={() => setSelectedFolder(`parent:${parent}`)}
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
                            <span className="text-[9px] bg-slate-100 font-bold px-1.5 py-0.2 rounded text-slate-500">
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
                                    onClick={() => setSelectedFolder(`child:${parent}|||${ch.child}`)}
                                    className={`w-full flex items-center justify-between py-1.5 px-2.5 rounded transition-all text-left truncate cursor-pointer ${
                                      isSelected
                                        ? 'bg-blue-50 text-blue-700 font-semibold'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                                  >
                                    <span className="truncate text-[11px]">{ch.child}</span>
                                    <span className={`text-[8px] px-1 py-0.1 font-bold rounded ${
                                      isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                                    }`}>
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
                        onClick={() => setSelectedEmail(email)}
                        className={`p-4 transition-all cursor-pointer border-l-4 text-left relative ${
                          isSelected 
                            ? 'bg-blue-50/70 border-blue-600' 
                            : 'hover:bg-slate-50 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-slate-800 text-xs truncate max-w-[160px]">
                            {email.fromName}
                          </span>
                          <span className="text-[9px] text-slate-400 shrink-0 font-mono">
                            {formatTimestamp(email.date)}
                          </span>
                        </div>

                        <p className={`text-xs font-semibold leading-snug truncate mb-1 ${
                          isSelected ? 'text-blue-800' : 'text-slate-700'
                        }`}>
                          {email.subject}
                        </p>

                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2 pr-2">
                          {email.body_text}
                        </p>

                        {/* Folder tags */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-bold px-1.5 py-0.2 rounded font-mono">
                            {email.folder_parent || 'Lainnya'} &gt; {email.folder_child || 'Uncategorized'}
                          </span>

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

                      <div className="text-right">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block">
                          Folder: {selectedEmail.folder_parent || 'Lainnya'} / {selectedEmail.folder_child || 'Uncategorized'}
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
                        Create New Filter Rule
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
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                        >
                          Add Rule
                        </button>
                        {filterMsg && (
                          <span className="text-slate-600 italic font-semibold">{filterMsg}</span>
                        )}
                      </div>
                    </form>

                    {/* Existing Rules CRUD Table */}
                    <div className="space-y-3">
                      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Configured Filter Rules ({customFilters.length})</p>

                      {customFilters.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No custom filter rules defined yet.</p>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-xs text-left text-slate-600 divide-y divide-slate-100">
                            <thead className="bg-slate-50 font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                              <tr>
                                <th className="p-3.5">Rule Name & Matching Criteria</th>
                                <th className="p-3.5">Target Folder Routing</th>
                                <th className="p-3.5 text-center">API Trigger</th>
                                <th className="p-3.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {customFilters.map(filter => (
                                <tr key={filter.id} className="hover:bg-slate-50">
                                  <td className="p-3.5 font-sans select-text">
                                    <p className="font-bold text-slate-800 text-[13px]">{filter.name}</p>
                                    <div className="text-[10px] text-slate-400 mt-1 space-y-0.5 font-mono leading-normal">
                                      {filter.match_from && <p>From: "{filter.match_from}"</p>}
                                      {filter.match_subject && <p>Subject: "{filter.match_subject}"</p>}
                                      {filter.match_body && <p>Body: "{filter.match_body}"</p>}
                                    </div>
                                  </td>
                                  <td className="p-3.5 font-medium">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold font-mono text-[10px] border border-blue-100">
                                      {filter.action_parent} &gt; {filter.action_child}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-center">
                                    {filter.trigger_api ? (
                                      <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                        <Zap className="h-3 w-3 fill-current" /> Active
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-bold uppercase text-[9px]">Disabled</span>
                                    )}
                                  </td>
                                  <td className="p-3.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => filter.id && handleDeleteFilter(filter.id)}
                                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                      title="Delete rule"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

              </div>
            </section>

          </div>
        )}

      </main>

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
