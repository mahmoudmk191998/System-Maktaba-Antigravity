/**
 * React Hook for Units of Measurement
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { Unit } from '@/types/retail.types';
import { STANDARD_DEFAULT_UNITS } from '@/services/units/units.service';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

export function useUnits() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id || '';

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUnits = useCallback(async () => {
    if (!tenantId) {
      setUnits(
        STANDARD_DEFAULT_UNITS.map((u, i) => ({
          id: `default-${i}`,
          tenantId: '',
          ...u,
        }))
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'units'), where('tenantId', '==', tenantId));
      const snap = await getDocs(q);

      if (snap.empty) {
        // Return standard defaults with tenantId
        const defaults: Unit[] = STANDARD_DEFAULT_UNITS.map((u, i) => ({
          id: `unit-${u.code.toLowerCase()}`,
          tenantId,
          ...u,
        }));
        setUnits(defaults);
      } else {
        const dbUnits = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Unit[];
        setUnits(dbUnits);
      }
    } catch (err) {
      console.error('Error fetching units:', err);
      // Fallback to standard
      setUnits(
        STANDARD_DEFAULT_UNITS.map((u, i) => ({
          id: `default-${i}`,
          tenantId,
          ...u,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  return { units, loading, refresh: loadUnits };
}
