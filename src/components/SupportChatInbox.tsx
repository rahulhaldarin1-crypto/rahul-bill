import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, MessageCircle, Search, Send } from 'lucide-react';
import { Client, SupportChatThread } from '../types/business';
import { api, formatApiError } from '../utils/api';

interface SupportChatInboxProps {
  supportChats: SupportChatThread[];
  clients?: Client[];
  onOpenCustomerProfile?: (clientId: string) => void;
}

function formatChatTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SupportChatInbox: React.FC<SupportChatInboxProps> = ({
  supportChats,
  clients = [],
  onOpenCustomerProfile,
}) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const filteredSupportChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    const sorted = [...supportChats].sort((a, b) =>
      String(b.updatedAt || b.createdAt).localeCompare(
        String(a.updatedAt || a.createdAt)
      )
    );
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        t.customerPhone.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
    );
  }, [supportChats, chatSearch]);

  const activeChatThread = useMemo(() => {
    if (selectedChatId) {
      const exact = supportChats.find((c) => c.id === selectedChatId);
      if (exact) return exact;
    }
    return filteredSupportChats[0] || null;
  }, [selectedChatId, supportChats, filteredSupportChats]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatThread?.messages?.length]);

  useEffect(() => {
    if (activeChatThread && activeChatThread.unreadForAdmin > 0) {
      void api
        .markSupportChatRead(activeChatThread.id, 'admin')
        .catch(() => undefined);
    }
  }, [activeChatThread?.id, activeChatThread?.unreadForAdmin]);

  const handleSendSupportReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatThread) return;
    const text = replyText.trim();
    if (!text) return;
    setChatError('');
    setSendingReply(true);
    try {
      await api.sendSupportMessage({
        chatId: activeChatThread.id,
        clientId: activeChatThread.clientId,
        customerName: activeChatThread.customerName,
        customerPhone: activeChatThread.customerPhone,
        senderRole: 'admin',
        senderName: 'Glamour Galleria Support',
        text,
      });
      setReplyText('');
    } catch (err) {
      setChatError(formatApiError(err, 'Failed to send support reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-stretch">
      {/* Conversation List */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col max-h-[620px]">
        <div className="p-3 border-b border-[#F4ECF8]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8E7C9E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search customer name, phone, message..."
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-8 pr-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#F4ECF8]">
          {filteredSupportChats.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#6B5B7B]">
              No Help Center support chats yet. Customer messages will appear here live.
            </div>
          ) : (
            filteredSupportChats.map((thread) => {
              const selected = activeChatThread?.id === thread.id;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedChatId(thread.id)}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    selected ? 'bg-[#FAF5FF]' : 'hover:bg-[#FDFBFE]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#1F122B] truncate">
                      {thread.customerName}
                    </span>
                    {thread.unreadForAdmin > 0 && (
                      <span className="rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num shrink-0">
                        {thread.unreadForAdmin} new
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono-num text-[#7E22CE] mt-0.5">
                    {thread.customerPhone}
                  </div>
                  <p className="text-xs text-[#5B4B6B] truncate mt-1">
                    {thread.lastSenderRole === 'admin' ? 'You: ' : ''}
                    {thread.lastMessage}
                  </p>
                  <div className="text-[10px] text-[#8E7C9E] font-mono-num mt-1">
                    {formatChatTime(thread.updatedAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Active Chat Thread & Reply Composer */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col min-h-[540px] max-h-[620px]">
        {!activeChatThread ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
            <MessageCircle className="w-10 h-10 text-[#D8B4FE]" />
            <div className="text-sm font-bold text-[#1F122B]">
              Select a Customer Chat to Reply
            </div>
            <p className="text-xs text-[#6B5B7B] max-w-sm">
              Messages sent by customers from the Help Center appear here in real time.
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3.5 border-b border-[#F4ECF8] bg-[#FDF9FC] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#1F122B]">
                  {activeChatThread.customerName}
                </div>
                <div className="text-xs font-mono-num text-[#6B5B7B]">
                  {activeChatThread.customerPhone}
                </div>
              </div>
              {onOpenCustomerProfile &&
                activeChatThread.clientId &&
                clients.some((c) => c.id === activeChatThread.clientId) && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCustomerProfile(activeChatThread.clientId || '')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Customer Profile</span>
                  </button>
                )}
            </div>

            {chatError && (
              <div className="mx-4 mt-3 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
                {chatError}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FDFBFE]">
              {activeChatThread.messages.map((msg) => {
                const isAdmin = msg.senderRole === 'admin';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      isAdmin ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                        isAdmin
                          ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white rounded-br-sm'
                          : 'bg-white border border-[#EFE2F5] text-[#1F122B] rounded-bl-sm'
                      }`}
                    >
                      {!isAdmin && (
                        <div className="text-[10px] font-bold text-[#7E22CE] mb-0.5">
                          {msg.senderName || activeChatThread.customerName}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </div>
                    </div>
                    <span className="text-[10px] text-[#8E7C9E] mt-1 px-1 font-mono-num">
                      {formatChatTime(msg.createdAt)}
                    </span>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleSendSupportReply}
              className="p-3.5 border-t border-[#F4ECF8] bg-white flex items-center gap-2.5"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${activeChatThread.customerName}...`}
                className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-4 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
