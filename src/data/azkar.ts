export interface Zikr {
  text: string;
  count?: number;
  category: 'general' | 'morning' | 'evening';
}

export const azkar: Zikr[] = [
  // General Azkar
  { text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", count: 1, category: "general" },
  { text: "سُبْحَانَ اللَّهِ الْعَظِيمِ", count: 1, category: "general" },
  { text: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ", count: 1, category: "general" },
  { text: "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ", count: 1, category: "general" },
  { text: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ", count: 1, category: "general" },
  { text: "الْحَمْدُ لِلَّهِ", count: 1, category: "general" },
  { text: "اللَّهُ أَكْبَرُ", count: 1, category: "general" },
  { text: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", count: 1, category: "general" },
  { text: "سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ", count: 1, category: "general" },
  { text: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ", count: 1, category: "general" },
  
  // Morning Azkar
  { text: "اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ", count: 1, category: "morning" },
  { text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", count: 1, category: "morning" },
  { text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", count: 1, category: "morning" },
  
  // Evening Azkar
  { text: "اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ", count: 1, category: "evening" },
  { text: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", count: 1, category: "evening" },
  { text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", count: 1, category: "evening" },
];

export const getRandomZikr = (includeTimeBased = true): Zikr => {
  const currentHour = new Date().getHours();
  // Morning roughly from 4 AM to 11 AM
  const isMorning = currentHour >= 4 && currentHour < 12;
  // Evening roughly from 3 PM to 8 PM
  const isEvening = currentHour >= 15 && currentHour < 21;

  let validAzkar = azkar.filter(z => z.category === 'general');

  if (includeTimeBased) {
    if (isMorning) validAzkar = [...validAzkar, ...azkar.filter(z => z.category === 'morning')];
    if (isEvening) validAzkar = [...validAzkar, ...azkar.filter(z => z.category === 'evening')];
  }

  const randomIndex = Math.floor(Math.random() * validAzkar.length);
  return validAzkar[randomIndex];
};
