
import { UserData, Domain, SSLCertificate, SMTPSettings, NotificationSettings, AlertLog } from '../types';

const API_BASE = '/api';
const FALLBACK_DATA_PREFIX = 'simpletrack_data_';

export const loadAllData = async (userId: string): Promise<UserData> => {
  try {
    const response = await fetch(`${API_BASE}/data/${userId}`);
    if (response.ok) {
      const data = await response.json();
      return {
        domains: data.domains || [],
        sslCerts: data.sslCerts || [],
        smtpSettings: data.settings?.smtp,
        notificationSettings: data.settings?.notifications,
        alertLogs: data.logs || []
      };
    }
  } catch (err) {
    console.warn("Data backend unreachable, loading from Local Storage.");
  }

  const localData = localStorage.getItem(`${FALLBACK_DATA_PREFIX}${userId}`);
  if (localData) return JSON.parse(localData);
  
  return { domains: [], sslCerts: [], alertLogs: [] };
};

export const syncAllData = async (userId: string) => {
  const response = await fetch(`${API_BASE}/sync/${userId}`, { method: 'POST' });
  if (!response.ok) throw new Error("Sync failed");
  return response.json();
};

const syncLocalData = (userId: string, updateFn: (data: UserData) => UserData) => {
  const current = localStorage.getItem(`${FALLBACK_DATA_PREFIX}${userId}`);
  let data: UserData = current ? JSON.parse(current) : { domains: [], sslCerts: [], alertLogs: [] };
  data = updateFn(data);
  localStorage.setItem(`${FALLBACK_DATA_PREFIX}${userId}`, JSON.stringify(data));
};

export const saveDomain = async (userId: string, domain: Domain) => {
  try {
    const response = await fetch(`${API_BASE}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, domain })
    });
    if (response.ok) return;
  } catch (err) {}

  syncLocalData(userId, (data) => ({ ...data, domains: [domain, ...data.domains] }));
};

export const updateDomain = async (userId: string, domain: Domain): Promise<Domain | null> => {
  try {
    const response = await fetch(`${API_BASE}/domains/${domain.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: domain.name,
        managedBy: domain.managedBy,
      })
    });
    if (response.ok) {
      const result = await response.json();
      return result.updatedDomain;
    }
     const error = await response.json();
     throw new Error(error.error || 'Failed to update domain');
  } catch (err) {
    console.error(err);
    // For local fallback, we just update with what we have
    syncLocalData(userId, (data) => ({ ...data, domains: data.domains.map(d => d.id === domain.id ? domain : d) }));
    return null; // Indicate that the server update failed
  }
};

export const deleteDomain = async (userId: string, domainId: string) => {
  try {
    const response = await fetch(`${API_BASE}/domains/${domainId}`, { method: 'DELETE' });
    if (response.ok) return;
  } catch (err) {}
  syncLocalData(userId, (data) => ({ ...data, domains: data.domains.filter(d => d.id !== domainId) }));
};

export const saveSSLCert = async (userId: string, ssl: SSLCertificate) => {
  try {
    const response = await fetch(`${API_BASE}/ssl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ssl })
    });
    if (response.ok) return;
  } catch (err) {}
  syncLocalData(userId, (data) => ({ ...data, sslCerts: [ssl, ...data.sslCerts] }));
};

export const deleteSSLCert = async (userId: string, sslId: string) => {
  try {
    const response = await fetch(`${API_BASE}/ssl/${sslId}`, { method: 'DELETE' });
    if (response.ok) return;
  } catch (err) {}
  syncLocalData(userId, (data) => ({ ...data, sslCerts: data.sslCerts.filter(s => s.id !== sslId) }));
};

export const updateSSLCert = async (userId: string, ssl: SSLCertificate) => {
  try {
    const response = await fetch(`${API_BASE}/ssl/${ssl.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: ssl.domain,
        managedBy: ssl.managedBy,
        host: ssl.host,
        ipAddress: ssl.ipAddress,
      })
    });
    if (response.ok) return;
  } catch (err) {}
  syncLocalData(userId, (data) => ({ ...data, sslCerts: data.sslCerts.map(s => s.id === ssl.id ? ssl : s) }));
};

export const saveSettings = async (userId: string, smtp: SMTPSettings, notifications: NotificationSettings) => {
  try {
    await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, smtp, notifications })
    });
  } catch (err) {}
  syncLocalData(userId, (data) => ({ ...data, smtpSettings: smtp, notificationSettings: notifications }));
};

export const generateTestSmtpCredentials = async (): Promise<Partial<SMTPSettings>> => {
  const response = await fetch(`${API_BASE}/settings/generate-test-credentials`, {
    method: 'POST',
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Failed to generate test credentials.');
  }
  return result;
}

export const testSmtpSettings = async (smtp: SMTPSettings) => {
  const response = await fetch(`${API_BASE}/settings/test-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smtp })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Failed to send test email.');
  }
  return result;
};

export const bulkImport = async (userId: string, type: 'domains' | 'ssl', data: Record<string, string>[]) => {
  const response = await fetch(`${API_BASE}/bulk-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, type, data })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Bulk import failed for ${type}.`);
  }
  return result;
}
