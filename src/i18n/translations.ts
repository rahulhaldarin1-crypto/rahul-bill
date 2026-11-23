import { Language } from '../types/invoice';

export interface Translations {
  navHome: string;
  navClients: string;
  navBuilder: string;
  navSaved: string;
  navSettings: string;
  backBtn: string;
  downloadPdf: string;
  downloadingPdf: string;
  printBill: string;
  newBill: string;
  saveBill: string;
  billSavedToast: string;
  quickPasteBtn: string;
  quickPasteTitle: string;
  quickPasteDesc: string;
  quickPastePlaceholder: string;
  applyParsed: string;
  cancel: string;
  sectionCustomer: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCityPin: string;
  sectionInvoiceMeta: string;
  invoiceNo: string;
  autoNext: string;
  orderDate: string;
  deliveryDate: string;
  orderVia: string;
  paymentTag: string;
  sectionItems: string;
  quickAddProduct: string;
  addItem: string;
  productName: string;
  size: string;
  qty: string;
  originalPrice: string;
  discountedPrice: string;
  amount: string;
  sectionShippingCharges: string;
  courier: string;
  trackingId: string;
  trackingUrl: string;
  deliveryCharge: string;
  gstPercent: string;
  sectionPayment: string;
  paymentMethod: string;
  codAmountHelper: string;
  previewLabel: string;
  zoomFit: string;
  savedTitle: string;
  savedSubtitle: string;
  searchPlaceholder: string;
  filterAll: string;
  emptySavedTitle: string;
  emptySavedDesc: string;
  createFirstBill: string;
  colInvoice: string;
  colCustomer: string;
  colItems: string;
  colPayment: string;
  colTotal: string;
  colActions: string;
  loadEditor: string;
  duplicate: string;
  delete: string;
  settingsTitle: string;
  settingsSubtitle: string;
  saveSettings: string;
  resetDefaults: string;
  settingsSavedToast: string;
  clientsTitle: string;
  clientsSubtitle: string;
  createClientTitle: string;
  editClientTitle: string;
  saveAndCreateBill: string;
  saveClientOnly: string;
  updateClient: string;
  clientSavedToast: string;
  clientDirectoryTitle: string;
  clientSearchPlaceholder: string;
  emptyClientsTitle: string;
  emptyClientsDesc: string;
  openBlankBill: string;
  createBillForClient: string;
  selectSavedClient: string;
  saveToClients: string;
  billsCountLabel: string;
  backToClients: string;
  clientOrdersTitle: string;
  totalOrdersLabel: string;
  totalSpentLabel: string;
  lastOrderLabel: string;
  newOrderForClient: string;
  repeatOrder: string;
  noClientOrdersTitle: string;
  noClientOrdersDesc: string;
  colOrderDate: string;
  viewOrdersHint: string;
  editingForClient: string;
  homeCreateClient: string;
  homeCreateClientDesc: string;
  homeClientList: string;
  homeClientListDesc: string;
  homeMasterUserTitle: string;
  homeMasterUserDesc: string;
  homeBillsTitle: string;
  homeBillsDesc: string;
  allClientsFilter: string;
  totalBilledLabel: string;
  clientIdLabel: string;
  clientProfileLabel: string;
}

