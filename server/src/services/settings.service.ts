import { getFirestoreDb } from '../config/firebase.js';
import { PublicRestaurantSettings } from '../types/public.types.js';
import { NotFoundError } from '../utils/errors.js';

import { env } from '../config/environment.js';

const COLLECTION_NAME = 'tenants';

// In-memory test store
const inMemoryTenants = new Map<string, any>();

export class SettingsService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  /**
   * Fetch public restaurant branding and settings.
   * Strips all internal settings, financial configs, and security details.
   */
  async getPublicSettings(tenantId: string): Promise<PublicRestaurantSettings> {
    let tenantData: any = null;

    if (this.useMemory) {
      tenantData = inMemoryTenants.get(tenantId);
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(COLLECTION_NAME).doc(tenantId).get();
        if (doc.exists) {
          tenantData = { id: doc.id, ...doc.data() };
        }
      } catch (err) {
        tenantData = inMemoryTenants.get(tenantId);
      }
    }

    if (!tenantData) {
      throw new NotFoundError(`Tenant '${tenantId}' not found`);
    }

    const settings = tenantData.settings || {};

    return {
      restaurant_name: tenantData.name || settings.invoiceCompanyName || 'Restaurant',
      logo: tenantData.logo || settings.invoiceLogo || undefined,
      currency: settings.currency || 'EGP',
      locale: settings.locale || 'ar-EG',
      timezone: settings.timezone || 'Africa/Cairo',
      tax_rate: Number(settings.taxRate) || 0,
      tax_included: Boolean(settings.taxIncluded),
      phone: settings.invoicePhone || undefined,
      address: settings.invoiceAddress || undefined,
      primary_color: settings.primaryColor || '#ea580c',
    };
  }

  // Test helpers
  setMemoryTenant(id: string, data: any) {
    inMemoryTenants.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryTenants.clear();
  }
}

export const defaultSettingsService = new SettingsService();
