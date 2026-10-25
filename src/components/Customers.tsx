import { useState, FormEvent, useMemo } from 'react';
import { Client, Estimate } from '../types';
import { isEstimateForClient } from '../utils/clientMatching';
import { 
  Search, 
  Plus, 
  UserCheck, 
  Edit, 
  Trash2,
  X,
  Printer,
  Edit2,
  Phone,
  MessageSquare,
  FileText,
  History,
  MapPin,
  Building,
  CreditCard,
  Download,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ExternalLink,
  ChevronRight,
  UserPlus
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPrice } from '../utils/numberToWords';

interface CustomersProps {
  clients: Client[];
  estimates?: Estimate[];
  onAddClient: (c: Client) => void;
  onEditClient: (c: Client) => void;
  onDeleteClient: (id: number) => void;
  onEditEstimate?: (id: number) => void;
  onPrintEstimate?: (id: number) => void;
  onDeleteEstimate?: (id: number) => void;
  onViewLedger?: (clientId?: number) => void;
  userRole?: 'admin' | 'clerk';
  onOpenFileImport?: () => void;
}

export default function Customers({ 
  clients, 
  estimates = [],
  onAddClient, 
  onEditClient, 
  onDeleteClient,
  onEditEstimate,
  onPrintEstimate,
  onDeleteEstimate,
  onViewLedger,
  userRole = 'admin',
  onOpenFileImport
}: CustomersProps) {
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<'ALL' | 'DUE' | 'SETTLED'>('ALL');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClientForBills, setSelectedClientForBills] = useState<Client | null>(null);

  // Form inputs for add
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');

  // Form inputs for edit
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGstin, setEditGstin] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Calculate Party Balances map for ultra-fast lookup
  const clientBalances = useMemo(() => {
    const balanceMap = new Map<number | string, { totalBilled: number; totalPaid: number; balanceDue: number; billCount: number }>();

    estimates.forEach(est => {
      if (!est || est.isCancelled) return;
      const cId = est.clientId;
      const cPhone = est.clientPhone;
      const gTotal = Number(est.grandTotal) || 0;
      const paid = Number(est.paidAmount) || 0;
      const due = Number(est.balanceDue) || 0;

      const keys: (number | string)[] = [];
      if (cId) keys.push(cId);
      if (cPhone) keys.push(cPhone);

      keys.forEach(k => {
        const cur = balanceMap.get(k) || { totalBilled: 0, totalPaid: 0, balanceDue: 0, billCount: 0 };
        balanceMap.set(k, {
          totalBilled: cur.totalBilled + gTotal,
          totalPaid: cur.totalPaid + paid,
          balanceDue: cur.balanceDue + due,
          billCount: cur.billCount + 1
        });
      });
    });

    return balanceMap;
  }, [estimates]);

  // Overall Market Receivables (MyBillBook To Collect Header)
  const totalReceivables = useMemo(() => {
    return estimates
      .filter(e => e && !e.isCancelled)
      .reduce((sum, e) => sum + (Number(e.balanceDue) || 0), 0);
  }, [estimates]);

  const handleSaveClient = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("Please enter both customer name and 10-digit mobile number!");
      return;
    }

    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile number!");
      return;
    }

    const nClient: Client = {
      id: Date.now(),
      name: name.trim(),
      phone: cleanPhone,
      gstin: gstin.trim().toUpperCase(),
      address: address.trim()
    };

    onAddClient(nClient);
    setShowAddClientModal(false);

    // Reset Form
    setName('');
    setPhone('');
    setGstin('');
    setAddress('');
  };

  const handleStartEdit = (c: Client) => {
    setEditingClient(c);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditGstin(c.gstin || '');
    setEditAddress(c.address || '');
    setShowEditClientModal(true);
  };

  const handleSaveEditClient = (e: FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    if (!editName.trim() || !editPhone.trim()) {
      alert("Please enter both customer name and mobile number!");
      return;
    }

    const cleanPhone = editPhone.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile number!");
      return;
    }

    const updated: Client = {
      ...editingClient,
      name: editName.trim(),
      phone: cleanPhone,
      gstin: editGstin.trim().toUpperCase(),
      address: editAddress.trim()
    };

    onEditClient(updated);
    setShowEditClientModal(false);
    setEditingClient(null);
  };

  // Selected client's specific estimates
  const selectedClientEstimates = useMemo(() => {
    if (!selectedClientForBills) return [];
    return estimates.filter(est => isEstimateForClient(est, selectedClientForBills));
  }, [selectedClientForBills, estimates]);

  // Filter clients by search & balance tab
  const filteredClients = useMemo(() => {
    let result = clients;

    // Filter by balance state
    if (partyFilter === 'DUE') {
      result = result.filter(c => {
        const stats = (c.id && clientBalances.get(c.id)) || (c.phone && clientBalances.get(c.phone));
        return stats && stats.balanceDue > 0;
      });
    } else if (partyFilter === 'SETTLED') {
      result = result.filter(c => {
        const stats = (c.id && clientBalances.get(c.id)) || (c.phone && clientBalances.get(c.phone));
        return !stats || stats.balanceDue <= 0;
      });
    }

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.gstin && c.gstin.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    }

    return result;
  }, [clients, search, partyFilter, clientBalances]);

  return (
    <div className="space-y-6">
      
      {/* ----------------- TOP MYBILLBOOK SUMMARY BAR ----------------- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span>Parties & Customers Directory</span>
            <span className="text-xs text-slate-400 font-sans font-bold hidden sm:inline">&bull; ग्राहक व पार्टियां</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            ग्राहकों के खाते, बकाया राशि, GSTIN और लेजर स्टेटमेंट प्रबंधित करें
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenFileImport && (
            <button
              type="button"
              onClick={onOpenFileImport}
              className="bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Add parties & data from saved project files or local JSON/CSV file"
            >
              <span>📂</span>
              <span>Add File Data (फ़ाइल डेटा जोड़ें)</span>
            </button>
          )}
          {onViewLedger && (
            <button
              onClick={() => onViewLedger()}
              className="bg-slate-900 hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              title="View All Customer Ledgers"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>All Party Ledgers (खाता बही)</span>
            </button>
          )}

          <button
            onClick={() => setShowAddClientModal(true)}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black py-2.5 px-5 rounded-xl text-xs shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add New Party (नई पार्टी जोड़ें)</span>
          </button>
        </div>
      </div>

      {/* ----------------- MYBILLBOOK METRIC SUMMARY CARDS ----------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Total Parties (कुल ग्राहक)
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-0.5 block">
              {clients.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
            👥
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-red-500 block">
              To Collect (कुल बकाया लेना है)
            </span>
            <span className="text-2xl font-black text-red-600 font-mono mt-0.5 block">
              ₹{formatPrice(totalReceivables)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg">
            ₹
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
              Settled Accounts (पूरा भुगतान)
            </span>
            <span className="text-2xl font-black text-emerald-700 font-mono mt-0.5 block">
              {clients.filter(c => {
                const s = (c.id && clientBalances.get(c.id)) || (c.phone && clientBalances.get(c.phone));
                return !s || s.balanceDue <= 0;
              }).length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
            ✓
          </div>
        </div>
      </div>

      {/* ----------------- CONTROLS & FILTER TABS ----------------- */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Search party name, mobile number, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100 text-xs px-4 py-2.5 pl-9 rounded-xl border border-slate-200 focus:border-blue-500 focus:bg-white outline-none transition-colors font-semibold placeholder:text-slate-400"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold gap-1">
          <button
            onClick={() => setPartyFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              partyFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Parties ({clients.length})
          </button>
          <button
            onClick={() => setPartyFilter('DUE')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              partyFilter === 'DUE' ? 'bg-red-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            To Collect (बकाया)
          </button>
          <button
            onClick={() => setPartyFilter('SETTLED')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              partyFilter === 'SETTLED' ? 'bg-white text-slate-900 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Settled (शून्य बकाया)
          </button>
        </div>
      </div>

      {/* ----------------- PARTIES TABLE VIEW ----------------- */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="w-full overflow-x-auto block">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-4">PARTY / CUSTOMER</th>
                <th className="p-4">CONTACT MOBILE</th>
                <th className="p-4">GSTIN KEY</th>
                <th className="p-4">REGISTERED ADDRESS</th>
                <th className="p-4 text-right">OUTSTANDING (बाकी)</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 font-medium">
              {filteredClients.map(c => {
                const stats = (c.id && clientBalances.get(c.id)) || (c.phone && clientBalances.get(c.phone));
                const baki = stats ? stats.balanceDue : 0;
                const isSelected = selectedClientForBills?.id === c.id;

                return (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedClientForBills(isSelected ? null : c)}
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-black flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-extrabold text-slate-900 text-xs block hover:text-blue-600 transition-colors">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {stats ? `${stats.billCount} invoices recorded` : 'No bills yet'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-mono font-bold text-slate-700">
                      +91 {c.phone}
                    </td>

                    <td className="p-4">
                      {c.gstin ? (
                        <span className="font-mono bg-blue-50 text-blue-800 px-2.5 py-1 rounded-md text-[10px] font-black uppercase border border-blue-200">
                          {c.gstin}
                        </span>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>

                    <td className="p-4 text-slate-600 max-w-xs truncate" title={c.address}>
                      {c.address || <span className="italic text-slate-400">No address recorded</span>}
                    </td>

                    <td className="p-4 text-right font-mono">
                      {baki > 0 ? (
                        <div>
                          <span className="text-xs font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                            ₹{formatPrice(baki)}
                          </span>
                          <span className="text-[9.5px] text-slate-400 block mt-0.5">You'll Get</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            ₹0
                          </span>
                          <span className="text-[9.5px] text-slate-400 block mt-0.5">Settled</span>
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* WhatsApp Reminder */}
                        {c.phone && (
                          <a
                            href={`https://wa.me/91${c.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `Dear ${c.name},\nGreeting from our billing desk!\nYour current outstanding balance is INR ${formatPrice(baki)}.\nPlease arrange for the payment at your earliest convenience.\nThank you for your business!`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Send WhatsApp Payment Reminder (व्हाट्सएप रिमाइंडर)"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </a>
                        )}

                        {/* View Ledger */}
                        {onViewLedger && (
                          <button
                            type="button"
                            onClick={() => onViewLedger(c.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="View Customer Ledger Passbook (खाताबही देखें)"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(c)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Customer Details"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => onDeleteClient(c.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Customer Profile"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredClients.length === 0 && (
          <div className="p-14 text-center bg-slate-50/50">
            <span className="text-3xl block mb-2">👥</span>
            <h3 className="font-bold text-slate-700 text-sm">No customers matching your search query</h3>
            <p className="text-xs text-slate-400 mt-1">Try another search or click "+ Add New Party" above.</p>
          </div>
        )}
      </div>

      {/* ----------------- SELECTED PARTY SLIDE-OVER DETAIL CARD ----------------- */}
      {selectedClientForBills && (
        <div className="bg-white rounded-3xl border border-blue-200 p-5 shadow-md animate-fade-in space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-150 pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black flex items-center justify-center text-base shadow-sm">
                {selectedClientForBills.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">{selectedClientForBills.name}</h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium mt-0.5">
                  <span><b>Phone:</b> +91 {selectedClientForBills.phone}</span>
                  {selectedClientForBills.gstin && <span><b>GSTIN:</b> {selectedClientForBills.gstin}</span>}
                  {selectedClientForBills.address && <span><b>Address:</b> {selectedClientForBills.address}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onViewLedger && (
                <button
                  onClick={() => onViewLedger(selectedClientForBills.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center space-x-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open Full Passbook & Statement</span>
                </button>
              )}
              <button
                onClick={() => setSelectedClientForBills(null)}
                className="text-slate-400 hover:text-slate-600 p-2 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Invoices list for this party */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
              Recent Invoices & Bills for {selectedClientForBills.name} ({selectedClientEstimates.length})
            </h4>

            {selectedClientEstimates.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
                {selectedClientEstimates.map(est => (
                  <div key={est.id} className="p-3 bg-white hover:bg-slate-50 flex flex-wrap justify-between items-center gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700">#{est.serial}</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="font-medium text-slate-600">{est.date}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          est.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {est.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Items: {est.items.map(i => i.name).slice(0, 3).join(', ')}{est.items.length > 3 ? '...' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 block">₹{formatPrice(est.grandTotal)}</span>
                        {est.balanceDue > 0 && (
                          <span className="text-[10px] font-bold text-red-600 block">Due: ₹{formatPrice(est.balanceDue)}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onPrintEstimate && (
                          <button
                            onClick={() => onPrintEstimate(est.id)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                            title="Print Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onEditEstimate && (
                          <button
                            onClick={() => onEditEstimate(est.id)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                            title="Edit Invoice"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                No invoices recorded yet for this customer. Create a new bill to get started!
              </p>
            )}
          </div>
        </div>
      )}

      {/* ----------------- MODAL: REGISTER NEW CLIENT ----------------- */}
      {showAddClientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <form onSubmit={handleSaveClient} className="bg-white rounded-3xl w-full max-w-md p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>Add New Party / Customer</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddClientModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Party / Customer Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Trading Co. or Rajesh Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Mobile Contact Phone *</label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10-digit mobile number e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">GSTIN Number (Optional)</label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Billing & Shipping Address</label>
                <textarea
                  rows={2}
                  placeholder="Shop No, Market Road, City, Pincode"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAddClientModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                Save Party (सेव करें)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------- MODAL: EDIT CLIENT ----------------- */}
      {showEditClientModal && editingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <form onSubmit={handleSaveEditClient} className="bg-white rounded-3xl w-full max-w-md p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <span>Edit Customer Profile</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditClientModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Contact Phone *</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">GSTIN Key</label>
                <input
                  type="text"
                  maxLength={15}
                  value={editGstin}
                  onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Registered Address</label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowEditClientModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                Update Party (अपडेट करें)
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
