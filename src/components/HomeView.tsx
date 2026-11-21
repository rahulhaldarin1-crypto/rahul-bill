import React, { useMemo } from 'react';
import { ArrowRight, FileText, Plus, UserCog, Users } from 'lucide-react';
import { Translations } from '../i18n/translations';
import { ClientRecord, Language, SavedInvoice, StoreSettings } from '../types/invoice';
import { formatMoney } from '../utils/invoiceHelpers';
import { GoldCrestLogo } from './GoldCrestLogo';

interface HomeViewProps {
  settings: StoreSettings;
  clients: ClientRecord[];
  savedInvoices: SavedInvoice[];
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onOpenMasterCreate: () => void;
  onOpenClientListTab: () => void;
  onOpenAllBills: () => void;
  onOpenBlankBill: () => void;
  t: Translations;
}

export const HomeView: React.FC<HomeViewProps> = ({
  settings,
  clients,
  savedInvoices,
  lang,
  onChangeLang,
  onOpenMasterCreate,
  onOpenClientListTab,
  onOpenAllBills,
  onOpenBlankBill,
  t,
}) => {
  const totalRevenue = useMemo(
    () => savedInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
    [savedInvoices]
  );

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#14110E] text-[#F5EFE4] pb-24 lg:pb-14 flex flex-col justify-between">
      <div className="max-w-[1040px] w-full mx-auto px-4 sm:px-6 pt-10 pb-8">
        {/* TOP BRAND HERO */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="mb-4">
            <GoldCrestLogo
              customLogoDataUrl={settings.customLogoDataUrl}
              storeName={settings.storeName}
              size={128}
            />
          </div>

          <h1 className="font-display-serif text-3xl sm:text-4xl font-bold tracking-[0.06em] text-[#D5AE52]">
            {settings.storeName || 'GLAMOUR GALLERIA'}
          </h1>
          <p className="font-display-serif italic text-xs sm:text-sm text-[#DDD3C0] mt-1.5">
            {settings.tagline}
          </p>

          {/* Language Switcher + Live Totals Strip */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#1F1A15] border border-[#3B3123]">
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  lang === 'en' ? 'bg-[#D5AE52] text-[#14110E]' : 'text-[#BFB4A0]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onChangeLang('bn')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  lang === 'bn' ? 'bg-[#D5AE52] text-[#14110E]' : 'text-[#BFB4A0]'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-[#A59882] font-mono-num">
            <span>
              {clients.length} {t.navClients}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {savedInvoices.length} {t.navSaved}
            </span>
            {totalRevenue > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#D5AE52]">₹ {formatMoney(totalRevenue)}</span>
              </>
            )}
          </div>
        </div>

        {/* 3 PRIMARY NAVIGATION CARDS DIRECTLY UNDER LOGO: Master User | Client List | Bill */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Master User -> Create New Client */}
          <button
            type="button"
            onClick={onOpenMasterCreate}
            className="group text-left rounded-2xl border border-[#5B4926] bg-[#1C1713] p-6 hover:border-[#D5AE52] hover:bg-[#231D17] transition-all cursor-pointer flex flex-col justify-between gap-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div
                style={{
                  background: 'linear-gradient(180deg, #D9B65C 0%, #B78E35 100%)',
                }}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-[#14110E] shrink-0"
              >
                <UserCog className="w-6 h-6" />
              </div>

              <span className="inline-flex items-center gap-1 rounded-md border border-[#443825] bg-[#251F19] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#D5AE52]">
                <Plus className="w-3 h-3" />
                <span>OPERATOR</span>
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#F5EFE4] group-hover:text-[#D5AE52] transition-colors">
                {t.homeMasterUserTitle}
              </h2>
              <p className="text-xs text-[#A59882] mt-1 leading-relaxed">
                {t.homeMasterUserDesc}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2E261C] text-xs font-semibold text-[#D5AE52]">
              <span>{t.homeCreateClient}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card 2: Client List -> Client Profiles & Data */}
          <button
            type="button"
            onClick={onOpenClientListTab}
            className="group text-left rounded-2xl border border-[#3B3123] bg-[#1C1713] p-6 hover:border-[#D5AE52] hover:bg-[#231D17] transition-all cursor-pointer flex flex-col justify-between gap-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#27211B] border border-[#443825] flex items-center justify-center text-[#D5AE52] shrink-0">
                <Users className="w-6 h-6" />
              </div>

              <span className="font-mono-num text-xs font-bold text-[#D5AE52] bg-[#251F19] border border-[#443825] rounded-md px-2.5 py-1">
                {clients.length}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#F5EFE4] group-hover:text-[#D5AE52] transition-colors">
                {t.homeClientList}
              </h2>
              <p className="text-xs text-[#A59882] mt-1 leading-relaxed">
                {t.homeClientListDesc}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2E261C] text-xs font-semibold text-[#F5EFE4] group-hover:text-[#D5AE52]">
              <span>{t.clientProfileLabel}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card 3: Bill -> All Client Bills Collected in One Place */}
          <button
            type="button"
            onClick={onOpenAllBills}
            className="group text-left rounded-2xl border border-[#3B3123] bg-[#1C1713] p-6 hover:border-[#D5AE52] hover:bg-[#231D17] transition-all cursor-pointer flex flex-col justify-between gap-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#27211B] border border-[#443825] flex items-center justify-center text-[#D5AE52] shrink-0">
                <FileText className="w-6 h-6" />
              </div>

              <span className="font-mono-num text-xs font-bold text-[#D5AE52] bg-[#251F19] border border-[#443825] rounded-md px-2.5 py-1">
                {savedInvoices.length}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#F5EFE4] group-hover:text-[#D5AE52] transition-colors">
                {t.homeBillsTitle}
              </h2>
              <p className="text-xs text-[#A59882] mt-1 leading-relaxed">
                {t.homeBillsDesc}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2E261C] text-xs font-semibold text-[#F5EFE4] group-hover:text-[#D5AE52]">
              <span>
                {totalRevenue > 0 ? `₹ ${formatMoney(totalRevenue)}` : t.navSaved}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        {/* Subtle Secondary Quick Blank Bill Link */}
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={onOpenBlankBill}
            className="inline-flex items-center gap-2 rounded-xl border border-[#3B3123] bg-[#1A1612] px-4 py-2 text-xs font-medium text-[#C7BDA9] hover:border-[#D5AE52] hover:text-[#F5EFE4] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#D5AE52]" />
            <span>{t.openBlankBill}</span>
          </button>
        </div>
      </div>

      {/* MOBILE BOTTOM DOCK */}
      <div className="lg:hidden fixed bottom-3 left-4 right-4 z-30 rounded-2xl border border-[#3D3222] bg-[#1C1814]/95 backdrop-blur-md px-3 py-2 flex items-center justify-between gap-2 shadow-xl">
        <button
          type="button"
          onClick={onOpenMasterCreate}
          style={{ background: 'linear-gradient(180deg, #D9B65C 0%, #B78E35 100%)' }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-bold text-[#14110E] whitespace-nowrap cursor-pointer"
        >
          <UserCog className="w-3.5 h-3.5" />
          <span>MASTER USER</span>
        </button>

        <button
          type="button"
          onClick={onOpenClientListTab}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2C241B] whitespace-nowrap cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 text-[#D5AE52]" />
          <span>CLIENT LIST</span>
        </button>

        <button
          type="button"
          onClick={onOpenAllBills}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2C241B] whitespace-nowrap cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-[#D5AE52]" />
          <span>BILL</span>
        </button>
      </div>
    </div>
  );
};
