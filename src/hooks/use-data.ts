import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { Supplier, Delivery, Payment, SupplierSummary, Purchase, PurchaseItem } from "@/types";

const CACHE_KEY = "suppliertrack/global";
const PAGE_SIZE = 1000;

export interface AppData {
  suppliers: Supplier[];
  deliveries: Delivery[];
  payments: Payment[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  summaries: SupplierSummary[];
  materialsBySupplier: Record<string, string>;
}

async function fetchAllRows<T>(table: string, orderColumn: string, ascending: boolean): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchAll(): Promise<AppData> {
  const [
    suppliers,
    deliveries,
    payments,
    purchases,
    purchaseItems,
  ] = await Promise.all([
    fetchAllRows<Supplier>("suppliers", "created_at", false),
    fetchAllRows<Delivery>("deliveries", "delivery_date", false),
    fetchAllRows<Payment>("payments", "payment_date", false),
    fetchAllRows<Purchase>("purchases", "purchase_date", false),
    fetchAllRows<PurchaseItem>("purchase_items", "id", true),
  ]);

  const sList = suppliers;
  const dList = deliveries;
  const pList = payments;
  const purList = purchases;
  const pItemList = purchaseItems;

  // Build lookup maps for O(1) access instead of O(n) filtering
  const deliveriesBySupplier = new Map<string, Delivery[]>();
  for (const d of dList) {
    const arr = deliveriesBySupplier.get(d.supplier_id) || [];
    arr.push(d);
    deliveriesBySupplier.set(d.supplier_id, arr);
  }

  const paymentsBySupplier = new Map<string, Payment[]>();
  for (const p of pList) {
    const arr = paymentsBySupplier.get(p.supplier_id) || [];
    arr.push(p);
    paymentsBySupplier.set(p.supplier_id, arr);
  }

  const purchasesBySupplier = new Map<string, Purchase[]>();
  for (const pur of purList) {
    const arr = purchasesBySupplier.get(pur.supplier_id) || [];
    arr.push(pur);
    purchasesBySupplier.set(pur.supplier_id, arr);
  }

  // Use recorded deliveries and purchase items as a display fallback when
  // older supplier rows do not have the optional material_type field filled.
  const purchaseItemsByPurchase = new Map<string, PurchaseItem[]>();
  for (const item of pItemList) {
    const arr = purchaseItemsByPurchase.get(item.purchase_id) || [];
    arr.push(item);
    purchaseItemsByPurchase.set(item.purchase_id, arr);
  }

  const materialNamesBySupplier = new Map<string, Set<string>>();
  const addMaterial = (supplierId: string, materialName?: string) => {
    const name = materialName?.trim();
    if (!name) return;
    const materials = materialNamesBySupplier.get(supplierId) || new Set<string>();
    materials.add(name);
    materialNamesBySupplier.set(supplierId, materials);
  };

  for (const delivery of dList) addMaterial(delivery.supplier_id, delivery.material_name);
  for (const purchase of purList) {
    for (const item of purchaseItemsByPurchase.get(purchase.id) || []) {
      addMaterial(purchase.supplier_id, item.item_name);
    }
  }

  const materialsBySupplier: Record<string, string> = {};
  materialNamesBySupplier.forEach((materials, supplierId) => {
    materialsBySupplier[supplierId] = Array.from(materials).join(", ");
  });

  const summaries: SupplierSummary[] = sList.map((s) => {
    const sDeliveries = deliveriesBySupplier.get(s.id) || [];
    const sPayments = paymentsBySupplier.get(s.id) || [];
    const sPurchases = purchasesBySupplier.get(s.id) || [];

    const opening_balance = Number(s.opening_balance) || 0;
    const total_delivered = opening_balance + sDeliveries.reduce(
      (acc, d) => acc + (Number(d.total_value) || 0),
      0
    ) + sPurchases.reduce(
      (acc, pur) => acc + (Number(pur.total_amount) || 0),
      0
    );
    
    const total_paid = sPayments.reduce(
      (acc, p) => acc + (Number(p.amount) || 0),
      0
    ) + sPurchases.reduce(
      (acc, pur) => acc + (Number(pur.payment_amount) || 0),
      0
    );

    return {
      id: s.id,
      name: s.name,
      contact_person: s.contact_person,
      material_type: s.material_type?.trim() || materialsBySupplier[s.id] || undefined,
      phone: s.phone,
      opening_balance,
      total_delivered,
      total_paid,
      balance_due: total_delivered - total_paid,
    };
  });

  return {
    suppliers: sList,
    deliveries: dList,
    payments: pList,
    purchases: purList,
    purchaseItems: pItemList,
    summaries,
    materialsBySupplier,
  };
}

export function useAppData() {
  const { data, error, isLoading, mutate } = useSWR<AppData>(
    CACHE_KEY,
    fetchAll,
    {
      revalidateOnFocus: false,        // Don't refresh when tab gains focus
      revalidateOnReconnect: false,    // Don't refresh on network reconnect
      dedupingInterval: 5000,          // Dedupe requests within 5 seconds
      refreshInterval: 0,              // NO auto-refresh - manual only
      keepPreviousData: true,          // Show cached data while fetching
      suspense: false,                 // Don't use suspense
    }
  );

  return {
    data: data || {
      suppliers: [],
      deliveries: [],
      payments: [],
      purchases: [],
      purchaseItems: [],
      summaries: [],
      materialsBySupplier: {},
    },
    isLoading,
    error,
    mutate,
  };
}

export function useRefreshAppData() {
  const { mutate } = useSWR(CACHE_KEY);
  return () => mutate();
}
