export type UserRole = "worker" | "company";
export type ApplicationStatus = "applied" | "shortlisted" | "rejected" | "hired";
export type JobSchedule = "parcial" | "completa";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          name: string;
          city: string;
          phone: string | null;
          categories: string[] | null;
          experience: string | null;
          available_today: boolean;
          radius_km: number;
          photo_url: string | null;
          company_name: string | null;
          contact_name: string | null;
          cif: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          name: string;
          city: string;
          phone?: string | null;
          categories?: string[] | null;
          experience?: string | null;
          available_today?: boolean;
          radius_km?: number;
          photo_url?: string | null;
          company_name?: string | null;
          contact_name?: string | null;
          cif?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: UserRole;
          name?: string;
          city?: string;
          phone?: string | null;
          categories?: string[] | null;
          experience?: string | null;
          available_today?: boolean;
          radius_km?: number;
          photo_url?: string | null;
          company_name?: string | null;
          contact_name?: string | null;
          cif?: string | null;
          logo_url?: string | null;
          updated_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          category: string;
          city: string;
          description: string;
          schedule: JobSchedule;
          salary_text: string;
          start_date: string | null;
          urgent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          category: string;
          city: string;
          description: string;
          schedule: JobSchedule;
          salary_text: string;
          start_date?: string | null;
          urgent?: boolean;
          created_at?: string;
        };
        Update: {
          title?: string;
          category?: string;
          city?: string;
          description?: string;
          schedule?: JobSchedule;
          salary_text?: string;
          start_date?: string | null;
          urgent?: boolean;
        };
      };
      applications: {
        Row: {
          id: string;
          job_id: string;
          worker_id: string;
          status: ApplicationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          worker_id: string;
          status?: ApplicationStatus;
          created_at?: string;
        };
        Update: {
          status?: ApplicationStatus;
        };
      };
      chats: {
        Row: {
          id: string;
          job_id: string;
          company_id: string;
          worker_id: string;
          application_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          company_id: string;
          worker_id: string;
          application_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          sender_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          sender_id: string;
          text: string;
          created_at?: string;
        };
        Update: {
          text?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
