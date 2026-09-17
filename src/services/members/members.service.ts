import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  runTransaction,
} from 'firebase/firestore';
import type { Member, Loan, Hold, Fine, FinePayment } from '@/types/library.types';
import { normalizeSearchText } from '../catalog/books.service';

export interface MemberFilterOptions {
  search?: string;
  status?: string;
  membershipPlanId?: string;
  maxLimit?: number;
}

export async function getMembers(
  tenantId: string,
  options: MemberFilterOptions = {}
): Promise<Member[]> {
  if (!tenantId) return [];

  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  }
  if (options.membershipPlanId) {
    constraints.push(where('membershipPlanId', '==', options.membershipPlanId));
  }
  if (options.maxLimit && options.maxLimit > 0) {
    constraints.push(fsLimit(options.maxLimit));
  }

  const q = query(collection(db, 'members'), ...constraints);
  const snap = await getDocs(q);
  let members = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Member, 'id'>) }));

  if (options.search && options.search.trim()) {
    const term = normalizeSearchText(options.search);
    members = members.filter((m) => {
      const matchName = normalizeSearchText(m.fullName).includes(term);
      const matchPhone = m.phone.includes(options.search!.trim());
      const matchNum = m.memberNumber.toLowerCase().includes(term);
      const matchBarcode = m.barcode.toLowerCase().includes(term);
      const matchEmail = m.email ? m.email.toLowerCase().includes(term) : false;
      const matchNational = m.nationalId ? m.nationalId.includes(term) : false;
      return matchName || matchPhone || matchNum || matchBarcode || matchEmail || matchNational;
    });
  }

  members.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
  return members;
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  const snap = await getDoc(doc(db, 'members', memberId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Member, 'id'>) };
}

export async function findMemberByBarcodeOrPhone(
  tenantId: string,
  rawQuery: string
): Promise<Member | null> {
  const term = rawQuery.trim();
  if (!term) return null;

  // 1. Try barcode lookup
  const barcodeQ = query(
    collection(db, 'members'),
    where('tenantId', '==', tenantId),
    where('barcode', '==', term),
    fsLimit(1)
  );
  const barcodeSnap = await getDocs(barcodeQ);
  if (!barcodeSnap.empty) {
    return { id: barcodeSnap.docs[0].id, ...(barcodeSnap.docs[0].data() as Omit<Member, 'id'>) };
  }

  // 2. Try member number lookup
  const numQ = query(
    collection(db, 'members'),
    where('tenantId', '==', tenantId),
    where('memberNumber', '==', term.toUpperCase()),
    fsLimit(1)
  );
  const numSnap = await getDocs(numQ);
  if (!numSnap.empty) {
    return { id: numSnap.docs[0].id, ...(numSnap.docs[0].data() as Omit<Member, 'id'>) };
  }

  // 3. Try phone number lookup
  const phoneQ = query(
    collection(db, 'members'),
    where('tenantId', '==', tenantId),
    where('phone', '==', term),
    fsLimit(1)
  );
  const phoneSnap = await getDocs(phoneQ);
  if (!phoneSnap.empty) {
    return { id: phoneSnap.docs[0].id, ...(phoneSnap.docs[0].data() as Omit<Member, 'id'>) };
  }

  return null;
}

