import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, FilePlus2, Save } from 'lucide-react';
import { Client } from '../types/business';

interface NewClientViewProps {
  editingClient: Client | null;
  onBack: () => void;
  onSaveClient: (
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string,
    andCreateBill?: boolean
  ) => Promise<void>;
}

export const NewClientView: React.FC<NewClientViewProps> = ({
  editingClient,
  onBack,
  onSaveClient,
}) => {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingClient) {
      setName(editingClient.name);
      setMobile(editingClient.mobile);
      setWhatsapp(editingClient.whatsapp);
      setSameAsMobile(editingClient.whatsapp === editingClient.mobile);
      setAddress(editingClient.address);
      setStateName(editingClient.state);
      setCity(editingClient.city);
      setPinCode(editingClient.pinCode);
    } else {
      setName('');
      setMobile('');
      setWhatsapp('');
      setSameAsMobile(true);
      setAddress('');
      setStateName('');
      setCity('');
      setPinCode('');
    }
    setError('');
  }, [editingClient]);

  const validate = (): string | null => {
    if (name.trim().length < 2) {
      return 'Customer name is required (at least 2 characters).';
    }
    const cleanMobile = mobile.replace(/[\s\-+]/g, '');
    if (cleanMobile.length < 10) {
      return 'Please enter a valid 10-digit mobile number.';
    }
    if (pinCode.trim() && !/^\d{6}$/.test(pinCode.trim())) {
      return 'PIN code must be 6 digits.';
    }
    return null;
  };

  const buildPayload = (): Omit<Client, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: name.trim(),
    mobile: mobile.trim(),
    whatsapp: sameAsMobile ? mobile.trim() : whatsapp.trim() || mobile.trim(),
    address: address.trim(),
    state: stateName.trim(),
    city: city.trim(),
    pinCode: pinCode.trim(),
  });

  const handleSubmit = async (andCreateBill: boolean) => {
    const errMsg = validate();
    if (errMsg) {
      setError(errMsg);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSaveClient(buildPayload(), editingClient?.id, andCreateBill);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:bg-white focus:outline-none transition-colors';
  const labelClass = 'block text-xs font-semibold text-[#4A3B59] mb-1.5';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-10">
      <div className="flex items-center gap-3 mb-6">
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
            {editingClient ? 'Edit Customer Details' : 'New Client'}
          </h1>
          <p className="text-xs text-[#6B5B7B] mt-0.5">
            Save customer contact & shipping address permanently to your Glamour Galleria directory.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
        className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-7 space-y-5 shadow-xs"
      >
        {error && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
            {error}
          </div>
        )}

        <div>
          <label className={labelClass}>
            Customer Name <span className="text-[#DB2777]">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya Sharma"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Mobile Number <span className="text-[#DB2777]">*</span>
            </label>
            <input
              type="tel"
              required
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                if (sameAsMobile) setWhatsapp(e.target.value);
              }}
              placeholder="+91 9876543210"
              className={`${inputClass} font-mono-num`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#4A3B59]">
                WhatsApp Number
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !sameAsMobile;
                  setSameAsMobile(next);
                  if (next) setWhatsapp(mobile);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7E22CE] hover:underline cursor-pointer"
              >
                {sameAsMobile && <Check className="w-3 h-3" />}
                <span>Same as mobile</span>
              </button>
            </div>
            <input
              type="tel"
              value={sameAsMobile ? mobile : whatsapp}
              disabled={sameAsMobile}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+91 9876543210"
              className={`${inputClass} font-mono-num disabled:opacity-70`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Full Address</label>
          <textarea
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="House No, Street, Landmark, Area"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Kolkata"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              type="text"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              placeholder="West Bengal"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>PIN Code</label>
            <input
              type="text"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="700001"
              className={`${inputClass} font-mono-num`}
            />
          </div>
        </div>

        <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-[#F4ECF8]">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E6D9EE] bg-white px-5 py-2.5 text-sm font-semibold text-[#1F122B] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{editingClient ? 'Update Client' : 'Save Client'}</span>
          </button>

          {!editingClient && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Save &amp; Create Bill</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
