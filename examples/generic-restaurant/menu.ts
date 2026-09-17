import { rms } from './rms-client.js';

export async function fetchRestaurantData() {
  const [settings, branches, menu, deliveryZones, offers] = await Promise.all([
    rms.getSettings(),
    rms.getBranches(),
    rms.getMenu(),
    rms.getDeliveryZones(),
    rms.getOffers(),
  ]);

  return {
    settings,
    branches,
    menu,
    deliveryZones,
    offers,
  };
}
