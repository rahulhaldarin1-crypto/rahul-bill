import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, Upload, X } from 'lucide-react';
import { COURIER_PRESETS, DEFAULT_STORE_SETTINGS } from '../data/defaults';
import { Translations } from '../i18n/translations';
import { StoreSettings } from '../types/invoice';
import { GoldCrestLogo } from './GoldCrestLogo';

interface StoreSettingsViewProps {
  settings: StoreSettings;
  onBack: () => void;
  onSaveSettings: (next: StoreSettings) => void;
  t: Translations;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  settings,
  onBack,
  onSaveSettings,
  t,
}) => {
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'customLogoDataUrl' | 'customQrDataUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraft((prev) => ({ ...prev, [field]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleReset = () => {
    setDraft(DEFAULT_STORE_SETTINGS);
    onSaveSettings(DEFAULT_STORE_SETTINGS);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const inputClass =
    'w-full rounded-md border border-[#DDD7CB] bg-white px-3 py-2 text-sm text-[#181613] focus:border-[#A8822E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A449]/35';
  const labelClass = 'block text-xs font-medium text-[#5A5347] mb-1.5';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-white px-3 py-1.5 text-xs font-medium text-[#181613] hover:bg-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#7D6635]" />
            <span>{t.backBtn}</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#181613]">
              {t.settingsTitle}
            </h1>
            <p className="text-sm text-[#6B6356] mt-1">{t.settingsSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#DDD7CB] bg-white text-xs font-medium text-[#5A5347] hover:text-[#181613] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetDefaults}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Brand Identity */}
        <section className="rounded-lg border border-[#E2DDD2] bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-[#181613]">Brand Identity & Crest</h2>

          <div className="flex flex-wrap items-center gap-6 pb-4 border-b border-[#EFECE4]">
            <div className="p-2 rounded-lg bg-[#141210]">
              <GoldCrestLogo
                customLogoDataUrl={draft.customLogoDataUrl}
                storeName={draft.storeName}
                size={76}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#5A5347]">
                Store Logo (Uses ornate GG gold crest by default)
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#DDD7CB] bg-[#FAF8F4] text-xs font-medium text-[#181613] hover:bg-[#F2ECE0] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'customLogoDataUrl')}
                    className="sr-only"
                  />
                </label>
                {draft.customLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, customLogoDataUrl: '' })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#B91C1C] hover:bg-[#FEF2F2] rounded-md cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Use Default Crest</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Store Name</label>
              <input
                type="text"
                value={draft.storeName}
                onChange={(e) => setDraft({ ...draft, storeName: e.target.value })}
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
              <label className={labelClass}>Location Line</label>
              <input
                type="text"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Minimum Table Rows</label>
              <input
                type="number"
                min={1}
                max={12}
                value={draft.minTableRows}
                onChange={(e) =>
                  setDraft({ ...draft, minTableRows: Math.max(1, Number(e.target.value || 6)) })
                }
                className={`${inputClass} font-mono-num`}
              />
            </div>
          </div>
        </section>

        {/* Payment Credentials */}
        <section className="rounded-lg border border-[#E2DDD2] bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-[#181613]">UPI & Bank Transfer Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>UPI ID (auto-generates QR when valid)</label>
              <input
                type="text"
                value={draft.upiId}
                onChange={(e) => setDraft({ ...draft, upiId: e.target.value })}
                placeholder="glamourgalleria@okicici"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>UPI Phone Number</label>
              <input
                type="text"
                value={draft.upiNumber}
                onChange={(e) => setDraft({ ...draft, upiNumber: e.target.value })}
                className={`${inputClass} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelClass}>Account Holder Name</label>
              <input
                type="text"
                value={draft.bankAccountName}
                onChange={(e) => setDraft({ ...draft, bankAccountName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Account Number</label>
              <input
                type="text"
                value={draft.bankAccountNo}
                onChange={(e) => setDraft({ ...draft, bankAccountNo: e.target.value })}
                className={`${inputClass} font-mono-num`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>IFSC / Bank & Branch</label>
              <input
                type="text"
                value={draft.bankIfscBranch}
                onChange={(e) => setDraft({ ...draft, bankIfscBranch: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#DDD7CB] bg-[#FAF8F4] text-xs font-medium text-[#181613] hover:bg-[#F2ECE0] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom UPI QR Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'customQrDataUrl')}
                  className="sr-only"
                />
              </label>
              {draft.customQrDataUrl && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, customQrDataUrl: '' })}
                  className="text-xs text-[#B91C1C] cursor-pointer"
                >
                  Remove uploaded QR
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Courier & Footer Note */}
        <section className="rounded-lg border border-[#E2DDD2] bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-[#181613]">Default Courier & Footer Note</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Default Courier</label>
              <select
                value={draft.defaultCourier}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    defaultCourier: e.target.value,
                    defaultTrackingUrl: COURIER_PRESETS[e.target.value] || draft.defaultTrackingUrl,
                  })
                }
                className={inputClass}
              >
                {Object.keys(COURIER_PRESETS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Size Options Caption</label>
              <input
                type="text"
                value={draft.sizeOptionsNote}
                onChange={(e) => setDraft({ ...draft, sizeOptionsNote: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Thank You Headline</label>
              <input
                type="text"
                value={draft.noteHeadline}
                onChange={(e) => setDraft({ ...draft, noteHeadline: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Note Message</label>
              <textarea
                rows={2}
                value={draft.noteBody}
                onChange={(e) => setDraft({ ...draft, noteBody: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Social Tag Line</label>
              <input
                type="text"
                value={draft.socialTagLine}
                onChange={(e) => setDraft({ ...draft, socialTagLine: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-4">
          {savedNotice && (
            <span className="text-sm font-medium text-[#15803D]">{t.settingsSavedToast}</span>
          )}
          <button
            type="submit"
            className="px-6 py-2.5 rounded-md bg-[#181613] text-sm font-semibold text-[#F5EFE4] hover:bg-[#2C2721] cursor-pointer"
          >
            {t.saveSettings}
          </button>
        </div>
      </form>
    </div>
  );
};
