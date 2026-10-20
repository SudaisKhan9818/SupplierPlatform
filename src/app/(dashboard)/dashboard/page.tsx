"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAppData } from "@/hooks/use-data";
import { formatSAR } from "@/lib/format-utils";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Users, Package, Wallet, AlertCircle, Plus, Trash2, CheckCircle, Filter, LayoutDashboard,
} from "lucide-react";
import QuickUpdatePopup from "@/components/QuickUpdatePopup";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading, mutate } = useAppData();
  const { summaries } = data;
  const { toast } = useToast();

  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid">("all");

  const stats = useMemo(() => {
    const totalSuppliers = summaries.length;
    const totalStockValue = summaries.reduce((a, s) => a + s.total_delivered, 0);
    const totalPaid = summaries.reduce((a, s) => a + s.total_paid, 0);
    const outstandingBalance = totalStockValue - totalPaid;
    return { totalSuppliers, totalStockValue, totalPaid, outstandingBalance };
  }, [summaries]);

  const { totalSuppliers, totalStockValue, totalPaid, outstandingBalance } = stats;

  const filteredSummaries = useMemo(() =>
    summaries.filter((s) => {
      if (filterStatus === "paid") return s.balance_due <= 0 && s.total_delivered > 0;
      if (filterStatus === "unpaid") return s.balance_due > 0;
      return true;
    }),
    [summaries, filterStatus]
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#8faac3]">Everything at a glance</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Suppliers</span>
            <div className="w-9 h-9 rounded-lg bg-[#1e3464] flex items-center justify-center">
              <Users className="w-4 h-4 text-[#3b82f6]" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{totalSuppliers}</div>
          <div className="text-xs text-[#8faac3] mt-1">total registered</div>
        </div>

        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Total Stock</span>
            <div className="w-9 h-9 rounded-lg bg-amber-900/40 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white truncate">{formatSAR(totalStockValue)}</div>
          <div className="text-xs text-[#8faac3] mt-1">total delivered value</div>
        </div>

        <div className="bg-[#121e36] border border-[#1e3464] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Paid</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-900/40 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 truncate">{formatSAR(totalPaid)}</div>
          <div className="text-xs text-[#8faac3] mt-1">total payment paid</div>
        </div>

        <div className="bg-[#121e36] border border-red-900/40 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Payment Remaining</span>
            <div className="w-9 h-9 rounded-lg bg-red-900/40 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-400 truncate">{formatSAR(outstandingBalance)}</div>
          <div className="text-xs text-[#8faac3] mt-1">payment remaining</div>
        </div>
      </div>

      {/* Supplier List Table */}
      <div className="bg-[#121e36] border border-[#1e3464] rounded-xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 bg-[#0a1422] border-b border-[#1e3464] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#3b82f6]" /> Suppliers
            </h2>
            <span className="text-xs text-[#8faac3] bg-[#1e3464] px-2 py-0.5 rounded-full">
              {filteredSummaries.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#8faac3]" />
            <div className="flex bg-[#0d1526] rounded-lg border border-[#1e3464] p-0.5 gap-0.5">
              {(["all", "paid", "unpaid"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-md transition-colors capitalize flex items-center gap-1",
                    filterStatus === f
                      ? f === "paid" ? "bg-emerald-600 text-white" : f === "unpaid" ? "bg-red-600 text-white" : "bg-[#3b82f6] text-white"
                      : "text-[#8faac3] hover:text-white"
                  )}
                >
                  {f === "paid" && <CheckCircle className="w-3 h-3" />}
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="w-12 h-12 text-[#1e3464] mb-3" />
            <p className="text-[#8faac3] font-medium text-sm">No suppliers yet — add your first one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3464]">
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">#</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Material</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Total Delivered</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Paid</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Payment Remaining</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-[#8faac3] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.map((item, idx) => (
                  <tr key={item.id} className="border-b border-[#1e3464]/50 hover:bg-[#162040] transition-colors">
                    <td className="px-5 py-3.5 text-[#8faac3] text-xs">{idx + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{item.name}</span>
                        {item.balance_due <= 0 && item.total_delivered > 0 && (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {item.material_type
                        ? <span className="px-2 py-0.5 bg-[#1e3464] text-[#8faac3] rounded text-xs">{item.material_type}</span>
                        : <span className="text-[#8faac3]">Not provided</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-[#e2e8f0]">{formatSAR(item.total_delivered)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-emerald-400">{formatSAR(item.total_paid)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={cn("font-bold font-mono", item.balance_due > 0 ? "text-red-400" : "text-emerald-400")}>
                        {formatSAR(item.balance_due)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedSupplier({ id: item.id, name: item.name, balance: item.balance_due })}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-900/40 hover:bg-amber-600 text-amber-400 hover:text-white rounded-lg text-xs font-bold transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Update
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                          className="w-7 h-7 bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white rounded-lg flex items-center justify-center transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSupplier && (
        <QuickUpdatePopup
          isOpen={!!selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          currentBalance={selectedSupplier.balance}
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
