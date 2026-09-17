import { rmsClient } from './rms-client.js';

export async function fetchSushiBarMenu() {
  try {
    // 1. Fetch public settings
    const settings = await rmsClient.getSettings();
    console.log(`Restaurant: ${settings.name} (${settings.currency})`);

    // 2. Fetch branches
    const branches = await rmsClient.getBranches();
    console.log(`Active Branches: ${branches.map((b) => b.name).join(', ')}`);

    // 3. Fetch full catalog for default branch
    const menu = await rmsClient.getMenu();
    console.log(`Loaded ${menu.categories.length} categories and ${menu.products.length} products.`);

    return {
      settings,
      branches,
      categories: menu.categories,
      products: menu.products,
    };
  } catch (error) {
    console.error('Failed to load Sushi Bar menu:', error);
    throw error;
  }
}
