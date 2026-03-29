export interface Member {
  id: string;
  name: string;
  relation: string;
  age: number;
}

export interface Medicine {
  id: string;
  name: string;
  dosage: string;
  frequency: string; // e.g., "Daily", "Twice Daily"
  memberId: string;
  expiryDate: string;
}

export interface Log {
  id: string;
  medicineId: string;
  date: string; // YYYY-MM-DD
  status: 'taken' | 'skipped' | 'pending';
  takenAt?: string;
}

export interface DashboardStats {
  completionRate: number;
  missedThisWeek: number;
}
