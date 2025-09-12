export interface SocrataHosts {
  host: string;
  region: 'US' | 'EU';
  last_seen: Date;
}

export interface SocrataDomains {
  domain: string;
  country: string | null;
  region: 'US' | 'EU';
  last_seen: Date;
}

export interface SocrataAgencies {
  host: string;
  name: string;
  type: string | null;
  created_at: Date;
}