const ENGLISH_TRANSLATIONS: Translations = {
  navHome: 'Home',
  navClients: 'Clients',
  navBuilder: 'Invoice Builder',
  navSaved: 'Saved Bills',
  navSettings: 'Store Settings',
  backBtn: 'Back',
  downloadPdf: 'Download PDF',
  downloadingPdf: 'Generating PDF...',
  printBill: 'Print',
  newBill: 'New Bill',
  saveBill: 'Save Bill',
  billSavedToast: 'Invoice saved to Saved Bills',
  quickPasteBtn: 'Paste Customer Text',
  quickPasteTitle: 'Auto-Fill Customer Details',
  quickPasteDesc:
    'Paste a WhatsApp message or address block with Name, Phone, Address, and PIN. Details will fill automatically.',
  quickPastePlaceholder:
    'Name: Anil Barman\nPhone: +916000294107\nAddress: Near Chandra Choudhury Path, Guwahati\nPIN: Assam-781028',
  applyParsed: 'Fill Customer Details',
  cancel: 'Cancel',
  sectionCustomer: 'Customer Details (Bill To)',
  customerName: 'Customer Name',
  customerPhone: 'Phone Number',
  customerAddress: 'Street Address',
  customerCityPin: 'City / State / PIN',
  sectionInvoiceMeta: 'Invoice & Order Details',
  invoiceNo: 'Invoice No',
  autoNext: 'Next #',
  orderDate: 'Order Date',
  deliveryDate: 'Delivery Date',
  orderVia: 'Order Via',
  paymentTag: 'Payment Label',
  sectionItems: 'Order Items',
  quickAddProduct: 'Quick add preset...',
  addItem: 'Add Product',
  productName: 'Product Name',
  size: 'Size',
  qty: 'Qty',
  originalPrice: 'Original (₹)',
  discountedPrice: 'Price (₹)',
  amount: 'Amount',
  sectionShippingCharges: 'Shipping, Delivery & GST',
  courier: 'Courier Partner',
  trackingId: 'Tracking / AWB No',
  trackingUrl: 'Tracking URL',
  deliveryCharge: 'Delivery Charge (₹)',
  gstPercent: 'GST (%)',
  sectionPayment: 'Payment Method',
  paymentMethod: 'Select Method Used',
  codAmountHelper: 'COD Amount (auto-syncs with Grand Total if blank)',
  previewLabel: 'Live A4 Invoice Preview',
  zoomFit: 'Fit',
  savedTitle: 'Saved Invoices',
  savedSubtitle: 'View, reload, duplicate, or export previously generated customer bills.',
  searchPlaceholder: 'Search by customer name, phone, or invoice no...',
  filterAll: 'All',
  emptySavedTitle: 'No saved invoices yet',
  emptySavedDesc: 'Save a bill from the Invoice Builder or download a PDF to keep a record here.',
  createFirstBill: 'Open Invoice Builder',
  colInvoice: 'Invoice No',
  colCustomer: 'Customer',
  colItems: 'Items',
  colPayment: 'Payment',
  colTotal: 'Grand Total',
  colActions: 'Actions',
  loadEditor: 'Edit',
  duplicate: 'Duplicate',
  delete: 'Delete',
  settingsTitle: 'Store Profile & Invoice Template',
  settingsSubtitle: 'Customize branding, UPI/Bank details, logo crest, and footer notes.',
  saveSettings: 'Save Settings',
  resetDefaults: 'Restore Defaults',
  settingsSavedToast: 'Store settings updated',
  clientsTitle: 'Client Directory',
  clientsSubtitle: 'Create a client profile first or pick an existing client to open the bill builder.',
  createClientTitle: 'Create New Client',
  editClientTitle: 'Edit Client',
  saveAndCreateBill: 'Save Client & Create Bill',
  saveClientOnly: 'Save Client',
  updateClient: 'Update Client',
  clientSavedToast: 'Client saved to directory',
  clientDirectoryTitle: 'Saved Clients',
  clientSearchPlaceholder: 'Search clients by name, phone, or PIN...',
  emptyClientsTitle: 'No clients created yet',
  emptyClientsDesc: 'Enter client details on the left and click "Save Client & Create Bill" to start billing.',
  openBlankBill: 'Open Blank Bill',
  createBillForClient: 'Create Bill',
  selectSavedClient: 'Select saved client...',
  saveToClients: 'Save Client',
  billsCountLabel: 'orders',
  backToClients: 'All Clients',
  clientOrdersTitle: 'Order History',
  totalOrdersLabel: 'Total Orders',
  totalSpentLabel: 'Total Billed',
  lastOrderLabel: 'Last Order',
  newOrderForClient: 'New Order / Bill',
  repeatOrder: 'Repeat',
  noClientOrdersTitle: 'No orders recorded for this client yet',
  noClientOrdersDesc: 'Click "New Order / Bill" to enter products, order date, and order number.',
  colOrderDate: 'Order Date',
  viewOrdersHint: 'Click name to view orders',
  editingForClient: 'Client Profile',
  homeCreateClient: 'Create New Client',
  homeCreateClientDesc: 'Enter new client details and generate a bill.',
  homeClientList: 'Client List',
  homeClientListDesc: 'Open saved clients to view and add client bills.',
  homeMasterUserTitle: 'Master User',
  homeMasterUserDesc: 'Click to create and save a new client profile.',
  homeBillsTitle: 'All Bills',
  homeBillsDesc: 'View all clients’ saved bills gathered in one place.',
  allClientsFilter: 'All Clients',
  totalBilledLabel: 'Total Billed',
  clientIdLabel: 'Client ID',
  clientProfileLabel: 'Client Profile',
};

export const TRANSLATIONS: Record<Language, Translations> = {
  en: ENGLISH_TRANSLATIONS,
  bn: ENGLISH_TRANSLATIONS,
};