export async function createMember(
  tenantId: string,
  data: {
    fullName: string;
    phone: string;
    email?: string;
    nationalId?: string;
    address?: string;
    membershipPlanId: string;
    membershipPlanName?: string;
    durationMonths?: number;
    maxBooksAllowed?: number;
    notes?: string;
    photoUrl?: string;
  }
): Promise<Member> {
  const cleanPhone = data.phone.trim();
  if (!cleanPhone) {
    throw new Error('رقم الهاتف مطلوب لتسجيل العضو.');
  }

  // Check duplicate phone
  const existingPhoneQ = query(
    collection(db, 'members'),
    where('tenantId', '==', tenantId),
    where('phone', '==', cleanPhone),
    fsLimit(1)
  );
  const phoneSnap = await getDocs(existingPhoneQ);
  if (!phoneSnap.empty) {
    throw new Error(`رقم الهاتف [${cleanPhone}] مسجل بالفعل لعضو آخر بالمكتبة.`);
  }

  // Atomic member sequence counter
  const counterRef = doc(db, 'member_counters', tenantId);
  const nextSeq = await runTransaction(db, async (t) => {
    const snap = await t.get(counterRef);
    let current = 0;
    if (snap.exists()) {
      current = Number(snap.data()?.lastSequence || 0);
    }
    const updated = current + 1;
    t.set(counterRef, { lastSequence: updated, updatedAt: new Date().toISOString() }, { merge: true });
    return updated;
  });

  const memberNumber = `MEM-${String(nextSeq).padStart(6, '0')}`;
  const barcode = `M${String(nextSeq).padStart(8, '0')}`;
  const now = new Date();
  const joinDate = now.toISOString().slice(0, 10);

  const months = data.durationMonths || 12;
  const expiry = new Date(now.getTime());
  expiry.setMonth(expiry.getMonth() + months);
  const expiryDate = expiry.toISOString().slice(0, 10);

  const newMember: Omit<Member, 'id'> = {
    tenantId,
    memberNumber,
    barcode,
    qrCode: `LIB-PATRON:${tenantId}:${barcode}`,
    fullName: data.fullName.trim(),
    phone: cleanPhone,
    email: data.email?.trim() || '',
    nationalId: data.nationalId?.trim() || '',
    address: data.address?.trim() || '',
    membershipPlanId: data.membershipPlanId,
    membershipPlanName: data.membershipPlanName || '',
    joinDate,
    expiryDate,
    status: 'active',
    maxBooksAllowed: Number(data.maxBooksAllowed) || 3,
    notes: data.notes || '',
    photoUrl: data.photoUrl || '',
    outstandingFine: 0,
    currentLoansCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const ref = await addDoc(collection(db, 'members'), newMember);
  return { id: ref.id, ...newMember };
}

export async function updateMember(
  memberId: string,
  data: Partial<Omit<Member, 'id' | 'tenantId' | 'memberNumber' | 'barcode' | 'createdAt'>>
): Promise<void> {
  const ref = doc(db, 'members', memberId);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function getMemberProfileSummary(
  tenantId: string,
  memberId: string
): Promise<{
  member: Member | null;
  activeLoans: Loan[];
  historicalLoans: Loan[];
  holds: Hold[];
  unpaidFines: Fine[];
  paymentHistory: FinePayment[];
}> {
  const member = await getMemberById(memberId);
  if (!member) {
    return {
      member: null,
      activeLoans: [],
      historicalLoans: [],
      holds: [],
      unpaidFines: [],
      paymentHistory: [],
    };
  }

  // Active Loans
  const activeLoansQ = query(
    collection(db, 'loans'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', 'in', ['active', 'partially_returned', 'overdue'])
  );
  const activeSnap = await getDocs(activeLoansQ);
  const activeLoans = activeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Loan, 'id'>) }));

  // Historical Loans
  const histLoansQ = query(
    collection(db, 'loans'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', 'in', ['returned', 'lost', 'cancelled']),
    fsLimit(50)
  );
  const histSnap = await getDocs(histLoansQ);
  const historicalLoans = histSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Loan, 'id'>) }));

  // Active Holds
  const holdsQ = query(
    collection(db, 'holds'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', 'in', ['waiting', 'ready'])
  );
  const holdsSnap = await getDocs(holdsQ);
  const holds = holdsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Hold, 'id'>) }));

  // Unpaid Fines
  const finesQ = query(
    collection(db, 'fines'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', 'in', ['unpaid', 'partially_paid'])
  );
  const finesSnap = await getDocs(finesQ);
  const unpaidFines = finesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fine, 'id'>) }));

  // Payment History
  const payQ = query(
    collection(db, 'fine_payments'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    fsLimit(50)
  );
  const paySnap = await getDocs(payQ);
  const paymentHistory = paySnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinePayment, 'id'>) }));

  return {
    member,
    activeLoans,
    historicalLoans,
    holds,
    unpaidFines,
    paymentHistory,
  };
}
