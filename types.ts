
export enum Status {
  HEALTHY = 'Healthy',
  WARNING = 'Warning',
  CRITICAL = 'Critical',
  EXPIRED = 'Expired'
}

export interface Domain {
  id: string;
  name: string;
  registrar: string;
  expiryDate: string;
  autoRenew: boolean;
  status: Status;
  lastChecked: string;
  managedBy?: string;
}

export interface SSLCertificate {
  id: string;
  domain: string;
  issuer: string;
  expiryDate: string;
  type: string;
  status: Status;
  managedBy: string;
  host: string;
  lastChecked: string;
  ipAddress?: string;
}

export interface SMTPSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromEmail: string;
  toEmail: string;
  secure: boolean;
  useAuth: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  intervals: {
    expired: boolean;
    day7: boolean;
    day15: boolean;
    day30: boolean;
  };
}

export interface AlertLog {
  id: string;
  timestamp: string;
  target: string;
  type: 'Domain' | 'SSL';
  interval: string;
  status: 'Sent' | 'Failed';
}

export type ViewType = 'dashboard' | 'domains' | 'ssl' | 'settings-smtp' | 'settings-password';

export interface User {
  id: string;
  username: string;
}

export interface UserData {
  domains: Domain[];
  sslCerts: SSLCertificate[];
  smtpSettings?: SMTPSettings;
  notificationSettings?: NotificationSettings;
  alertLogs?: AlertLog[];
}
