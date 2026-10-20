import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { Employee, SalaryMonth, SalaryTransaction } from "@/types";

// ─── Cache Keys ──────────────────────────────────────────────
const STAFF_CACHE_KEY = "suppliertrack/staff";
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: string,
  columns: string,
  orderColumn: string,
  ascending: boolean
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchEmployeeRows<T>(
  table: string,
  columns: string,
  employeeId: string
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("employee_id", employeeId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

// ─── Data Shape ──────────────────────────────────────────────
export interface StaffData {
  employees: Employee[];
  salaryMonths: SalaryMonth[];
  transactions: SalaryTransaction[];
}

// ─── Fetcher ─────────────────────────────────────────────────
async function fetchStaffData(): Promise<StaffData> {
  const [employees, salaryMonths, transactions] = await Promise.all([
    fetchAllRows<Employee>("employees", "*", "created_at", false),
    fetchAllRows<SalaryMonth>("salary_months", "*, employees(name)", "id", true),
    fetchAllRows<SalaryTransaction>(
      "salary_transactions",
      "*, employees(name), salary_months(month, year)",
      "date",
      false
    ),
  ]);

  return {
    employees: (employees || []) as Employee[],
    salaryMonths: (salaryMonths || []) as SalaryMonth[],
    transactions: (transactions || []) as SalaryTransaction[],
  };
}

// ─── Hook: All Staff Data ────────────────────────────────────
// Used by /staff and /staff/payroll pages
export function useStaffData() {
  const { data, error, isLoading, mutate } = useSWR<StaffData>(
    STAFF_CACHE_KEY,
    fetchStaffData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000,
      refreshInterval: 0,
      keepPreviousData: true,
      suspense: false,
    }
  );

  return {
    data: data || { employees: [], salaryMonths: [], transactions: [] },
    isLoading,
    error,
    mutate,
  };
}

// ─── Hook: Single Employee Detail ────────────────────────────
// Used by /staff/[id] page — fetches one employee + their months + transactions
export function useEmployeeDetail(employeeId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    employeeId ? `suppliertrack/staff/${employeeId}` : null,
    async () => {
      if (!employeeId) return null;

      const [{ data: employee, error: eErr }, months, txns] = await Promise.all([
        supabase
          .from("employees")
          .select("*")
          .eq("id", employeeId)
          .single(),
        fetchEmployeeRows<SalaryMonth>("salary_months", "*", employeeId),
        fetchEmployeeRows<SalaryTransaction>("salary_transactions", "*", employeeId),
      ]);

      if (eErr) throw eErr;

      return {
        employee: employee as Employee,
        salaryMonths: months,
        transactions: txns,
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000,
      refreshInterval: 0,
      keepPreviousData: true,
      suspense: false,
    }
  );

  return {
    data: data || null,
    isLoading,
    error,
    mutate,
  };
}

// ─── Refresh helper ──────────────────────────────────────────
export function useRefreshStaffData() {
  const { mutate } = useSWR(STAFF_CACHE_KEY);
  return () => mutate();
}
