import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  Home,
  Lock,
  Package,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { AppBackground } from './components/AppBackground';
import { BrandLogo } from './components/BrandLogo';
import { ClientBillView } from './components/ClientBillView';
import { ClientListView } from './components/ClientListView';
import { DashboardView } from './components/DashboardView';
import { DeliveryTrackingView } from './components/DeliveryTrackingView';
import { NewClientView } from './components/NewClientView';
import { OrdersView } from './components/OrdersView';
import { PaymentHistoryView } from './components/PaymentHistoryView';
import { ProductsView } from './components/ProductsView';
import { ProfitLossView } from './components/ProfitLossView';
import { SalesReportView } from './components/SalesReportView';
import { SettingsView } from './components/SettingsView';
import { StartPortal } from './components/StartPortal';
import { ViewPanelControlView } from './components/ViewPanelControlView';
import {
  AppRoute,
  BusinessSettings,
  Client,
  DeliveryStatus,
  ExpenseRecord,
  Invoice,
  PaymentMethod,
  Product,
  ViewPanelConfig,
  WorkspaceData,
} from './types/business';
import {
  getCustomerSessionId,
  isAdminUnlockedStored,
  setAdminUnlockedStored,
  setCustomerSessionId,
} from './utils/adminAuth';
import { api } from './utils/api';
import {
  createEmptyWorkspace,
  DEFAULT_VIEW_PANEL_CONFIG,
  phoneNumbersMatch,
} from './utils/calculations';

