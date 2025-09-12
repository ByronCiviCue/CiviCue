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

export interface ResumeState {
  pipeline: string;
  resume_token: string | null;
  last_processed_at: Date | null;
  updated_at: Date;
}

export interface SocrataDatasets {
  dataset_id: string;
  host: string;
  title: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  publisher: string | null;
  updated_at: Date | null;
  row_count: number | null;
  view_count: number | null;
  link: string | null;
  active: boolean;
  first_seen: Date;
  last_seen: Date;
}