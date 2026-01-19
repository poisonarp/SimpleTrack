
import { Status } from "../types";

export const verifyDomainInfo = async (domainName: string) => {
  const response = await fetch('/api/verify/domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: domainName })
  });

  if (!response.ok) {
    throw new Error("Failed to verify domain data.");
  }

  return response.json();
};

export const verifySSLInfo = async (domainName: string) => {
  const response = await fetch('/api/verify/ssl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: domainName })
  });

  if (!response.ok) {
    throw new Error("Failed to verify SSL data. Make sure the host is reachable on port 443.");
  }

  return response.json();
};

export const getStatusFromDate = (expiryDate: string): Status => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return Status.EXPIRED;
  if (diffDays <= 7) return Status.CRITICAL;
  if (diffDays <= 30) return Status.WARNING;
  return Status.HEALTHY;
};
