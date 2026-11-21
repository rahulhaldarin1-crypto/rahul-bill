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

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
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
  },
  bn: {
    navHome: 'হোম',
    navClients: 'ক্লায়েন্ট',
    navBuilder: 'বিল তৈরি করুন',
    navSaved: 'সেভ করা বিল',
    navSettings: 'দোকান সেটিংস',
    backBtn: 'ফিরে যান',
    downloadPdf: 'PDF সেভ করুন',
    downloadingPdf: 'PDF তৈরি হচ্ছে...',
    printBill: 'প্রিন্ট',
    newBill: 'নতুন বিল',
    saveBill: 'বিল সেভ করুন',
    billSavedToast: 'বিলটি সফলভাবে সেভ হয়েছে',
    quickPasteBtn: 'মেসেজ পেস্ট করে অটো-ফিল',
    quickPasteTitle: 'কাস্টমারের তথ্য অটো-ফিল করুন',
    quickPasteDesc:
      'হোয়াটসঅ্যাপ মেসেজ থেকে নাম, ফোন নম্বর, ঠিকানা ও পিন কোড এখানে পেস্ট করুন—অটোমেটিক ঘরগুলো পূরণ হয়ে যাবে।',
    quickPastePlaceholder:
      'Name: Anil Barman\nPhone: +916000294107\nAddress: Near Chandra Choudhury Path, Guwahati\nPIN: Assam-781028',
    applyParsed: 'তথ্য বসান',
    cancel: 'বাতিল',
    sectionCustomer: 'কাস্টমারের বিবরণ (Bill To)',
    customerName: 'কাস্টমারের নাম',
    customerPhone: 'ফোন নম্বর',
    customerAddress: 'সম্পূর্ণ ঠিকানা',
    customerCityPin: 'শহর / রাজ্য / পিন কোড',
    sectionInvoiceMeta: 'ইনভয়েস ও অর্ডারের তথ্য',
    invoiceNo: 'ইনভয়েস নম্বর',
    autoNext: 'পরবর্তী #',
    orderDate: 'অর্ডারের তারিখ',
    deliveryDate: 'ডেলিভারির তারিখ',
    orderVia: 'অর্ডারের মাধ্যম',
    paymentTag: 'পেমেন্ট স্ট্যাটাস',
    sectionItems: 'অর্ডার করা পণ্য (Items)',
    quickAddProduct: 'দ্রুত পণ্য যোগ করুন...',
    addItem: 'নতুন পণ্য যোগ করুন',
    productName: 'পণ্যের নাম',
    size: 'সাইজ',
    qty: 'সংখ্যা',
    originalPrice: 'আসল দাম (₹)',
    discountedPrice: 'বিক্রয় মূল্য (₹)',
    amount: 'মোট',
    sectionShippingCharges: 'ডেলিভারি চার্জ, GST ও ট্র্যাকিং',
    courier: 'কুরিয়ার সার্ভিস',
    trackingId: 'ট্র্যাকিং / AWB নম্বর',
    trackingUrl: 'ট্র্যাকিং লিংক',
    deliveryCharge: 'ডেলিভারি চার্জ (₹)',
    gstPercent: 'GST (%)',
    sectionPayment: 'পেমেন্ট পদ্ধতি',
    paymentMethod: 'ব্যবহৃত পেমেন্ট মাধ্যম',
    codAmountHelper: 'COD পরিমাণ (খালি রাখলে মোট বিলের টাকা অটোমেটিক বসবে)',
    previewLabel: 'লাইভ A4 বিল প্রিভিউ',
    zoomFit: 'ফিট',
    savedTitle: 'সেভ করা বিলসমূহ',
    savedSubtitle: 'আগের তৈরি করা বিলগুলো দেখুন, এডিট করুন বা সরাসরি PDF ডাউনলোড করুন।',
    searchPlaceholder: 'নাম, ফোন বা ইনভয়েস নম্বর দিয়ে খুঁজুন...',
    filterAll: 'সবগুলো',
    emptySavedTitle: 'এখনো কোনো বিল সেভ করা নেই',
    emptySavedDesc: 'বিল তৈরি করে সেভ বা PDF ডাউনলোড করলে এখানে তালিকা দেখতে পাবেন।',
    createFirstBill: 'বিল তৈরি শুরু করুন',
    colInvoice: 'ইনভয়েস নং',
    colCustomer: 'কাস্টমার',
    colItems: 'পণ্য',
    colPayment: 'পেমেন্ট',
    colTotal: 'সর্বমোট বিল',
    colActions: 'অ্যাকশন',
    loadEditor: 'এডিট',
    duplicate: 'কপি',
    delete: 'মুছুন',
    settingsTitle: 'দোকানের তথ্য ও বিল সেটিংস',
    settingsSubtitle: 'দোকানের নাম, লোগো, UPI QR, ব্যাংক ডিটেইলস এবং নিচের নোট পরিবর্তন করুন।',
    saveSettings: 'সেটিংস সেভ করুন',
    resetDefaults: 'ডিফল্ট ফিরিয়ে আনুন',
    settingsSavedToast: 'দোকানের সেটিংস সেভ হয়েছে',
    clientsTitle: 'ক্লায়েন্ট তৈরি ও তালিকা',
    clientsSubtitle: 'আগে ক্লায়েন্টের তথ্য তৈরি করুন বা তালিকা থেকে বেছে নিয়ে সাথে সাথে বিল তৈরির অপশনে যান।',
    createClientTitle: 'নতুন ক্লায়েন্ট তৈরি করুন',
    editClientTitle: 'ক্লায়েন্ট এডিট করুন',
    saveAndCreateBill: 'ক্লায়েন্ট সেভ করে বিল তৈরি করুন',
    saveClientOnly: 'শুধু ক্লায়েন্ট সেভ করুন',
    updateClient: 'তথ্য আপডেট করুন',
    clientSavedToast: 'ক্লায়েন্ট সেভ হয়েছে',
    clientDirectoryTitle: 'সেভ করা ক্লায়েন্টসমূহ',
    clientSearchPlaceholder: 'নাম, ফোন বা পিন দিয়ে ক্লায়েন্ট খুঁজুন...',
    emptyClientsTitle: 'এখনো কোনো ক্লায়েন্ট তৈরি করা নেই',
    emptyClientsDesc: 'বাম পাশের ফর্মে ক্লায়েন্টের তথ্য দিয়ে "ক্লায়েন্ট সেভ করে বিল তৈরি করুন" বাটনে ক্লিক করুন।',
    openBlankBill: 'খালি বিল খুলুন',
    createBillForClient: 'বিল তৈরি করুন',
    selectSavedClient: 'সেভ করা ক্লায়েন্ট বাছুন...',
    saveToClients: 'ক্লায়েন্ট সেভ করুন',
    billsCountLabel: 'টি অর্ডার',
    backToClients: 'সব ক্লায়েন্ট',
    clientOrdersTitle: 'অর্ডার ইতিহাস (Order History)',
    totalOrdersLabel: 'মোট অর্ডার',
    totalSpentLabel: 'মোট বিল',
    lastOrderLabel: 'শেষ অর্ডার',
    newOrderForClient: 'নতুন অর্ডার / বিল যোগ করুন',
    repeatOrder: 'রিপিট অর্ডার',
    noClientOrdersTitle: 'এই ক্লায়েন্টের কোনো অর্ডার এখনো সেভ করা নেই',
    noClientOrdersDesc: 'নতুন অর্ডার নম্বর ও তারিখ দিয়ে বিল তৈরি করতে "নতুন অর্ডার / বিল যোগ করুন" বাটনে ক্লিক করুন।',
    colOrderDate: 'অর্ডারের তারিখ',
    viewOrdersHint: 'অর্ডার দেখতে নামে ক্লিক করুন',
    editingForClient: 'ক্লায়েন্ট প্রোফাইল',
    homeCreateClient: 'Create New Client',
    homeCreateClientDesc: 'নতুন ক্লায়েন্টের তথ্য এন্ট্রি করে বিল তৈরি করুন।',
    homeClientList: 'Client List',
    homeClientListDesc: 'সেভ করা ক্লায়েন্টদের প্রোফাইল ও সম্পূর্ণ তথ্য দেখুন।',
    homeMasterUserTitle: 'Master User',
    homeMasterUserDesc: 'নতুন ক্লায়েন্ট তৈরি ও সেভ করতে ক্লিক করুন।',
    homeBillsTitle: 'Bill',
    homeBillsDesc: 'সব ক্লায়েন্টের সমস্ত বিল এক জায়গায় দেখুন।',
    allClientsFilter: 'সব ক্লায়েন্ট',
    totalBilledLabel: 'মোট বিল',
    clientIdLabel: 'ক্লায়েন্ট আইডি',
    clientProfileLabel: 'ক্লায়েন্ট প্রোফাইল',
  },
};
