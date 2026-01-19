
import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import Auth from './components/Auth';
import BulkImportModal from './components/BulkImportModal';
import { Domain, SSLCertificate, ViewType, Status, User, SMTPSettings, NotificationSettings, AlertLog } from './types';
import { verifyDomainInfo, verifySSLInfo, getStatusFromDate } from './services/auditService';
import { getSession, logout, changePassword } from './services/authService';
import { loadAllData, saveDomain, deleteDomain, saveSSLCert, deleteSSLCert, updateSSLCert, updateDomain, saveSettings, syncAllData, testSmtpSettings, generateTestSmtpCredentials, bulkImport, bulkDeleteDomains, bulkDeleteSslCerts } from './services/dataService';

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewType>('dashboard');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [sslCerts, setSSLCerts] = useState<SSLCertificate[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expiring' | 'expired'>('all');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // UI States
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddSSL, setShowAddSSL] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [editingSSL, setEditingSSL] = useState<SSLCertificate | null>(null);
  const [showBulkImport, setShowBulkImport] = useState<'domains' | 'ssl' | null>(null);
  const [domainQuery, setDomainQuery] = useState('');
  const [domainManagedBy, setDomainManagedBy] = useState('');
  const [newSslData, setNewSslData] = useState({ domain: '', host: '', managedBy: '', ipAddress: '' });
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [isVerifyingSSL, setIsVerifyingSSL] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedSslCerts, setSelectedSslCerts] = useState<string[]>([]);

  // Settings State
  const [smtpSettings, setSmtpSettings] = useState<SMTPSettings>({ host: '', port: '587', user: '', pass: '', fromEmail: '', toEmail: '', secure: false, useAuth: true });
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({ enabled: false, intervals: { expired: true, day7: true, day15: true, day30: true } });
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [settingsMsg, setSettingsMsg] = useState<{ text: string, type: 'success' | 'error', previewUrl?: string | null } | null>(null);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isGeneratingCreds, setIsGeneratingCreds] = useState(false);
  
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const fetchUserData = async (u: User) => {
    try {
      const data = await loadAllData(u.id);
      setDomains(data.domains);
      setSSLCerts(data.sslCerts);
      if (data.smtpSettings) setSmtpSettings(data.smtpSettings);
      if (data.notificationSettings) setNotifSettings(data.notificationSettings);
      if (data.alertLogs) setAlertLogs(data.alertLogs);
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  };

  useEffect(() => {
    const sessionUser = getSession();
    if (sessionUser) {
      setUser(sessionUser);
      fetchUserData(sessionUser);
    }
    setIsInitialLoad(false);
  }, []);
  
  // Clear selections when view changes
  useEffect(() => {
    setSelectedDomains([]);
    setSelectedSslCerts([]);
  }, [view]);

  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    const expiringDomains = domains.filter(d => new Date(d.expiryDate) <= thirtyDaysFromNow && new Date(d.expiryDate) > now).length;
    const expiringSSL = sslCerts.filter(s => new Date(s.expiryDate) <= thirtyDaysFromNow && new Date(s.expiryDate) > now).length;
    const expiredDomains = domains.filter(d => d.status === Status.EXPIRED).length;
    const expiredSSLs = sslCerts.filter(s => s.status === Status.EXPIRED).length;
    return {
      totalDomains: domains.length,
      totalSSL: sslCerts.length,
      expiringDomains30: expiringDomains,
      expiringSSL30: expiringSSL,
      expiredDomains,
      expiredSSLs
    };
  }, [domains, sslCerts]);

  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await syncAllData(user.id);
      await fetchUserData(user);
    } catch (e) {
      alert("Sync failed. Server might be busy.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    fetchUserData(newUser);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setDomains([]);
    setSSLCerts([]);
    setView('dashboard');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await saveSettings(user.id, smtpSettings, notifSettings);
      setSettingsMsg({ text: 'Settings saved successfully!', type: 'success' });
      setTimeout(() => setSettingsMsg(null), 3000);
    } catch (err) {
      setSettingsMsg({ text: 'Failed to save settings.', type: 'error' });
    }
  };

  const handleTestSmtp = async () => {
    setIsTestingSmtp(true);
    setSettingsMsg(null);
    try {
      const result = await testSmtpSettings(smtpSettings);
      setSettingsMsg({ text: result.message, type: 'success', previewUrl: result.previewUrl });
    } catch (err: any) {
      setSettingsMsg({ text: err.message, type: 'error' });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleGenerateCreds = async () => {
    setIsGeneratingCreds(true);
    setSettingsMsg(null);
    try {
      const creds = await generateTestSmtpCredentials();
      setSmtpSettings(prev => ({ ...prev, ...creds }));
      setSettingsMsg({ text: 'Ethereal.email test credentials generated!', type: 'success'});
    } catch (err: any) {
      setSettingsMsg({ text: err.message, type: 'error' });
    } finally {
      setIsGeneratingCreds(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (!user) return;
    if (newPass !== confirmPass) {
      setPassMsg({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    try {
      const success = await changePassword(user.username, oldPass, newPass);
      if (success) {
        setPassMsg({ text: 'Password updated successfully!', type: 'success' });
        setOldPass(''); setNewPass(''); setConfirmPass('');
      } else {
        setPassMsg({ text: 'Failed to update password. Check your current password.', type: 'error' });
      }
    } catch (err) {
      setPassMsg({ text: 'An error occurred while updating password.', type: 'error' });
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainQuery || !user) return;
    setIsVerifyingDomain(true);
    try {
      const result = await verifyDomainInfo(domainQuery);
      const newDomain: Domain = {
        id: Math.random().toString(36).substr(2, 9),
        name: domainQuery,
        registrar: result.registrar,
        expiryDate: result.domainExpiry,
        autoRenew: true,
        status: getStatusFromDate(result.domainExpiry),
        lastChecked: result.lastChecked,
        managedBy: domainManagedBy,
      };
      await saveDomain(user.id, newDomain);
      setDomains(prev => [newDomain, ...prev]);
      setDomainQuery('');
      setDomainManagedBy('');
      setShowAddDomain(false);
    } catch (err) {
      alert("Domain verification failed. Please check the domain name.");
    } finally {
      setIsVerifyingDomain(false);
    }
  };
  
  const handleUpdateDomain = async (updatedDomain: Domain) => {
    if (!user) return;
    try {
      const result = await updateDomain(user.id, updatedDomain);
      if (result) {
        setDomains(prev => prev.map(d => d.id === result.id ? { ...d, ...result } : d));
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setEditingDomain(null);
    }
  };

  const handleAddSSL = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSslData.domain || !user) return;
    setIsVerifyingSSL(true);
    try {
      const hostToVerify = newSslData.host || newSslData.domain;
      const result = await verifySSLInfo(hostToVerify);
      const newSSL: SSLCertificate = {
        id: Math.random().toString(36).substr(2, 9),
        domain: newSslData.domain,
        issuer: result.sslIssuer,
        expiryDate: result.sslExpiry,
        type: result.sslType,
        status: getStatusFromDate(result.sslExpiry),
        managedBy: newSslData.managedBy || result.managedBy,
        host: hostToVerify,
        lastChecked: result.lastChecked,
        ipAddress: newSslData.ipAddress || result.ipAddress,
      };
      await saveSSLCert(user.id, newSSL);
      setSSLCerts(prev => [newSSL, ...prev]);
      setNewSslData({ domain: '', host: '', managedBy: '', ipAddress: '' });
      setShowAddSSL(false);
    } catch (err) {
      alert("SSL verification failed. Make sure the host is reachable on port 443.");
    } finally {
      setIsVerifyingSSL(false);
    }
  };
  
  const handleUpdateSSL = async (updatedCert: SSLCertificate) => {
    if (!user) return;
    await updateSSLCert(user.id, updatedCert);
    setSSLCerts(prev => prev.map(s => s.id === updatedCert.id ? updatedCert : s));
    setEditingSSL(null);
  };

  const handleDeleteDomain = async (id: string) => {
    if (!user || !confirm('Are you sure you want to remove this domain?')) return;
    await deleteDomain(user.id, id);
    setDomains(prev => prev.filter(d => d.id !== id));
  };

  const handleDeleteSSL = async (id: string) => {
    if (!user || !confirm('Are you sure you want to remove this certificate?')) return;
    await deleteSSLCert(user.id, id);
    setSSLCerts(prev => prev.filter(s => s.id !== id));
  };

  const handleBulkImport = async (type: 'domains' | 'ssl', data: Record<string, string>[]) => {
    if (!user) return { success: 0, failed: data.length };
    const result = await bulkImport(user.id, type, data);
    await fetchUserData(user); // Refresh data after import
    return result;
  };
  
  const handleBulkDeleteDomains = async () => {
    if (!user || selectedDomains.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedDomains.length} selected domains?`)) {
      await bulkDeleteDomains(user.id, selectedDomains);
      setDomains(prev => prev.filter(d => !selectedDomains.includes(d.id)));
      setSelectedDomains([]);
    }
  };
  
  const handleBulkDeleteSslCerts = async () => {
    if (!user || selectedSslCerts.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedSslCerts.length} selected SSL certificates?`)) {
      await bulkDeleteSslCerts(user.id, selectedSslCerts);
      setSSLCerts(prev => prev.filter(s => !selectedSslCerts.includes(s.id)));
      setSelectedSslCerts([]);
    }
  };

  const navigateToFiltered = (view: ViewType, filter: 'expiring' | 'expired') => {
    setFilterType(filter);
    setView(view);
    setSortConfig({ key: 'expiryDate', direction: 'asc' });
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortData = <T extends Record<string, any>>(data: T[], config: SortConfig) => {
    if (!config) return data;
    return [...data].sort((a, b) => {
      if (a[config.key] < b[config.key]) return config.direction === 'asc' ? -1 : 1;
      if (a[config.key] > b[config.key]) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filteredDomains = useMemo(() => {
    let result = domains;
    if (filterType === 'expiring') {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);
      result = domains.filter(d => {
        const expiry = new Date(d.expiryDate);
        return expiry <= thirtyDaysFromNow && expiry > now;
      });
    } else if (filterType === 'expired') {
      result = domains.filter(d => d.status === Status.EXPIRED);
    }
    return sortData(result, sortConfig);
  }, [domains, filterType, sortConfig]);

  const filteredSSL = useMemo(() => {
    let result = sslCerts;
    if (filterType === 'expiring') {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);
      result = sslCerts.filter(s => {
        const expiry = new Date(s.expiryDate);
        return expiry <= thirtyDaysFromNow && expiry > now;
      });
    } else if (filterType === 'expired') {
      result = sslCerts.filter(s => s.status === Status.EXPIRED);
    }
    return sortData(result, sortConfig);
  }, [sslCerts, filterType, sortConfig]);
  
  const handleSelectDomain = (id: string, checked: boolean) => {
    setSelectedDomains(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };
  
  const handleSelectAllDomains = (checked: boolean) => {
    setSelectedDomains(checked ? filteredDomains.map(d => d.id) : []);
  };
  
  const handleSelectSslCert = (id: string, checked: boolean) => {
    setSelectedSslCerts(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };
  
  const handleSelectAllSslCerts = (checked: boolean) => {
    setSelectedSslCerts(checked ? filteredSSL.map(s => s.id) : []);
  };

  const getStatusColor = (status: Status) => {
    switch (status) {
      case Status.HEALTHY: return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case Status.WARNING: return 'text-amber-600 bg-amber-50 border-amber-100';
      case Status.CRITICAL: return 'text-rose-600 bg-rose-50 border-rose-100';
      case Status.EXPIRED: return 'text-slate-600 bg-slate-100 border-slate-200';
      default: return 'text-slate-600 bg-slate-100 border-slate-200';
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (!sortConfig || sortConfig.key !== column) return <svg className="w-3 h-3 text-slate-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return sortConfig.direction === 'asc' ? <svg className="w-3 h-3 text-blue-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" /></svg> : <svg className="w-3 h-3 text-blue-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>;
  };

  const formatLastChecked = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString();
  };

  if (isInitialLoad) return null;
  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <Sidebar currentView={view} onViewChange={(v) => { setView(v); setFilterType('all'); setPassMsg(null); setSortConfig(null); }} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-slate-800">
              {view === 'dashboard' ? 'Overview' : view === 'domains' ? 'Domains' : view === 'ssl' ? 'SSL' : 'Settings'}
            </h1>
            {isSyncing && (
              <div className="flex items-center gap-2 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold uppercase">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Syncing Portfolio...
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={handleManualSync} 
              disabled={isSyncing}
              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-lg transition-all"
              title="Sync All Data"
            >
              <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold text-slate-800 leading-tight">{user.username}</p>
                <button onClick={handleLogout} className="text-[10px] text-slate-500 hover:text-rose-500 uppercase font-bold tracking-wider">Sign Out</button>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold uppercase">{user.username.charAt(0)}</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {view === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <StatCard title="Total Domains" value={stats.totalDomains} colorClass="text-blue-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>} />
                <StatCard title="SSL Certificates" value={stats.totalSSL} colorClass="text-indigo-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>} />
                <StatCard title="Domains Expiring (30d)" value={stats.expiringDomains30} colorClass="text-rose-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} onClick={() => navigateToFiltered('domains', 'expiring')} />
                <StatCard title="SSL Expiring (30d)" value={stats.expiringSSL30} colorClass="text-rose-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} onClick={() => navigateToFiltered('ssl', 'expiring')} />
                <StatCard title="Expired Domains" value={stats.expiredDomains} colorClass="text-slate-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} onClick={() => navigateToFiltered('domains', 'expired')} />
                <StatCard title="Expired SSLs" value={stats.expiredSSLs} colorClass="text-slate-500" icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} onClick={() => navigateToFiltered('ssl', 'expired')} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Domain Pulse</h3>
                    <button onClick={() => setShowAddDomain(true)} className="text-xs font-bold text-blue-600 hover:underline">Track New Domain</button>
                  </div>
                  {domains.length === 0 ? <p className="text-slate-400 italic text-center py-10">Add a domain to monitor registration.</p> : (
                    <div className="space-y-3">
                      {domains.slice(0, 5).map(d => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div><p className="text-sm font-bold text-slate-800">{d.name}</p><p className="text-[10px] text-slate-500">Last Checked: {formatLastChecked(d.lastChecked)}</p></div>
                          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(d.status)}`}>{d.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">SSL Portfolio</h3>
                    <button onClick={() => setShowAddSSL(true)} className="text-xs font-bold text-indigo-600 hover:underline">Track New SSL</button>
                  </div>
                  {sslCerts.length === 0 ? <p className="text-slate-400 italic text-center py-10">Add a host to monitor SSL status.</p> : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {sslCerts.slice(0, 5).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div><p className="text-sm font-bold text-slate-800">{s.domain}</p><p className="text-[10px] text-slate-500">Last Checked: {formatLastChecked(s.lastChecked)}</p></div>
                          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(s.status)}`}>{s.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'domains' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800">Domain Registrations</h2>
                <div className="flex items-center gap-2">
                  {selectedDomains.length > 0 && (
                    <button onClick={handleBulkDeleteDomains} className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete ({selectedDomains.length})
                    </button>
                  )}
                  <button onClick={() => setShowBulkImport('domains')} className="bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Bulk Import
                  </button>
                  <button onClick={() => setShowAddDomain(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    Track Domain
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4 w-12 text-center"><input type="checkbox" className="w-4 h-4 rounded text-blue-600" onChange={e => handleSelectAllDomains(e.target.checked)} checked={filteredDomains.length > 0 && selectedDomains.length === filteredDomains.length} /></th>
                      <th onClick={() => requestSort('name')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Domain <SortIcon column="name" /></div></th>
                      <th onClick={() => requestSort('managedBy')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Managed By <SortIcon column="managedBy" /></div></th>
                      <th onClick={() => requestSort('registrar')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Registrar <SortIcon column="registrar" /></div></th>
                      <th onClick={() => requestSort('expiryDate')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Expiry <SortIcon column="expiryDate" /></div></th>
                      <th onClick={() => requestSort('status')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Status <SortIcon column="status" /></div></th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDomains.map(d => (
                      <tr key={d.id} className={`hover:bg-slate-50/50 transition-colors ${selectedDomains.includes(d.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 text-center"><input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={selectedDomains.includes(d.id)} onChange={e => handleSelectDomain(d.id, e.target.checked)} /></td>
                        <td className="px-6 py-4 font-bold text-slate-800 text-sm">{d.name}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{d.managedBy || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{d.registrar}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{d.expiryDate}</td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(d.status)}`}>{d.status}</span></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                             <button onClick={() => setEditingDomain(d)} className="text-slate-400 hover:text-blue-500 transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => handleDeleteDomain(d.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === 'ssl' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800">SSL Portfolio</h2>
                <div className="flex items-center gap-2">
                  {selectedSslCerts.length > 0 && (
                    <button onClick={handleBulkDeleteSslCerts} className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete ({selectedSslCerts.length})
                    </button>
                  )}
                  <button onClick={() => setShowBulkImport('ssl')} className="bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Bulk Import
                  </button>
                  <button onClick={() => setShowAddSSL(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    Track SSL
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4 w-12 text-center"><input type="checkbox" className="w-4 h-4 rounded text-blue-600" onChange={e => handleSelectAllSslCerts(e.target.checked)} checked={filteredSSL.length > 0 && selectedSslCerts.length === filteredSSL.length} /></th>
                      <th onClick={() => requestSort('expiryDate')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Expiry <SortIcon column="expiryDate" /></div></th>
                      <th onClick={() => requestSort('domain')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Domain <SortIcon column="domain" /></div></th>
                      <th onClick={() => requestSort('issuer')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Issued By <SortIcon column="issuer" /></div></th>
                      <th onClick={() => requestSort('managedBy')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Managed By <SortIcon column="managedBy" /></div></th>
                      <th onClick={() => requestSort('host')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Host <SortIcon column="host" /></div></th>
                      <th onClick={() => requestSort('ipAddress')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">IP Address <SortIcon column="ipAddress" /></div></th>
                      <th onClick={() => requestSort('status')} className="group cursor-pointer px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="flex items-center">Status <SortIcon column="status" /></div></th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSSL.map(s => (
                      <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${selectedSslCerts.includes(s.id) ? 'bg-indigo-50' : ''}`}>
                        <td className="px-4 text-center"><input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={selectedSslCerts.includes(s.id)} onChange={e => handleSelectSslCert(s.id, e.target.checked)} /></td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{s.expiryDate}</td>
                        <td className="px-6 py-4 font-bold text-slate-800 text-sm">{s.domain}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{s.issuer}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{s.managedBy}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{s.host}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm font-mono">{s.ipAddress || 'N/A'}</td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(s.status)}`}>{s.status}</span></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditingSSL(s)} className="text-slate-400 hover:text-blue-500 transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => handleDeleteSSL(s.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
              <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Email & SMTP Setup</h3>
                </div>
                
                <form onSubmit={handleSaveSettings} className="space-y-6">
                  {settingsMsg && (
                    <div className={`p-4 rounded-lg text-sm font-medium ${settingsMsg.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {settingsMsg.text}
                      {settingsMsg.previewUrl && (
                        <a href={settingsMsg.previewUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold underline hover:text-emerald-700">View Preview Email</a>
                      )}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">SMTP Configuration</h4>
                        <button type="button" onClick={handleGenerateCreds} disabled={isGeneratingCreds} className="text-xs font-bold text-blue-600 hover:underline disabled:opacity-50">
                          {isGeneratingCreds ? 'Generating...' : 'Use Test Credentials'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="SMTP Host" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.host} onChange={e => setSmtpSettings({...smtpSettings, host: e.target.value})} />
                        <input type="text" placeholder="Port" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.port} onChange={e => setSmtpSettings({...smtpSettings, port: e.target.value})} />
                      </div>
                      <input type="email" placeholder="From Email Address" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.fromEmail} onChange={e => setSmtpSettings({...smtpSettings, fromEmail: e.target.value})} />
                      <input type="email" placeholder="Alert Recipient Email" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.toEmail} onChange={e => setSmtpSettings({...smtpSettings, toEmail: e.target.value})} />

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={smtpSettings.secure} onChange={e => setSmtpSettings({...smtpSettings, secure: e.target.checked})} />
                          Use SSL/TLS
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={smtpSettings.useAuth} onChange={e => setSmtpSettings({...smtpSettings, useAuth: e.target.checked})} />
                          Use Authentication
                        </label>
                      </div>

                      {smtpSettings.useAuth && (
                        <div className="grid grid-cols-2 gap-4">
                          <input type="text" placeholder="Username" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.user} onChange={e => setSmtpSettings({...smtpSettings, user: e.target.value})} />
                          <input type="password" placeholder="Password" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={smtpSettings.pass} onChange={e => setSmtpSettings({...smtpSettings, pass: e.target.value})} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Notification Thresholds</h4>
                      <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer">
                        <input type="checkbox" className="w-5 h-5 rounded text-blue-600" checked={notifSettings.enabled} onChange={e => setNotifSettings({...notifSettings, enabled: e.target.checked})} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800">Enable Email Alerts</p>
                          <p className="text-[10px] text-slate-500 uppercase font-black">Daily check automation</p>
                        </div>
                      </label>
                      
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Send alerts when:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'expired', label: 'Expired' },
                            { id: 'day7', label: '7 Days Before' },
                            { id: 'day15', label: '15 Days Before' },
                            { id: 'day30', label: '30 Days Before' }
                          ].map(opt => (
                            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={notifSettings.intervals[opt.id as keyof typeof notifSettings.intervals]} onChange={e => setNotifSettings({...notifSettings, intervals: {...notifSettings.intervals, [opt.id]: e.target.checked}})} />
                              <span className="text-sm text-slate-700">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center gap-4">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                      Save Alert Configuration
                    </button>
                    <button 
                      type="button" 
                      onClick={handleTestSmtp}
                      disabled={isTestingSmtp}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2 rounded-lg font-bold active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isTestingSmtp ? 'Sending...' : 'Send Test Email'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-slate-100 p-2 rounded-lg text-slate-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Security Credentials</h3>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                   {passMsg && <div className={`p-4 rounded-lg text-sm font-medium ${passMsg.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{passMsg.text}</div>}
                   <input type="password" placeholder="Current Password" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={oldPass} onChange={e => setOldPass(e.target.value)} />
                   <input type="password" placeholder="New Password" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={newPass} onChange={e => setNewPass(e.target.value)} />
                   <input type="password" placeholder="Confirm Password" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
                   <button type="submit" className="bg-slate-900 text-white px-8 py-2 rounded-lg font-bold shadow-lg shadow-slate-900/20 active:scale-95 transition-transform">Update Password</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Domain Modal */}
      {showAddDomain && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 border-t-4 border-blue-600">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Track Registration</h3>
              <button onClick={() => setShowAddDomain(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-6">Enter a domain to monitor its WHOIS and registration status.</p>
            <form onSubmit={handleAddDomain} className="space-y-4">
               <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Domain Name (Required)</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="domain.com"
                  value={domainQuery}
                  onChange={(e) => setDomainQuery(e.target.value)}
                />
              </div>
               <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Managed By (Optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Personal, Client Project"
                  value={domainManagedBy}
                  onChange={(e) => setDomainManagedBy(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={isVerifyingDomain}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isVerifyingDomain ? 'Running WHOIS Check...' : 'Add Domain Tracking'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add SSL Modal */}
      {showAddSSL && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 border-t-4 border-indigo-600">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Track SSL Certificate</h3>
              <button onClick={() => setShowAddSSL(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-6">Enter a domain to track. You can specify a different host (like an IP) to connect to for verification.</p>
            <form onSubmit={handleAddSSL} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Domain (Required)</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="example.com"
                  value={newSslData.domain}
                  onChange={(e) => setNewSslData({...newSslData, domain: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Host (Optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newSslData.host}
                  onChange={(e) => setNewSslData({...newSslData, host: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Managed By (Optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Cloudflare"
                  value={newSslData.managedBy}
                  onChange={(e) => setNewSslData({...newSslData, managedBy: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">IP Address (Optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 mt-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Auto-discovered if empty"
                  value={newSslData.ipAddress}
                  onChange={(e) => setNewSslData({...newSslData, ipAddress: e.target.value})}
                />
              </div>
              <button
                type="submit"
                disabled={isVerifyingSSL}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isVerifyingSSL ? 'Verifying & Adding...' : 'Add SSL Tracking'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modals */}
      {editingDomain && (
        <EditDomainModal
          domain={editingDomain}
          onClose={() => setEditingDomain(null)}
          onSave={handleUpdateDomain}
        />
      )}
      {editingSSL && (
        <EditSSLModal 
          ssl={editingSSL} 
          onClose={() => setEditingSSL(null)} 
          onSave={handleUpdateSSL} 
        />
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          type={showBulkImport}
          onClose={() => setShowBulkImport(null)}
          onImport={handleBulkImport}
        />
      )}
    </div>
  );
};

interface EditDomainModalProps {
  domain: Domain;
  onClose: () => void;
  onSave: (domain: Domain) => void;
}

const EditDomainModal: React.FC<EditDomainModalProps> = ({ domain, onClose, onSave }) => {
  const [formData, setFormData] = useState<Domain>(domain);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 border-t-4 border-blue-600">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">Edit Domain</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Domain Name</label>
            <input name="name" value={formData.name} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Managed By</label>
            <input name="managedBy" value={formData.managedBy || ''} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2 rounded-lg font-bold">Cancel</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-all">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};


interface EditSSLModalProps {
  ssl: SSLCertificate;
  onClose: () => void;
  onSave: (ssl: SSLCertificate) => void;
}

const EditSSLModal: React.FC<EditSSLModalProps> = ({ ssl, onClose, onSave }) => {
  const [formData, setFormData] = useState<SSLCertificate>(ssl);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 border-t-4 border-indigo-600">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">Edit SSL Certificate</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Domain</label>
            <input name="domain" value={formData.domain} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
           <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Host</label>
            <input name="host" value={formData.host} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Managed By</label>
            <input name="managedBy" value={formData.managedBy} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">IP Address</label>
            <input name="ipAddress" value={formData.ipAddress || ''} onChange={handleChange} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2 rounded-lg font-bold">Cancel</button>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-all">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
