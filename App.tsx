import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  UserPlus, 
  Pill, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  Activity,
  LayoutDashboard,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isBefore, addDays, parseISO, subDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, logOut } from './firebase';
import { Medicine, Member, Log, DashboardStats } from './types';

// Error Handling Spec for Firestore
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ completionRate: 0, missedThisWeek: 0 });
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'medicines' | 'members'>('dashboard');
  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // Form States
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: 'Daily', memberId: '', expiryDate: '' });
  const [newMember, setNewMember] = useState({ name: '', relation: '', age: '' });
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u: User | null) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const qMembers = query(collection(db, 'members'), where('ownerId', '==', user.uid));
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    }, (err: any) => handleFirestoreError(err, OperationType.LIST, 'members'));

    const qMeds = query(collection(db, 'medicines'), where('ownerId', '==', user.uid));
    const unsubMeds = onSnapshot(qMeds, (snapshot) => {
      setMedicines(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Medicine)));
    }, (err: any) => handleFirestoreError(err, OperationType.LIST, 'medicines'));

    const qLogs = query(collection(db, 'logs'), where('ownerId', '==', user.uid));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Log)));
    }, (err: any) => handleFirestoreError(err, OperationType.LIST, 'logs'));

    return () => {
      unsubMembers();
      unsubMeds();
      unsubLogs();
    };
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!medicines.length && !logs.length) {
      setStats({ completionRate: 0, missedThisWeek: 0 });
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const todayLogs = logs.filter(l => l.date === today);
    const todayMedsCount = medicines.length;
    
    const completionRate = todayMedsCount > 0 ? (todayLogs.filter(l => l.status === 'taken').length / todayMedsCount) * 100 : 0;
    
    const startOfWk = startOfWeek(new Date());
    const endOfWk = endOfWeek(new Date());
    const missedThisWeek = logs.filter(l => {
      const logDate = parseISO(l.date);
      return isWithinInterval(logDate, { start: startOfWk, end: endOfWk }) && l.status === 'skipped';
    }).length;

    setStats({ completionRate, missedThisWeek });
  }, [medicines, logs]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newMed.name || !newMed.memberId || !newMed.expiryDate) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    try {
      await addDoc(collection(db, 'medicines'), {
        ...newMed,
        ownerId: user.uid
      });
      setShowAddMed(false);
      setNewMed({ name: '', dosage: '', frequency: 'Daily', memberId: '', expiryDate: '' });
      showToast('Medicine added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'medicines');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newMember.name || !newMember.relation || !newMember.age) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    try {
      await addDoc(collection(db, 'members'), {
        ...newMember,
        age: parseInt(newMember.age),
        ownerId: user.uid
      });
      setShowAddMember(false);
      setNewMember({ name: '', relation: '', age: '' });
      showToast('Family member added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'members');
    }
  };

  const logMedicine = async (medicineId: string, status: 'taken' | 'skipped') => {
    if (!user) return;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const existingLog = logs.find(l => l.medicineId === medicineId && l.date === today);
      
      if (existingLog) {
        await updateDoc(doc(db, 'logs', existingLog.id), {
          status,
          takenAt: status === 'taken' ? new Date().toISOString() : null
        });
      } else {
        await addDoc(collection(db, 'logs'), {
          medicineId,
          date: today,
          status,
          ownerId: user.uid,
          takenAt: status === 'taken' ? new Date().toISOString() : null
        });
      }
      
      showToast(`Medicine marked as ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'logs');
    }
  };

  const isExpiringSoon = (expiryDate: string) => {
    const expiry = parseISO(expiryDate);
    const sevenDaysFromNow = addDays(new Date(), 7);
    return isBefore(expiry, sevenDaysFromNow);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl shadow-emerald-100/50 max-w-md w-full text-center border border-emerald-50">
          <div className="bg-emerald-600 w-20 h-20 rounded-[30px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
            <Pill className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">MedTrack Family</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">The shared dashboard for Indian households to manage family health together.</p>
          <button 
            onClick={signIn}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-200 active:scale-95"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex justify-around md:top-0 md:bottom-auto md:flex-col md:w-64 md:h-full md:border-t-0 md:border-r md:pt-10 z-20">
        <div className="hidden md:flex items-center gap-3 px-4 mb-10">
          <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-100">
            <Pill className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">MedTrack</h1>
        </div>
        
        <div className="flex flex-row md:flex-col gap-2 w-full justify-around md:justify-start">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard />} label="Dashboard" />
          <NavItem active={activeTab === 'medicines'} onClick={() => setActiveTab('medicines')} icon={<Pill />} label="Medicines" />
          <NavItem active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users />} label="Family" />
        </div>

        <div className="hidden md:block mt-auto pb-6 px-4">
          <button 
            onClick={logOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 w-full font-bold transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-64 p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
        
        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed top-6 right-6 z-50 px-6 py-3 rounded-2xl shadow-xl border font-bold flex items-center gap-3 ${
                toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-rose-600 text-white border-rose-500'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatCard 
                title="Today's Adherence" 
                value={`${Math.round(stats.completionRate)}%`} 
                icon={<Activity className="text-emerald-500" />}
                color="bg-emerald-50"
              />
              <StatCard 
                title="Missed This Week" 
                value={stats.missedThisWeek.toString()} 
                icon={<AlertTriangle className="text-rose-500" />}
                color="bg-rose-50"
              />
            </div>

            {/* Daily Checklist */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Calendar className="text-slate-400" />
                  Daily Checklist
                  <span className="text-sm font-normal text-slate-400 ml-2">{format(new Date(), 'EEEE, MMM do')}</span>
                </h2>
              </div>

              <div className="grid gap-4">
                {members.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-slate-300">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Add family members to start tracking</p>
                  </div>
                ) : (
                  members.map(member => {
                    const memberMeds = medicines.filter(m => m.memberId === member.id);
                    if (memberMeds.length === 0) return null;

                    return (
                      <div key={member.id} className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 text-lg">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          {member.name}'s Schedule
                        </h3>
                        <div className="space-y-4">
                          {memberMeds.map(med => {
                            const todayLog = logs.find(l => l.medicineId === med.id && l.date === todayStr);
                            const yesterdayLog = logs.find(l => l.medicineId === med.id && l.date === yesterdayStr);
                            const isMissedYesterday = yesterdayLog && yesterdayLog.status === 'skipped';
                            const expiringSoon = isExpiringSoon(med.expiryDate);

                            return (
                              <div key={med.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border transition-all gap-4 ${isMissedYesterday ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex items-center gap-4">
                                  <div className={`p-3 rounded-xl ${isMissedYesterday ? 'bg-rose-100' : 'bg-white shadow-sm'}`}>
                                    <Pill className={`w-6 h-6 ${isMissedYesterday ? 'text-rose-600' : 'text-emerald-600'}`} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-slate-900">{med.name}</p>
                                      {expiringSoon && (
                                        <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" />
                                          EXPIRING
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-500 font-medium">{med.dosage} • {med.frequency}</p>
                                    {isMissedYesterday && <p className="text-[10px] font-black text-rose-600 uppercase mt-1 tracking-wider">Missed Yesterday</p>}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {todayLog?.status === 'taken' ? (
                                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-100/50 px-5 py-2.5 rounded-xl border border-emerald-200">
                                      <CheckCircle2 className="w-4 h-4" />
                                      Taken
                                    </div>
                                  ) : todayLog?.status === 'skipped' ? (
                                    <div className="flex items-center gap-2 text-rose-600 font-bold text-sm bg-rose-100/50 px-5 py-2.5 rounded-xl border border-rose-200">
                                      <XCircle className="w-4 h-4" />
                                      Skipped
                                    </div>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => logMedicine(med.id, 'taken')}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-100 active:scale-95"
                                      >
                                        Mark Taken
                                      </button>
                                      <button 
                                        onClick={() => logMedicine(med.id, 'skipped')}
                                        className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                                      >
                                        Skip
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'medicines' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight">Medicine Inventory</h2>
              <button 
                onClick={() => setShowAddMed(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-emerald-100 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Add Medicine
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {medicines.map(med => (
                <div key={med.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-xl text-slate-900">{med.name}</h3>
                      <p className="text-slate-500 font-medium">{med.dosage} • {med.frequency}</p>
                    </div>
                    <div className="bg-emerald-50 px-4 py-1.5 rounded-full text-xs font-bold text-emerald-700 border border-emerald-100">
                      {members.find(m => m.id === med.memberId)?.name}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className={isExpiringSoon(med.expiryDate) ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                        Expires: {format(parseISO(med.expiryDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                    {isExpiringSoon(med.expiryDate) && <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight">Family Members</h2>
              <button 
                onClick={() => setShowAddMember(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-emerald-100 active:scale-95"
              >
                <UserPlus className="w-5 h-5" />
                Add Member
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {members.map(member => (
                <div key={member.id} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm text-center group hover:border-emerald-200 transition-all">
                  <div className="w-20 h-20 bg-emerald-50 rounded-[30px] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Users className="text-emerald-600 w-10 h-10" />
                  </div>
                  <h3 className="font-bold text-xl text-slate-900 mb-1">{member.name}</h3>
                  <p className="text-slate-500 font-medium mb-6">{member.relation} • {member.age} years</p>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Active Medicines</p>
                    <p className="text-2xl font-black text-emerald-600">
                      {medicines.filter(m => m.memberId === member.id).length}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAddMed && (
          <Modal title="Add New Medicine" onClose={() => setShowAddMed(false)}>
            <form onSubmit={handleAddMed} className="space-y-5">
              <Input label="Medicine Name" value={newMed.name} onChange={v => setNewMed({...newMed, name: v})} placeholder="e.g. Paracetamol" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Dosage" value={newMed.dosage} onChange={v => setNewMed({...newMed, dosage: v})} placeholder="e.g. 500mg" />
                <Select label="Frequency" value={newMed.frequency} onChange={v => setNewMed({...newMed, frequency: v})} options={['Daily', 'Twice Daily', 'Thrice Daily', 'Weekly']} />
              </div>
              <Select 
                label="Assign To" 
                value={newMed.memberId} 
                onChange={v => setNewMed({...newMed, memberId: v})} 
                options={members.map(m => ({ label: m.name, value: m.id }))} 
              />
              <Input label="Expiry Date" type="date" value={newMed.expiryDate} onChange={v => setNewMed({...newMed, expiryDate: v})} />
              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold mt-4 shadow-lg shadow-emerald-100 active:scale-95 transition-all">Save Medicine</button>
            </form>
          </Modal>
        )}

        {showAddMember && (
          <Modal title="Add Family Member" onClose={() => setShowAddMember(false)}>
            <form onSubmit={handleAddMember} className="space-y-5">
              <Input label="Full Name" value={newMember.name} onChange={v => setNewMember({...newMember, name: v})} placeholder="e.g. Grandma" />
              <Input label="Relation" value={newMember.relation} onChange={v => setNewMember({...newMember, relation: v})} placeholder="e.g. Grandmother" />
              <Input label="Age" type="number" value={newMember.age} onChange={v => setNewMember({...newMember, age: v})} placeholder="e.g. 75" />
              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold mt-4 shadow-lg shadow-emerald-100 active:scale-95 transition-all">Add Member</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl transition-all w-full ${active ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-100' : 'text-slate-400 hover:bg-slate-50'}`}
    >
      <div className="w-5 h-5">
        {icon}
      </div>
      <span className="hidden md:block">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex items-center justify-between group hover:border-emerald-100 transition-all">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{title}</p>
        <p className="text-4xl font-black text-slate-900">{value}</p>
      </div>
      <div className={`p-5 rounded-[30px] ${color} group-hover:scale-110 transition-transform`}>
        <div className="w-10 h-10">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl border border-slate-100"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <XCircle className="w-8 h-8" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string, type?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-900"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: (string | { label: string, value: string })[] }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <select 
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-900 appearance-none"
      >
        <option value="">Select...</option>
        {options.map(opt => {
          const label = typeof opt === 'string' ? opt : opt.label;
          const val = typeof opt === 'string' ? opt : opt.value;
          return <option key={val} value={val}>{label}</option>;
        })}
      </select>
    </div>
  );
}
