"use client";

import React, { useState, useMemo } from "react";
import { useAppData } from "@/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { formatSAR, downloadExcel, downloadPDF } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CreditCard,
  Banknote,
  Building2,
  X,
  CheckCircle,
  Search,
  DollarSign,
  Edit2,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, FileText } from "lucide-react";

interface PayModalState {
  supplier_id: string;
  supplier_name: string;
  balance_due: number;
}

export default function PaymentsPage() {
  const { data, isLoading, mutate } = useAppData();
  const { suppliers, payments, materialsBySupplier } = data;
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [payModal, setPayModal] = useState<PayModalState | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    method: "cash" as "cash" | "bank",
    reference: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Build supplier balance summaries
  const supplierBalances = useMemo(() => {
    // Total delivered per supplier (opening_balance + deliveries + purchases)
    const deliveredMap = new Map<string, number>();
    // Start with opening balances
    suppliers.forEach((s) => {
      deliveredMap.set(s.id, Number(s.opening_balance) || 0);
    });
    data.deliveries.forEach((d) => {
      deliveredMap.set(d.supplier_id, (deliveredMap.get(d.supplier_id) || 0) + Number(d.total_value));
    });
    (data.purchases || []).forEach((pur) => {
      deliveredMap.set(pur.supplier_id, (deliveredMap.get(pur.supplier_id) || 0) + Number(pur.total_amount));
    });

    // Total paid per supplier (payments + purchase payments)
    const paidMap = new Map<string, number>();
    data.payments.forEach((p) => {
      paidMap.set(p.supplier_id, (paidMap.get(p.supplier_id) || 0) + Number(p.amount));
    });
    (data.purchases || []).forEach((pur) => {
      paidMap.set(pur.supplier_id, (paidMap.get(pur.supplier_id) || 0) + Number(pur.payment_amount));
    });

    return suppliers.map((s) => {
      const total_delivered = deliveredMap.get(s.id) || 0;
      const total_paid = paidMap.get(s.id) || 0;
      const balance_due = total_delivered - total_paid;
      return {
        ...s,
        material_type: s.material_type?.trim() || materialsBySupplier[s.id] || undefined,
        total_delivered,
        total_paid,
        balance_due,
      };
    }).sort((a, b) => b.balance_due - a.balance_due);
  }, [suppliers, materialsBySupplier, data.deliveries, data.payments, data.purchases]);

  const filteredBalances = useMemo(
    () => supplierBalances.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.material_type || "").toLowerCase().includes(search.toLowerCase())
    ),
    [supplierBalances, search]
  );

  // Enrich payment history
  const enrichedPayments = useMemo(() => {
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
    return payments.map((p) => ({
      ...p,
      supplier_name: supplierMap.get(p.supplier_id) || "Unknown",
    })).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
  }, [payments, suppliers]);

  const openPayModal = (s: typeof supplierBalances[0]) => {
    setEditingPaymentId(null);
    setPayModal({ supplier_id: s.id, supplier_name: s.name, balance_due: s.balance_due });
    setPayForm({ amount: s.balance_due > 0 ? s.balance_due.toFixed(2) : "", method: "cash", reference: "", date: new Date().toISOString().split("T")[0], notes: "" });
  };

  const openEditPayment = (payment: typeof enrichedPayments[0]) => {
    const balance = supplierBalances.find((s) => s.id === payment.supplier_id)?.balance_due || 0;
    setEditingPaymentId(payment.id);
    setPayModal({
      supplier_id: payment.supplier_id,
      supplier_name: payment.supplier_name,
      balance_due: balance + (Number(payment.amount) || 0),
    });
    setPayForm({
      amount: String(Number(payment.amount) || ""),
      method: payment.payment_method?.toLowerCase().includes("bank") ? "bank" : "cash",
      reference: payment.reference_number || "",
      date: payment.payment_date,
      notes: payment.notes || "",
    });
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" }); return;
    }
    if (payForm.method === "bank" && !payForm.reference.trim()) {
      toast({ title: "Error", description: "Please enter bank reference number", variant: "destructive" }); return;
    }

    setPayLoading(true);
    try {
      const paymentPayload = {
        supplier_id: payModal.supplier_id,
        amount,
        payment_method: payForm.method,
        payment_date: payForm.date,
        reference_number: payForm.reference.trim() || null,
        notes: payForm.notes.trim() || null,
      };

      const { error } = editingPaymentId
        ? await supabase.from("payments").update(paymentPayload).eq("id", editingPaymentId)
        : await supabase.from("payments").insert(paymentPayload);
      if (error) throw error;

      toast({
        title: "Payment Recorded ✓",
        description: `${formatSAR(amount)} paid to ${payModal.supplier_name} via ${payForm.method === "cash" ? "Cash" : "Bank Transfer"}.`,
      });
      mutate();
      setEditingPaymentId(null);
      setPayModal(null);
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error)?.message || "Failed to record payment", variant: "destructive" });
    } finally {
      setPayLoading(false);
    }
  };

  const totalOwed = supplierBalances.reduce((a, s) => a + Math.max(s.balance_due, 0), 0);
  const totalPaid = supplierBalances.reduce((a, s) => a + s.total_paid, 0);
  const suppliersWithBalance = supplierBalances.filter((s) => s.balance_due > 0).length;

  const exportPaymentsExcel = () => {
    const rows: Record<string, string | number>[] = enrichedPayments.map((p, idx) => ({
      "#": idx + 1,
      Date: format(new Date(p.payment_date), "yyyy-MM-dd"),
      Supplier: p.supplier_name,
      Method: p.payment_method,
      Reference: p.reference_number || "",
      Notes: p.notes || "",
      Amount: Number(p.amount) || 0,
    }));
    downloadExcel(rows, "Payments-Report");
    toast({ title: "Excel Downloaded", description: "Payments exported." });
  };

  const exportPaymentsPDF = () => {
    const headers = ["#", "Date", "Supplier", "Method", "Reference", "Notes", "Amount"];
    const rows = enrichedPayments.map((p, idx) => [
      idx + 1,
      format(new Date(p.payment_date), "yyyy-MM-dd"),
      p.supplier_name,
      p.payment_method,
      p.reference_number || "",
      p.notes || "",
      formatSAR(Number(p.amount) || 0),
    ]);
    downloadPDF("Payments Report", headers, rows, "Payments-Report", [
      { label: "Total Paid", value: formatSAR(enrichedPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0)) },
    ]);
    toast({ title: "PDF Downloaded", description: "Payments exported." });
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Payments</h1>
            <p className="text-sm text-[#8faac3]">Manage outgoing payments to all suppliers</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={exportPaymentsExcel} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded text-sm font-bold">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button onClick={exportPaymentsPDF} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded text-sm font-bold">
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Suppliers Owing</span>
            <TrendingDown className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400">{suppliersWithBalance}</div>
          <div className="text-xs text-[#8faac3] mt-1">have pending balance</div>
        </div>
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Payment Remaining</span>
            <DollarSign className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400">{formatSAR(totalOwed)}</div>
          <div className="text-xs text-[#8faac3] mt-1">outstanding to pay</div>
        </div>
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Paid</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatSAR(totalPaid)}</div>
          <div className="text-xs text-[#8faac3] mt-1">total payment paid</div>
        </div>
      </div>

      {/* Supplier Balances Table */}
      <div className="bg-[#121e36] border border-[#1e3464] rounded-xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 bg-[#0a1422] border-b border-[#1e3464] flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#3b82f6]" /> Supplier Payment Status
            </h2>
            <p className="text-xs text-[#8faac3] mt-0.5">Click PAY to record a payment for any supplier</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8faac3]" />
            <input
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-[#0d1526] border border-[#1e3464] rounded-lg text-sm text-[#e2e8f0] placeholder-[#8faac3] outline-none focus:border-[#3b82f6] w-[200px]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
            </div>
          ) : filteredBalances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-10 h-10 text-emerald-400 mb-3" />
              <p className="text-[#8faac3] text-sm">No suppliers found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3464]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Supplier Name</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Material</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Phone</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Total Delivered</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Remaining</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalances.map((s, idx) => {
                  const isPaid = s.balance_due <= 0 && s.total_delivered > 0;
                  const isNew = s.total_delivered === 0;
                  return (
                    <tr key={s.id} className="border-b border-[#1e3464]/50 hover:bg-[#162040] transition-colors">
                      <td className="px-4 py-3.5 text-[#8faac3] text-xs">{idx + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                            isPaid ? "bg-emerald-900/50 text-emerald-400" : s.balance_due > 0 ? "bg-red-900/50 text-red-400" : "bg-[#1e3464] text-[#8faac3]"
                          )}>
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-white">{s.name}</span>
                          {isPaid && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {s.material_type
                          ? <span className="px-2 py-0.5 bg-[#1e3464] text-[#8faac3] rounded text-xs">{s.material_type}</span>
                          : <span className="text-[#8faac3]">Not provided</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[#8faac3] text-sm">{s.phone || "Not provided"}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-[#e2e8f0]">{formatSAR(s.total_delivered)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-emerald-400">{formatSAR(s.total_paid)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold">
                        <span className={s.balance_due > 0 ? "text-red-400" : "text-emerald-400"}>
                          {formatSAR(s.balance_due)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", {
                          "bg-emerald-900/60 text-emerald-400": isPaid,
                          "bg-red-900/60 text-red-400": s.balance_due > 0 && s.total_paid > 0,
                          "bg-orange-900/60 text-orange-400": s.balance_due > 0 && s.total_paid === 0 && !isNew,
                          "bg-[#1e3464] text-[#8faac3]": isNew,
                        })}>
                          {isNew ? "New" : isPaid ? "Settled" : s.total_paid > 0 ? "Partial" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => openPayModal(s)}
                          className={cn(
                            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all mx-auto",
                            s.balance_due > 0
                              ? "bg-gradient-to-r from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white shadow-lg shadow-blue-900/30"
                              : "bg-[#1e3464] text-[#8faac3] hover:bg-[#3b82f6] hover:text-white"
                          )}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          PAY
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {filteredBalances.length > 0 && (
          <div className="px-5 py-3 bg-[#0a1422] border-t border-[#1e3464] flex items-center justify-between">
            <span className="text-xs text-[#8faac3]">
              <span className="text-white font-bold">{filteredBalances.length}</span> suppliers
            </span>
            <div className="flex gap-6">
              <div><span className="text-xs text-[#8faac3]">Total Delivered: </span><span className="text-sm font-bold text-white">{formatSAR(filteredBalances.reduce((a, s) => a + s.total_delivered, 0))}</span></div>
              <div><span className="text-xs text-[#8faac3]">Payment Paid: </span><span className="text-sm font-bold text-emerald-400">{formatSAR(filteredBalances.reduce((a, s) => a + s.total_paid, 0))}</span></div>
              <div><span className="text-xs text-red-400">Payment Remaining: </span><span className="text-sm font-bold text-red-400">{formatSAR(filteredBalances.reduce((a, s) => a + Math.max(s.balance_due, 0), 0))}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Payment History Table */}
      <div className="bg-[#121e36] border border-[#1e3464] rounded-xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 bg-[#0a1422] border-b border-[#1e3464]">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Banknote className="w-4 h-4 text-[#3b82f6]" /> Payment History
          </h2>
          <p className="text-xs text-[#8faac3] mt-0.5">{enrichedPayments.length} total payment records</p>
        </div>
        <div className="overflow-x-auto">
          {enrichedPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CreditCard className="w-10 h-10 text-[#1e3464] mb-3" />
              <p className="text-[#8faac3] text-sm">No payment records yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3464]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Method</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Notes</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {enrichedPayments.map((p, idx) => (
                  <tr key={p.id} className="border-b border-[#1e3464]/50 hover:bg-[#162040] transition-colors">
                    <td className="px-4 py-3.5 text-[#8faac3] text-xs">{idx + 1}</td>
                    <td className="px-4 py-3.5 text-[#8faac3] text-xs whitespace-nowrap">
                      {format(new Date(p.payment_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-white">{p.supplier_name}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-bold",
                        p.payment_method === "cash"
                          ? "bg-amber-900/40 text-amber-400"
                          : "bg-blue-900/40 text-blue-400"
                      )}>
                        {p.payment_method === "cash"
                          ? <><Banknote className="w-3 h-3" /> Cash</>
                          : <><Building2 className="w-3 h-3" /> Bank</>}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[#8faac3] text-xs font-mono">{p.reference_number || "—"}</td>
                    <td className="px-4 py-3.5 text-[#8faac3] text-xs">{p.notes || "—"}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400">
                      {formatSAR(Number(p.amount) || 0)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => openEditPayment(p)}
                        className="w-8 h-8 rounded-lg bg-[#1e3464] hover:bg-[#2563eb] text-[#8faac3] hover:text-white transition-all inline-flex items-center justify-center"
                        title="Edit payment"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {enrichedPayments.length > 0 && (
          <div className="px-5 py-3 bg-[#0a1422] border-t border-[#1e3464] flex items-center justify-between">
            <span className="text-xs text-[#8faac3]"><span className="text-white font-bold">{enrichedPayments.length}</span> payments</span>
            <div>
              <span className="text-xs text-[#8faac3]">Total Paid: </span>
              <span className="text-lg font-bold text-emerald-400">
                {formatSAR(enrichedPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* PAY Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setPayModal(null); setEditingPaymentId(null); }}>
          <div className="bg-[#121e36] border border-[#1e3464] rounded-2xl shadow-2xl w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 bg-[#0a1422] rounded-t-2xl border-b border-[#1e3464]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center text-white font-bold">
                  {payModal.supplier_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-white">{editingPaymentId ? "Edit payment" : "Pay to"} {payModal.supplier_name}</h3>
                  <p className="text-xs text-red-400">Payment Remaining: {formatSAR(payModal.balance_due)}</p>
                </div>
              </div>
              <button onClick={() => { setPayModal(null); setEditingPaymentId(null); }} className="w-8 h-8 rounded-lg bg-[#1e3464] hover:bg-red-900/50 text-[#8faac3] hover:text-red-400 transition-all flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handlePay} className="p-6 space-y-4">
              {/* Payment Method Toggle */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayForm({ ...payForm, method: "cash", reference: "" })}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all",
                      payForm.method === "cash"
                        ? "bg-amber-500/20 border-amber-500 text-amber-400"
                        : "bg-[#0d1526] border-[#1e3464] text-[#8faac3] hover:border-amber-600 hover:text-amber-400"
                    )}
                  >
                    <Banknote className="w-4 h-4" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayForm({ ...payForm, method: "bank" })}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all",
                      payForm.method === "bank"
                        ? "bg-blue-500/20 border-blue-500 text-blue-400"
                        : "bg-[#0d1526] border-[#1e3464] text-[#8faac3] hover:border-blue-600 hover:text-blue-400"
                    )}
                  >
                    <Building2 className="w-4 h-4" /> Bank Transfer
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Amount (SAR) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8faac3] text-sm font-bold">SAR</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    className="w-full pl-12 pr-4 h-12 bg-[#0d1526] border border-[#1e3464] rounded-xl text-[#e2e8f0] text-lg font-bold outline-none focus:border-[#3b82f6]"
                  />
                </div>
                {payModal.balance_due > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayForm({ ...payForm, amount: payModal.balance_due.toFixed(2) })}
                    className="text-xs text-[#3b82f6] hover:underline"
                  >
                    Pay full balance: {formatSAR(payModal.balance_due)}
                  </button>
                )}
              </div>

              {/* Bank Reference (only for bank) */}
              {payForm.method === "bank" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Bank Reference # *</label>
                  <input
                    required
                    placeholder="e.g. TRF-20240524-001"
                    value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                    className="w-full px-4 h-11 bg-[#0d1526] border border-[#1e3464] rounded-xl text-[#e2e8f0] outline-none focus:border-[#3b82f6] placeholder-[#8faac3] font-mono text-sm"
                  />
                </div>
              )}

              {/* Payment Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={payForm.date}
                  onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                  className="w-full px-4 h-11 bg-[#0d1526] border border-[#1e3464] rounded-xl text-[#e2e8f0] outline-none focus:border-[#3b82f6]"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Notes (Optional)</label>
                <input
                  placeholder="Any additional notes..."
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  className="w-full px-4 h-11 bg-[#0d1526] border border-[#1e3464] rounded-xl text-[#e2e8f0] outline-none focus:border-[#3b82f6] placeholder-[#8faac3] text-sm"
                />
              </div>

              {/* Remaining after payment preview */}
              {payForm.amount && Number(payForm.amount) > 0 && (
                <div className="bg-[#0d1526] border border-[#1e3464] rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-[#8faac3]">Remaining after payment:</span>
                  <span className={cn("text-sm font-bold font-mono", (payModal.balance_due - Number(payForm.amount)) > 0 ? "text-red-400" : "text-emerald-400")}>
                    {formatSAR(Math.max(payModal.balance_due - Number(payForm.amount), 0))}
                  </span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setPayModal(null); setEditingPaymentId(null); }}
                  className="flex-1 py-3 bg-[#1e3464] hover:bg-[#162040] text-[#8faac3] hover:text-white rounded-xl text-sm font-bold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={payLoading}
                  className="flex-1 py-3 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
                  {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {editingPaymentId ? "Update Payment" : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
