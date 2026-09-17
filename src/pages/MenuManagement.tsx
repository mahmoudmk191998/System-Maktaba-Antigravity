import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { 
  Search, Plus, Edit, Trash2, Clock, LayoutGrid, List,
  ChefHat, Eye, EyeOff, LayoutList, Layers, Grid2x2,
  UtensilsCrossed, Image as ImageIcon, CheckCircle2,
  Flame, Calendar, BadgeAlert, AlertCircle
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

import { useTenantBranch, useMenuCategories, useMenuItems, useRecipes, useInventoryItems, useUnits } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';

export default function MenuManagement() {
  const { tenantId } = useTenantBranch();
  const { categories, add: addCategory, update: updateCategory, remove: removeCategory } = useMenuCategories(tenantId);
  const { items: menuItems, add: addItem, update: updateItem, remove: removeItem } = useMenuItems(tenantId);
  const { recipes, add: addRecipe, update: updateRecipe, remove: removeRecipe } = useRecipes(tenantId);
  const { items: inventoryItems } = useInventoryItems(tenantId);
  const { units } = useUnits(tenantId);
  const { currency, number } = useFormatters();
  const { hasPermission } = useUserPermissions();

  const canCreateMenu = hasPermission('menu.create');
  const canEditMenu = hasPermission('menu.edit');
  const canDeleteMenu = hasPermission('menu.delete');
  const canToggleAvailability = hasPermission('menu.toggle_availability');
  const canViewRecipes = hasPermission('recipes.view');
  const canManageRecipes = hasPermission('recipes.manage');

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);

  // Form states and visibility
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState<any>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showEditCategory, setShowEditCategory] = useState<any>(null);
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [showEditRecipe, setShowEditRecipe] = useState<any>(null);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  // Default Item Form
  const initialItemForm = { 
    name: '', name_en: '', description: '', price: 0, cost: 0, category_id: '', 
    preparation_time: 15, calories: 0, allergens: '', image_url: '' 
  };
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [itemTab, setItemTab] = useState("basic");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Default Category Form
  const initialCatForm = { name: '', name_en: '', icon: '🍽️', sort_order: 0, color: 'bg-primary' };
  const [catForm, setCatForm] = useState(initialCatForm);

  // Default Recipe Form
  const initialRecipeForm = { name: '', menu_item_id: '', ingredients: [{ item_id: '', quantity: 0, unit_id: '' }] };
  const [recipeForm, setRecipeForm] = useState(initialRecipeForm);

  const colors = ["bg-primary", "bg-emerald-500", "bg-sky-500", "bg-purple-500", "bg-rose-500", "bg-amber-500", "bg-slate-700"];

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item: any) => {
      const qs = searchQuery.toLowerCase();
      const matchesSearch = item.name.toLowerCase().includes(qs) || item.name_en?.toLowerCase().includes(qs) || item.description?.toLowerCase().includes(qs);
      const matchesCategory = selectedCategory ? item.category_id === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  // Derived KPIs
  const totalItems = menuItems.length;
  const totalCategories = categories.length;
  const totalRecipes = recipes.length;
  const avgPrepTime = totalItems > 0 ? Math.round(menuItems.reduce((acc, i) => acc + (i.preparation_time || 0), 0) / totalItems) : 0;

  // Handlers for Items
  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name || !itemForm.price) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    
    const allergens = itemForm.allergens ? itemForm.allergens.split(',').map(a => a.trim()).filter(Boolean) : null;
    let image_url = itemForm.image_url;
    
    if (imageFile) {
      setUploading(true);
      const ext = imageFile.name.split('.').pop();
      const path = `menu-images/${tenantId}/${Date.now()}.${ext}`;
      try {
        const { storage } = await import('@/lib/firebase');
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, imageFile);
        image_url = await getDownloadURL(storageRef);
      } catch (e) {
        console.error('Upload Error:', e);
        toast.error('خطأ في رفع الصورة');
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    
    const success = await addItem({ 
      ...itemForm, 
      image_url: image_url || null, 
      allergens, 
      price: Number(itemForm.price), 
      cost: Number(itemForm.cost) || 0, 
      preparation_time: Number(itemForm.preparation_time), 
      calories: Number(itemForm.calories) || null, 
      category_id: itemForm.category_id || null 
    });
    
    if (success) { 
      setShowAddItem(false); 
      setItemForm(initialItemForm); 
      setImageFile(null);
      setImagePreview(null);
      setItemTab("basic");
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditItem) return;

    let image_url = showEditItem.image_url;
    if (imageFile) {
      setUploading(true);
      const ext = imageFile.name.split('.').pop();
      const path = `menu-images/${tenantId}/${Date.now()}.${ext}`;
      try {
        const { storage } = await import('@/lib/firebase');
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, imageFile);
        image_url = await getDownloadURL(storageRef);
      } catch (e) {
        console.error('Upload Error:', e);
        toast.error('خطأ في رفع الصورة');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const allergens = showEditItem.allergensStr ? showEditItem.allergensStr.split(',').map((a: string) => a.trim()).filter(Boolean) : null;
    await updateItem(showEditItem.id, { 
      name: showEditItem.name, 
      name_en: showEditItem.name_en, 
      description: showEditItem.description, 
      price: Number(showEditItem.price), 
      cost: Number(showEditItem.cost) || 0, 
      category_id: showEditItem.category_id || null, 
      preparation_time: Number(showEditItem.preparation_time), 
      calories: Number(showEditItem.calories) || null, 
      allergens, 
      is_available: showEditItem.is_available,
      image_url
    });
    setShowEditItem(null);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleBulkDeleteItems = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedItems.length} صنف؟`)) return;
    for (const id of selectedItems) {
      await removeItem(id);
    }
    setSelectedItems([]);
  };

  const handleBulkDeleteCategories = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedCategories.length} فئة؟`)) return;
    for (const id of selectedCategories) {
      await removeCategory(id);
    }
    setSelectedCategories([]);
  };

  const handleBulkDeleteRecipes = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedRecipes.length} وصفة؟`)) return;
    for (const id of selectedRecipes) {
      await removeRecipe(id);
    }
    setSelectedRecipes([]);
  };

  // Handlers for Categories
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name) { toast.error('يرجى إدخال اسم الفئة'); return; }
    // Saving color as icon fallback mechanism if DB doesn't support color column directly (can append to icon if strictly necessary, but assuming we can pass generic payload to categories)
    const payload: any = { name: catForm.name, name_en: catForm.name_en, icon: catForm.icon, sort_order: catForm.sort_order };
    // Try to pass color, if the db hook allows it
    try { payload.color = catForm.color; } catch(e) {}
    
    const success = await addCategory(payload);
    if (success) { setShowAddCategory(false); setCatForm(initialCatForm); }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditCategory) return;
    const payload: any = { name: showEditCategory.name, name_en: showEditCategory.name_en, icon: showEditCategory.icon, sort_order: showEditCategory.sort_order };
    try { payload.color = showEditCategory.color; } catch(e) {}
    await updateCategory(showEditCategory.id, payload);
    setShowEditCategory(null);
  };

  // Handlers for Recipes
  const handleAddRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeForm.name) { toast.error('يرجى إدخال اسم الوصفة'); return; }
    const validIngredients = recipeForm.ingredients.filter(i => i.item_id && i.quantity > 0);
    const success = await addRecipe(
      { name: recipeForm.name, menu_item_id: recipeForm.menu_item_id || null },
      validIngredients.map(i => ({ item_id: i.item_id, quantity: Number(i.quantity), unit_id: i.unit_id || null }))
    );
    if (success) { setShowAddRecipe(false); setRecipeForm(initialRecipeForm); }
  };

  const handleUpdateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditRecipe || !showEditRecipe.name) { toast.error('يرجى إدخال اسم الوصفة'); return; }
    const validIngredients = showEditRecipe.ingredients.filter((i: any) => i.item_id && i.quantity > 0);
    const success = await updateRecipe(
      showEditRecipe.id,
      { name: showEditRecipe.name, menu_item_id: showEditRecipe.menu_item_id || null },
      validIngredients.map((i: any) => ({ item_id: i.item_id, quantity: Number(i.quantity), unit_id: i.unit_id || null }))
    );
    if (success) { setShowEditRecipe(null); }
  };

  return (
    <MainLayout title="المنيو والوصفات" subtitle="إدارة شاملة لأصناف البيع وفئات المنيو وتكويد الوصفات"
      actions={canCreateMenu && <Button onClick={() => setShowAddItem(true)} className="gap-2 shadow-sm"><Plus className="w-4 h-4"/>إضافة صنف جديد</Button>}>
      
      {/* KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-primary/5 border-primary/20">
           <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                 <UtensilsCrossed className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-sm font-medium text-muted-foreground mb-1">أصناف المنيو</p>
                 <p className="text-2xl font-bold">{number(totalItems)}</p>
              </div>
           </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
           <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-info/10 text-info flex items-center justify-center">
                 <Layers className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-sm font-medium text-muted-foreground mb-1">Фئات القائمة</p>
                 <p className="text-2xl font-bold text-info">{number(totalCategories)}</p>
              </div>
           </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
           <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/10 text-warning flex items-center justify-center">
                 <ChefHat className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-sm font-medium text-muted-foreground mb-1">الوصفات المكتملة</p>
                 <p className="text-2xl font-bold text-warning">{number(totalRecipes)}</p>
              </div>
           </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
           <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center">
                 <Clock className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-sm font-medium text-muted-foreground mb-1">متوسط وقت التحضير</p>
                 <p className="text-2xl font-bold text-success">{avgPrepTime} <span className="text-sm font-medium">دقيقة</span></p>
              </div>
           </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items" className="space-y-6">
        <TabsList className="mb-2 h-12 bg-card border shadow-sm px-2">
          <TabsTrigger value="items" className="text-base px-6 h-9 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md">الأصناف المتاحة</TabsTrigger>
          <TabsTrigger value="categories" className="text-base px-6 h-9 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md">إدارة الفئات</TabsTrigger>
          {canViewRecipes && <TabsTrigger value="recipes" className="text-base px-6 h-9 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600 rounded-md">وصفات التحضير</TabsTrigger>}
        </TabsList>

        {/* --- ITEMS TAB --- */}
        <TabsContent value="items" className="space-y-6">
          <Card className="border-t-4 border-t-primary shadow-sm border-0">
             <CardHeader className="bg-card border-b pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div>
                     <CardTitle className="text-xl flex items-center gap-2"><LayoutList className="w-5 h-5 text-primary"/> سجل أصناف البيع</CardTitle>
                   </div>
                   <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                      {selectedItems.length > 0 && (
                        <Button onClick={handleBulkDeleteItems} variant="destructive" className="gap-2 shrink-0 md:mr-auto">
                          <Trash2 className="w-4 h-4" />
                          حذف ({selectedItems.length})
                        </Button>
                      )}
                      <div className="relative w-full sm:w-64">
                         <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                         <Input placeholder="البحث باسم الصنف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 h-10 w-full bg-background" />
                      </div>
                      <div className="flex items-center gap-1 border bg-muted/20 rounded-lg p-1 shrink-0">
                        <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}><Grid2x2 className="w-4 h-4" /></Button>
                        <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}><List className="w-4 h-4" /></Button>
                      </div>
                   </div>
                </div>
                {/* Categories Filter Strip */}
                <div className="flex gap-2 pt-4 overflow-x-auto pb-1 scrollbar-hide">
                  <Button variant={selectedCategory === null ? 'default' : 'outline'} size="sm" className="rounded-full shrink-0" onClick={() => setSelectedCategory(null)}>
                     الكل <Badge variant="secondary" className="ml-2 font-mono text-[10px] py-0">{totalItems}</Badge>
                  </Button>
                  {categories.map((cat: any) => {
                     const count = menuItems.filter((i: any) => i.category_id === cat.id).length;
                     const bgColor = selectedCategory === cat.id ? (cat.color || 'bg-primary') : 'border';
                     return (
                        <Button key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} size="sm" 
                                className={cn("rounded-full shrink-0 gap-2 transition-all", selectedCategory === cat.id ? bgColor : "")} 
                                onClick={() => setSelectedCategory(cat.id)}>
                           <span>{cat.icon}</span> {cat.name}
                           <Badge variant={selectedCategory === cat.id ? 'secondary' : 'outline'} className="ml-1 font-mono text-[10px] py-0">{count}</Badge>
                        </Button>
                     );
                  })}
                </div>
             </CardHeader>
             
             <CardContent className={viewMode === 'list' ? 'p-0' : 'p-6'}>
               {filteredItems.length === 0 ? (
                  <div className="text-center py-20 bg-muted/10 rounded-xl m-4 border-dashed border-2">
                     <UtensilsCrossed className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                     <p className="text-lg font-medium">لا يوجد أصناف متطابقة</p>
                     <p className="text-sm text-muted-foreground mb-4">جرب تغيير فلتر البحث أو أضف صنف جديد.</p>
                  </div>
               ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                   <AnimatePresence>
                     {filteredItems.map((item: any, index: number) => {
                       const cat = categories.find((c: any) => c.id === item.category_id);
                       return (
                        <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }}>
                          <Card className={cn('overflow-hidden hover:shadow-lg transition-all group border-0 shadow ring-1 ring-border', !item.is_available && 'opacity-60 grayscale')}>
                            {/* Image Header */}
                            <div className="h-40 bg-muted/50 relative overflow-hidden flex items-center justify-center">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                              ) : (
                                <div className="text-6xl group-hover:scale-125 transition-transform duration-300">{cat?.icon || '🍽️'}</div>
                              )}
                              
                              <div className="absolute top-2 right-2 flex flex-col gap-1">
                                {!item.is_available && <Badge variant="destructive" className="shadow-md">غير متاح</Badge>}
                                {item.allergens && item.allergens.length > 0 && <Badge variant="outline" className="bg-background/90 text-amber-600 border-amber-500 shadow-md p-1 px-2" title="مسببات حساسية"><AlertCircle className="w-3 h-3 ml-1 fill-amber-100"/>تنبيه</Badge>}
                              </div>
                              <div className="absolute bottom-2 right-2 flex flex-col gap-1 items-end">
                                <Badge className="bg-background/90 text-foreground font-bold border shadow-sm backdrop-blur-sm text-sm">
                                   {currency(Number(item.price))}
                                </Badge>
                              </div>
                              <div className="absolute top-2 left-2" onClick={e => e.stopPropagation()}>
                                <Checkbox 
                                  className="bg-white/90 data-[state=checked]:bg-primary rounded-sm shadow-sm border-white/50"
                                  checked={selectedItems.includes(item.id)}
                                  onCheckedChange={(c) => {
                                    if (c) setSelectedItems(prev => [...prev, item.id]);
                                    else setSelectedItems(prev => prev.filter(id => id !== item.id));
                                  }}
                                />
                              </div>
                            </div>
                            
                            <CardContent className="p-4 bg-card">
                              <h3 className="font-bold text-base truncate" title={item.name}>{item.name}</h3>
                              {item.name_en ? <p className="text-xs text-muted-foreground truncate font-mono" title={item.name_en}>{item.name_en}</p> : <div className="h-4"></div>}
                              
                              <div className="flex justify-between items-center mt-4">
                                <span className="flex items-center text-xs font-medium bg-muted px-2 py-1 rounded-md text-muted-foreground gap-1"><Clock className="w-3.5 h-3.5" />{item.preparation_time || 15}د</span>
                                {item.calories > 0 && <span className="flex items-center text-xs font-medium text-orange-500 bg-orange-50 px-2 py-1 rounded-md gap-1"><Flame className="w-3 h-3" />{item.calories}</span>}
                              </div>
                            </CardContent>
                            
                            {/* Hover Actions Bar */}
                            <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
                               <Switch checked={item.is_available !== false} disabled={!canToggleAvailability} onCheckedChange={(checked) => updateItem(item.id, { is_available: checked })} className="data-[state=checked]:bg-success scale-90"/>
                               <div className="flex items-center gap-1">
                                 {canEditMenu && <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-100/50" onClick={() => {
                                   setShowEditItem({ ...item, allergensStr: item.allergens?.join(', ') || '' });
                                   setImagePreview(item.image_url || null);
                                   setItemTab('basic');
                                 }}><Edit className="w-4 h-4" /></Button>}
                                 {canDeleteMenu && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeItem(item.id)}><Trash2 className="w-4 h-4" /></Button>}
                               </div>
                            </div>
                          </Card>
                        </motion.div>
                       )
                     })}
                   </AnimatePresence>
                  </div>
               ) : (
                  <div className="overflow-x-auto">
                    <Table>
                       <TableHeader className="bg-muted/30">
                          <TableRow>
                             <TableHead className="w-[40px] px-4">
                                <Checkbox
                                  checked={filteredItems.length > 0 && selectedItems.length === filteredItems.length}
                                  onCheckedChange={(c) => {
                                    if (c) setSelectedItems(filteredItems.map(item => item.id));
                                    else setSelectedItems([]);
                                  }}
                                />
                              </TableHead>
                             <TableHead className="w-16">الصورة</TableHead>
                             <TableHead>الصنف</TableHead>
                             <TableHead>الفئة</TableHead>
                             <TableHead className="text-center">السعر</TableHead>
                             <TableHead className="text-center">وقت التحضير</TableHead>
                             <TableHead className="text-center">الإتاحة</TableHead>
                             <TableHead className="text-center w-[120px]">الإجراءات</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                         {filteredItems.map((item: any) => {
                            const cat = categories.find((c: any) => c.id === item.category_id);
                            return (
                               <TableRow key={item.id} className={cn(!item.is_available && 'opacity-60 bg-muted/30')}>
                                  <TableCell className="px-4">
                                     <div onClick={e => e.stopPropagation()}>
                                       <Checkbox 
                                         checked={selectedItems.includes(item.id)}
                                         onCheckedChange={(c) => {
                                           if (c) setSelectedItems(prev => [...prev, item.id]);
                                           else setSelectedItems(prev => prev.filter(id => id !== item.id));
                                         }}
                                       />
                                     </div>
                                   </TableCell>
                                  <TableCell>
                                     <div className="w-12 h-12 rounded-lg bg-muted border flex items-center justify-center text-xl overflow-hidden shadow-sm">
                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : cat?.icon || '🍽️'}
                                     </div>
                                  </TableCell>
                                  <TableCell>
                                     <p className="font-bold leading-tight">{item.name}</p>
                                     {item.name_en && <p className="text-xs text-muted-foreground font-mono">{item.name_en}</p>}
                                  </TableCell>
                                  <TableCell>
                                     <Badge variant="outline" className={cn('px-2 py-0.5', cat?.color)}>{cat?.icon} {cat?.name}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center font-bold text-primary font-mono">{currency(Number(item.price))}</TableCell>
                                  <TableCell className="text-center">
                                     <span className="flex items-center justify-center text-sm font-medium gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5"/>{item.preparation_time} د</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Switch checked={item.is_available !== false} disabled={!canToggleAvailability} onCheckedChange={(checked) => updateItem(item.id, { is_available: checked })} className="data-[state=checked]:bg-success scale-90"/>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {canEditMenu && <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => {
                                        setShowEditItem({ ...item, allergensStr: item.allergens?.join(', ') || '' });
                                        setImagePreview(item.image_url || null);
                                        setItemTab('basic');
                                      }}><Edit className="w-4 h-4" /></Button>}
                                      {canDeleteMenu && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeItem(item.id)}><Trash2 className="w-4 h-4" /></Button>}
                                    </div>
                                  </TableCell>
                               </TableRow>
                            )
                         })}
                       </TableBody>
                    </Table>
                  </div>
               )}
             </CardContent>
          </Card>
        </TabsContent>

        {/* --- CATEGORIES TAB --- */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex gap-2 items-center">
            {categories.length > 0 && (
              <div className="flex items-center gap-2 px-3 border rounded-md bg-background h-10">
                <Checkbox
                  checked={selectedCategories.length === categories.length}
                  onCheckedChange={(c) => {
                    if (c) setSelectedCategories(categories.map((cat: any) => cat.id));
                    else setSelectedCategories([]);
                  }}
                />
                <span className="text-sm font-medium">الكل</span>
              </div>
            )}
            {selectedCategories.length > 0 && (
              <Button onClick={handleBulkDeleteCategories} variant="destructive" className="gap-2 shrink-0">
                <Trash2 className="w-4 h-4" />
                حذف ({selectedCategories.length})
              </Button>
            )}
            {canCreateMenu && <div className="flex justify-end flex-1"><Button className="gap-2 shadow-sm" onClick={() => setShowAddCategory(true)}><Plus className="w-4 h-4" />تصنيف فئة جديدة</Button></div>}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {categories.map((cat: any, index: number) => {
              const itemsCount = menuItems.filter((i: any) => i.category_id === cat.id).length;
              return (
                <motion.div key={cat.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.05 }}>
                  <Card className="hover:border-primary/50 transition-all shadow-sm border-0 ring-1 ring-border group relative">
                    <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        className="bg-white/90 data-[state=checked]:bg-primary rounded-sm shadow-sm border-muted"
                        checked={selectedCategories.includes(cat.id)}
                        onCheckedChange={(c) => {
                          if (c) setSelectedCategories(prev => [...prev, cat.id]);
                          else setSelectedCategories(prev => prev.filter(id => id !== cat.id));
                        }}
                      />
                    </div>
                    <div className={cn("h-2 w-full rounded-t-lg", cat.color || 'bg-primary')}></div>
                    <CardContent className="p-6 text-center relative">
                      <div className="text-6xl mb-4 transform group-hover:scale-110 transition-transform">{cat.icon}</div>
                      <h3 className="font-bold text-lg leading-tight">{cat.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 mb-4 font-mono">{cat.name_en || '---'}</p>
                      
                      <div className="flex justify-between items-center text-sm mb-4 bg-muted/40 p-2 rounded-lg">
                         <span className="text-muted-foreground font-medium">أصناف القائمة</span>
                         <Badge variant="secondary" className="font-mono text-base bg-background border">{itemsCount}</Badge>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-2 border-t border-dashed">
                        {canEditMenu && <Button variant="ghost" size="sm" className="flex-1 text-blue-600 hover:bg-blue-50" onClick={() => setShowEditCategory({ ...cat })}><Edit className="w-4 h-4 ml-1" />تعديل</Button>}
                        {canDeleteMenu && <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:bg-destructive/10" onClick={() => removeCategory(cat.id)}><Trash2 className="w-4 h-4 ml-1" />حذف</Button>}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* --- RECIPES TAB --- */}
        {canViewRecipes && (
          <TabsContent value="recipes" className="space-y-4">
            <Card className="border-t-4 border-t-amber-500 shadow-sm border-0">
               <CardHeader className="bg-card border-b pb-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                     <div>
                       <CardTitle className="text-xl flex items-center gap-2"><ChefHat className="w-6 h-6 text-amber-500"/> دفتر الوصفات (Recipes Book)</CardTitle>
                       <CardDescription>اربط المقادير بعناصر المخزون لتحقيق رقابة آلية ومتقدمة للتكاليف</CardDescription>
                     </div>
                     <div className="flex gap-2 items-center">
                       {recipes.length > 0 && (
                         <div className="flex items-center gap-2 px-3 border rounded-md bg-background h-10">
                           <Checkbox
                             checked={selectedRecipes.length === recipes.length}
                             onCheckedChange={(c) => {
                               if (c) setSelectedRecipes(recipes.map((r: any) => r.id));
                               else setSelectedRecipes([]);
                             }}
                           />
                           <span className="text-sm font-medium">الكل</span>
                         </div>
                       )}
                       {selectedRecipes.length > 0 && (
                         <Button onClick={handleBulkDeleteRecipes} variant="destructive" className="gap-2 shrink-0 md:mr-auto">
                           <Trash2 className="w-4 h-4" />
                           حذف ({selectedRecipes.length})
                         </Button>
                       )}
                       {canManageRecipes && <Button onClick={() => setShowAddRecipe(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"><Plus className="w-4 h-4"/>وصفة جديدة</Button>}
                     </div>
                  </div>
               </CardHeader>
               <CardContent className="p-6 bg-card/50">
                   {recipes.length === 0 ? (
                     <div className="text-center py-20 bg-background border border-dashed rounded-xl m-4">
                        <ChefHat className="w-16 h-16 text-muted-foreground opacity-20 mx-auto mb-4" />
                        <p className="text-lg font-bold mb-1">دفتر الوصفات فارغ</p>
                        <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">احسب تكلفة كل صنف وراقب مخزونك بدقة من خلال بناء وتكويد وصفات لأطباقك.</p>
                        {canManageRecipes && <Button onClick={() => setShowAddRecipe(true)} variant="outline" className="border-amber-500 text-amber-700">دشن وصفتك الأولى</Button>}
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                       {recipes.map((recipe: any) => {
                          const linkedItem = menuItems.find((m: any) => m.id === recipe.menu_item_id);
                          const totalRecipeCost = recipe.recipe_ingredients?.reduce((sum: number, ing: any) => {
                             const cost = Number(ing.inventory_items?.cost_per_unit || 0);
                             return sum + (cost * Number(ing.quantity || 0));
                          }, 0) || 0;
                          return (
                          <Card key={recipe.id} className={cn("overflow-hidden border transition-all shadow-sm relative", expandedRecipeId === recipe.id ? "ring-2 ring-amber-500" : "hover:border-amber-500/50")}>
                            <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                className="bg-white/90 data-[state=checked]:bg-primary rounded-sm shadow-sm border-muted"
                                checked={selectedRecipes.includes(recipe.id)}
                                onCheckedChange={(c) => {
                                  if (c) setSelectedRecipes(prev => [...prev, recipe.id]);
                                  else setSelectedRecipes(prev => prev.filter(id => id !== recipe.id));
                                }}
                              />
                            </div>
                            {/* Card Header for Recipe */}
                            <div className="bg-gradient-to-l from-amber-500/10 to-transparent p-5 pb-4 border-b relative">
                              <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 shrink-0 shadow-inner">
                                  {linkedItem?.image_url ? <img src={linkedItem.image_url} className="w-full h-full object-cover rounded-2xl" /> : <ChefHat className="w-7 h-7" />}
                                </div>
                                <div className="flex-1 pt-1">
                                  <h3 className="font-bold text-lg leading-tight mb-1">{recipe.name}</h3>
                                  {linkedItem && <Badge variant="outline" className="bg-background text-xs px-2 py-0 border-primary cursor-default text-primary">مرتبط: {linkedItem.name}</Badge>}
                                </div>
                              </div>
                            </div>

                            <CardContent className="p-0 flex flex-col">
                              {/* Quick Stats */}
                              <div className="flex items-center justify-between p-4 bg-background">
                                 <div className="flex flex-col items-center flex-1 border-l">
                                    <span className="text-xl font-bold font-mono">{recipe.recipe_ingredients?.length || 0}</span>
                                    <span className="text-xs text-muted-foreground">مكونات</span>
                                 </div>
                                 <div className="flex flex-col items-center flex-1 border-l">
                                    <span className="text-lg font-bold font-mono text-amber-700">{currency(totalRecipeCost)}</span>
                                    <span className="text-xs text-muted-foreground">التكلفة</span>
                                 </div>
                                 <div className="flex-1 flex justify-center px-2 gap-1 content-center">
                                    <Button variant={expandedRecipeId===recipe.id?"secondary":"outline"} size="sm" className="w-full text-xs font-medium bg-muted/50" onClick={() => setExpandedRecipeId(expandedRecipeId === recipe.id ? null : recipe.id)}>
                                       {expandedRecipeId === recipe.id ? "طيّ التفاصيل" : "قراءة المقادير"}
                                    </Button>
                                 </div>
                              </div>

                              {/* Ingredients Expander */}
                              <AnimatePresence>
                                {expandedRecipeId === recipe.id && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-amber-50/50 border-t">
                                    <div className="p-4 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                                      {recipe.recipe_ingredients && recipe.recipe_ingredients.length > 0 ? (
                                        recipe.recipe_ingredients.map((ing: any, i: number) => {
                                          const unit = units.find((u: any) => u.id === ing.unit_id);
                                          const unitName = unit ? unit.abbreviation : '';
                                          return (
                                            <div key={i} className="flex items-center justify-between text-sm bg-background/80 border p-2.5 rounded-lg shadow-sm">
                                              <span className="font-semibold text-primary/80 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-500" /> {ing.inventory_items?.name || 'مكون غير محدد'}</span>
                                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 font-mono font-bold text-[13px]">{ing.quantity} {unitName}</Badge>
                                            </div>
                                          );
                                        })
                                      ) : <p className="text-sm text-center py-5 text-muted-foreground/60 font-medium">الوصفة فارغة</p>}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Footer Actions */}
                              {canManageRecipes && (
                                 <div className="p-3 border-t bg-muted/20 flex gap-2">
                                    <Button variant="ghost" size="sm" className="flex-1 text-blue-600 bg-background border shadow-sm hover:border-blue-300" onClick={() => setShowEditRecipe({ ...recipe, ingredients: recipe.recipe_ingredients?.length ? recipe.recipe_ingredients : [{ item_id: '', quantity: 0, unit_id: '' }] })}>
                                       <Edit className="w-4 h-4 ml-2" /> تعديل الوصفة
                                    </Button>
                                    <Button variant="ghost" size="icon" className="w-10 bg-background border shadow-sm text-destructive hover:bg-destructive/10" onClick={() => removeRecipe(recipe.id)}>
                                       <Trash2 className="w-4 h-4" />
                                    </Button>
                                 </div>
                              )}
                            </CardContent>
                          </Card>
                       )})}
                     </div>
                   )}
               </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>


      {/* ==== SMART TABS FORM FOR ITEM ADD/EDIT ==== */}
      <Dialog open={showAddItem || !!showEditItem} onOpenChange={(open) => {
         if (!open) { setShowAddItem(false); setShowEditItem(null); setItemTab("basic"); }
      }}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl p-0 overflow-hidden bg-muted/10 max-h-[90dvh]">
          <form onSubmit={showEditItem ? handleUpdateItem : handleAddItem} className="flex flex-col h-[85vh] sm:h-[75vh]">
             {/* Header */}
             <div className="px-6 py-4 bg-background border-b flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  {showEditItem ? <Edit className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}
               </div>
               <div>
                  <DialogTitle className="text-xl font-bold">{showEditItem ? 'تحديث صنف منيو' : 'بناء صنف جديد'}</DialogTitle>
                  <DialogDescription>املأ بيانات الصنف بدقة وتفصيل من خلال التبويبات التالية</DialogDescription>
               </div>
             </div>

             {/* Tab Links */}
             <div className="px-6 bg-background border-b pt-2">
                <Tabs value={itemTab} onValueChange={setItemTab} className="w-full">
                   <TabsList className="w-full h-auto flex flex-wrap bg-transparent justify-start gap-6 px-1">
                      <TabsTrigger value="basic" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 pb-3 pt-1 text-base">البيانات الأساسية</TabsTrigger>
                      <TabsTrigger value="prices" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 pb-3 pt-1 text-base">التسعير والتحضير</TabsTrigger>
                      <TabsTrigger value="extra" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 pb-3 pt-1 text-base">صورة وحساسية</TabsTrigger>
                   </TabsList>
                </Tabs>
             </div>

             {/* Tab Content Area */}
             <div className="flex-1 overflow-y-auto p-6 bg-background">
                <Tabs value={itemTab} className="w-full h-full">
                   
                   <TabsContent value="basic" className="m-0 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                         <div className="space-y-2">
                            <Label>اسم الصنف (بالعربية) <span className="text-destructive">*</span></Label>
                            <Input placeholder="مثال: برجر لحم دبل" required value={showEditItem ? showEditItem.name : itemForm.name} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, name: e.target.value})) : setItemForm(f=>({...f, name: e.target.value}))} className="bg-muted/30 font-bold text-lg h-12" />
                         </div>
                         <div className="space-y-2">
                            <Label className="font-mono">Item Name (English)</Label>
                            <Input placeholder="e.g. Double Beef Burger" value={showEditItem ? showEditItem.name_en : itemForm.name_en} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, name_en: e.target.value})) : setItemForm(f=>({...f, name_en: e.target.value}))} dir="ltr" className="bg-muted/30 font-mono h-12" />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <Label>فئة العرض في المنيو <span className="text-destructive">*</span></Label>
                         <Select value={showEditItem ? (showEditItem.category_id || '') : itemForm.category_id} onValueChange={v => showEditItem ? setShowEditItem((s:any)=>({...s, category_id: v})) : setItemForm(f=>({...f, category_id: v}))} required>
                           <SelectTrigger className="h-12 bg-muted/30 focus:ring-primary shadow-sm">
                             <SelectValue placeholder="-- اختر الفئة التي سيندرج تحتها الصنف --" />
                           </SelectTrigger>
                           <SelectContent>
                              {categories.map((c: any) => <SelectItem key={c.id} value={c.id}><div className="flex items-center gap-2 text-base"><span className="text-lg">{c.icon}</span> {c.name}</div></SelectItem>)}
                           </SelectContent>
                         </Select>
                      </div>
                      <div className="space-y-2">
                         <Label>الوصف الترويجي</Label>
                         <Textarea placeholder="شرح مغري عن مكونات وطعم الطبق لعرضه في تطبيق العملاء والإيصالات..." rows={4} value={showEditItem ? showEditItem.description : itemForm.description} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, description: e.target.value})) : setItemForm(f=>({...f, description: e.target.value}))} className="bg-muted/30 resize-none text-base leading-relaxed" />
                      </div>
                      <div className="flex justify-end pt-4"><Button type="button" onClick={() => setItemTab("prices")} className="px-8">التالي: خطة التسعير</Button></div>
                   </TabsContent>

                   <TabsContent value="prices" className="m-0 space-y-6">
                      <div className="bg-primary/5 p-5 border border-primary/20 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                         <div className="space-y-2">
                            <Label className="text-primary font-bold text-lg">سعر البيع النهائي <span className="text-destructive">*</span></Label>
                            <div className="relative">
                               <Input type="number" min={0} step={0.01} required value={showEditItem ? showEditItem.price : itemForm.price} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, price: Number(e.target.value)})) : setItemForm(f=>({...f, price: Number(e.target.value)}))} className="pl-12 text-2xl h-14 font-mono text-center font-bold" />
                               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold">$</span>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <Label className="text-muted-foreground font-bold text-lg">تكلفة المواد (Cost)</Label>
                            <div className="relative">
                               <Input type="number" min={0} step={0.01} value={showEditItem ? showEditItem.cost : itemForm.cost} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, cost: Number(e.target.value)})) : setItemForm(f=>({...f, cost: Number(e.target.value)}))} className="text-xl h-14 font-mono text-center font-bold bg-muted/50 border-dashed" />
                            </div>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 border-t pt-6">
                         <div className="space-y-3">
                            <Label className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/> وقت التحضير (Standard)</Label>
                            <div className="flex items-center gap-3">
                               <Input type="number" min={1} value={showEditItem ? showEditItem.preparation_time : itemForm.preparation_time} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, preparation_time: Number(e.target.value)})) : setItemForm(f=>({...f, preparation_time: Number(e.target.value)}))} className="w-24 text-center font-mono h-11" />
                               <span className="text-muted-foreground font-medium">دقيقة</span>
                            </div>
                         </div>
                         <div className="space-y-3">
                            <Label className="flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> السعرات الحرارية</Label>
                            <div className="flex items-center gap-3">
                               <Input type="number" min={0} value={showEditItem ? showEditItem.calories : itemForm.calories} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, calories: Number(e.target.value)})) : setItemForm(f=>({...f, calories: Number(e.target.value)}))} className="w-32 text-center font-mono h-11 border-orange-200 focus-visible:ring-orange-500" />
                               <span className="text-muted-foreground font-medium">Kcal</span>
                            </div>
                         </div>
                      </div>
                      
                      <div className="flex justify-between pt-4 mt-8">
                         <Button type="button" variant="outline" onClick={() => setItemTab("basic")}>رجوع للبيانات</Button>
                         <Button type="button" onClick={() => setItemTab("extra")} className="px-8">الخطوة الأخيرة المظهر</Button>
                      </div>
                   </TabsContent>

                   <TabsContent value="extra" className="m-0 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                         <div className="space-y-4">
                            <Label className="text-base flex items-center gap-2"><ImageIcon className="w-5 h-5"/> صورة العرض الرئيسية</Label>
                            
                            <label className="group relative w-full aspect-square md:aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-muted/20 hover:bg-muted/50 hover:border-primary/50 transition-colors">
                               <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
                               {imagePreview ? (
                                  <>
                                    <img src={imagePreview} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                       <p className="text-white font-bold flex items-center gap-2"><Edit className="w-5 h-5"/> تغيير الصورة</p>
                                    </div>
                                  </>
                               ) : (
                                  <div className="text-center p-6 flex flex-col items-center">
                                     <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4"><ImageIcon className="w-8 h-8"/></div>
                                     <p className="font-semibold text-lg">ارفع صورة للصنف</p>
                                     <p className="text-sm text-muted-foreground mt-2 font-mono">PNG, JPG up to 2MB</p>
                                  </div>
                               )}
                            </label>

                            <div className="space-y-2">
                               <Label className="text-sm text-muted-foreground">أو ضع رابط الصورة مباشرة (URL)</Label>
                               <Input 
                                 placeholder="https://example.com/image.jpg" 
                                 dir="ltr"
                                 className="font-mono text-sm bg-muted/30"
                                 value={showEditItem ? (showEditItem.image_url || '') : itemForm.image_url}
                                 onChange={(e) => {
                                    const val = e.target.value;
                                    if (showEditItem) {
                                       setShowEditItem((s:any)=>({...s, image_url: val}));
                                    } else {
                                       setItemForm(f=>({...f, image_url: val}));
                                    }
                                    if (!imageFile && val.trim() !== '') {
                                       setImagePreview(val);
                                    } else if (!imageFile && val.trim() === '') {
                                       setImagePreview(null);
                                    }
                                 }}
                               />
                            </div>
                         </div>

                         <div className="space-y-6">
                            <div className="space-y-3 bg-red-50 p-5 rounded-xl border border-red-100 relative overflow-hidden">
                               <BadgeAlert className="absolute -left-4 top-1/2 -translate-y-1/2 w-24 h-24 text-red-500/10 rotate-12" />
                               <Label className="text-red-700 text-base flex items-center gap-2 relative z-10"><AlertCircle className="w-5 h-5"/> مسببات الحساسية</Label>
                               <Textarea value={showEditItem ? showEditItem.allergensStr : itemForm.allergens} onChange={e => showEditItem ? setShowEditItem((s:any)=>({...s, allergensStr: e.target.value})) : setItemForm(f=>({...f, allergens: e.target.value}))} placeholder="أمثلة: حليب، لوز، جلوتين، بيض... الخ" rows={3} className="bg-white resize-none shadow-inner border-red-200 focus-visible:ring-red-400 relative z-10" />
                               <p className="text-xs text-red-600/80 relative z-10">استخدم (الفاصلة) للفصل بين الكلمات إن وجدت.</p>
                            </div>
                            
                            {showEditItem && canToggleAvailability && (
                               <Card className="shadow-none border-dashed bg-transparent">
                                  <CardContent className="p-4 flex items-center justify-between">
                                     <Label className="text-base cursor-pointer" htmlFor="item-avail">الصنف متاح للطلب حالياً؟</Label>
                                     <Switch id="item-avail" checked={showEditItem.is_available !== false} onCheckedChange={(c) => setShowEditItem((s:any)=>({...s, is_available: c}))} className="data-[state=checked]:bg-success scale-110"/>
                                  </CardContent>
                               </Card>
                            )}
                         </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t mt-auto">
                         <Button type="button" variant="outline" onClick={() => setItemTab("prices")}>رجوع للتسعير</Button>
                         <Button type="submit" disabled={uploading || (!itemForm.name && !showEditItem?.name)} className="px-10 gap-2 h-12 text-lg">
                           {uploading ? 'جاري رفع الملفات...' : <><CheckCircle2 className="w-5 h-5"/> {showEditItem ? 'حفظ التحديثات' : 'تسجيل الصنف وإدراجه'}</>}
                         </Button>
                      </div>
                   </TabsContent>
                </Tabs>
             </div>
          </form>
        </DialogContent>
      </Dialog>


      {/* ADD/EDIT CATEGORY DIALOG */}
      <Dialog open={showAddCategory || !!showEditCategory} onOpenChange={(open) => {
         if (!open) { setShowAddCategory(false); setShowEditCategory(null); }
      }}>
         <DialogContent className="max-w-[95vw] sm:max-w-[425px] max-h-[90dvh] overflow-y-auto">
            <form onSubmit={showEditCategory ? handleUpdateCategory : handleAddCategory}>
               <DialogHeader className="border-b pb-4 mb-4">
                  <DialogTitle className="text-xl">{showEditCategory ? 'تحديث فئة قائمة' : 'بناء فئة جديدة للمنيو'}</DialogTitle>
               </DialogHeader>
               
               <div className="space-y-5 -mt-2 mb-2">
                  <div className="space-y-2">
                     <Label>اسم الفئة <span className="text-destructive">*</span></Label>
                     <Input required placeholder="مثال: مشروبات ساخنة" value={showEditCategory ? showEditCategory.name : catForm.name} onChange={e => showEditCategory ? setShowEditCategory({...showEditCategory, name: e.target.value}) : setCatForm({...catForm, name: e.target.value})} className="h-11 font-bold text-lg text-center" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label>رمز الإيموجي للمجال</Label>
                        <Input placeholder="☕" value={showEditCategory ? showEditCategory.icon : catForm.icon} onChange={e => showEditCategory ? setShowEditCategory({...showEditCategory, icon: e.target.value}) : setCatForm({...catForm, icon: e.target.value})} className="h-11 text-2xl text-center font-mono" />
                     </div>
                     <div className="space-y-2">
                        <Label>ترتيب العرض (1 أولاً)</Label>
                        <Input type="number" min={0} value={showEditCategory ? showEditCategory.sort_order : catForm.sort_order} onChange={e => showEditCategory ? setShowEditCategory({...showEditCategory, sort_order: Number(e.target.value)}) : setCatForm({...catForm, sort_order: Number(e.target.value)})} className="h-11 text-center font-mono" />
                     </div>
                  </div>

                  <div className="space-y-3 pt-2">
                     <Label>اللون المميز (للعرض والإيصالات)</Label>
                     <div className="flex flex-wrap gap-3 mt-1 justify-center p-3 border rounded-xl bg-muted/10">
                        {colors.map(colorClass => (
                           <button 
                             key={colorClass} 
                             type="button" 
                             className={cn("w-10 h-10 rounded-full cursor-pointer transition-all border-2 border-transparent scale-100 hover:scale-110", colorClass, 
                               showEditCategory 
                                 ? (showEditCategory.color === colorClass && "ring-2 ring-primary ring-offset-2 scale-110") 
                                 : (catForm.color === colorClass && "ring-2 ring-primary ring-offset-2 scale-110")
                             )}
                             onClick={() => showEditCategory ? setShowEditCategory({...showEditCategory, color: colorClass}) : setCatForm({...catForm, color: colorClass})}
                           />
                        ))}
                     </div>
                  </div>
               </div>

               <DialogFooter className="mt-6 border-t pt-4">
                  <Button type="button" variant="ghost" onClick={() => { setShowAddCategory(false); setShowEditCategory(null); }}>إلغاء الأمر</Button>
                  <Button type="submit" className="px-8 shadow-sm">حفظ الفئة</Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>

      {/* ADD/EDIT RECIPE DIALOG */}
      <Dialog open={showAddRecipe || !!showEditRecipe} onOpenChange={(open) => {
         if (!open) { setShowAddRecipe(false); setShowEditRecipe(null); }
      }}>
         <DialogContent className="max-w-[95vw] sm:max-w-[700px] bg-amber-50/50 max-h-[90dvh] overflow-y-auto">
            <form onSubmit={showEditRecipe ? handleUpdateRecipe : handleAddRecipe}>
               <DialogHeader className="border-b pb-4 mb-4">
                  <DialogTitle className="text-xl flex items-center gap-2 text-amber-800"><ChefHat className="w-5 h-5"/> {showEditRecipe ? 'تعديل مقادير الوصفة' : 'صياغة وصفة جديدة'}</DialogTitle>
               </DialogHeader>
               
               <div className="space-y-6 -mt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label>اسم الوصفة <span className="text-destructive">*</span></Label>
                        <Input required placeholder="مثال: خلطة برجر الدجاج" value={showEditRecipe ? showEditRecipe.name : recipeForm.name} onChange={e => showEditRecipe ? setShowEditRecipe({...showEditRecipe, name: e.target.value}) : setRecipeForm({...recipeForm, name: e.target.value})} className="h-11 font-bold text-lg" />
                     </div>
                     <div className="space-y-2">
                        <Label>صلة الصنف (اختياري)</Label>
                        <Select value={showEditRecipe ? (showEditRecipe.menu_item_id || 'none') : (recipeForm.menu_item_id || 'none')} onValueChange={v => {
                           const val = v === 'none' ? '' : v;
                           showEditRecipe ? setShowEditRecipe({...showEditRecipe, menu_item_id: val}) : setRecipeForm({...recipeForm, menu_item_id: val})
                        }}>
                           <SelectTrigger className="h-11 bg-background">
                              <SelectValue placeholder="اربط الوصفة بصنف..." />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="none">بدون ارتباط</SelectItem>
                              {menuItems.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                           </SelectContent>
                        </Select>
                     </div>
                  </div>

                  <div className="space-y-3 pt-2">
                     <Label className="flex justify-between items-center bg-amber-100 p-2 rounded-md border border-amber-200">
                        <span className="text-amber-900 font-bold px-2">مكونات الوصفة (المقادير)</span>
                     </Label>
                     
                     <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                        {(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients).map((ing: any, index: number) => (
                           <div key={index} className="flex gap-2 items-center bg-background p-2 rounded-lg border shadow-sm">
                              <Select value={ing.item_id || 'none'} onValueChange={(val) => {
                                 const newList = [...(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients)];
                                 newList[index].item_id = val === 'none' ? '' : val;
                                 showEditRecipe ? setShowEditRecipe({...showEditRecipe, ingredients: newList}) : setRecipeForm({...recipeForm, ingredients: newList});
                              }}>
                                 <SelectTrigger className="flex-1 border-0 bg-muted/20 font-bold">
                                    <SelectValue placeholder="اختر عنصر من المخزون" />
                                 </SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value="none">-- اختر الصنف --</SelectItem>
                                    {inventoryItems.map((inv: any) => <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>)}
                                 </SelectContent>
                              </Select>

                              <Input type="number" min={0} step={0.01} placeholder="الكمية" value={ing.quantity || ''} className="w-24 text-center font-mono font-bold border-0 bg-muted/20" onChange={(e) => {
                                 const newList = [...(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients)];
                                 newList[index].quantity = Number(e.target.value);
                                 showEditRecipe ? setShowEditRecipe({...showEditRecipe, ingredients: newList}) : setRecipeForm({...recipeForm, ingredients: newList});
                              }} />

                              <Select value={ing.unit_id || 'none'} onValueChange={(val) => {
                                 const newList = [...(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients)];
                                 newList[index].unit_id = val === 'none' ? '' : val;
                                 showEditRecipe ? setShowEditRecipe({...showEditRecipe, ingredients: newList}) : setRecipeForm({...recipeForm, ingredients: newList});
                              }}>
                                 <SelectTrigger className="w-28 border-0 bg-muted/20 text-xs">
                                    <SelectValue placeholder="الوحدة" />
                                 </SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value="none">--</SelectItem>
                                    {units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                 </SelectContent>
                              </Select>

                              <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => {
                                 const newList = [...(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients)];
                                 newList.splice(index, 1);
                                 showEditRecipe ? setShowEditRecipe({...showEditRecipe, ingredients: newList}) : setRecipeForm({...recipeForm, ingredients: newList});
                              }}>
                                 <Trash2 className="w-4 h-4" />
                              </Button>
                           </div>
                        ))}
                     </div>

                     <Button type="button" variant="outline" className="w-full mt-2 border-dashed border-amber-300 text-amber-700 bg-amber-50/50 hover:bg-amber-100" onClick={() => {
                        const newList = [...(showEditRecipe ? showEditRecipe.ingredients : recipeForm.ingredients)];
                        newList.push({ item_id: '', quantity: 0, unit_id: '' });
                        showEditRecipe ? setShowEditRecipe({...showEditRecipe, ingredients: newList}) : setRecipeForm({...recipeForm, ingredients: newList});
                     }}>
                        <Plus className="w-4 h-4 mr-2" /> إدراج مكون إضافي
                     </Button>
                  </div>
               </div>

               <DialogFooter className="mt-6 border-t pt-4">
                  <Button type="button" variant="ghost" onClick={() => { setShowAddRecipe(false); setShowEditRecipe(null); }}>إلغاء</Button>
                  <Button type="submit" className="px-8 bg-amber-600 hover:bg-amber-700 text-white shadow-sm">حفظ الوصفة</Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