interface HistoryEntry {
  route: AppRoute;
  clientId: string | null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceData>(createEmptyWorkspace);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(() => isAdminUnlockedStored());
  const [showViewPanel, setShowViewPanel] = useState<boolean>(() => !isAdminUnlockedStored());
  const [customerSessionId, setCustomerSessionIdState] = useState<string | null>(() =>
    getCustomerSessionId()
  );

  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [billClientId, setBillClientId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2600);
  }, []);

  // Load from Cloud Firestore and keep synced across all devices in real time
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    api
      .fetchWorkspace()
      .then((data) => {
        if (!active) return;
        setWorkspace(data);
        unsubscribe = api.subscribeWorkspace(
          (updater) => {
            if (active) setWorkspace(updater);
          },
          (err) => {
            const msg = err.message || '';
            if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
              showToast('Firestore permission denied. Check Firestore Rules in Firebase Console.');
            }
          }
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
          showToast('Firestore permission denied. Update Firestore Rules in Firebase Console.');
        } else {
          showToast('Could not connect to Cloud Firestore. Please refresh.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [showToast]);

  const navigateTo = useCallback(
    (
      nextRoute: AppRoute,
      options?: {
        clientId?: string | null;
        editClient?: Client | null;
        forBillClientId?: string | null;
        editInvoice?: Invoice | null;
      }
    ) => {
      const nextClientId =
        options?.clientId !== undefined ? options.clientId : null;

      if (route !== nextRoute || selectedClientId !== nextClientId) {
        setHistory((prev) => [
          ...prev.slice(-24),
          { route, clientId: selectedClientId },
        ]);
      }

      if (options?.editClient !== undefined) {
        setEditingClient(options.editClient);
      } else if (nextRoute === 'new-client') {
        setEditingClient(null);
      }

      if (options?.forBillClientId !== undefined) {
        setBillClientId(options.forBillClientId);
      } else if (nextRoute === 'client-bill' && options?.editInvoice === undefined) {
        setBillClientId(null);
      }

      if (options?.editInvoice !== undefined) {
        setEditingInvoice(options.editInvoice);
      } else if (nextRoute === 'client-bill') {
        setEditingInvoice(null);
      }

      setSelectedClientId(nextClientId);
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [route, selectedClientId]
  );

  const goBack = useCallback(() => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setSelectedClientId(prev.clientId);
      setRoute(prev.route);
      return;
    }
    setSelectedClientId(null);
    setRoute('dashboard');
  }, [history]);

  // CRUD HANDLERS
  const handleSaveClient = async (
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string,
    andCreateBill?: boolean
  ) => {
    if (existingId) {
      const updated = await api.updateClient(existingId, payload);
      setWorkspace((prev) => ({
        ...prev,
        clients: prev.clients.map((c) => (c.id === updated.id ? updated : c)),
      }));
      showToast('Customer details updated.');
      navigateTo('client-list', { clientId: updated.id });
      return;
    }

    const created = await api.createClient(payload);
    setWorkspace((prev) => ({
      ...prev,
      clients: [created, ...prev.clients],
    }));
    showToast('New customer saved.');
    if (andCreateBill) {
      navigateTo('client-bill', { forBillClientId: created.id, editInvoice: null });
    } else {
      navigateTo('client-list', { clientId: created.id });
    }
  };

  const handleDeleteClient = async (id: string) => {
    await api.deleteClient(id);
    setWorkspace((prev) => ({
      ...prev,
      clients: prev.clients.filter((c) => c.id !== id),
    }));
    showToast('Customer deleted.');
  };

  const handleSaveClientPassword = async (clientId: string, newPassword: string) => {
    const updated = await api.setClientPassword(clientId, newPassword);
    setWorkspace((prev) => ({
      ...prev,
      clients: prev.clients.map((c) => (c.id === updated.id ? updated : c)),
    }));
    showToast(`Password updated for ${updated.name}.`);
  };

  const handleSaveProduct = async (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      const updated = await api.updateProduct(existingId, payload);
      setWorkspace((prev) => ({
        ...prev,
        products: prev.products.map((p) => (p.id === updated.id ? updated : p)),
      }));
      showToast('Product updated.');
      return;
    }
    const created = await api.createProduct(payload);
    setWorkspace((prev) => ({
      ...prev,
      products: [created, ...prev.products],
    }));
    showToast('Product added to catalog.');
  };

  const handleDeleteProduct = async (id: string) => {
    await api.deleteProduct(id);
    setWorkspace((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
    }));
    showToast('Product removed.');
  };

  const handleSaveInvoice = async (
    payload: Partial<Invoice>,
    existingId?: string
  ): Promise<Invoice> => {
    if (existingId) {
      const res = await api.updateInvoice(existingId, payload);
      setWorkspace((prev) => ({
        ...prev,
        invoices: prev.invoices.map((i) =>
          i.id === res.invoice.id ? res.invoice : i
        ),
        products: res.products,
        payments: res.payments,
      }));
      showToast(`Invoice ${res.invoice.invoiceNumber} updated.`);
      return res.invoice;
    }

    const res = await api.createInvoice(payload);
    setWorkspace((prev) => ({
      ...prev,
      invoices: [res.invoice, ...prev.invoices],
      products: res.products,
      payments: res.payment ? [res.payment, ...prev.payments] : prev.payments,
    }));
    showToast(`Invoice ${res.invoice.invoiceNumber} saved.`);
    return res.invoice;
  };

  const handleDeleteInvoice = async (id: string) => {
    const res = await api.deleteInvoice(id);
    setWorkspace((prev) => ({
      ...prev,
      invoices: prev.invoices.filter((i) => i.id !== id),
      payments: prev.payments.filter((p) => p.invoiceId !== id),
      products: res.products,
    }));
    showToast('Invoice deleted and stock restored.');
  };

  const handleRecordPayment = async (payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }) => {
    const res = await api.createPayment(payload);
    setWorkspace((prev) => ({
      ...prev,
      payments: [res.payment, ...prev.payments],
      invoices: prev.invoices.map((i) =>
        i.id === res.invoice.id ? res.invoice : i
      ),
    }));
    showToast('Payment recorded.');
  };

  const handleDeletePayment = async (id: string) => {
    const res = await api.deletePayment(id);
    setWorkspace((prev) => ({
      ...prev,
      payments: prev.payments.filter((p) => p.id !== id),
      invoices: res.invoice
        ? prev.invoices.map((i) => (i.id === res.invoice!.id ? res.invoice! : i))
        : prev.invoices,
    }));
    showToast('Payment entry removed.');
  };

  const handleUpdateDelivery = async (
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ) => {
    const updated = await api.updateDelivery(invoiceId, payload);
    setWorkspace((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) => (i.id === updated.id ? updated : i)),
    }));
    showToast(`Delivery status set to ${updated.deliveryStatus}.`);
  };

  const handleAddExpense = async (
    payload: Omit<ExpenseRecord, 'id' | 'createdAt'>
  ) => {
    const created = await api.createExpense(payload);
    setWorkspace((prev) => ({
      ...prev,
      expenses: [created, ...prev.expenses],
    }));
    showToast('Expense added.');
  };

  const handleDeleteExpense = async (id: string) => {
    await api.deleteExpense(id);
    setWorkspace((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }));
    showToast('Expense deleted.');
  };

  const handleSaveSettings = async (next: BusinessSettings) => {
    const merged: BusinessSettings = {
      ...next,
      viewPanel: next.viewPanel ?? workspace.settings.viewPanel,
    };
    const saved = await api.updateSettings(merged);
    setWorkspace((prev) => ({ ...prev, settings: saved }));
    showToast('Settings saved.');
  };

  const handleSaveViewPanel = async (nextViewPanel: ViewPanelConfig) => {
    const merged: BusinessSettings = {
      ...workspace.settings,
      viewPanel: nextViewPanel,
    };
    const saved = await api.updateSettings(merged);
    setWorkspace((prev) => ({ ...prev, settings: saved }));
    showToast('View Panel updated & synced.');
  };

  const handleRestoreBackup = async (backup: WorkspaceData) => {
    const restored = await api.restoreBackup(backup);
    setWorkspace(restored);
    showToast('Backup restored successfully.');
  };

  const handleConfirmCustomerOrder = async (orderId: string) => {
    const res = await api.confirmCustomerOrder(orderId);
    setWorkspace((prev) => {
      const hasClient = prev.clients.some((c) => c.id === res.client.id);
      const hasInvoice = prev.invoices.some((i) => i.id === res.invoice.id);
      const hasPayment = res.payment
        ? prev.payments.some((p) => p.id === res.payment!.id)
        : false;
      return {
        ...prev,
        orders: prev.orders.map((o) => (o.id === res.order.id ? res.order : o)),
        clients: hasClient
          ? prev.clients.map((c) => (c.id === res.client.id ? res.client : c))
          : [res.client, ...prev.clients],
        invoices: hasInvoice ? prev.invoices : [res.invoice, ...prev.invoices],
        payments:
          res.payment && !hasPayment ? [res.payment, ...prev.payments] : prev.payments,
        products: res.products,
      };
    });
    showToast(
      `Order ${res.order.orderNumber} confirmed! Bill ${res.invoice.invoiceNumber} generated.`
    );
  };

  const handleCancelCustomerOrder = async (orderId: string) => {
    const updated = await api.cancelCustomerOrder(orderId);
    setWorkspace((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === updated.id ? updated : o)),
    }));
    showToast(`Order ${updated.orderNumber} cancelled.`);
  };

  const handleDeleteCustomerOrder = async (orderId: string) => {
    await api.deleteCustomerOrder(orderId);
    setWorkspace((prev) => ({
      ...prev,
      orders: prev.orders.filter((o) => o.id !== orderId),
    }));
    showToast('Order deleted.');
  };

  const handleUnlockAdmin = () => {
    setAdminUnlockedStored(true);
    setAdminUnlocked(true);
    setShowViewPanel(false);
    setRoute('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockAdmin = () => {
    setAdminUnlockedStored(false);
    setAdminUnlocked(false);
    setShowViewPanel(true);
    setRoute('dashboard');
    showToast('Admin Panel locked.');
  };

  const loggedInCustomer = useMemo(
    () =>
      customerSessionId
        ? workspace.clients.find((c) => c.id === customerSessionId) || null
        : null,
    [customerSessionId, workspace.clients]
  );

  useEffect(() => {
    if (!loading && customerSessionId && !loggedInCustomer) {
      setCustomerSessionId(null);
      setCustomerSessionIdState(null);
    }
  }, [loading, customerSessionId, loggedInCustomer]);

  const customerOrders = useMemo(() => {
    if (!loggedInCustomer) return [];
    return (workspace.orders || []).filter(
      (ord) =>
        ord.clientId === loggedInCustomer.id ||
        phoneNumbersMatch(ord.customerPhone, loggedInCustomer.mobile)
    );
  }, [loggedInCustomer, workspace.orders]);

  const customerBills = useMemo(() => {
    if (!loggedInCustomer) return [];
    return workspace.invoices
      .filter(
        (inv) =>
          inv.clientId === loggedInCustomer.id ||
          phoneNumbersMatch(inv.customerMobile, loggedInCustomer.mobile)
      )
      .map((inv) => ({
        ...inv,
        totalPurchaseCost: 0,
        profitAmount: 0,
        notes: '',
        items: inv.items.map((item) => ({
          ...item,
          purchasePrice: 0,
          lineCost: 0,
          lineProfit: 0,
        })),
      }));
  }, [loggedInCustomer, workspace.invoices]);

  const upsertWorkspaceClient = useCallback((client: Client) => {
    setWorkspace((prev) => {
      const exists = prev.clients.some((c) => c.id === client.id);
      return {
        ...prev,
        clients: exists
          ? prev.clients.map((c) => (c.id === client.id ? client : c))
          : [client, ...prev.clients],
      };
    });
  }, []);

  const handleCustomerLogin = useCallback(
    (client: Client) => {
      upsertWorkspaceClient(client);
      setCustomerSessionId(client.id);
      setCustomerSessionIdState(client.id);
    },
    [upsertWorkspaceClient]
  );

  const handleCustomerLogout = useCallback(() => {
    setCustomerSessionId(null);
    setCustomerSessionIdState(null);
  }, []);

  const sanitizedLoggedInCustomer = useMemo(() => {
    if (!loggedInCustomer) return null;
    const {
      passwordHash: _ph,
      passwordSalt: _ps,
      runningPasswordEnc: _rp,
      ...safeClient
    } = loggedInCustomer;
    return safeClient;
  }, [loggedInCustomer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDF9FC] flex items-center justify-center">
        <div className="text-sm font-semibold text-[#7E22CE]">
          Loading Glamour Galleria...
        </div>
      </div>
    );
  }

  if (showViewPanel || !adminUnlocked) {
    return (
      <StartPortal
        settings={workspace.settings}
        products={workspace.products}
        isAdminUnlocked={adminUnlocked}
        onOpenAdminPanel={handleUnlockAdmin}
        loggedInCustomer={sanitizedLoggedInCustomer}
        customerOrders={customerOrders}
        customerBills={customerBills}
        onCustomerLogin={handleCustomerLogin}
        onCustomerLogout={handleCustomerLogout}
        onCustomerUpdated={upsertWorkspaceClient}
      />
    );
  }

  const currencySymbol = workspace.settings.currencySymbol || '₹';

  return (
    <div className="relative min-h-screen flex flex-col text-[#1F122B]">
      <AppBackground backgroundImageDataUrl={workspace.settings.backgroundImageDataUrl} />

      {/* TOP NAVIGATION BAR (Strict 3-zone contract) */}
      <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#EFE2F5]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Brand Logo & Wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-2 min-w-0 cursor-pointer"
          >
            <BrandLogo
              logoDataUrl={workspace.settings.logoDataUrl}
              businessName={workspace.settings.businessName}
              size={32}
            />
            <span className="font-display-serif text-base sm:text-lg font-bold tracking-tight text-[#6D28D9] whitespace-nowrap truncate max-w-[110px] sm:max-w-none">
              {workspace.settings.businessName || 'Glamour Galleria'}
            </span>
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-5 overflow-x-auto">
            {(
              [
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'orders', label: 'Orders' },
                { id: 'client-list', label: 'Clients' },
                { id: 'products', label: 'Product Listing' },
                { id: 'sales-report', label: 'Reports' },
                { id: 'settings', label: 'Settings' },
              ] as const
            ).map((nav) => {
              const active = route === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => navigateTo(nav.id)}
                  className={`py-1 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                    active
                      ? 'text-[#DB2777] border-[#DB2777]'
                      : 'text-[#5B4B6B] border-transparent hover:text-[#7E22CE]'
                  }`}
                >
                  {nav.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary CTA & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowViewPanel(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>View Panel</span>
            </button>
            <button
              type="button"
              onClick={handleLockAdmin}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-2.5 sm:px-3 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Admin</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('client-bill')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 sm:px-4 py-2 text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>New Bill</span>
            </button>
          </div>
        </div>
      </header>

      {/* ACTIVE VIEW */}
      <main className="relative z-10 flex-1">
        {route === 'dashboard' && (
          <DashboardView
            workspace={workspace}
            onNavigate={(nextRoute) => navigateTo(nextRoute)}
            onOpenViewPanel={() => setShowViewPanel(true)}
          />
        )}

        {route === 'new-client' && (
          <NewClientView
            editingClient={editingClient}
            onBack={goBack}
            onSaveClient={handleSaveClient}
          />
        )}

        {route === 'client-list' && (
          <ClientListView
            clients={workspace.clients}
            invoices={workspace.invoices}
            currencySymbol={currencySymbol}
            selectedClientId={selectedClientId}
            onSelectClient={(id) => navigateTo('client-list', { clientId: id })}
            onBack={goBack}
            onAddNew={() => navigateTo('new-client', { editClient: null })}
            onEditClient={(client) =>
              navigateTo('new-client', { editClient: client })
            }
            onDeleteClient={handleDeleteClient}
            onCreateBillForClient={(client) =>
              navigateTo('client-bill', {
                forBillClientId: client.id,
                editInvoice: null,
              })
            }
            onOpenInvoice={(inv) =>
              navigateTo('client-bill', { editInvoice: inv })
            }
            onSaveClientPassword={handleSaveClientPassword}
          />
        )}

        {route === 'client-bill' && (
          <ClientBillView
            settings={workspace.settings}
            clients={workspace.clients}
            products={workspace.products}
            invoices={workspace.invoices}
            initialClientId={billClientId}
            editingInvoice={editingInvoice}
            onBack={goBack}
            onAddNewClient={() => navigateTo('new-client', { editClient: null })}
            onSaveInvoice={handleSaveInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {route === 'products' && (
          <ProductsView
            products={workspace.products}
            currencySymbol={currencySymbol}
            defaultLowStock={workspace.settings.lowStockThreshold || 5}
            onBack={goBack}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {route === 'sales-report' && (
          <SalesReportView
            invoices={workspace.invoices}
            currencySymbol={currencySymbol}
            onBack={goBack}
          />
        )}

        {route === 'payment-history' && (
          <PaymentHistoryView
            invoices={workspace.invoices}
            payments={workspace.payments}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onRecordPayment={handleRecordPayment}
            onDeletePayment={handleDeletePayment}
          />
        )}

        {route === 'delivery-tracking' && (
          <DeliveryTrackingView
            invoices={workspace.invoices}
            onBack={goBack}
            onUpdateDelivery={handleUpdateDelivery}
          />
        )}

        {route === 'profit-loss' && (
          <ProfitLossView
            invoices={workspace.invoices}
            expenses={workspace.expenses}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {route === 'settings' && (
          <SettingsView
            workspace={workspace}
            onBack={goBack}
            onSaveSettings={handleSaveSettings}
            onRestoreBackup={handleRestoreBackup}
          />
        )}

        {route === 'view-panel-control' && (
          <ViewPanelControlView
            viewPanel={workspace.settings.viewPanel || DEFAULT_VIEW_PANEL_CONFIG}
            products={workspace.products}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onOpenViewPanel={() => setShowViewPanel(true)}
            onSaveViewPanel={handleSaveViewPanel}
          />
        )}
        {route === 'orders' && (
          <OrdersView
            orders={workspace.orders || []}
            invoices={workspace.invoices}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onConfirmOrder={handleConfirmCustomerOrder}
            onCancelOrder={handleCancelCustomerOrder}
            onDeleteOrder={handleDeleteCustomerOrder}
            onOpenInvoice={(inv) => navigateTo('client-bill', { editInvoice: inv })}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-[#EFE2F5] grid grid-cols-5 items-center px-1">
        {(
          [
            { id: 'dashboard', label: 'Home', icon: Home },
            { id: 'orders', label: 'Orders', icon: ShoppingBag },
            { id: 'client-list', label: 'Clients', icon: Users },
            { id: 'products', label: 'Products', icon: Package },
            { id: 'settings', label: 'Settings', icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = route === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateTo(tab.id)}
              className={`flex flex-col items-center justify-center py-1 text-[10px] font-semibold cursor-pointer ${
                active ? 'text-[#DB2777]' : 'text-[#6B5B7B]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div className="no-print fixed bottom-16 md:bottom-5 right-4 z-50 rounded-xl bg-[#1F122B] text-white px-4 py-2.5 text-xs font-semibold shadow-lg border border-[#A855F7]/40">
          {toast}
        </div>
      )}
    </div>
  );
}
