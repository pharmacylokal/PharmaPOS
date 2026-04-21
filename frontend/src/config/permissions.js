// Permission configuration for PharmaPOS
// Groups with their permissions and inheritance rules

export const PERMISSION_GROUPS = [
  {
    id: 'inventory',
    name: 'Inventory',
    icon: 'package',
    adminOnly: false,
    permissions: [
      { id: 'inventory_view', name: 'View products', description: 'View product list and details' },
      { id: 'inventory_add', name: 'Add products', description: 'Add new products to inventory' },
      { id: 'inventory_edit', name: 'Edit products', description: 'Edit existing products' },
      { id: 'inventory_delete', name: 'Delete products', description: 'Remove products from inventory' },
    ],
    inherits: ['inventory_view'],
  },
  {
    id: 'sales',
    name: 'Sales / POS',
    icon: 'shopping-cart',
    adminOnly: false,
    permissions: [
      { id: 'sales_pos', name: 'Process sales', description: 'Complete sales transactions' },
      { id: 'sales_returns', name: 'Process returns', description: 'Handle product returns' },
      { id: 'sales_discount', name: 'Apply discounts', description: 'Apply discounts to sales' },
    ],
    inherits: [],
  },
  {
    id: 'batches',
    name: 'Batches',
    icon: 'layers',
    adminOnly: false,
    permissions: [
      { id: 'batches_view', name: 'View batches', description: 'View batch information' },
      { id: 'batches_manage', name: 'Manage batches', description: 'Create and edit batches' },
    ],
    inherits: ['batches_view'],
  },
  {
    id: 'reports',
    name: 'Reports',
    icon: 'bar-chart',
    adminOnly: false,
    permissions: [
      { id: 'reports_access', name: 'Access reports', description: 'View and generate reports' },
      { id: 'reports_export', name: 'Export data', description: 'Export reports to CSV/PDF' },
    ],
    inherits: [],
  },
  {
    id: 'users',
    name: 'Users',
    icon: 'users',
    adminOnly: true,
    permissions: [
      { id: 'users_view', name: 'View users', description: 'View user list' },
      { id: 'users_manage', name: 'Manage users', description: 'Create, edit, and delete users' },
    ],
    inherits: ['users_view'],
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    adminOnly: true,
    permissions: [
      { id: 'settings_view', name: 'View settings', description: 'View system settings' },
      { id: 'settings_modify', name: 'Modify settings', description: 'Change system settings' },
    ],
    inherits: ['settings_view'],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(group =>
  group.permissions.map(p => p.id)
);

export function getAllPermissionIds(selectedPermissions) {
  const all = [...selectedPermissions];
  PERMISSION_GROUPS.forEach(group => {
    const hasGroupPermission = group.permissions.some(p => all.includes(p.id));
    if (hasGroupPermission && group.inherits) {
      group.inherits.forEach(inheritedId => {
        if (!all.includes(inheritedId)) {
          all.push(inheritedId);
        }
      });
    }
  });
  return all;
}

export default PERMISSION_GROUPS;