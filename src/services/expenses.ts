import { db } from '@/lib/firebase';
import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, orderBy, limit as fsLimit } from 'firebase/firestore';
import type { Expense } from '@/types/expenses';
import { notifyLargeExpense } from './notifications.service';
import { applyExpenseToStats } from './analytics/aggregatedStats.service';
import { firestoreLogger } from '@/lib/firestoreLogger';

const COLLECTION_NAME = 'expenses';

export const getExpenses = async (tenantId?: string, branchId?: string, startDate?: string, endDate?: string, limitCount = 50) => {
  try {
    const expensesRef = collection(db, COLLECTION_NAME);
    let constraints: any[] = [];
    
    if (tenantId) constraints.push(where('tenantId', '==', tenantId));
    if (branchId && branchId !== 'all') constraints.push(where('branchId', '==', branchId));

    if (limitCount && limitCount > 0) {
      constraints.push(fsLimit(limitCount));
    }

    let q = constraints.length > 0 ? query(expensesRef, ...constraints) : query(expensesRef);

    const snapshot = await getDocs(q);
    firestoreLogger.logOperation('getExpenses', COLLECTION_NAME, 'getDocs', snapshot.docs.length);

    let expenses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Expense[];

    // Sort in-memory desc by date to avoid Firebase composite index errors
    expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (startDate && endDate) {
      // In-memory filter for dates
      expenses = expenses.filter(e => e.date >= startDate && e.date <= endDate);
    }
    return expenses;
  } catch (error) {
    console.error('Error fetching expenses:', error);
    throw error;
  }
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
  const numAmount = Number(expenseData.amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw new Error('مبلغ المصروف يجب أن يكون رقماً موجباً أكبر من الصفر');
  }
  if (!expenseData.tenantId || typeof expenseData.tenantId !== 'string' || !expenseData.tenantId.trim()) {
    throw new Error('يجب تحديد معرف المنشأة (tenantId)');
  }
  try {
    const expensesRef = collection(db, COLLECTION_NAME);
    const docRef = await addDoc(expensesRef, {
      ...expenseData,
      amount: numAmount,
      createdAt: new Date().toISOString()
    });

    // Update Aggregated Daily & Monthly Stats
    await applyExpenseToStats(expenseData.tenantId, expenseData.date || new Date(), numAmount, false);

    if (numAmount >= 5000) {
      notifyLargeExpense(
        expenseData.branchId || 'all',
        expenseData.description || 'مصروف عام',
        numAmount,
        docRef.id
      ).catch(() => {});
    }

    return docRef.id;
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
};

export const updateExpense = async (id: string, updates: Partial<Expense>) => {
  if (updates.amount !== undefined) {
    const numAmount = Number(updates.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new Error('مبلغ المصروف يجب أن يكون رقماً موجباً أكبر من الصفر');
    }
    updates.amount = numAmount;
  }
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updates);
  } catch (error) {
    console.error('Error updating expense:', error);
    throw error;
  }
};

export const deleteExpense = async (id: string) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Expense;
      const amt = Number(data.amount || 0);
      const tId = data.tenantId;
      if (tId && amt > 0) {
        await applyExpenseToStats(tId, data.date || data.createdAt, amt, true);
      }
    }
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw error;
  }
};
