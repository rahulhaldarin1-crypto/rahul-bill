import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import { BusinessSettings, WorkspaceData } from '../types/business';
import {
  DEFAULT_SETTINGS,
  normalizeIndianPhone,
  resizeImageFileToDataUrl,
  todayIsoDate,
} from '../utils/calculations';
import { DEFAULT_BACKGROUND_IMAGE_PATH } from './AppBackground';
import { BrandLogo } from './BrandLogo';
import { ConfirmModal } from './ConfirmModal';

interface SettingsViewProps {
  workspace: WorkspaceData;
  onBack: () => void;
  onSaveSettings: (next: BusinessSettings) => Promise<void>;
  onRestoreBackup: (data: WorkspaceData) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspace,
  onBack,
  onSaveSettings,
  onRestoreBackup,
}) => {
  const [draft, setDraft] = useState<BusinessSettings>(workspace.settings);
  const [saving, setSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<'logo' | 'background' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Restore confirmation
  const [pendingRestore, setPendingRestore] = useState<WorkspaceData | null>(null);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      logoDataUrl: workspace.settings.logoDataUrl || '',
      backgroundImageDataUrl: workspace.settings.backgroundImageDataUrl || '',
      viewPanel: workspace.settings.viewPanel,
    }));
  }, [
    workspace.settings.logoDataUrl,
    workspace.settings.backgroundImageDataUrl,
    workspace.settings.viewPanel,
  ]);

  const showTempNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((curr) => (curr === msg ? '' : curr)), 2800);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingAsset('logo');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 320, {
        quality: 0.85,
        preserveTransparency: true,
        maxDataUrlLength: 140_000,
      });
      const nextDraft = { ...draft, logoDataUrl: dataUrl };
      setDraft(nextDraft);
      await onSaveSettings(nextDraft);
      showTempNotice('Business logo uploaded and synced across devices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid logo image file.');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleResetLogo = async () => {
    setError('');
    setUploadingAsset('logo');
    try {
      const nextDraft = { ...draft, logoDataUrl: '' };
      setDraft(nextDraft);
      await onSaveSettings(nextDraft);
      showTempNotice('Business logo reset to default.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset business logo.');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingAsset('background');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 1280, {
        quality: 0.78,
        preserveTransparency: false,
        maxDataUrlLength: 360_000,
      });
      const nextDraft = { ...draft, backgroundImageDataUrl: dataUrl };
      setDraft(nextDraft);
      await onSaveSettings(nextDraft);
      showTempNotice('Background photo updated and synced across devices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid background image file.');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleResetBackground = async () => {
    setError('');
    setUploadingAsset('background');
    try {
      const nextDraft = { ...draft, backgroundImageDataUrl: '' };
      setDraft(nextDraft);
      await onSaveSettings(nextDraft);
      showTempNotice('Background photo reset to default.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset background photo.');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    let normalizedMobile = draft.mobile.trim();
    if (normalizedMobile) {
      const mobileCheck = normalizeIndianPhone(normalizedMobile);
      if (!mobileCheck.valid) {
        setError(`Mobile Number: ${mobileCheck.error}`);
        return;
      }
      normalizedMobile = mobileCheck.formatted;
    }

    let normalizedWhatsapp = draft.whatsapp.trim();
    if (normalizedWhatsapp) {
      const waCheck = normalizeIndianPhone(normalizedWhatsapp);
      if (!waCheck.valid) {
        setError(`WhatsApp Number: ${waCheck.error}`);
        return;
      }
      normalizedWhatsapp = waCheck.formatted;
    }

    let normalizedUpiNumber = (draft.upiNumber || '').trim();
    if (normalizedUpiNumber) {
      const upiCheck = normalizeIndianPhone(normalizedUpiNumber);
      if (!upiCheck.valid) {
        setError(`UPI Number: ${upiCheck.error}`);
        return;
      }
      normalizedUpiNumber = upiCheck.formatted;
    }

    const nextDraft: BusinessSettings = {
      ...draft,
      mobile: normalizedMobile,
      whatsapp: normalizedWhatsapp,
      upiNumber: normalizedUpiNumber,
    };

    setSaving(true);
    try {
      setDraft(nextDraft);
      await onSaveSettings(nextDraft);
      showTempNotice('Business settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glamour_galleria_backup_${todayIsoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkspaceData;
        if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.invoices)) {
          setError('Invalid Glamour Galleria backup file.');
          return;
        }
        setError('');
        setPendingRestore(parsed);
      } catch {
        setError('Could not parse backup JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-[#4A3B59] mb-1.5';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              Settings &amp; Backup
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Customize branding, invoice defaults, UPI/bank details, currency, and backup/restore.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* Business & Invoice Customization Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-5 border-b border-[#F4ECF8]">
          {/* Business Logo Upload */}
          <div className="rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-4 flex items-center gap-4">
            <BrandLogo
              logoDataUrl={draft.logoDataUrl}
              businessName={draft.businessName}
              size={72}
            />
            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <div className="text-sm font-bold text-[#1F122B]">Business Logo</div>
                <div className="text-[11px] text-[#6B5B7B]">
                  {draft.logoDataUrl
                    ? 'Custom logo active across headers & invoices'
                    : 'Using default Glamour Galleria crest'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingAsset === 'logo' ? 'Uploading...' : 'Upload Logo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingAsset !== null}
                    onChange={handleLogoUpload}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  disabled={!draft.logoDataUrl || uploadingAsset !== null}
                  onClick={handleResetLogo}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#FECDD3] bg-white px-3 py-1.5 text-xs font-semibold text-[#BE123C] hover:bg-[#FFF1F2] cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Default</span>
                </button>
              </div>
            </div>
          </div>

          {/* App Background Photo Upload */}
          <div className="rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-4 flex items-center gap-4">
            <div className="w-[72px] h-[72px] rounded-xl overflow-hidden border border-[#E6D9EE] bg-white shrink-0 relative">
              <img
                src={
                  draft.backgroundImageDataUrl && draft.backgroundImageDataUrl.trim()
                    ? draft.backgroundImageDataUrl
                    : DEFAULT_BACKGROUND_IMAGE_PATH
                }
                alt="App background preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-top"
              />
              {!draft.backgroundImageDataUrl && (
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                  Default
                </span>
              )}
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <div className="text-sm font-bold text-[#1F122B]">Background Photo</div>
                <div className="text-[11px] text-[#6B5B7B]">
                  {draft.backgroundImageDataUrl
                    ? 'Custom background synced across devices'
                    : 'Using default background photo'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>
                    {uploadingAsset === 'background'
                      ? 'Uploading...'
                      : 'Upload Background'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingAsset !== null}
                    onChange={handleBackgroundUpload}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  disabled={!draft.backgroundImageDataUrl || uploadingAsset !== null}
                  onClick={handleResetBackground}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#FECDD3] bg-white px-3 py-1.5 text-xs font-semibold text-[#BE123C] hover:bg-[#FFF1F2] cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Default</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Business Name</label>
            <input
              type="text"
              required
              value={draft.businessName}
              onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tagline</label>
            <input
              type="text"
              value={draft.tagline}
              onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Mobile Number</label>
            <input
              type="tel"
              value={draft.mobile}
              onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Number</label>
            <input
              type="tel"
              value={draft.whatsapp}
              onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Business Address</label>
            <input
              type="text"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              placeholder="Shop / Studio Address, City, State, PIN"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>GSTIN (optional)</label>
            <input
              type="text"
              value={draft.gstin}
              onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>UPI ID (QR &amp; invoice)</label>
            <input
              type="text"
              value={draft.upiId}
              onChange={(e) => setDraft({ ...draft, upiId: e.target.value })}
              placeholder="glamourgalleria@okicici"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>UPI Number (PhonePay / GPay)</label>
            <input
              type="tel"
              value={draft.upiNumber || ''}
              onChange={(e) => setDraft({ ...draft, upiNumber: e.target.value })}
              placeholder="+91 9876543210"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>Bank Account Holder Name</label>
            <input
              type="text"
              value={draft.bankAccountName || ''}
              onChange={(e) => setDraft({ ...draft, bankAccountName: e.target.value })}
              placeholder="Glamour Galleria"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Bank Account Number</label>
            <input
              type="text"
              value={draft.bankAccountNo || ''}
              onChange={(e) => setDraft({ ...draft, bankAccountNo: e.target.value })}
              placeholder="123456789012"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>IFSC / Bank &amp; Branch</label>
            <input
              type="text"
              value={draft.bankIfscBranch || ''}
              onChange={(e) => setDraft({ ...draft, bankIfscBranch: e.target.value })}
              placeholder="HDFC0001234, Kolkata Branch"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Invoice Number Prefix</label>
            <input
              type="text"
              value={draft.invoicePrefix}
              onChange={(e) => setDraft({ ...draft, invoicePrefix: e.target.value })}
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select
              value={draft.currencyCode}
              onChange={(e) => {
                const code = e.target.value;
                const sym =
                  code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : '₹';
                setDraft({ ...draft, currencyCode: code, currencySymbol: sym });
              }}
              className={inputClass}
            >
              <option value="INR">Indian Rupee (₹ INR)</option>
              <option value="USD">US Dollar ($ USD)</option>
              <option value="GBP">British Pound (£ GBP)</option>
              <option value="EUR">Euro (€ EUR)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Invoice Footer Note</label>
            <textarea
              rows={2}
              value={draft.invoiceFooterNote}
              onChange={(e) => setDraft({ ...draft, invoiceFooterNote: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Social Tag Line (bottom of invoice)</label>
            <input
              type="text"
              value={draft.socialTagLine || ''}
              onChange={(e) => setDraft({ ...draft, socialTagLine: e.target.value })}
              placeholder="Loved your order? Tag us @glamour.galleria.in and share your look with us!"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#F4ECF8]">
          <button
            type="button"
            onClick={() =>
              setDraft((prev) => ({
                ...DEFAULT_SETTINGS,
                viewPanel: prev.viewPanel,
              }))
            }
            className="text-xs font-semibold text-[#6B5B7B] hover:text-[#1F122B] cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Backup & Restore */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#1F122B]">Backup &amp; Restore</h2>
          <p className="text-xs text-[#6B5B7B] mt-0.5">
            Download a complete JSON backup of all clients, products, invoices, payments, expenses, and settings, or restore from a previous backup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 rounded-xl border border-[#7E22CE] bg-white px-4 py-2.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#F5F3FF] cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Full Backup (.json)</span>
          </button>

          <label className="inline-flex items-center gap-2 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-4 py-2.5 text-xs font-semibold text-[#1F122B] hover:border-[#DB2777] cursor-pointer">
            <Upload className="w-4 h-4 text-[#DB2777]" />
            <span>Restore from Backup (.json)</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleSelectRestoreFile}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title="Restore Backup Data"
        message="Restoring a backup will replace your current clients, products, invoices, payments, expenses, and settings with the contents of the backup file. Continue?"
        confirmLabel="Restore Backup"
        destructive={false}
        onConfirm={async () => {
          if (!pendingRestore) return;
          await onRestoreBackup(pendingRestore);
          setPendingRestore(null);
          setNotice('Backup restored successfully.');
        }}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
};
