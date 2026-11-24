import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  Home,
  LifeBuoy,
  Lock,
  Mail,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react';
import {
  auth,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from './firebase';
import { AdminLockView } from './components/AdminLockView';
import { AppBackground } from './components/AppBackground';
import { BrandLogo } from './components/BrandLogo';
import { ClientBillView } from './components/ClientBillView';
import { ClientListView } from './components/ClientListView';
import { DashboardView } from './components/DashboardView';
import { DeliveryTrackingView } from './components/DeliveryTrackingView';
import { HelpChatAdminView } from './components/HelpChatAdminView';
import { NewClientView } from './components/NewClientView';
import { OrdersView } from './components/OrdersView';
import { PaymentHistoryView } from './components/PaymentHistoryView';
import { ProductsView } from './components/ProductsView';
import { ProfitLossView } from './components/ProfitLossView';
import { SalesReportView } from './components/SalesReportView';
import { SellerHubManageView } from './components/SellerHubManageView';
import { SettingsView } from './components/SettingsView';
import { SmartOffersMailView } from './components/SmartOffersMailView';
import { StartPortal } from './components/StartPortal';
import { ViewPanelControlView } from './components/ViewPanelControlView';
import {
  AdminPaymentSettings,
  AppRoute,
  BusinessSettings,
  Client,
  CustomerOrder,
  DeliveryStatus,
  ExpenseRecord,
  HighlightConfig,
  HighlightRequestStatus,
  Invoice,
  PaymentMethod,
  Product,
  ProductReview,
  SellerAccountStatus,
  SellerApprovalStatus,
  SellerFollowRecord,
  SellerPublicPaymentProfile,
  ViewPanelConfig,
  WorkspaceData,
} from './types/business';
import {
  getCustomerSessionId,
  getSellerSessionId,
  setAdminUnlockedStored,
  setCustomerSessionId,
} from './utils/adminAuth';
import { isAdminOnlyAppMode } from './utils/appMode';
import { api } from './utils/api';
import {
  DEFAULT_ADMIN_PAYMENT_SETTINGS,
  DEFAULT_HIGHLIGHT_CONFIG,
  DEFAULT_VIEW_PANEL_CONFIG,
  createEmptyWorkspace,
  isAuthorizedAdminEmail,
  mergeAdminPaymentSettings,
  mergeBusinessSettings,
} from './utils/calculations';

interface HistoryEntry {
  route: AppRoute;
  clientId: string | null;
}

export default function App() {
  const adminOnlyMode = isAdminOnlyAppMode();
  const [loading, setLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData>(createEmptyWorkspace);
  const [customerSettings, setCustomerSettings] = useState<BusinessSettings>(
    () => createEmptyWorkspace().settings
  );
  const [customerPaymentSettings, setCustomerPaymentSettings] =
    useState<AdminPaymentSettings>(() => ({ ...DEFAULT_ADMIN_PAYMENT_SETTINGS }));
  const [customerProducts, setCustomerProducts] = useState<Product[]>([]);
  const [approvedSellerIds, setApprovedSellerIds] = useState<string[]>([]);
  const [sellerPaymentProfiles, setSellerPaymentProfiles] = useState<
    Record<string, SellerPublicPaymentProfile>
  >({});
  const [highlightSeatUsage, setHighlightSeatUsage] = useState<
    Record<string, number>
  >({});
  const [customerSellerFollows, setCustomerSellerFollows] = useState<
    SellerFollowRecord[]
  >([]);
  const [customerProductReviews, setCustomerProductReviews] = useState<
    ProductReview[]
  >([]);
  const [isolatedCustomer, setIsolatedCustomer] = useState<Client | null>(null);
  const [isolatedCustomerOrders, setIsolatedCustomerOrders] = useState<CustomerOrder[]>([]);
  const [isolatedCustomerBills, setIsolatedCustomerBills] = useState<Invoice[]>([]);

  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(false);
  const [adminAuthChecked, setAdminAuthChecked] = useState<boolean>(() => !adminOnlyMode);
  const [adminDeniedMessage, setAdminDeniedMessage] = useState<string>('');

  // Enforce strict Admin Google Authentication allowlist on mount & auth state changes
  useEffect(() => {
    if (!adminOnlyMode) return;
    let active = true;

    void getRedirectResult(auth).catch(() => undefined);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (user) {
        if (isAuthorizedAdminEmail(user.email)) {
          setAdminDeniedMessage('');
          setAdminUnlockedStored(true);
          setAdminUnlocked(true);
          setAdminAuthChecked(true);
        } else {
          await signOut(auth).catch(() => undefined);
          if (!active) return;
          setAdminUnlockedStored(false);
          setAdminUnlocked(false);
          setWorkspace(createEmptyWorkspace());
          setWorkspaceLoaded(false);
          setAdminDeniedMessage('Access Denied: Unauthorized Admin Account');
          setAdminAuthChecked(true);
        }
      } else {
        setAdminUnlockedStored(false);
        setAdminUnlocked(false);
        setWorkspace(createEmptyWorkspace());
        setWorkspaceLoaded(false);
        setAdminAuthChecked(true);
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
    };
  }, [adminOnlyMode]);

  const [customerSessionId, setCustomerSessionIdState] = useState<string | null>(() =>
    getCustomerSessionId()
  );
  const [sellerSessionId, setSellerSessionIdState] = useState<string | null>(() =>
    getSellerSessionId()
  );

  useEffect(() => {
    const syncSellerSession = () => {
      setSellerSessionIdState(getSellerSessionId());
    };
    window.addEventListener('gg-seller-session-changed', syncSellerSession);
    window.addEventListener('storage', syncSellerSession);
    return () => {
      window.removeEventListener('gg-seller-session-changed', syncSellerSession);
      window.removeEventListener('storage', syncSellerSession);
    };
  }, []);

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

  // Load from Cloud Firestore and keep synced in real time
  // Admin Mode loads full workspace ONLY after verified Google Admin unlock; otherwise only lightweight public branding for the lock screen
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    if (adminOnlyMode) {
      if (!adminAuthChecked) return;

      if (!adminUnlocked) {
        api
          .fetchPublicSettingsOnly()
          .then((settings) => {
            if (!active) return;
            setWorkspace((prev) => ({
              ...createEmptyWorkspace(),
              settings,
              paymentSettings: prev.paymentSettings,
            }));
          })
          .finally(() => {
            if (active) setLoading(false);
          });
        return () => {
          active = false;
        };
      }

      setLoading(true);
      api
        .fetchWorkspace()
        .then((data) => {
          if (!active) return;
          setWorkspace(data);
          setWorkspaceLoaded(true);
          unsubscribe = api.subscribeWorkspace(
            (updater) => {
              if (active) setWorkspace(updater);
            },
            (err) => {
              const msg = err.message || '';
              if (
                msg.includes('permission-denied') ||
                msg.includes('Missing or insufficient permissions')
              ) {
                showToast('Firestore permission denied. Check Firestore Rules in Firebase Console.');
              }
            }
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : '';
          if (
            msg.includes('permission-denied') ||
            msg.includes('Missing or insufficient permissions')
          ) {
            showToast('Firestore permission denied. Update Firestore Rules in Firebase Console.');
          } else {
            showToast('Could not connect to Cloud Firestore. Please refresh.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      api
        .fetchCustomerStorefront()
        .then((data) => {
          if (!active) return;
          setCustomerSettings(data.settings);
          setCustomerPaymentSettings(data.paymentSettings);
          setCustomerProducts(data.products);
          setApprovedSellerIds(data.approvedSellerIds);
          setSellerPaymentProfiles(data.sellerPaymentProfiles);
          setHighlightSeatUsage(data.highlightSeatUsage);
          setCustomerSellerFollows(data.sellerFollows);
          setCustomerProductReviews(data.productReviews);
          setWorkspaceLoaded(true);
          unsubscribe = api.subscribeCustomerStorefront(
            (nextSettings) => {
              if (active) setCustomerSettings(nextSettings);
            },
            (nextPaymentSettings) => {
              if (active) setCustomerPaymentSettings(nextPaymentSettings);
            },
            (nextProducts) => {
              if (active) setCustomerProducts(nextProducts);
            },
            (nextApprovedIds) => {
              if (active) setApprovedSellerIds(nextApprovedIds);
            },
            (nextProfiles) => {
              if (active) setSellerPaymentProfiles(nextProfiles);
            },
            (nextSeatUsage) => {
              if (active) setHighlightSeatUsage(nextSeatUsage);
            },
            (err) => {
              const msg = err.message || '';
              if (
                msg.includes('permission-denied') ||
                msg.includes('Missing or insufficient permissions')
              ) {
                showToast('Firestore permission denied. Check Firestore Rules in Firebase Console.');
              }
            },
            (nextFollows) => {
              if (active) setCustomerSellerFollows(nextFollows);
            },
            (nextReviews) => {
              if (active) setCustomerProductReviews(nextReviews);
            }
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : '';
          if (
            msg.includes('permission-denied') ||
            msg.includes('Missing or insufficient permissions')
          ) {
            showToast('Firestore permission denied. Update Firestore Rules in Firebase Console.');
          } else {
            showToast('Could not connect to Cloud Firestore. Please refresh.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [adminOnlyMode, adminAuthChecked, adminUnlocked, showToast]);

  // In Customer Mode, subscribe ONLY to the logged-in customer's own client record, orders, and bills
  useEffect(() => {
    if (adminOnlyMode) return;
    if (!customerSessionId) {
      setIsolatedCustomer(null);
      setIsolatedCustomerOrders([]);
      setIsolatedCustomerBills([]);
      return;
    }

    let active = true;
    const unsubscribe = api.subscribeCustomerAccount(
      customerSessionId,
      (client) => {
        if (!active) return;
        if (!client) {
          setIsolatedCustomer(null);
          setIsolatedCustomerOrders([]);
          setIsolatedCustomerBills([]);
          setCustomerSessionId(null);
          setCustomerSessionIdState(null);
          return;
        }
        setIsolatedCustomer(client);
      },
      (orders) => {
        if (active) setIsolatedCustomerOrders(orders);
      },
      (bills) => {
        if (active) setIsolatedCustomerBills(bills);
      },
      () => {
        // ignore transient snapshot errors
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [adminOnlyMode, customerSessionId]);

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
    existingId?: string,
    expectedSellerId?: string
  ) => {
    if (existingId) {
      const updated = await api.updateProduct(existingId, payload, expectedSellerId);
      if (adminOnlyMode) {
        setWorkspace((prev) => ({
          ...prev,
          products: prev.products.map((p) => (p.id === updated.id ? updated : p)),
        }));
      } else {
        setCustomerProducts((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
      }
      showToast('Product updated.');
      return;
    }
    const created = await api.createProduct(payload);
    if (adminOnlyMode) {
      setWorkspace((prev) => ({
        ...prev,
        products: [created, ...prev.products],
      }));
    } else {
      setCustomerProducts((prev) => [created, ...prev]);
    }
    showToast('Product added to catalog.');
  };

  const handleDeleteProduct = async (id: string, expectedSellerId?: string) => {
    await api.deleteProduct(id, expectedSellerId);
    if (adminOnlyMode) {
      setWorkspace((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== id),
      }));
    } else {
      setCustomerProducts((prev) => prev.filter((p) => p.id !== id));
    }
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
      highlightConfig: next.highlightConfig ?? workspace.settings.highlightConfig,
      lastAdminOtpVerifiedAt:
        next.lastAdminOtpVerifiedAt ?? workspace.settings.lastAdminOtpVerifiedAt,
    };
    const saved = await api.updateSettings(merged);
    setWorkspace((prev) => ({
      ...prev,
      settings: saved,
      paymentSettings: mergeAdminPaymentSettings(prev.paymentSettings, saved),
    }));
    showToast('Settings saved.');
  };

  const handleSavePaymentSettings = async (next: AdminPaymentSettings) => {
    const res = await api.updatePaymentSettings(next);
    setWorkspace((prev) => ({
      ...prev,
      paymentSettings: res.paymentSettings,
      settings: res.settings,
    }));
    showToast('Payment System updated & synced live across Admin, Seller Hub & Checkout.');
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

  const handleSaveHighlightConfig = async (nextConfig: HighlightConfig) => {
    const merged = mergeBusinessSettings({
      ...workspace.settings,
      upiId: nextConfig.upiId || workspace.settings.upiId,
      highlightConfig: {
        ...nextConfig,
        updatedAt: new Date().toISOString(),
      },
    });
    const saved = await api.updateSettings(merged);
    setWorkspace((prev) => ({
      ...prev,
      settings: saved,
      paymentSettings: mergeAdminPaymentSettings(prev.paymentSettings, saved),
    }));
    showToast('Highlight plans & placement rules saved.');
  };

  const handleUpdateHighlightRequestStatus = async (
    requestId: string,
    status: HighlightRequestStatus,
    adminRemarks?: string
  ) => {
    const res = await api.updateHighlightRequestStatus(
      requestId,
      status,
      adminRemarks
    );
    setWorkspace((prev) => ({
      ...prev,
      highlightRequests: (prev.highlightRequests || []).map((r) =>
        r.id === res.request.id ? res.request : r
      ),
      products: res.product
        ? prev.products.map((p) => (p.id === res.product!.id ? res.product! : p))
        : prev.products,
    }));
    showToast(
      status === 'approved'
        ? `Highlight activated for ${res.request.productName}!`
        : `Highlight request marked as ${status}.`
    );
  };

  const handleDeleteHighlightRequest = async (requestId: string) => {
    await api.deleteHighlightRequest(requestId);
    setWorkspace((prev) => ({
      ...prev,
      highlightRequests: (prev.highlightRequests || []).filter(
        (r) => r.id !== requestId
      ),
    }));
    showToast('Highlight request deleted.');
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

  const handleUpdateSellerStatus = async (
    applicationId: string,
    status: SellerAccountStatus,
    adminRemarks?: string,
    credentials?: {
      sellerCode?: string;
      email?: string;
      password?: string;
    }
  ) => {
    const updated = await api.updateSellerApplicationStatus(
      applicationId,
      status,
      adminRemarks,
      credentials
    );
    setWorkspace((prev) => ({
      ...prev,
      sellerApplications: (prev.sellerApplications || []).map((a) =>
        a.id === updated.id ? updated : a
      ),
    }));
    showToast(
      status === 'approved'
        ? `Seller approved (${updated.sellerCode || updated.name}) — account activated.`
        : `Seller status updated to ${status}.`
    );
  };

  const handleSetSellerPassword = async (
    applicationId: string,
    newPassword: string
  ) => {
    const updated = await api.setSellerPassword(applicationId, newPassword);
    setWorkspace((prev) => ({
      ...prev,
      sellerApplications: (prev.sellerApplications || []).map((a) =>
        a.id === updated.id ? updated : a
      ),
    }));
    showToast(`Seller login password updated for ${updated.name}.`);
  };

  const handleDeleteSellerApplication = async (applicationId: string) => {
    await api.deleteSellerApplication(applicationId);
    setWorkspace((prev) => ({
      ...prev,
      sellerApplications: (prev.sellerApplications || []).filter(
        (a) => a.id !== applicationId
      ),
    }));
    showToast('Seller application deleted.');
  };

  const handleUpdateProductApproval = async (
    productId: string,
    sellerApprovalStatus: SellerApprovalStatus
  ) => {
    const updated = await api.updateProductApproval(
      productId,
      sellerApprovalStatus
    );
    setWorkspace((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === updated.id ? updated : p)),
    }));
    showToast(`Seller product marked as ${sellerApprovalStatus}.`);
  };

  const handleUnlockAdmin = () => {
    const email = auth.currentUser?.email;
    if (!isAuthorizedAdminEmail(email)) {
      void signOut(auth).catch(() => undefined);
      setAdminUnlockedStored(false);
      setAdminUnlocked(false);
      setAdminDeniedMessage('Access Denied: Unauthorized Admin Account');
      return;
    }
    setAdminDeniedMessage('');
    setAdminUnlockedStored(true);
    setAdminUnlocked(true);
    setRoute('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockAdmin = async () => {
    await signOut(auth).catch(() => undefined);
    setAdminUnlockedStored(false);
    setAdminUnlocked(false);
    setWorkspace(createEmptyWorkspace());
    setWorkspaceLoaded(false);
    setRoute('dashboard');
    showToast('Admin Panel locked.');
  };

  const handleCustomerLogin = useCallback(
    (client: Client) => {
      setIsolatedCustomer(client);
      setCustomerSessionId(client.id);
      setCustomerSessionIdState(client.id);
    },
    []
  );

  const handleCustomerLogout = useCallback(() => {
    void signOut(auth).catch(() => undefined);
    setCustomerSessionId(null);
    setCustomerSessionIdState(null);
    setIsolatedCustomer(null);
    setIsolatedCustomerOrders([]);
    setIsolatedCustomerBills([]);
  }, []);

  const handleCustomerUpdated = useCallback((client: Client) => {
    setIsolatedCustomer(client);
  }, []);

  const handleToggleFollowSeller = useCallback(
    async (sellerId: string, client: Client) => {
      const res = await api.toggleSellerFollow({
        sellerId,
        clientId: client.id,
        customerName: client.name,
      });
      setCustomerSellerFollows((prev) => {
        const filtered = prev.filter(
          (f) => !(f.sellerId === sellerId && f.clientId === client.id)
        );
        return res.following && res.follow ? [res.follow, ...filtered] : filtered;
      });
      setSellerPaymentProfiles((prev) => {
        const current = prev[sellerId];
        if (!current) return prev;
        return {
          ...prev,
          [sellerId]: {
            ...current,
            followersCount: res.followersCount,
          },
        };
      });
      return res;
    },
    []
  );

  const handleSubmitProductReview = useCallback(
    async (payload: {
      productId: string;
      sellerId?: string;
      client: Client;
      rating: number;
      comment: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
      mediaRecord?: import('./types/business').CloudinaryMediaRecord;
    }) => {
      const saved = await api.submitProductReview({
        productId: payload.productId,
        sellerId: payload.sellerId,
        clientId: payload.client.id,
        customerName: payload.client.name,
        rating: payload.rating,
        comment: payload.comment,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        mediaRecord: payload.mediaRecord,
      });
      setCustomerProductReviews((prev) => [
        saved,
        ...prev.filter((r) => r.id !== saved.id),
      ]);
      return saved;
    },
    []
  );

  const sanitizedCustomerProducts = useMemo(() => {
    return customerProducts.map((p) =>
      sellerSessionId && p.sellerId === sellerSessionId
        ? p
        : { ...p, purchasePrice: 0 }
    );
  }, [customerProducts, sellerSessionId]);

  // Keep workspaceLoaded read cleanly for admin-mode sanity checks
  void workspaceLoaded;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDF9FC] flex items-center justify-center">
        <div className="text-sm font-semibold text-[#7E22CE]">
          Loading Glamour Galleria...
        </div>
      </div>
    );
  }

  if (!adminOnlyMode) {
    return (
      <StartPortal
        settings={customerSettings}
        paymentSettings={customerPaymentSettings}
        products={sanitizedCustomerProducts}
        approvedSellerIds={approvedSellerIds}
        sellerPaymentProfiles={sellerPaymentProfiles}
        highlightSeatUsage={highlightSeatUsage}
        sellerFollows={customerSellerFollows}
        productReviews={customerProductReviews}
        loggedInCustomer={isolatedCustomer}
        customerOrders={isolatedCustomerOrders}
        customerBills={isolatedCustomerBills}
        onCustomerLogin={handleCustomerLogin}
        onCustomerLogout={handleCustomerLogout}
        onCustomerUpdated={handleCustomerUpdated}
        onSaveProduct={handleSaveProduct}
        onDeleteProduct={handleDeleteProduct}
        onToggleFollowSeller={handleToggleFollowSeller}
        onSubmitProductReview={handleSubmitProductReview}
      />
    );
  }

  if (!adminUnlocked) {
    return (
      <>
        <AdminLockView
          settings={workspace.settings}
          deniedMessage={adminDeniedMessage}
          onClearDeniedMessage={() => setAdminDeniedMessage('')}
          onUnlock={handleUnlockAdmin}
        />
        {toast && (
          <div className="no-print fixed bottom-5 right-4 z-50 rounded-xl bg-[#1F122B] text-white px-4 py-2.5 text-xs font-semibold shadow-lg border border-[#A855F7]/40">
            {toast}
          </div>
        )}
      </>
    );
  }

  const currencySymbol = workspace.settings.currencySymbol || '₹';
  const pendingSellerCount =
    (workspace.sellerApplications || []).filter((a) => a.status === 'pending')
      .length +
    workspace.products.filter(
      (p) =>
        Boolean(p.sellerId) &&
        p.sellerApprovalStatus !== 'approved' &&
        p.sellerApprovalStatus !== 'rejected'
    ).length +
    (workspace.highlightRequests || []).filter(
      (r) => r.status === 'pending_approval'
    ).length;
  const unreadHelpChatCount = (workspace.supportChats || []).reduce(
    (sum, t) => sum + Math.max(0, Number(t.unreadForAdmin) || 0),
    0
  );

  return (
    <div className="relative min-h-screen flex flex-col text-[#1F122B]">
      <AppBackground backgroundImageDataUrl={workspace.settings.backgroundImageDataUrl} />

      {/* TOP NAVIGATION BAR (Strict 3-zone contract) */}
      <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#EFE2F5]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand Logo & Wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-2 min-w-0 shrink cursor-pointer"
          >
            <BrandLogo
              logoDataUrl={workspace.settings.logoDataUrl}
              businessName={workspace.settings.businessName}
              size={32}
            />
            <span className="font-display-serif text-base sm:text-lg font-bold tracking-tight text-[#6D28D9] whitespace-nowrap truncate max-w-[92px] sm:max-w-none">
              {workspace.settings.businessName || 'Glamour Galleria'}
            </span>
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-5 overflow-x-auto">
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

          {/* Zone 3: Seller Hub Manage, Help Chat, New Bill & Lock Admin */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('seller-hub-manage')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === 'seller-hub-manage'
                  ? 'border-[#DB2777] bg-[#FDF2F8] text-[#9D174D]'
                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE]'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-[#DB2777] shrink-0" />
              <span>Seller Hub Manage</span>
              {pendingSellerCount > 0 && (
                <span className="rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num leading-none">
                  {pendingSellerCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigateTo('smart-offers-mail')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === 'smart-offers-mail'
                  ? 'border-[#DB2777] bg-[#FDF2F8] text-[#9D174D]'
                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE]'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-[#DB2777] shrink-0" />
              <span className="hidden sm:inline">Smart Offers Mail</span>
              <span className="sm:hidden">Offers Mail</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('help-chat')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                route === 'help-chat'
                  ? 'border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE]'
              }`}
            >
              <LifeBuoy className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
              <span>Help Chat</span>
              {unreadHelpChatCount > 0 && (
                <span className="rounded-md bg-[#7E22CE] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num leading-none">
                  {unreadHelpChatCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigateTo('client-bill')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
              <span>New Bill</span>
            </button>

            <button
              type="button"
              onClick={handleLockAdmin}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Lock Admin</span>
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
            supportChats={workspace.supportChats || []}
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
            paymentSettings={workspace.paymentSettings}
            onBack={goBack}
            onSaveSettings={handleSaveSettings}
            onSavePaymentSettings={handleSavePaymentSettings}
            onRestoreBackup={handleRestoreBackup}
          />
        )}

        {route === 'view-panel-control' && (
          <ViewPanelControlView
            viewPanel={workspace.settings.viewPanel || DEFAULT_VIEW_PANEL_CONFIG}
            products={workspace.products}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onSaveViewPanel={handleSaveViewPanel}
          />
        )}
        {route === 'orders' && (
          <OrdersView
            orders={workspace.orders || []}
            invoices={workspace.invoices}
            products={workspace.products}
            currencySymbol={currencySymbol}
            onBack={goBack}
            onConfirmOrder={handleConfirmCustomerOrder}
            onCancelOrder={handleCancelCustomerOrder}
            onDeleteOrder={handleDeleteCustomerOrder}
            onOpenInvoice={(inv) => navigateTo('client-bill', { editInvoice: inv })}
          />
        )}

        {route === 'seller-hub-manage' && (
          <SellerHubManageView
            sellerApplications={workspace.sellerApplications || []}
            products={workspace.products}
            highlightRequests={workspace.highlightRequests || []}
            highlightConfig={
              workspace.settings.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG
            }
            currencySymbol={currencySymbol}
            defaultLowStock={workspace.settings.lowStockThreshold || 5}
            onBack={goBack}
            onUpdateSellerStatus={handleUpdateSellerStatus}
            onSetSellerPassword={handleSetSellerPassword}
            onDeleteSellerApplication={handleDeleteSellerApplication}
            onUpdateProductApproval={handleUpdateProductApproval}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onSaveHighlightConfig={handleSaveHighlightConfig}
            onUpdateHighlightRequestStatus={handleUpdateHighlightRequestStatus}
            onDeleteHighlightRequest={handleDeleteHighlightRequest}
          />
        )}

        {route === 'help-chat' && (
          <HelpChatAdminView
            supportChats={workspace.supportChats || []}
            clients={workspace.clients}
            onBack={goBack}
            onOpenCustomerProfile={(clientId) =>
              navigateTo('client-list', { clientId })
            }
          />
        )}

        {route === 'smart-offers-mail' && (
          <SmartOffersMailView
            clients={workspace.clients}
            orders={workspace.orders || []}
            invoices={workspace.invoices}
            products={workspace.products}
            businessName={workspace.settings.businessName || 'Glamour Galleria'}
            onBack={goBack}
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
