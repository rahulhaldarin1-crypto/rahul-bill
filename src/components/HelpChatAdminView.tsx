import React, { useMemo } from 'react';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { Client, SupportChatThread } from '../types/business';
import { SupportChatInbox } from './SupportChatInbox';

interface HelpChatAdminViewProps {
  supportChats: SupportChatThread[];
  clients: Client[];
  onBack: () => void;
  onOpenCustomerProfile: (clientId: string) => void;
}

export const HelpChatAdminView: React.FC<HelpChatAdminViewProps> = ({
  supportChats,
  clients,
  onBack,
  onOpenCustomerProfile,
}) => {
  const unreadTotal = useMemo(
    () =>
      supportChats.reduce(
        (sum, t) => sum + Math.max(0, Number(t.unreadForAdmin) || 0),
        0
      ),
    [supportChats]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B] flex items-center gap-2">
              <LifeBuoy className="w-6 h-6 text-[#7E22CE]" />
              <span>Help Chat (Live Support Inbox)</span>
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              All customer messages from Help Center arrive here in real time. Select any conversation to reply directly.
            </p>
          </div>
        </div>

        <div className="text-xs font-mono-num font-bold text-[#6D28D9] shrink-0">
          {supportChats.length} Chats
          {unreadTotal > 0 ? ` · ${unreadTotal} Unread` : ''}
        </div>
      </div>

      <SupportChatInbox
        supportChats={supportChats}
        clients={clients}
        onOpenCustomerProfile={onOpenCustomerProfile}
      />
    </div>
  );
};
