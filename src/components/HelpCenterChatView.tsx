import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  LifeBuoy,
  MessageCircle,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import { Client, SupportChatThread } from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  normalizeIndianPhone,
  stripPlus91Prefix,
  validateEnglishName,
} from '../utils/calculations';

const GUEST_SUPPORT_SESSION_KEY = 'gg_support_guest_session_v1';

interface GuestIdentity {
  name: string;
  phone: string;
}

interface HelpCenterChatViewProps {
  loggedInCustomer: Client | null;
  onBackToShop: () => void;
  onRequestSignIn: () => void;
}

function formatMessageTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const HelpCenterChatView: React.FC<HelpCenterChatViewProps> = ({
  loggedInCustomer,
  onBackToShop,
  onRequestSignIn,
}) => {
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(() => {
    try {
      const raw = sessionStorage.getItem(GUEST_SUPPORT_SESSION_KEY);
      return raw ? (JSON.parse(raw) as GuestIdentity) : null;
    } catch {
      return null;
    }
  });

  const [guestNameInput, setGuestNameInput] = useState(
    () => guestIdentity?.name || ''
  );
  const [guestPhoneInput, setGuestPhoneInput] = useState(() =>
    guestIdentity?.phone ? stripPlus91Prefix(guestIdentity.phone) : ''
  );
  const [activeThread, setActiveThread] = useState<SupportChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endOfChatRef = useRef<HTMLDivElement | null>(null);

  const activeName = loggedInCustomer?.name || guestIdentity?.name || '';
  const activePhone = loggedInCustomer?.mobile || guestIdentity?.phone || '';

  // Automatically load ONLY the logged-in customer's own chat history
  useEffect(() => {
    let active = true;

    if (loggedInCustomer) {
      try {
        sessionStorage.removeItem(GUEST_SUPPORT_SESSION_KEY);
      } catch {
        // ignore
      }
      setLoadingThread(true);
      setError('');
      api
        .fetchSupportThreadForClient(loggedInCustomer.id, loggedInCustomer.mobile)
        .then((thread) => {
          if (active) setActiveThread(thread);
        })
        .catch((err) => {
          if (active) {
            setError(
              formatApiError(err, 'Could not load your previous support chat.')
            );
          }
        })
        .finally(() => {
          if (active) setLoadingThread(false);
        });
      return () => {
        active = false;
      };
    }

    if (guestIdentity?.name && guestIdentity?.phone) {
      setLoadingThread(true);
      setError('');
      api
        .resolveGuestSupportThread(guestIdentity.name, guestIdentity.phone)
        .then((thread) => {
          if (active) setActiveThread(thread);
        })
        .catch((err) => {
          if (active) {
            try {
              sessionStorage.removeItem(GUEST_SUPPORT_SESSION_KEY);
            } catch {
              // ignore
            }
            setGuestIdentity(null);
            setActiveThread(null);
            setError(formatApiError(err, 'Could not verify support chat identity.'));
          }
        })
        .finally(() => {
          if (active) setLoadingThread(false);
        });
    } else {
      setActiveThread(null);
    }

    return () => {
      active = false;
    };
  }, [loggedInCustomer, guestIdentity?.name, guestIdentity?.phone]);

  // Real-time listener restricted ONLY to this user's own thread ID
  const threadId = activeThread?.id;
  useEffect(() => {
    if (!threadId) return;
    const unsub = api.subscribeSingleSupportThread(
      threadId,
      (updated) => {
        if (updated) {
          setActiveThread(updated);
        }
      },
      () => undefined
    );
    return () => unsub();
  }, [threadId]);

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages?.length]);

  useEffect(() => {
    if (activeThread && activeThread.unreadForCustomer > 0) {
      void api.markSupportChatRead(activeThread.id, 'customer').catch(() => undefined);
    }
  }, [activeThread?.id, activeThread?.unreadForCustomer]);

  const handleStartGuestChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nameCheck = validateEnglishName(guestNameInput, 'Your Name');
    if (!nameCheck.valid) {
      setError(
        nameCheck.error || 'Please enter your full name in English (at least 2 characters).'
      );
      return;
    }
    const cleanName = nameCheck.cleaned;
    const phoneCheck = normalizeIndianPhone(guestPhoneInput);
    if (!phoneCheck.valid) {
      setError(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    setLoadingThread(true);
    try {
      const resolved = await api.resolveGuestSupportThread(
        cleanName,
        phoneCheck.formatted
      );
      const next: GuestIdentity = { name: cleanName, phone: phoneCheck.formatted };
      try {
        sessionStorage.setItem(GUEST_SUPPORT_SESSION_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failure
      }
      setGuestIdentity(next);
      setActiveThread(resolved);
    } catch (err) {
      setError(
        formatApiError(err, 'Could not open your support inbox. Please check Name & Phone.')
      );
    } finally {
      setLoadingThread(false);
    }
  };

  const handleSwitchGuest = () => {
    try {
      sessionStorage.removeItem(GUEST_SUPPORT_SESSION_KEY);
    } catch {
      // ignore
    }
    setGuestIdentity(null);
    setActiveThread(null);
    setError('');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeName || !activePhone) {
      setError('Please sign in or enter your Name and Mobile Number first.');
      return;
    }
    const text = messageText.trim();
    if (!text) return;

    setError('');
    setSending(true);
    try {
      const savedThread = await api.sendSupportMessage({
        chatId: activeThread?.id,
        clientId: loggedInCustomer?.id,
        customerName: activeName,
        customerPhone: activePhone,
        senderRole: 'customer',
        senderName: activeName,
        text,
      });
      setActiveThread(savedThread);
      setMessageText('');
    } catch (err) {
      setError(formatApiError(err, 'Could not send message. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToShop}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Shop</span>
        </button>

        <div className="flex items-center gap-2">
          {!loggedInCustomer && guestIdentity && (
            <button
              type="button"
              onClick={handleSwitchGuest}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#5B4B6B] hover:border-[#9333EA] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Change Name / Phone</span>
            </button>
          )}
          {!loggedInCustomer && (
            <button
              type="button"
              onClick={onRequestSignIn}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md shadow-sm overflow-hidden flex flex-col">
        {/* Chat Header */}
        <div className="px-5 py-4 border-b border-[#F4ECF8] bg-gradient-to-r from-[#FDF2F8] via-white to-[#F5F3FF] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] flex items-center justify-center text-white shrink-0">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display-serif text-lg sm:text-xl font-bold text-[#1F122B]">
                Help Center (হেল্প সেন্টার)
              </h1>
              <p className="text-xs text-[#6B5B7B]">
                Private real-time support chat — only you and Admin can view this conversation
              </p>
            </div>
          </div>
          {activePhone && (
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-[#1F122B]">{activeName}</div>
              <div className="text-[11px] font-mono-num text-[#6B5B7B]">
                {activePhone}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
            {error}
          </div>
        )}

        {/* Guest Identification Form if not logged in */}
        {!activeName || !activePhone ? (
          <form onSubmit={handleStartGuestChat} className="p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[#1F122B]">
                Start or Restore Your Private Support Chat
              </h2>
              <p className="text-xs text-[#6B5B7B]">
                Enter your <strong>Name</strong> and <strong>Phone Number</strong> (or Sign In) to start chatting. Returning with the same Name &amp; Phone Number automatically restores your previous chat history.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Your Name (in English) <span className="text-[#DB2777]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  placeholder="Enter your full name in English"
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Mobile Number <span className="text-[#DB2777]">*</span>
                </label>
                <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                  <span className="inline-flex items-center px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={guestPhoneInput}
                    onChange={(e) => setGuestPhoneInput(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingThread}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {loadingThread ? 'Loading Inbox...' : 'Open My Support Chat'}
              </span>
            </button>
          </form>
        ) : (
          <>
            {/* Live Message List */}
            <div className="h-[380px] sm:h-[420px] overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FDFBFE]">
              {loadingThread && !activeThread ? (
                <div className="h-full flex items-center justify-center text-xs font-semibold text-[#7E22CE]">
                  Loading your chat history...
                </div>
              ) : !activeThread || activeThread.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-2">
                  <MessageCircle className="w-10 h-10 text-[#D8B4FE]" />
                  <div className="text-sm font-bold text-[#1F122B]">
                    How can we help you today?
                  </div>
                  <p className="text-xs text-[#6B5B7B] max-w-sm">
                    Send a message about your order, sizing, payments, or seller queries. Our Admin team replies live here.
                  </p>
                </div>
              ) : (
                activeThread.messages.map((msg) => {
                  const isCustomer = msg.senderRole === 'customer';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isCustomer ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                          isCustomer
                            ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white rounded-br-sm'
                            : 'bg-white border border-[#EFE2F5] text-[#1F122B] rounded-bl-sm'
                        }`}
                      >
                        {!isCustomer && (
                          <div className="text-[10px] font-bold text-[#7E22CE] mb-0.5">
                            {msg.senderName || 'Glamour Galleria Support'}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                      </div>
                      <span className="text-[10px] text-[#8E7C9E] mt-1 px-1 font-mono-num">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={endOfChatRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSendMessage}
              className="p-3.5 sm:p-4 border-t border-[#F4ECF8] bg-white flex items-center gap-2.5"
            >
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message to support..."
                className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-4 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{sending ? 'Sending...' : 'Send'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
