import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import type { Hold, Member, MembershipPlan, Book } from '@/types/library.types';

export async function getHolds(
  tenantId: string,
  options: { bookId?: string; memberId?: string; branchId?: string; status?: string } = {}
): Promise<Hold[]> {
  if (!tenantId) return [];
  const constraints = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  }
  if (options.bookId) {
    constraints.push(where('bookId', '==', options.bookId));
  }
  if (options.memberId) {
    constraints.push(where('memberId', '==', options.memberId));
  }
  if (options.branchId && options.branchId !== 'all') {
    constraints.push(where('branchId', '==', options.branchId));
  }

  const q = query(collection(db, 'holds'), ...constraints);
  const snap = await getDocs(q);
  const holds = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Hold, 'id'>) }));
  holds.sort((a, b) => a.queuePosition - b.queuePosition);
  return holds;
}

export async function createHold(
  tenantId: string,
  data: {
    branchId: string;
    memberId: string;
    bookId: string;
  }
): Promise<Hold> {
  const { branchId, memberId, bookId } = data;
  const now = new Date();

  // 1. Check patron validity & reservation limit
  const memberRef = doc(db, 'members', memberId);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) throw new Error('العضو غير موجود.');
  const member = memberSnap.data() as Member;

  if (member.status !== 'active') {
    throw new Error('لا يمكن إنشاء حجز لحساب عضو غير نشط.');
  }

  const planRef = doc(db, 'membership_plans', member.membershipPlanId);
  const planSnap = await getDoc(planRef);
  const plan = planSnap.exists() ? (planSnap.data() as MembershipPlan) : null;
  const maxHolds = plan?.reservationLimit || 2;

  // Check current active holds for this member
  const memberActiveHoldsQ = query(
    collection(db, 'holds'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', 'in', ['waiting', 'ready'])
  );
  const memHoldsSnap = await getDocs(memberActiveHoldsQ);
  if (memHoldsSnap.size >= maxHolds) {
    throw new Error(`بلغ العضو الحد الأقصى للحجوزات المسموح بها في وقت واحد (${maxHolds} حجز).`);
  }

  // Check if member already has an active hold on this exact book
  const dupCheck = memHoldsSnap.docs.some((d) => d.data().bookId === bookId);
  if (dupCheck) {
    throw new Error('العضو لديه حجز نشط بالفعل على هذا الكتاب.');
  }

  // 2. Fetch Book title
  const bookRef = doc(db, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  if (!bookSnap.exists()) throw new Error('العنوان المطلوب غير موجود.');
  const book = bookSnap.data() as Book;

  // 3. Compute next Queue Position
  const activeBookHoldsQ = query(
    collection(db, 'holds'),
    where('tenantId', '==', tenantId),
    where('bookId', '==', bookId),
    where('status', '==', 'waiting')
  );
  const bookHoldsSnap = await getDocs(activeBookHoldsQ);
  const nextPosition = bookHoldsSnap.size + 1;

  // Expiration of wait request (e.g. 60 days default before auto-cancelling if not fulfilled)
  const expiresAt = new Date(now.getTime());
  expiresAt.setDate(expiresAt.getDate() + 60);

  const newHold: Omit<Hold, 'id'> = {
    tenantId,
    branchId,
    memberId,
    memberName: member.fullName,
    bookId,
    bookTitle: book.title,
    requestedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    queuePosition: nextPosition,
    status: 'waiting',
    fulfilledCopyId: null,
    notifiedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const ref = await addDoc(collection(db, 'holds'), newHold);
  return { id: ref.id, ...newHold };
}

export async function cancelHold(holdId: string, reason?: string): Promise<void> {
  const ref = doc(db, 'holds', holdId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('طلب الحجز غير موجود.');
  const hold = snap.data() as Hold;

  const now = new Date().toISOString();
  await updateDoc(ref, {
    status: 'cancelled',
    updatedAt: now,
  });

  // If a copy was reserved for this hold, release it back to available or next in queue
  if (hold.fulfilledCopyId) {
    const copyRef = doc(db, 'book_copies', hold.fulfilledCopyId);
    const copySnap = await getDoc(copyRef);
    if (copySnap.exists() && copySnap.data().status === 'reserved') {
      await updateDoc(copyRef, {
        status: 'available',
        reservedForMemberId: null,
        updatedAt: now,
      });
    }
  }
}
