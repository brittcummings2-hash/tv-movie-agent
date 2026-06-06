"use client";

import { useCallback, useEffect, useState } from "react";
import type { ToastMessage } from "@/lib/types";
import { Nav, type AppTab } from "./Nav";
import { ToastContainer, createToast } from "./Toast";
import { UpNextView } from "./UpNextView";
import { WatchedView } from "./WatchedView";

export function AppShell() {
  const [activeTab, setActiveTab] = useState<AppTab>("upnext");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const handleToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <div className="page">
      <Nav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container">
        <div className={activeTab === "upnext" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
          <UpNextView onToast={handleToast} />
        </div>
        <div className={activeTab === "watched" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
          <WatchedView onToast={handleToast} />
        </div>
      </main>
      <ToastContainer toasts={toasts} />
    </div>
  );
}
