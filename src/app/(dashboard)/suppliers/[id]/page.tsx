"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { Supplier, Delivery, Payment, Purchase, PurchaseItem } from "@/types";
import { formatSAR, downloadExcel, downloadPDF } from "@/lib/format-utils";
import {
  Loader2,
  ArrowLeft,
  Package,
  CreditCard,
  Edit2,
  Plus,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import QuickUpdatePopup from "@/components/QuickUpdatePopup";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const PAGE_SIZE = 1000;

async function fetchSupplierRows<T>(
  table: string,
  supplierId: string,
  orderColumn: string
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("supplier_id", supplierId)
      .order(orderColumn, { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchPurchaseItems(purchaseIds: string[]): Promise<PurchaseItem[]> {
  const rows: PurchaseItem[] = [];
  const chunkSize = 100;

  for (let start = 0; start < purchaseIds.length; start += chunkSize) {
    const ids = purchaseIds.slice(start, start + chunkSize);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .in("purchase_id", ids)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data || []) as PurchaseItem[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [quickUpdateOpen, setQuickUpdateOpen] = useState(false);
  const [quickUpdateTab, setQuickUpdateTab] = useState<"stock" | "payment">("stock");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Period filters (year / month / custom / all)
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => String(currentYear - i)), [currentYear]);
  const months = useMemo(
    () => [
      { value: "01", label: "January" },
      { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
      { value: "11", label: "November" },
      { value: "12", label: "December" },
    ],
    []
  );
  const [periodType, setPeriodType] = useState<"all" | "year" | "month" | "custom">("year");
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editForm, setEditForm] = useState<Partial<Supplier>>({});
  const [editErrors, setEditErrors] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const supplierId = Array.isArray(id) ? id[0] : id;
      if (!supplierId) return;

      const { data: sData, error: sError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (sError) throw sError;
      setSupplier(sData);
      setEditForm(sData || {});

      const [dData, pData, purData] = await Promise.all([
        fetchSupplierRows<Delivery>("deliveries", supplierId, "delivery_date"),
        fetchSupplierRows<Payment>("payments", supplierId, "payment_date"),
        fetchSupplierRows<Purchase>("purchases", supplierId, "purchase_date"),
      ]);
      setDeliveries(dData);
      setPayments(pData);
      setPurchases(purData);

      const piData = purData.length > 0
        ? await fetchPurchaseItems(purData.map((purchase) => purchase.id))
        : [];
      setPurchaseItems(piData);
    } catch (error: unknown) {
      toast({
        title: "Error loading supplier",
        description: (error as Error)?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute period range
  const period = useMemo(() => {
    if (periodType === "all") return { from: "", to: "", label: "All Time" };
    if (periodType === "year") return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31`, label: selectedYear };
    if (periodType === "month") {
      const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
      const label = `${months.find((m) => m.value === selectedMonth)?.label} ${selectedYear}`;
      return { from: `${selectedYear}-${selectedMonth}-01`, to: `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, "0")}`, label };
    }
    return { from: customFrom, to: customTo, label: customFrom || customTo ? `${customFrom || "Start"} to ${customTo || "Today"}` : "Custom" };
  }, [periodType, selectedYear, selectedMonth, customFrom, customTo, months]);

  // Filter deliveries and payments by computed period
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      const date = new Date(d.delivery_date);
      if (period.from && date < new Date(period.from)) return false;
      if (period.to && date > new Date(period.to)) return false;
      return true;
    });
  }, [deliveries, period]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const date = new Date(p.payment_date);
      if (period.from && date < new Date(period.from)) return false;
      if (period.to && date > new Date(period.to)) return false;
      return true;
    });
  }, [payments, period]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const date = new Date(p.purchase_date);
      if (period.from && date < new Date(period.from)) return false;
      if (period.to && date > new Date(period.to)) return false;
      return true;
    });
  }, [purchases, period]);

  const openingBalance = Number(supplier?.opening_balance) || 0;
  const totalDelivered = openingBalance + filteredDeliveries.reduce(
    (acc: number, curr: Delivery) => acc + (Number(curr.total_value) || 0),
    0
  ) + filteredPurchases.reduce(
    (acc: number, curr: Purchase) => acc + (Number(curr.total_amount) || 0),
    0
  );
  
  const totalPaid = filteredPayments.reduce(
    (acc: number, curr: Payment) => acc + (Number(curr.amount) || 0),
    0
  ) + filteredPurchases.reduce(
    (acc: number, curr: Purchase) => acc + (Number(curr.payment_amount) || 0),
    0
  );
  const balanceDue = totalDelivered - totalPaid;
  
  const isFullyPaid = balanceDue <= 0 && totalDelivered > 0;

  type CombinedStockItem = {
    id: string;
    date: string;
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_value: number;
    type: "Delivery" | "Purchase";
  };

  const combinedStock = useMemo<CombinedStockItem[]>(() => {
    const list = [
      ...filteredDeliveries.map(d => ({
        id: d.id,
        date: d.delivery_date,
        material_name: d.material_name,
        quantity: d.quantity,
        unit: d.unit,
        unit_price: d.unit_price,
        total_value: d.total_value,
        type: "Delivery" as const
      })),
      ...filteredPurchases.flatMap(p => 
        purchaseItems.filter(pi => pi.purchase_id === p.id).map(pi => ({
          id: pi.id,
          date: p.purchase_date,
          material_name: pi.item_name,
          quantity: pi.quantity,
          unit: "pcs",
          unit_price: pi.unit_price,
          total_value: pi.total_price,
          type: "Purchase" as const
        }))
      )
    ];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredDeliveries, filteredPurchases, purchaseItems]);

  // Delivery edit state
  type DeliveryEditForm = {
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    delivery_date: string;
    notes: string;
  };
  const [editDelivery, setEditDelivery] = useState<Delivery | null>(null);
  const [editDeliveryForm, setEditDeliveryForm] = useState<DeliveryEditForm>({
    material_name: "",
    quantity: 0,
    unit: "units",
    unit_price: 0,
    delivery_date: "",
    notes: "",
  });

  const startEditDelivery = (d: CombinedStockItem) => {
    if (d.type !== "Delivery") return;
    const originalDelivery = deliveries.find((item) => item.id === d.id);
    if (!originalDelivery) return;

    setEditDelivery(originalDelivery);
    setEditDeliveryForm({
      material_name: originalDelivery.material_name,
      quantity: Number(originalDelivery.quantity) || 0,
      unit: originalDelivery.unit || "units",
      unit_price: Number(originalDelivery.unit_price) || 0,
      delivery_date: originalDelivery.delivery_date,
      notes: originalDelivery.notes || "",
    });
  };

  const handleSaveDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDelivery) return;
    try {
      const quantity = Number(editDeliveryForm.quantity) || 0;
      const unitPrice = Number(editDeliveryForm.unit_price) || 0;
      const { error } = await supabase.from("deliveries").update({
        material_name: editDeliveryForm.material_name,
        quantity,
        unit: editDeliveryForm.unit,
        unit_price: unitPrice,
        total_value: quantity * unitPrice,
        delivery_date: editDeliveryForm.delivery_date,
        notes: editDeliveryForm.notes || null,
      }).eq("id", editDelivery.id);
      if (error) throw error;
      toast({ title: "Updated", description: "Delivery entry updated." });
      setEditDelivery(null);
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error)?.message || "Failed to update delivery", variant: "destructive" });
    }
  };

  const combinedPayments = useMemo(() => {
    const list = [
      ...filteredPayments.map(p => ({
        id: p.id,
        date: p.payment_date,
        amount: p.amount,
        method: p.payment_method,
        reference: p.reference_number
      })),
      ...filteredPurchases.filter(p => Number(p.payment_amount) > 0).map(p => ({
        id: `pay-${p.id}`,
        date: p.purchase_date,
        amount: p.payment_amount,
        method: "Purchase Payment",
        reference: p.branch
      }))
    ];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredPayments, filteredPurchases]);

  type ProductSummaryEntry = { name: string; quantity: number; unit: string };

  const itemsBroughtSummary = useMemo<ProductSummaryEntry[]>(() => {
    const itemsMap = new Map<string, { quantity: number; unit: string }>();

    filteredDeliveries.forEach((d) => {
      if (!d.material_name) return;
      const key = d.material_name.trim();
      const existing = itemsMap.get(key) || { quantity: 0, unit: d.unit || "units" };
      itemsMap.set(key, {
        quantity: existing.quantity + Number(d.quantity || 0),
        unit: existing.unit || d.unit || "units",
      });
    });

    filteredPurchases.forEach((pur) => {
      const purItems = purchaseItems.filter((pi) => pi.purchase_id === pur.id);
      purItems.forEach((pi) => {
        if (!pi.item_name) return;
        const key = pi.item_name.trim();
        const existing = itemsMap.get(key) || { quantity: 0, unit: "pcs" };
        itemsMap.set(key, {
          quantity: existing.quantity + Number(pi.quantity || 0),
          unit: existing.unit || "pcs",
        });
      });
    });

    return Array.from(itemsMap.entries()).map(([name, value]) => ({
      name,
      quantity: value.quantity,
      unit: value.unit,
    }));
  }, [filteredDeliveries, filteredPurchases, purchaseItems]);

  const isMissingOpeningBalanceColumnError = (message: string) =>
    /opening_balance|column.*does not exist|does not exist in the schema/i.test(message);

  const buildSupplierEditPayload = (includeOpeningBalance = true) => {
    const basePayload = {
      name: editForm.name?.trim() || supplier?.name || "",
      contact_person: editForm.contact_person?.trim() || null,
      phone: editForm.phone?.trim() || null,
      material_type: editForm.material_type?.trim() || null,
      notes: editForm.notes?.trim() || null,
    };

    return includeOpeningBalance
      ? { ...basePayload, opening_balance: Number(editForm.opening_balance) || 0 }
      : basePayload;
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.name?.trim()) {
      setEditErrors({ name: true });
      return;
    }
    try {
      let result = await supabase
        .from("suppliers")
        .update(buildSupplierEditPayload())
        .eq("id", id)
        .select();

      if (result.error && isMissingOpeningBalanceColumnError(result.error.message)) {
        result = await supabase
          .from("suppliers")
          .update(buildSupplierEditPayload(false))
          .eq("id", id)
          .select();
      }

      if (result.error) throw new Error(result.error.message);
      toast({ title: "Updated", description: "Supplier info saved." });
      setIsEditModalOpen(false);
      fetchData();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: (error as Error)?.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      // Delete supplier (cascade will delete related deliveries and payments due to ON DELETE CASCADE)
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Supplier deleted",
        description: "All records for this supplier have been removed.",
      });

      // Redirect to suppliers list
      router.push("/suppliers");
    } catch (error: unknown) {
      toast({
        title: "Error deleting supplier",
        description: (error as Error)?.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  if (loading && !supplier) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-[#f59e0b]" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-6 text-center">
        <p className="text-[#64748b]">Supplier not found.</p>
        <Link href="/suppliers">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Suppliers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-44 max-w-[1400px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/suppliers"
            className="text-sm text-[#8faac3] hover:text-white flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {supplier.name}
            </h1>
            {isFullyPaid && (
              <span className="flex items-center gap-1 bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-sm font-bold">
                <CheckCircle className="w-4 h-4" /> Paid
              </span>
            )}
          </div>
          <p className="text-sm text-[#8faac3] mt-0.5">
            {supplier.material_type || "Supplier"} Provider
            {supplier.contact_person ? ` · ${supplier.contact_person}` : ""}
            {supplier.phone ? ` · ${supplier.phone}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setIsEditModalOpen(true)}
            className="border-[#e2e8f0] hover:bg-[#f8fafc] font-bold gap-1.5 min-h-[44px]"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit Info
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsDeleteModalOpen(true)}
            className="border-red-200 text-red-500 hover:bg-red-50 font-bold gap-1.5 min-h-[44px]"
          >
            Delete
          </Button>
          <Button
            onClick={() => {
              setQuickUpdateTab("stock");
              setQuickUpdateOpen(true);
            }}
            className="bg-[#f59e0b] hover:bg-amber-600 text-white font-bold gap-1.5 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> Update
          </Button>
        </div>
      </div>

      {/* Items Brought Summary */}
      {itemsBroughtSummary && (
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-[#f59e0b]" />
            <h2 className="text-lg font-bold text-white">Items Brought Summary</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {itemsBroughtSummary.map((entry) => (
              <div key={entry.name} className="rounded-lg border border-[#1e3464] bg-[#0d1526] p-3">
                <div className="text-xs uppercase tracking-wider text-[#8faac3]">{entry.name}</div>
                <div className="mt-1 text-sm font-semibold text-white">{entry.quantity} {entry.unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Period Filters & Download */}
      <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white font-bold">
            <Calendar className="w-4 h-4 text-[#f59e0b]" /> Filter by Period
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const stockData = filteredDeliveries.map((d) => ({
                  Date: format(new Date(d.delivery_date), "dd MMM yyyy"),
                  Material: d.material_name,
                  Quantity: `${d.quantity} ${d.unit}`,
                  "Price/Unit": formatSAR(Number(d.unit_price) || 0),
                  "Total Value": formatSAR(Number(d.total_value) || 0),
                }));
                const paymentData = filteredPayments.map((p) => ({
                  Date: format(new Date(p.payment_date), "dd MMM yyyy"),
                  Amount: formatSAR(Number(p.amount) || 0),
                  Method: p.payment_method,
                  Reference: p.reference_number || "-",
                }));
                downloadExcel(
                  [
                    { Type: "=== STOCK HISTORY ===" },
                    ...stockData,
                    {},
                    { Type: "=== PAYMENT HISTORY ===" },
                    ...paymentData,
                    {},
                    { Type: "=== SUMMARY ===" },
                    { Type: "Total Delivered", Value: formatSAR(totalDelivered) },
                    { Type: "Payment Paid", Value: formatSAR(totalPaid) },
                    { Type: "Payment Remaining", Value: formatSAR(balanceDue) },
                  ],
                  `${supplier.name}-${period.label}-Report`
                );
                toast({ title: "Excel Downloaded", description: "Report saved to your device." });
              }}
              className="border-[#10b981] text-[#10b981] hover:bg-emerald-50 font-bold text-xs h-9 gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const allHeaders = ["Date", "Type", "Description", "Amount"];
                const purchaseRows = filteredPurchases.flatMap((pur) => {
                  const purItems = purchaseItems.filter((pi) => pi.purchase_id === pur.id);
                  return purItems.length > 0
                    ? purItems.map((pi) => [
                        format(new Date(pur.purchase_date), "dd MMM yyyy"),
                        "PURCHASE",
                        `${pi.item_name} (${pi.quantity} pcs)`,
                        formatSAR(Number(pi.total_price) || 0),
                      ])
                    : [[
                        format(new Date(pur.purchase_date), "dd MMM yyyy"),
                        "PURCHASE",
                        `Purchase (${pur.branch})`,
                        formatSAR(Number(pur.total_amount) || 0),
                      ]];
                });

                const allData = [
                  ...filteredDeliveries.map((d) => [
                    format(new Date(d.delivery_date), "dd MMM yyyy"),
                    "STOCK",
                    `${d.material_name} (${d.quantity} ${d.unit})`,
                    formatSAR(Number(d.total_value) || 0),
                  ]),
                  ...purchaseRows,
                  ...filteredPayments.map((p) => [
                    format(new Date(p.payment_date), "dd MMM yyyy"),
                    "PAYMENT",
                    `${p.payment_method}${p.reference_number ? ` (${p.reference_number})` : ""}`,
                    formatSAR(Number(p.amount) || 0),
                  ]),
                ].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

                const totalProductQuantity = itemsBroughtSummary.reduce((sum, item) => sum + item.quantity, 0);
                const productSummary = itemsBroughtSummary.map((item) => ({
                  label: item.name,
                  value: `${item.quantity} ${item.unit}`,
                }));

                downloadPDF(
                  `${supplier.name} - Report`,
                  allHeaders,
                  allData,
                  `${supplier.name}-${period.label}-Report`,
                  [
                    ...productSummary,
                    { label: "Total Quantity", value: totalProductQuantity.toFixed(2) },
                    { label: "Total Amount", value: formatSAR(totalDelivered) },
                    { label: "Payment Paid", value: formatSAR(totalPaid) },
                    { label: "Payment Remaining", value: formatSAR(balanceDue) },
                  ]
                );
                toast({ title: "PDF Downloaded", description: "Report saved to your device." });
              }}
              className="border-red-400 text-red-500 hover:bg-red-50 font-bold text-xs h-9 gap-1.5"
            >
              <FileText className="w-4 h-4" /> PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Duration</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as "year" | "month" | "custom" | "all")}
              className="w-full h-9 bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 text-sm text-[#e2e8f0] outline-none">
              <option value="year">Yearly</option>
              <option value="month">Monthly</option>
              <option value="custom">Custom Duration</option>
              <option value="all">All Time</option>
            </select>
          </div>
          {(periodType === "year" || periodType === "month") && (
            <div>
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Year</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full h-9 bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 text-sm text-[#e2e8f0] outline-none">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
          )}
          {periodType === "month" && (
            <div>
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Month</label>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full h-9 bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 text-sm text-[#e2e8f0] outline-none">
                  {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
            </div>
          )}
          {periodType === "custom" && (
            <>
              <div>
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Start Date</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 bg-[#0d1526] border-[#1e3464] text-[#e2e8f0]" />
              </div>
              <div>
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">End Date</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 bg-[#0d1526] border-[#1e3464] text-[#e2e8f0]" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Two side-by-side sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Stock History */}
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl shadow-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e3464] bg-[#0a1422] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#8faac3] uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-[#f59e0b]" /> Stock History
              {combinedStock.length > 0 && (
                <span className="text-xs font-normal text-[#8faac3] bg-transparent px-2 py-0.5 rounded-full border border-[#1e3464]">
                  {combinedStock.length} items
                </span>
              )}
            </h2>
          </div>
          <div className="overflow-x-auto">
            {combinedStock.length === 0 ? (
              <div className="py-12 text-center text-[#64748b] text-sm">
                No stock entries yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#0a1422]">
                  <tr>
                    <th className="text-left px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Date
                    </th>
                    <th className="text-left px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Material
                    </th>
                    <th className="text-right px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Quantity
                    </th>
                    <th className="text-right px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Price/Unit
                    </th>
                    <th className="text-right px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Total Value
                    </th>
                    <th className="text-right px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {combinedStock.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-[#1e3464] hover:bg-[#162040] transition-colors"
                    >
                      <td className="px-5 py-3 text-[#8faac3] text-xs">
                        {format(new Date(d.date), "dd MMM yyyy")}
                        <div className="text-[9px] text-[#f59e0b] mt-0.5 uppercase tracking-wider">{d.type}</div>
                      </td>
                      <td className="px-5 py-3 font-semibold text-white">
                        {d.material_name}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-semibold">{d.quantity}</span>{" "}
                        <span className="text-[#8faac3] text-xs uppercase">
                          {d.unit}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[#8faac3] text-xs">
                        {formatSAR(Number(d.unit_price) || 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-[#3b82f6]">
                        {formatSAR(Number(d.total_value) || 0)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {d.type === "Delivery" && (
                          <button onClick={() => startEditDelivery(d)} className="w-8 h-8 rounded-lg bg-[#1e3464] hover:bg-[#2563eb] text-[#8faac3] hover:text-white transition-all inline-flex items-center justify-center">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {/* RIGHT — Payment History */}
        <div className="bg-[#0a1422] border border-[#1e3464] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e3464] bg-[#0a1422] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#8faac3] uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#10b981]" /> Payment History
              {combinedPayments.length > 0 && (
                <span className="text-xs font-normal text-[#8faac3] bg-transparent px-2 py-0.5 rounded-full border border-[#1e3464]">
                  {combinedPayments.length} items
                </span>
              )}
            </h2>
            <Button
              onClick={() => {
                setQuickUpdateTab("payment");
                setQuickUpdateOpen(true);
              }}
              className="bg-[#10b981] hover:bg-emerald-600 text-white font-bold text-xs h-8 px-3"
            >
              + Pay
            </Button>
          </div>
          <div className="overflow-x-auto">
            {combinedPayments.length === 0 ? (
              <div className="py-12 text-center text-[#8faac3] text-sm">
                No payment records yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#0a1422]">
                  <tr>
                    <th className="text-left px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Date
                    </th>
                    <th className="text-right px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Amount
                    </th>
                    <th className="text-left px-5 py-3 font-bold text-[#8faac3] text-xs">
                      Method
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {combinedPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-[#1e3464] hover:bg-[#162040] transition-colors"
                    >
                      <td className="px-5 py-3 text-[#8faac3] text-xs">
                        {format(new Date(p.date), "dd MMM yyyy")}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-white">
                        {formatSAR(Number(p.amount) || 0)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="capitalize text-[#8faac3] text-xs">
                          {p.method}
                        </span>
                        {p.reference && (
                          <span className="text-[#8faac3] text-xs ml-1">
                            ({p.reference})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Balance Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[220px] bg-[#0a1422] border-t border-[#1e3464] shadow-[0_-6px_30px_rgba(0,0,0,0.12)] z-30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-6 sm:gap-10 w-full sm:w-auto">
            <div className="text-center sm:text-left">
              <div className="text-[10px] font-bold text-[#8faac3] uppercase tracking-wider">
                Total Goods
              </div>
              <div className="text-lg font-bold text-white">
                {formatSAR(totalDelivered)}
              </div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-[#1e3464]" />
            <div className="text-center sm:text-left">
              <div className="text-[10px] font-bold text-[#8faac3] uppercase tracking-wider">
                Payment Paid
              </div>
              <div className="text-lg font-bold text-white">
                {formatSAR(totalPaid)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-center sm:text-right">
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                Payment Remaining
              </div>
              <div className="text-xl font-bold text-red-500">
                {formatSAR(balanceDue)}
              </div>
              <div className="text-xs text-[#8faac3] mt-0.5">
                {balanceDue > 0 ? "Payment Required" : "All Paid"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Update Popup */}
      <QuickUpdatePopup
        isOpen={quickUpdateOpen}
        onClose={() => setQuickUpdateOpen(false)}
        supplierId={supplier.id}
        supplierName={supplier.name}
        currentBalance={balanceDue}
        defaultTab={quickUpdateTab}
        onSuccess={fetchData}
      />

      {/* Edit Delivery Modal */}
      <Dialog open={!!editDelivery} onOpenChange={(open) => { if (!open) setEditDelivery(null); }}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-[#1a1a2e] p-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Edit Delivery</DialogTitle>
            </DialogHeader>
          </div>
          <form onSubmit={handleSaveDelivery} className="p-5 bg-[#0d1526] text-[#e2e8f0] space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Material Name</Label>
              <Input value={editDeliveryForm.material_name || ""} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, material_name: e.target.value }))} className="border border-[#1e3464] h-11 bg-[#071225] text-[#e2e8f0]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#e2e8f0] text-sm font-medium">Quantity</Label>
                <Input type="number" value={String(editDeliveryForm.quantity ?? "")} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className="border border-[#1e3464] h-11 bg-[#071225] text-[#e2e8f0]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#e2e8f0] text-sm font-medium">Unit</Label>
                <Input value={editDeliveryForm.unit || ""} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, unit: e.target.value }))} className="border border-[#1e3464] h-11 bg-[#071225] text-[#e2e8f0]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Unit Price (SAR)</Label>
              <Input type="number" value={String(editDeliveryForm.unit_price ?? "")} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, unit_price: Number(e.target.value) }))} className="border border-[#1e3464] h-11 bg-[#071225] text-[#e2e8f0]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Delivery Date</Label>
              <Input type="date" value={editDeliveryForm.delivery_date || ""} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, delivery_date: e.target.value }))} className="border border-[#1e3464] h-11 bg-[#071225] text-[#e2e8f0]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Notes</Label>
              <Textarea value={editDeliveryForm.notes || ""} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, notes: e.target.value }))} className="border border-[#1e3464] min-h-[80px] bg-[#071225] text-[#e2e8f0]" />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDelivery(null)} className="flex-1 font-bold h-11">Cancel</Button>
              <Button type="submit" className="flex-1 bg-[#f59e0b] hover:bg-amber-600 text-white font-bold h-11">Save Delivery</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-[#1a1a2e] p-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Edit Supplier Info</DialogTitle>
            </DialogHeader>
          </div>
          <form onSubmit={handleEditSave} className="p-5 bg-white space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[#1a1a2e] text-sm font-medium">Company Name *</Label>
              <Input
                value={editForm.name || ""}
                onChange={(e) => {
                  setEditForm({ ...editForm, name: e.target.value });
                  if (editErrors.name) setEditErrors((p) => ({ ...p, name: false }));
                }}
                className={cn(
                  "border h-11",
                  editErrors.name ? "border-red-400 ring-1 ring-red-400" : "border-[#e2e8f0]"
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#1a1a2e] text-sm font-medium">Contact Person</Label>
                <Input
                  value={editForm.contact_person || ""}
                  onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                  className="border-[#e2e8f0] h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#1a1a2e] text-sm font-medium">Phone</Label>
                <Input
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="border-[#e2e8f0] h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#1a1a2e] text-sm font-medium">Material Type</Label>
              <Select
                value={editForm.material_type || ""}
                onValueChange={(v) => setEditForm({ ...editForm, material_type: v })}
              >
                <SelectTrigger className="border-[#e2e8f0] h-11">
                  <SelectValue placeholder="Select material type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Items">Items</SelectItem>
                  <SelectItem value="Thinner">Thinner</SelectItem>
                  <SelectItem value="Oil">Oil</SelectItem>
                  <SelectItem value="Grease">Grease</SelectItem>
                  <SelectItem value="Scrap">Scrap</SelectItem>
                  <SelectItem value="Ibcs 1000 ltrs">Ibcs 1000 ltrs</SelectItem>
                  <SelectItem value="Plastic drum">Plastic drum</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#1a1a2e] text-sm font-medium">Opening Balance (SAR)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={String(Number(editForm.opening_balance) || "")}
                onChange={(e) => setEditForm({ ...editForm, opening_balance: Number(e.target.value) || 0 })}
                className="border-[#e2e8f0] h-11"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#1a1a2e] text-sm font-medium">Notes</Label>
              <Textarea
                value={editForm.notes || ""}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="border-[#e2e8f0] min-h-[80px]"
              />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)} className="flex-1 font-bold h-11">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-[#f59e0b] hover:bg-amber-600 text-white font-bold h-11">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-red-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Delete Supplier?</DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 bg-white space-y-4">
            <p className="text-sm text-[#64748b]">
              This will permanently delete <strong>{supplier.name}</strong> and all their stock and payment records.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              ⚠️ This action cannot be undone.
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} className="flex-1 font-bold h-11">
                Cancel
              </Button>
              <Button 
                onClick={handleDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold h-11"
              >
                Yes, Delete
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
