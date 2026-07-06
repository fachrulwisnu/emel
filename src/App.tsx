import React, { useState, useEffect } from 'react';
import { getSeedEmails } from './seed';
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
  Tag, 
  SlidersHorizontal, 
  Settings, 
  Eye, 
  EyeOff,
  Trash2,
  Info,
  Clock,
  ArrowRight
} from 'lucide-react';

interface Email {
  id?: number;
  uid: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;
  body: string;
  bodyHtml: string;
  tags: string[];
  messageId?: string;
}

export default function App() {
  // POP3 Configuration State (defaults pre-filled)
  const [pop3Host, setPop3Host] = useState('mail.advantagescm.com');
  const [pop3Port, setPop3Port] = useState('995');
  const [pop3User, setPop3User] = useState('fachrul.wisnu@advantagescm.com');
  const [pop3Pass, setPop3Pass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Connection and Fetching States
  const [showSettings, setShowSettings] = useState(true);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [isFetching, setIsFetching] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string; count: number } | null>(null);

  // Email List and Selected Email States
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all'); // 'all', 'untagged', 'speedtest:<branch>', 'approval:<docType>'
  const [isSpeedtestExpanded, setIsSpeedtestExpanded] = useState(true);
  const [isApprovalExpanded, setIsApprovalExpanded] = useState(true);
  
  // Advanced Search / Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    from: '',
    to: '', // included for UI requirement, can search in headers or simulate
    subject: '',
    hasWords: '',
    dateWithin: 'all' // 'all', 'today', '7days', '30days'
  });

  // Pane 3 Email Body Toggle (Plain vs HTML)
  const [bodyViewMode, setBodyViewMode] = useState<'text' | 'html'>('text');

  // Trigger loading initial emails from local SQLite/JSON server database
  const loadEmails = async () => {
    try {
      const res = await fetch('/api/emails');
      const data = await res.json();
      if (data.success && data.emails) {
        setEmails(data.emails);
        // Automatically select the first email if none is selected
        if (data.emails.length > 0 && !selectedEmail) {
          setSelectedEmail(data.emails[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load emails from local database API:', err);
    }
  };

  useEffect(() => {
    loadEmails();
  }, []);

  // Sync selection view mode when email changes
  useEffect(() => {
    if (selectedEmail) {
      if (selectedEmail.bodyHtml) {
        setBodyViewMode('html');
      } else {
        setBodyViewMode('text');
      }
    }
  }, [selectedEmail]);

  // Test POP3 Connection Handler
  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: pop3Host,
          port: pop3Port,
          username: pop3User,
          password: pop3Pass
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
        message: `Connection failed: ${err.message || String(err)}`
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  // Sync POP3 Handler
  const handleSyncPop3 = async () => {
    setIsFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch('/api/fetch-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: pop3Host,
          port: pop3Port,
          username: pop3User,
          password: pop3Pass
        })
      });
      const data = await res.json();
      setFetchResult({
        success: data.success,
        message: data.message,
        count: data.fetchedCount || 0
      });
      
      if (data.success) {
        await loadEmails();
      }
    } catch (err: any) {
      setFetchResult({
        success: false,
        message: `Sync error: ${err.message || String(err)}`,
        count: 0
      });
    } finally {
      setIsFetching(false);
    }
  };

  // Simulate Emails Handler
  const handleSimulateEmails = async () => {
    setIsSimulating(true);
    setFetchResult(null);
    try {
      const res = await fetch('/api/simulate-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setFetchResult({
        success: data.success,
        message: data.message,
        count: data.fetchedCount || 0
      });
      
      if (data.success) {
        await loadEmails();
      }
    } catch (err: any) {
      setFetchResult({
        success: false,
        message: `Simulation error: ${err.message || String(err)}`,
        count: 0
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear Local Database Cache
  const handleClearDatabase = async () => {
    if (confirm('Are you sure you want to clear all cached emails from your local database? This cannot be undone.')) {
      try {
        const res = await fetch('/api/clear-emails', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setEmails([]);
          setSelectedEmail(null);
          alert('Local database cache cleared successfully.');
        }
      } catch (err) {
        alert('Failed to clear database cache on server.');
      }
    }
  };

  // Generate lists of dynamic Speedtest and Approval branches/types
  const getSpeedtestBranches = () => {
    const branches = new Set<string>();
    emails.forEach(email => {
      if (email.tags.includes('Speedtest')) {
        // Find other tags besides "Speedtest"
        email.tags.forEach(tag => {
          if (tag !== 'Speedtest' && tag !== 'General') {
            branches.add(tag);
          }
        });
      }
    });
    return Array.from(branches).sort();
  };

  const getApprovalTypes = () => {
    const types = new Set<string>();
    emails.forEach(email => {
      if (email.tags.includes('Approval')) {
        email.tags.forEach(tag => {
          if (tag !== 'Approval' && tag !== 'Other') {
            types.add(tag);
          }
        });
      }
    });
    return Array.from(types).sort();
  };

  const speedtestBranches = getSpeedtestBranches();
  const approvalTypes = getApprovalTypes();

  // Calculate folder badge counts
  const getFolderCounts = () => {
    const counts: Record<string, number> = {
      all: emails.length,
      untagged: emails.filter(e => !e.tags.includes('Speedtest') && !e.tags.includes('Approval')).length,
      'speedtest:all': emails.filter(e => e.tags.includes('Speedtest')).length,
      'approval:all': emails.filter(e => e.tags.includes('Approval')).length,
    };

    speedtestBranches.forEach(branch => {
      counts[`speedtest:${branch}`] = emails.filter(e => e.tags.includes('Speedtest') && e.tags.includes(branch)).length;
    });

    approvalTypes.forEach(type => {
      counts[`approval:${type}`] = emails.filter(e => e.tags.includes('Approval') && e.tags.includes(type)).length;
    });

    // Handle "Other" subfolder count for Approval
    counts['approval:Other'] = emails.filter(e => e.tags.includes('Approval') && e.tags.includes('Other')).length;

    return counts;
  };

  const folderCounts = getFolderCounts();

  // Filtering emails for Pane 2
  const getFilteredEmails = () => {
    return emails.filter(email => {
      // 1. Folder filter
      if (selectedFolder === 'all') {
        // Show everything
      } else if (selectedFolder === 'untagged') {
        if (email.tags.includes('Speedtest') || email.tags.includes('Approval')) return false;
      } else if (selectedFolder === 'speedtest:all') {
        if (!email.tags.includes('Speedtest')) return false;
      } else if (selectedFolder === 'approval:all') {
        if (!email.tags.includes('Approval')) return false;
      } else if (selectedFolder.startsWith('speedtest:')) {
        const branch = selectedFolder.split(':')[1];
        if (!email.tags.includes('Speedtest') || !email.tags.includes(branch)) return false;
      } else if (selectedFolder.startsWith('approval:')) {
        const docType = selectedFolder.split(':')[1];
        if (!email.tags.includes('Approval') || !email.tags.includes(docType)) return false;
      }

      // 2. Advanced search filters
      if (filters.from && !email.fromName.toLowerCase().includes(filters.from.toLowerCase()) && !email.fromAddress.toLowerCase().includes(filters.from.toLowerCase())) {
        return false;
      }
      if (filters.subject && !email.subject.toLowerCase().includes(filters.subject.toLowerCase())) {
        return false;
      }
      if (filters.hasWords) {
        const word = filters.hasWords.toLowerCase();
        const matchesSubj = email.subject.toLowerCase().includes(word);
        const matchesBody = email.body.toLowerCase().includes(word);
        const matchesFrom = email.fromName.toLowerCase().includes(word) || email.fromAddress.toLowerCase().includes(word);
        if (!matchesSubj && !matchesBody && !matchesFrom) return false;
      }
      if (filters.dateWithin && filters.dateWithin !== 'all') {
        const emailDate = new Date(email.date);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - emailDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (filters.dateWithin === 'today' && diffDays > 1) return false;
        if (filters.dateWithin === '7days' && diffDays > 7) return false;
        if (filters.dateWithin === '30days' && diffDays > 30) return false;
      }

      return true;
    });
  };

  const filteredEmails = getFilteredEmails();

  // Helper to format timestamps elegantly
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
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getTagBadgeStyles = (tag: string) => {
    switch(tag) {
      case 'Speedtest':
        return 'bg-amber-100 text-amber-800 font-bold border-transparent';
      case 'Approval':
        return 'bg-purple-100 text-purple-800 font-bold border-transparent';
      case 'UAT':
        return 'bg-blue-100 text-blue-800 font-bold border-transparent';
      case 'FSD':
        return 'bg-orange-100 text-orange-800 font-bold border-transparent';
      case 'SIT':
        return 'bg-emerald-100 text-emerald-800 font-bold border-transparent';
      case 'Other':
      case 'General':
        return 'bg-slate-100 text-slate-500 font-bold border-transparent';
      default:
        // dynamic branch names (e.g. Purwokerto, Senen)
        return 'bg-slate-100 text-slate-600 font-bold border-transparent';
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#F9FAFB] font-sans text-slate-900 overflow-hidden" id="main_app_container">
      
      {/* GLOBAL SYSTEM BAR / TOP HEADER */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shrink-0" id="header_pane">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600 rounded-lg text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800 flex items-center gap-1.5">
              MailTick <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-semibold">v1.0</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">POP3 Fetcher & Local SQLite Database Store</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
              showSettings 
                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Path Settings</span>
          </button>
          
          <button 
            onClick={handleClearDatabase}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-rose-600 hover:text-rose-750 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded text-xs font-semibold transition-all cursor-pointer"
            title="Clear all stored emails"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Cache</span>
          </button>
        </div>
      </header>

      {/* THREE-PANE LAYOUT BODY */}
      <div className="flex flex-row flex-1 overflow-hidden w-full" id="workspace_panes">
        
        {/* PANE 1: LEFT SIDEBAR - CONNECTION CONTROLS & VIRTUAL FOLDERS */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-y-auto shrink-0 select-none" id="pane_left">
          
          {/* POP3 Server Config Panel */}
          {showSettings && (
            <div className="p-4 bg-slate-50 border-b border-slate-200" id="pop3_settings_panel">
              <h3 className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center justify-between">
                <span>POP3 Configuration</span>
                <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono font-bold">Secure TLS</span>
              </h3>
              
              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">POP3 Server Host</label>
                  <input 
                    type="text"
                    value={pop3Host}
                    onChange={(e) => setPop3Host(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">Email / Username</label>
                    <input 
                      type="text"
                      value={pop3User}
                      onChange={(e) => setPop3User(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">Port</label>
                    <input 
                      type="text"
                      value={pop3Port}
                      onChange={(e) => setPop3Port(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500 transition-colors text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={pop3Pass}
                      placeholder="••••••••"
                      onChange={(e) => setPop3Pass(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500 transition-colors pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Connection Controls Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTestingConn || isFetching}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isTestingConn ? <RefreshCw className="h-3 w-3 animate-spin text-slate-500" /> : null}
                    <span>Test Connection</span>
                  </button>

                  <button
                    onClick={handleSyncPop3}
                    disabled={isFetching || isTestingConn}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold hover:bg-blue-700 disabled:bg-blue-400 transition-all shadow-sm cursor-pointer"
                  >
                    {isFetching ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span>Sync POP3</span>
                  </button>
                </div>

                {/* Simulation backup button for quick testing */}
                <div className="pt-1 border-t border-slate-200/50 mt-1">
                  <button
                    onClick={handleSimulateEmails}
                    disabled={isSimulating || isFetching}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded text-[10px] font-bold transition-all cursor-pointer"
                    title="Mock inbound emails for testing filters"
                  >
                    {isSimulating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                    <span>Simulate Local Inbound</span>
                  </button>
                </div>
              </div>

              {testResult && (
                <div className={`mt-2.5 p-2 rounded text-[11px] flex flex-col space-y-0.5 border ${
                  testResult.success 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-rose-50 text-rose-850 border-rose-200'
                }`}>
                  <div className="flex items-start space-x-1.5">
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-bold leading-none">{testResult.success ? "Connection Success" : "Connection Failed"}</p>
                      <p className="opacity-90 leading-normal mt-0.5 text-[10px]">{testResult.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {fetchResult && (
                <div className={`mt-2.5 p-2 rounded text-[11px] flex flex-col space-y-0.5 border ${
                  fetchResult.success 
                    ? 'bg-blue-50 text-blue-800 border-blue-200' 
                    : 'bg-rose-50 text-rose-850 border-rose-200'
                }`}>
                  <div className="flex items-start space-x-1.5">
                    {fetchResult.success ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-bold leading-none">{fetchResult.success ? "Sync Completed" : "Sync Failed"}</p>
                      <p className="opacity-90 leading-normal mt-0.5 text-[10px]">{fetchResult.message}</p>
                      {fetchResult.count > 0 && (
                        <p className="text-[10px] text-blue-700 font-bold mt-0.5">Scanned & Added: {fetchResult.count} new</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIRTUAL FOLDERS / TREE VIEW */}
          <div className="p-4 flex-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3 px-2">System Views</p>
            
            <nav className="space-y-1 text-sm" id="folders_tree">
              
              {/* All Folder */}
              <button 
                onClick={() => setSelectedFolder('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all cursor-pointer ${
                  selectedFolder === 'all' 
                    ? 'bg-blue-50 text-blue-700 font-semibold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Inbox className={`h-4 w-4 ${selectedFolder === 'all' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>All Tickets</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  selectedFolder === 'all' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-100 text-slate-505 font-medium'
                }`}>
                  {folderCounts['all'] || 0}
                </span>
              </button>

              {/* Speedtest Virtual Sub-Tree */}
              <div className="space-y-0.5">
                <button 
                  onClick={() => setSelectedFolder('speedtest:all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all cursor-pointer ${
                    selectedFolder === 'speedtest:all' 
                      ? 'bg-blue-50 text-blue-700 font-semibold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSpeedtestExpanded(!isSpeedtestExpanded);
                      }}
                      className="p-1 hover:bg-slate-200/50 rounded cursor-pointer transition-colors"
                    >
                      {isSpeedtestExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <Folder className={`h-4 w-4 ${selectedFolder === 'speedtest:all' ? 'text-blue-600' : 'text-blue-500'}`} />
                    <span>Speedtest Routine</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedFolder === 'speedtest:all' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-100 text-slate-505 font-medium'
                  }`}>
                    {folderCounts['speedtest:all'] || 0}
                  </span>
                </button>

                {/* Speedtest branch subfolders */}
                {isSpeedtestExpanded && (
                  <div className="pl-6 space-y-1 border-l border-slate-100 ml-5">
                    {speedtestBranches.map(branch => (
                      <button
                        key={branch}
                        onClick={() => setSelectedFolder(`speedtest:${branch}`)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-all cursor-pointer ${
                          selectedFolder === `speedtest:${branch}`
                            ? 'bg-slate-100 text-blue-700 font-bold'
                            : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-800'
                        }`}
                      >
                        <span className="flex items-center space-x-2 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                          <span className="truncate">{branch}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-medium">
                          {folderCounts[`speedtest:${branch}`] || 0}
                        </span>
                      </button>
                    ))}
                    {speedtestBranches.length === 0 && (
                      <p className="text-[11px] text-slate-400 italic pl-3 py-1">No branches parsed yet</p>
                    )}
                  </div>
                )}
              </div>

              {/* Approval Virtual Sub-Tree */}
              <div className="space-y-0.5">
                <button 
                  onClick={() => setSelectedFolder('approval:all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all cursor-pointer ${
                    selectedFolder === 'approval:all' 
                      ? 'bg-blue-50 text-blue-700 font-semibold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsApprovalExpanded(!isApprovalExpanded);
                      }}
                      className="p-1 hover:bg-slate-200/50 rounded cursor-pointer transition-colors"
                    >
                      {isApprovalExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <Folder className={`h-4 w-4 ${selectedFolder === 'approval:all' ? 'text-blue-600' : 'text-emerald-500'}`} />
                    <span>Approval Document</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedFolder === 'approval:all' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-100 text-slate-505 font-medium'
                  }`}>
                    {folderCounts['approval:all'] || 0}
                  </span>
                </button>

                {/* Approval document-type subfolders */}
                {isApprovalExpanded && (
                  <div className="pl-6 space-y-1 border-l border-slate-100 ml-5">
                    {['UAT', 'FSD', 'SIT', 'Other'].map(type => (
                      <button
                        key={type}
                        onClick={() => setSelectedFolder(`approval:${type}`)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-all cursor-pointer ${
                          selectedFolder === `approval:${type}`
                            ? 'bg-slate-100 text-blue-700 font-bold'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <span className="flex items-center space-x-2 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            type === 'UAT' ? 'bg-purple-400' :
                            type === 'FSD' ? 'bg-amber-400' :
                            type === 'SIT' ? 'bg-teal-400' : 'bg-slate-400'
                          }`}></span>
                          <span>{type} Request</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-medium">
                          {folderCounts[`approval:${type}`] || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* General / Untagged Folder */}
              <button 
                onClick={() => setSelectedFolder('untagged')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all cursor-pointer ${
                  selectedFolder === 'untagged' 
                    ? 'bg-blue-50 text-blue-700 font-semibold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Folder className={`h-4 w-4 ${selectedFolder === 'untagged' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>Unassigned Mail</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  selectedFolder === 'untagged' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-100 text-slate-505 font-medium'
                }`}>
                  {folderCounts['untagged'] || 0}
                </span>
              </button>

            </nav>
          </div>

          {/* Quick Informational Guide at Sidebar bottom */}
          <div className="p-4 m-3 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-500">
            <h4 className="flex items-center space-x-1 text-xs font-semibold text-slate-800 mb-1">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              <span>How Auto-Tagging works:</span>
            </h4>
            <ul className="text-[11px] list-disc list-inside space-y-1 mt-1 opacity-95 leading-tight">
              <li><strong>SPEEDTEST RUTIN</strong> subject filters look for branch name after "CABANG".</li>
              <li><strong>Approval</strong> triggers search inside subject/body for document types: UAT, FSD, or SIT.</li>
            </ul>
          </div>

          {/* Footer DB status */}
          <div className="p-4 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50/50 flex items-center justify-between mt-auto">
            <span>SQLite DB: Connected h-4</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-emerald-600 font-semibold">Active</span>
            </span>
          </div>
        </aside>

        {/* PANE 2: MIDDLE COLUMN - EMAIL LIST & FILTER BAR */}
        <section className="w-96 border-r border-slate-200 bg-[#F8FAFC] flex flex-col overflow-hidden shrink-0" id="pane_middle">
          
          {/* Header of Middle Pane */}
          <div className="p-4 border-b border-slate-200 shrink-0 bg-[#F8FAFC]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {selectedFolder === 'all' && 'All Tickets'}
                  {selectedFolder === 'untagged' && 'Unassigned Mail'}
                  {selectedFolder === 'speedtest:all' && 'All Speedtests'}
                  {selectedFolder === 'approval:all' && 'All Approvals'}
                  {selectedFolder.startsWith('speedtest:') && selectedFolder !== 'speedtest:all' && `Speedtest: ${selectedFolder.split(':')[1]}`}
                  {selectedFolder.startsWith('approval:') && selectedFolder !== 'approval:all' && `Approval: ${selectedFolder.split(':')[1]}`}
                </h2>
                <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded font-mono font-bold">
                  {filteredEmails.length}
                </span>
              </div>
              
              {/* Sliders filter button to toggle advanced search */}
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
                  showFilters || Object.values(filters).some(val => val !== '' && val !== 'all')
                    ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-505'
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Filters</span>
              </button>
            </div>

            {/* Advanced Search / Top Filter Bar */}
            {(showFilters || Object.values(filters).some(val => val !== '' && val !== 'all')) && (
              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2.5 text-xs text-slate-700 mb-1" id="filter_bar">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">From</label>
                    <input 
                      type="text"
                      placeholder="Sender name..."
                      value={filters.from}
                      onChange={(e) => setFilters({...filters, from: e.target.value})}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">To (Recipient)</label>
                    <input 
                      type="text"
                      placeholder="Recipient address..."
                      value={filters.to}
                      onChange={(e) => setFilters({...filters, to: e.target.value})}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">Subject snippet</label>
                    <input 
                      type="text"
                      placeholder="Subject contains..."
                      value={filters.subject}
                      onChange={(e) => setFilters({...filters, subject: e.target.value})}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-semibold text-[10px]">Has the words</label>
                    <input 
                      type="text"
                      placeholder="Body search..."
                      value={filters.hasWords}
                      onChange={(e) => setFilters({...filters, hasWords: e.target.value})}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold text-[10px]">Date within:</span>
                    <button
                      onClick={() => setFilters({ from: '', to: '', subject: '', hasWords: '', dateWithin: 'all' })}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {['all', 'today', '7days', '30days'].map((option) => (
                      <button
                        key={option}
                        onClick={() => setFilters({...filters, dateWithin: option})}
                        className={`py-1 rounded text-[10px] font-bold border capitalize cursor-pointer text-center transition-colors ${
                          filters.dateWithin === option
                            ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {option === 'all' ? 'All' : option === '7days' ? '7d' : option === '30days' ? '30d' : option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Email Cards List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-[#F8FAFC]" id="emails_cards_list">
            {filteredEmails.map(email => {
              const isSelected = selectedEmail?.uid === email.uid;
              return (
                <div
                  key={email.uid}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-4 bg-white border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors relative block text-left ${
                    isSelected ? 'bg-slate-50' : ''
                  }`}
                >
                  {/* Selected card blue indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                  )}
                  
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[70%]">
                      {email.fromName || email.fromAddress || 'Unknown Sender'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono flex items-center shrink-0">
                      {formatTimestamp(email.date)}
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-slate-700 truncate mb-1">
                    {email.subject}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">
                    {email.body || '(No message preview available)'}
                  </p>

                  {/* Badges Row */}
                  {email.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {email.tags.map(tag => (
                        <span
                          key={tag}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tighter ${getTagBadgeStyles(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredEmails.length === 0 && (
              <div className="p-8 text-center" id="no_emails_state">
                <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 font-semibold text-xs">No emails found</p>
                <p className="text-slate-400 text-[10px] mt-1">Modify filters or fetch from POP3 server.</p>
              </div>
            )}
          </div>
        </section>

        {/* PANE 3: RIGHT COLUMN - DRILL-DOWN / DETAIL VIEW */}
        <section className="flex-1 bg-white flex flex-col overflow-hidden" id="pane_right_detail">
          {selectedEmail ? (
            <div className="flex flex-col h-full overflow-hidden" id="active_email_details">
              
              {/* Email Detail Header */}
              <header className="p-6 border-b border-slate-100 bg-white">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex-1 leading-tight">
                    {selectedEmail.subject}
                  </h2>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                    {getInitials(selectedEmail.fromName || selectedEmail.fromAddress)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700 text-sm">
                        {selectedEmail.fromName || 'Unknown Sender'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        &lt;{selectedEmail.fromAddress || 'none'}&gt;
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      To: fachrul.wisnu@advantagescm.com • {new Date(selectedEmail.date).toLocaleString('en-US', {
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEmail.tags.map(tag => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-tighter ${getTagBadgeStyles(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </header>

              {/* View mode buttons if HTML is available */}
              {selectedEmail.bodyHtml && (
                <div className="px-6 py-2 border-b border-slate-100 flex justify-end space-x-1 shrink-0 bg-white">
                  <span className="text-xs text-slate-400 self-center mr-2 font-semibold">Render as:</span>
                  <button
                    onClick={() => setBodyViewMode('text')}
                    className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                      bodyViewMode === 'text'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    Plain Text
                  </button>
                  <button
                    onClick={() => setBodyViewMode('html')}
                    className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                      bodyViewMode === 'html'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    HTML View
                  </button>
                </div>
              )}

              {/* Email Content Body Frame */}
              <div className="flex-1 p-6 overflow-y-auto bg-white" id="email_rendered_body">
                {bodyViewMode === 'html' && selectedEmail.bodyHtml ? (
                  <div className="w-full h-full border border-slate-100 rounded-lg p-4 bg-white overflow-y-auto">
                    {/* Render HTML securely in iframe with local source */}
                    <iframe 
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <style>
                              body { 
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                                font-size: 14px; 
                                line-height: 1.6; 
                                color: #334155; 
                                margin: 0; 
                                padding: 4px;
                              }
                              p { margin-top: 0; margin-bottom: 1em; }
                              strong { color: #0f172a; }
                              ul { padding-left: 20px; margin-top: 0; }
                              li { margin-bottom: 0.5em; }
                              h3 { margin-top: 0; color: #1e293b; }
                            </style>
                          </head>
                          <body>
                            ${selectedEmail.bodyHtml}
                          </body>
                        </html>
                      `}
                      className="w-full h-full border-0"
                      title="Email HTML body"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full border border-slate-100 rounded-lg p-5 bg-slate-50/60 font-mono text-[11px] text-slate-700 whitespace-pre-wrap overflow-y-auto leading-relaxed">
                    {selectedEmail.body || '(Empty Email Body)'}
                  </div>
                )}
              </div>

              {/* Quick Reply Footer */}
              <footer className="p-4 border-t border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-full px-4 py-1.5">
                  <input 
                    type="text" 
                    placeholder="Click to write a quick reply..." 
                    className="text-xs text-slate-600 flex-1 bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        alert('Reply feature is ready to be linked with an SMTP gateway service.');
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <button 
                    onClick={() => alert('Reply feature is ready to be linked with an SMTP gateway service.')}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </footer>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400" id="empty_detail_view">
              <Mail className="h-14 w-14 text-slate-200 mb-3" />
              <p className="font-semibold text-sm text-slate-500">No email selected</p>
              <p className="text-xs text-slate-400 mt-1">Select an email card from the list to view its complete content, metadata, and auto-assigned tags.</p>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
