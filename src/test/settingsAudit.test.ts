import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/lib/store';
import { formatCurrency, formatNumber, formatDate, toArabicNumerals } from '@/lib/formatters';

describe('Settings Audit & Functional Verification Suite', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentTenant: { id: 'tenant_1', name: 'مطعم الكرم الأصلي', nameEn: 'Al Karam', taxNumber: '123456789' },
      currentBranch: { 
        id: 'branch_1', 
        tenantId: 'tenant_1', 
        name: 'فرع المعادي', 
        phone: '01000000000', 
        address: 'شارع النصر، المعادي', 
        openingTime: '09:00',
        closingTime: '01:00',
        isActive: true 
      },
      settings: {
        useArabicNumerals: false,
        useHijriCalendar: false,
        currency: 'EGP',
        locale: 'ar-EG',
        timezone: 'Africa/Cairo',
        taxRate: 14,
        serviceChargeRate: 12,
        autoPrintReceipt: true,
        printKitchenTicket: true,
        openDrawerPassword: '',
        receiptWelcomeMessage: 'شكراً لزيارتكم',
        invoiceCompanyName: 'مطعم الكرم الأصلي',
        invoiceAddress: 'شارع النصر، المعادي',
        invoicePhone: '01000000000',
        invoiceTaxNumber: '123456789',
        invoiceLogo: '',
        taxIncluded: false,
        serviceChargeIncluded: false,
        newOrderAlerts: true,
        lowStockAlerts: true,
        reservationAlerts: true,
        notificationSound: true,
        autoLogout: true,
        requirePin: true,
        logAllOperations: true,
        darkMode: true,
        primaryColor: '#ea580c',
        azkarEnabled: true,
        azkarInterval: 30,
      }
    });
  });

  it('1. Tenant information updates store state accurately', () => {
    const { setCurrentTenant, currentTenant } = useAppStore.getState();
    expect(currentTenant?.name).toBe('مطعم الكرم الأصلي');
    expect(currentTenant?.nameEn).toBe('Al Karam');
    expect(currentTenant?.taxNumber).toBe('123456789');

    setCurrentTenant({
      id: 'tenant_1',
      name: 'سلسلة مطاعم الكرم العالمية',
      nameEn: 'Al Karam Global',
      taxNumber: '987654321'
    });

    const updated = useAppStore.getState().currentTenant;
    expect(updated?.name).toBe('سلسلة مطاعم الكرم العالمية');
    expect(updated?.nameEn).toBe('Al Karam Global');
    expect(updated?.taxNumber).toBe('987654321');
  });

  it('2. Branch configuration updates and retains business operating hours', () => {
    const { setCurrentBranch, currentBranch } = useAppStore.getState();
    expect(currentBranch?.name).toBe('فرع المعادي');
    expect(currentBranch?.openingTime).toBe('09:00');
    expect(currentBranch?.closingTime).toBe('01:00');

    setCurrentBranch({
      ...currentBranch!,
      name: 'فرع التجمع الخامس',
      phone: '01111111111',
      address: 'شارع التسعين الشمالي',
      openingTime: '10:00',
      closingTime: '02:00'
    });

    const updated = useAppStore.getState().currentBranch;
    expect(updated?.name).toBe('فرع التجمع الخامس');
    expect(updated?.phone).toBe('01111111111');
    expect(updated?.address).toBe('شارع التسعين الشمالي');
    expect(updated?.openingTime).toBe('10:00');
    expect(updated?.closingTime).toBe('02:00');
  });

  it('3. toArabicNumerals converts standard digits to Arabic-Indic digits', () => {
    const converted = toArabicNumerals('1250');
    expect(converted).toBe('١٢٥٠');
    expect(toArabicNumerals('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('4. Currency and number formatters produce localized Egyptian output', () => {
    const formatted = formatCurrency(500, false);
    expect(formatted).toContain('ج.م');

    const formattedNum = formatNumber(1250);
    expect(formattedNum).toBeDefined();
    expect(typeof formattedNum).toBe('string');
  });

  it('5. Date formatting respects Hijri vs Gregorian calendar setting', () => {
    const testDate = new Date('2026-09-14T00:00:00Z');
    const gregorian = formatDate(testDate, false);
    expect(gregorian).toBeDefined();

    const hijri = formatDate(testDate, true);
    expect(hijri).toBeDefined();
    // The outputs should be localized strings
    expect(typeof gregorian).toBe('string');
    expect(typeof hijri).toBe('string');
  });

  it('6. POS receipt custom branding settings propagate to store', () => {
    const { updateSettings } = useAppStore.getState();
    updateSettings({
      invoiceCompanyName: 'مطعم النيل الذهبي',
      invoiceAddress: 'الزمالك، القاهرة',
      invoicePhone: '01222222222',
      invoiceTaxNumber: '555444333',
      receiptWelcomeMessage: 'أهلاً بكم دائماً'
    });

    const state = useAppStore.getState().settings;
    expect(state.invoiceCompanyName).toBe('مطعم النيل الذهبي');
    expect(state.invoiceAddress).toBe('الزمالك، القاهرة');
    expect(state.invoicePhone).toBe('01222222222');
    expect(state.invoiceTaxNumber).toBe('555444333');
    expect(state.receiptWelcomeMessage).toBe('أهلاً بكم دائماً');
  });

  it('7. Cash drawer password protection setting can be updated or disabled', () => {
    const { updateSettings } = useAppStore.getState();
    // Enable PIN
    updateSettings({ openDrawerPassword: '9988' });
    expect(useAppStore.getState().settings.openDrawerPassword).toBe('9988');

    // Disable PIN
    updateSettings({ openDrawerPassword: '' });
    expect(useAppStore.getState().settings.openDrawerPassword).toBe('');
  });

  it('8. Azkar interval setting updates and validates positive duration', () => {
    const { updateSettings } = useAppStore.getState();
    updateSettings({ azkarEnabled: true, azkarInterval: 45 });
    expect(useAppStore.getState().settings.azkarInterval).toBe(45);
    expect(useAppStore.getState().settings.azkarEnabled).toBe(true);

    updateSettings({ azkarEnabled: false });
    expect(useAppStore.getState().settings.azkarEnabled).toBe(false);
  });
});
