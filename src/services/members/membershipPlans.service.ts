import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import type { MembershipPlan } from '@/types/library.types';

export async function getMembershipPlans(tenantId: string): Promise<MembershipPlan[]> {
  if (!tenantId) return [];
  const q = query(
    collection(db, 'membership_plans'),
    where('tenantId', '==', tenantId),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MembershipPlan, 'id'>) }));
}

export async function createMembershipPlan(
  tenantId: string,
  data: Omit<MembershipPlan, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<MembershipPlan> {
  const now = new Date().toISOString();
  const newDoc = {
    tenantId,
    name: data.name.trim(),
    nameEn: data.nameEn || '',
    maxBooks: Number(data.maxBooks) || 3,
    loanDurationDays: Number(data.loanDurationDays) || 14,
    maxRenewals: Number(data.maxRenewals) || 1,
    reservationLimit: Number(data.reservationLimit) || 2,
    finePerDay: Number(data.finePerDay) || 5,
    gracePeriodDays: Number(data.gracePeriodDays) || 2,
    maxFineAmount: Number(data.maxFineAmount) || 100,
    membershipFee: Number(data.membershipFee) || 0,
    durationMonths: Number(data.durationMonths) || 12,
    active: data.active ?? true,
    allowSpecialCollections: !!data.allowSpecialCollections,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'membership_plans'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updateMembershipPlan(
  planId: string,
  data: Partial<Omit<MembershipPlan, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'membership_plans', planId);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function seedDefaultPlans(tenantId: string): Promise<void> {
  const existing = await getMembershipPlans(tenantId);
  if (existing.length > 0) return;

  const defaults = [
    {
      name: 'العضوية العامة (Basic)',
      nameEn: 'Basic Membership',
      maxBooks: 3,
      loanDurationDays: 14,
      maxRenewals: 1,
      reservationLimit: 2,
      finePerDay: 5,
      gracePeriodDays: 2,
      maxFineAmount: 80,
      membershipFee: 50,
      durationMonths: 12,
      active: true,
    },
    {
      name: 'عضوية الطلاب والباحثين',
      nameEn: 'Student & Researcher',
      maxBooks: 5,
      loanDurationDays: 21,
      maxRenewals: 2,
      reservationLimit: 3,
      finePerDay: 3,
      gracePeriodDays: 3,
      maxFineAmount: 60,
      membershipFee: 30,
      durationMonths: 12,
      active: true,
    },
    {
      name: 'العضوية الذهبية (Premium / VIP)',
      nameEn: 'VIP / Premium Plan',
      maxBooks: 8,
      loanDurationDays: 30,
      maxRenewals: 3,
      reservationLimit: 5,
      finePerDay: 2,
      gracePeriodDays: 5,
      maxFineAmount: 150,
      membershipFee: 150,
      durationMonths: 12,
      active: true,
      allowSpecialCollections: true,
    },
    {
      name: 'عضوية منسوبي المؤسسة (Staff)',
      nameEn: 'Staff Membership',
      maxBooks: 10,
      loanDurationDays: 45,
      maxRenewals: 4,
      reservationLimit: 5,
      finePerDay: 0,
      gracePeriodDays: 14,
      maxFineAmount: 0,
      membershipFee: 0,
      durationMonths: 24,
      active: true,
      allowSpecialCollections: true,
    },
  ];

  for (const plan of defaults) {
    await createMembershipPlan(tenantId, plan);
  }
}
