"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAppData } from "@/hooks/use-data";
import { Supplier, SupplierSummary } from "@/types";
import { formatSAR } from "@/lib/format-utils";
import {
  Loader2,
  Plus,
  Search,
  Edit2,
  Eye,
  Trash2,
  CheckCircle,
  Filter,
  Calendar,
  Users,
} from "lucide-react";
import { subMonths, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import QuickUpdatePopup from "@/components/QuickUpdatePopup";
import { cn } from "@/lib/utils";

export default function SuppliersPage() {
  const { data, isLoading, mutate } = useAppData();
  const { suppliers, summaries, materialsBySupplier } = data;
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplierForUpdate, setSelectedSupplierForUpdate] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "1m" | "3m" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    material_type: "",
    opening_balance: "",
    notes: "",
  });

  const validateForm = () => {
    const errors: Record<string, boolean> = {};
    if (!formData.name.trim()) errors.name = true;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isMissingOpeningBalanceColumnError = (message: string) =>
    /opening_balance|column.*does not exist|does not exist in the schema/i.test(message);

  const buildSupplierPayload = (includeOpeningBalance = true) => {
    const basePayload = {
      name: formData.name.trim(),
      contact_person: formData.contact_person?.trim() || null,
      phone: formData.phone?.trim() || null,
      material_type: formData.material_type?.trim() || null,
      notes: formData.notes?.trim() || null,
    };

    return includeOpeningBalance
      ? { ...basePayload, opening_balance: Number(formData.opening_balance) || 0 }
      : basePayload;
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      if (editingSupplier) {
        let result = await supabase
          .from("suppliers")
          .update(buildSupplierPayload())
          .eq("id", editingSupplier.id)
          .select();

        if (result.error && isMissingOpeningBalanceColumnError(result.error.message)) {
          result = await supabase
            .from("suppliers")
            .update(buildSupplierPayload(false))
            .eq("id", editingSupplier.id)
            .select();
        }

        if (result.error) throw new Error(result.error.message);
        toast({ title: "Updated", description: "Supplier updated successfully." });
      } else {
        let result = await supabase.from("suppliers").insert(buildSupplierPayload()).select();

        if (result.error && isMissingOpeningBalanceColumnError(result.error.message)) {
          result = await supabase.from("suppliers").insert(buildSupplierPayload(false)).select();
        }

        if (result.error) throw new Error(result.error.message);
        toast({ title: "Success", description: "New supplier added." });
      }
      setIsModalOpen(false);
      setEditingSupplier(null);
      setFormData({ name: "", contact_person: "", phone: "", material_type: "", opening_balance: "", notes: "" });
      setFormErrors({});
      mutate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: (error as Error)?.message || "Network error",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      material_type: supplier.material_type || "",
      opening_balance: String(Number(supplier.opening_balance) || 0),
      notes: supplier.notes || "",
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData({ name: "", contact_person: "", phone: "", material_type: "", opening_balance: "", notes: "" });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const computedSummaries = useMemo(() => {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    const now = new Date();
    if (dateFilter === "1m") { fromDate = subMonths(now, 1); toDate = now; }
    else if (dateFilter === "3m") { fromDate = subMonths(now, 3); toDate = now; }
    else if (dateFilter === "custom") {
      if (customFrom) fromDate = startOfDay(new Date(customFrom));
      if (customTo) toDate = endOfDay(new Date(customTo));
    }

    return suppliers.map((s) => {
      let sDeliveries = data.deliveries.filter((d) => d.supplier_id === s.id);
      let sPayments = data.payments.filter((p) => p.supplier_id === s.id);
      let sPurchases = (data.purchases || []).filter((pur) => pur.supplier_id === s.id);

      if (fromDate) {
        sDeliveries = sDeliveries.filter((d) => isAfter(new Date(d.delivery_date), fromDate!));
        sPayments = sPayments.filter((p) => isAfter(new Date(p.payment_date), fromDate!));
        sPurchases = sPurchases.filter((pur) => isAfter(new Date(pur.purchase_date), fromDate!));
      }
      if (toDate) {
        sDeliveries = sDeliveries.filter((d) => isBefore(new Date(d.delivery_date), toDate!));
        sPayments = sPayments.filter((p) => isBefore(new Date(p.payment_date), toDate!));
        sPurchases = sPurchases.filter((pur) => isBefore(new Date(pur.purchase_date), toDate!));
      }

      const opening_balance = Number(s.opening_balance) || 0;
      const total_delivered =
        opening_balance +
        sDeliveries.reduce((acc, d) => acc + (Number(d.total_value) || 0), 0) +
        sPurchases.reduce((acc, pur) => acc + (Number(pur.total_amount) || 0), 0);
      const total_paid =
        sPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) +
        sPurchases.reduce((acc, pur) => acc + (Number(pur.payment_amount) || 0), 0);

      return {
        ...s,
        material_type: s.material_type?.trim() || materialsBySupplier[s.id] || undefined,
        total_delivered,
        total_paid,
        balance_due: total_delivered - total_paid,
      };
    });
  }, [suppliers, materialsBySupplier, data.deliveries, data.payments, data.purchases, dateFilter, customFrom, customTo]);

  const filteredSummaries = useMemo(
    () =>
      computedSummaries.filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.material_type?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
          (s.contact_person?.toLowerCase() || "").includes(searchTerm.toLowerCase());
        if (filterStatus === "paid") return matchesSearch && s.balance_due <= 0 && s.total_delivered > 0;
        if (filterStatus === "unpaid") return matchesSearch && s.balance_due > 0;
        return matchesSearch;
      }),
    [computedSummaries, searchTerm, filterStatus]
  );

  const getStatusInfo = (summary: SupplierSummary) => {
    if (summary.total_delivered === 0) return { label: "New", cls: "bg-[#1e3464] text-[#8faac3]" };
    if (summary.balance_due <= 0) return { label: "Paid", cls: "bg-emerald-900/60 text-emerald-400" };
    if (summary.total_paid > 0) return { label: "Partial", cls: "bg-amber-900/60 text-amber-400" };
    return { label: "Unpaid", cls: "bg-red-900/60 text-red-400" };
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Suppliers</h1>
            <p className="text-sm text-[#8faac3]">Manage relationships & balances</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8faac3]" />
            <input
              placeholder="Search suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-[#121e36] border border-[#1e3464] rounded-lg text-sm text-[#e2e8f0] placeholder-[#8faac3] outline-none focus:border-[#3b82f6] w-[200px]"
            />
          </div>
          <Button
            onClick={openAddModal}
            className="bg-gradient-to-r from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white font-bold gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" /> Add New
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#121e36] p-3 rounded-xl border border-[#1e3464]">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#8faac3]" />
          <div className="flex bg-[#0d1526] rounded-lg border border-[#1e3464] p-0.5 gap-0.5">
            {(["all", "paid", "unpaid"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all capitalize",
                  filterStatus === f
                    ? f === "paid"
                      ? "bg-emerald-600 text-white"
                      : f === "unpaid"
                      ? "bg-red-600 text-white"
                      : "bg-[#3b82f6] text-white"
                    : "text-[#8faac3] hover:text-white"
                )}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#8faac3]" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as "all" | "1m" | "3m" | "custom")}
            className="bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] outline-none focus:border-[#3b82f6]"
          >
            <option value="all">All Time</option>
            <option value="1m">Last 1 Month</option>
            <option value="3m">Last 3 Months</option>
            <option value="custom">Custom</option>
          </select>
          {dateFilter === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] outline-none focus:border-[#3b82f6]" />
              <span className="text-[#8faac3] text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="bg-[#0d1526] border border-[#1e3464] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] outline-none focus:border-[#3b82f6]" />
            </>
          )}
        </div>

        <div className="ml-auto text-sm text-[#8faac3]">
          <span className="font-bold text-white">{filteredSummaries.length}</span> suppliers
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#121e36] border border-[#1e3464] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {isLoading && summaries.length === 0 ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="w-12 h-12 text-[#1e3464] mb-3" />
              <p className="text-[#8faac3] font-medium">No suppliers found</p>
              <p className="text-[#8faac3] text-sm mt-1">Try adjusting your search or add a new supplier.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0a1422] border-b border-[#1e3464]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Supplier Name</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Contact Person</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Material</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Total Delivered</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Remaining</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.map((summary, idx) => {
                  const status = getStatusInfo(summary);
                  return (
                    <tr
                      key={summary.id}
                      className="border-b border-[#1e3464]/50 hover:bg-[#162040] transition-colors"
                    >
                      <td className="px-4 py-3.5 text-[#8faac3] text-xs">{idx + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {summary.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-white">{summary.name}</span>
                          {summary.balance_due <= 0 && summary.total_delivered > 0 && (
                            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[#8faac3]">{summary.contact_person || "Not provided"}</td>
                      <td className="px-4 py-3.5 text-[#8faac3]">{summary.phone || "Not provided"}</td>
                      <td className="px-4 py-3.5">
                        {summary.material_type ? (
                          <span className="px-2 py-0.5 bg-[#1e3464] text-[#8faac3] rounded text-xs">{summary.material_type}</span>
                        ) : <span className="text-[#8faac3]">Not provided</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[#e2e8f0]">{formatSAR(summary.total_delivered)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-emerald-400">{formatSAR(summary.total_paid)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold">
                        <span className={summary.balance_due > 0 ? "text-red-400" : "text-emerald-400"}>
                          {formatSAR(summary.balance_due)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", status.cls)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link href={`/suppliers/${summary.id}`}>
                            <button className="w-8 h-8 rounded-lg bg-[#1e3464] hover:bg-[#3b82f6] text-[#8faac3] hover:text-white transition-all flex items-center justify-center" title="View Details">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </Link>
                          <button
                            onClick={() => setSelectedSupplierForUpdate({ id: summary.id, name: summary.name, balance: summary.balance_due })}
                            className="w-8 h-8 rounded-lg bg-amber-900/40 hover:bg-amber-600 text-amber-400 hover:text-white transition-all flex items-center justify-center" title="Quick Update"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { const orig = suppliers.find(s => s.id === summary.id); if (orig) openEditModal(orig); }}
                            className="w-8 h-8 rounded-lg bg-[#1e3464] hover:bg-[#2563eb] text-[#8faac3] hover:text-white transition-all flex items-center justify-center" title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ id: summary.id, name: summary.name })}
                            className="w-8 h-8 rounded-lg bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white transition-all flex items-center justify-center" title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {filteredSummaries.length > 0 && (
          <div className="px-5 py-3 bg-[#0a1422] border-t border-[#1e3464] flex items-center justify-between">
            <span className="text-xs text-[#8faac3]">
              Showing <span className="text-white font-bold">{filteredSummaries.length}</span> suppliers
            </span>
            <div className="flex gap-6">
              <div className="text-right">
                <span className="text-xs text-[#8faac3]">Total Delivered: </span>
                <span className="text-sm font-bold text-white">{formatSAR(filteredSummaries.reduce((a, s) => a + s.total_delivered, 0))}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-[#8faac3]">Payment Remaining: </span>
                <span className="text-sm font-bold text-red-400">{formatSAR(filteredSummaries.reduce((a, s) => a + s.balance_due, 0))}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl bg-[#121e36]">
          <div className="bg-gradient-to-r from-[#0a1422] to-[#121e36] p-5 border-b border-[#1e3464]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white">
                {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
              </DialogTitle>
              <p className="text-[#8faac3] text-sm mt-1">Fill in the company details below.</p>
            </DialogHeader>
          </div>
          <form onSubmit={handleSaveSupplier} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Company Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); if (formErrors.name) setFormErrors(p => ({ ...p, name: false })); }}
                className={cn("h-11 bg-[#0d1526] border text-[#e2e8f0] placeholder-[#8faac3]", formErrors.name ? "border-red-500" : "border-[#1e3464] focus:border-[#3b82f6]")}
                placeholder="e.g. Saudi Marble Ltd"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#e2e8f0] text-sm font-medium">Contact Person</Label>
                <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  className="h-11 bg-[#0d1526] border border-[#1e3464] text-[#e2e8f0] placeholder-[#8faac3] focus:border-[#3b82f6]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#e2e8f0] text-sm font-medium">Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-11 bg-[#0d1526] border border-[#1e3464] text-[#e2e8f0] placeholder-[#8faac3] focus:border-[#3b82f6]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Material Type</Label>
              <Select value={formData.material_type} onValueChange={(v) => setFormData({ ...formData, material_type: v })}>
                <SelectTrigger className="h-11 bg-[#0d1526] border-[#1e3464] text-[#e2e8f0]">
                  <SelectValue placeholder="Select material type" />
                </SelectTrigger>
                <SelectContent className="bg-[#121e36] border-[#1e3464]">
                  {["Items", "Thinner", "Oil", "Grease", "Scrap", "Ibcs 1000 ltrs", "Plastic drum", "Other"].map(m => (
                    <SelectItem key={m} value={m} className="text-[#e2e8f0] focus:bg-[#1e3464]">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Opening Balance (SAR)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.opening_balance}
                onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                className="h-11 bg-[#0d1526] border border-[#1e3464] text-[#e2e8f0] placeholder-[#8faac3] focus:border-[#3b82f6]"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#e2e8f0] text-sm font-medium">Notes (optional)</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-[#0d1526] border-[#1e3464] text-[#e2e8f0] placeholder-[#8faac3] min-h-[80px] focus:border-[#3b82f6]"
                placeholder="Additional information..." />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}
                className="flex-1 font-bold h-11 border-[#1e3464] text-[#e2e8f0] hover:bg-[#1e3464] bg-transparent">Cancel</Button>
              <Button type="submit" disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white font-bold h-11">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Supplier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedSupplierForUpdate && (
        <QuickUpdatePopup
          isOpen={!!selectedSupplierForUpdate}
          onClose={() => setSelectedSupplierForUpdate(null)}
          supplierId={selectedSupplierForUpdate.id}
          supplierName={selectedSupplierForUpdate.name}
          currentBalance={selectedSupplierForUpdate.balance}
          onSuccess={mutate}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-2xl bg-[#121e36]">
          <div className="bg-red-900/50 p-5 border-b border-red-800">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white">Delete Supplier?</DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-[#8faac3]">
              This will permanently delete <strong className="text-white">{deleteConfirm?.name}</strong> and all their records.
            </p>
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 text-sm text-amber-400">
              ⚠️ This action cannot be undone.
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}
                className="flex-1 font-bold h-11 border-[#1e3464] text-[#e2e8f0] hover:bg-[#1e3464] bg-transparent">Cancel</Button>
              <Button
                onClick={async () => {
                  if (!deleteConfirm) return;
                  try {
                    const { error } = await supabase.from("suppliers").delete().eq("id", deleteConfirm.id);
                    if (error) throw error;
                    toast({ title: "Deleted", description: `${deleteConfirm.name} removed.` });
                    mutate(); setDeleteConfirm(null);
                  } catch (error: unknown) {
                    toast({ title: "Error", description: (error as Error)?.message || "Failed to delete", variant: "destructive" });
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold h-11"
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
