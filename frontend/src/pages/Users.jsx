import React, { useState, useEffect } from 'react';
import { UserPlus, Pencil, Trash2, X, AlertCircle, Package, ShoppingCart, Layers, BarChart2, Users as UsersIcon, Settings, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSION_GROUPS, getAllPermissionIds } from '../config/permissions';

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

function PermissionCheckbox({ permission, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-blue-50'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(permission.id, e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm {disabled ? 'text-gray-400' : 'text-gray-700'}">{permission.name}</span>
    </label>
  );
}

function PermissionGroup({ group, selectedPermissions, onPermissionChange, disabled }) {
  const [expanded, setExpanded] = useState(!disabled);

  const handleGroupToggle = (checked) => {
    // Toggle all permissions in the group
    group.permissions.forEach(p => {
      if (p.id !== group.inherits[0]) { // Don't auto-toggle inherited permission
        onPermissionChange(p.id, checked);
      }
    });
  };

  const isGroupChecked = group.permissions.some(p => selectedPermissions.includes(p.id));
  const isInherited = (permId) => {
    // Check if this permission is inherited from another
    return group.inherits.includes(permId) && 
           group.permissions.some(p => 
             selectedPermissions.includes(p.id) && p.id !== permId && group.inherits.includes(p.id)
           );
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${disabled ? 'bg-gray-50' : 'bg-white'}`}>
      <div 
        className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100'
        }`}
        onClick={() => !disabled && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {disabled && <Lock size={14} className="text-gray-400" />}
          <span className="font-medium text-sm">{group.name}</span>
          {isGroupChecked && !disabled && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {selectedPermissions.filter(p => group.permissions.some(gp => gp.id === p)).length} selected
            </span>
          )}
        </div>
        {!disabled && (
          expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
        )}
      </div>
      {expanded && (
        <div className="p-2 space-y-1">
          {group.permissions.map(permission => (
            <PermissionCheckbox
              key={permission.id}
              permission={permission}
              checked={selectedPermissions.includes(permission.id)}
              onChange={onPermissionChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Users() {
  const { user: currentUser, getAuthHeader } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ username: '', password: '', permissions: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  const baseUrl = localStorage.getItem('pharmapos_api_url') || 'http://localhost:3001';
  const isAdmin = currentUser?.role === 'admin';

  const fetchUsers = async () => {
    try {
      const headers = getAuthHeader();
      const response = await fetch(`${baseUrl}/auth/users`, { headers });
      const data = await response.json();
      if (response.ok) {
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setFormData({ username: '', password: '', permissions: [] });
    setEditingUser(null);
    setError('');
    setExpandedGroups({});
  };

  const openAddModal = () => {
    resetForm();
    // Expand all non-admin groups by default
    const groups = {};
    PERMISSION_GROUPS.forEach(g => { groups[g.id] = !g.adminOnly; });
    setExpandedGroups(groups);
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({ 
      username: user.username, 
      password: '', 
      permissions: user.permissions || [] 
    });
    // Expand groups with permissions
    const groups = {};
    PERMISSION_GROUPS.forEach(g => {
      const hasPerm = g.permissions.some(p => user.permissions?.includes(p.id));
      groups[g.id] = hasPerm || !g.adminOnly;
    });
    setExpandedGroups(groups);
    setShowModal(true);
  };

  const handlePermissionChange = (permissionId, checked) => {
    const newPermissions = [...formData.permissions];
    if (checked) {
      if (!newPermissions.includes(permissionId)) {
        newPermissions.push(permissionId);
      }
    } else {
      const index = newPermissions.indexOf(permissionId);
      if (index > -1) {
        newPermissions.splice(index, 1);
      }
    }
    setFormData({ ...formData, permissions: newPermissions });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.username) {
      setError('Username is required');
      return;
    }

    if (!editingUser && !formData.password) {
      setError('Password is required');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Validate at least one permission selected
    const allPerms = getAllPermissionIds(formData.permissions);
    if (allPerms.length === 0) {
      setError('Please select at least one permission');
      return;
    }

    try {
      const headers = { ...getAuthHeader(), 'Content-Type': 'application/json' };
      const url = editingUser 
        ? `${baseUrl}/auth/users/${editingUser.id}`
        : `${baseUrl}/auth/register`;
      const method = editingUser ? 'PUT' : 'POST';
      
      const body = editingUser
        ? { 
            username: formData.username, 
            permissions: allPerms,
            ...(formData.password && { password: formData.password })
          }
        : { 
            username: formData.username, 
            password: formData.password, 
            permissions: allPerms 
          };

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Operation failed');
        return;
      }

      setSuccess(editingUser ? 'User updated successfully!' : 'User created successfully!');
      fetchUsers();
      setTimeout(() => {
        setShowModal(false);
        resetForm();
      }, 1000);
    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  const handleDelete = async (user) => {
    try {
      const headers = getAuthHeader();
      const response = await fetch(`${baseUrl}/auth/users/${user.id}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        setSuccess('User deleted successfully!');
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete user');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
    setShowDeleteConfirm(null);
  };

  const getPermissionLabels = (permissions) => {
    if (!permissions || permissions.length === 0) return 'No permissions';
    const labels = [];
    if (permissions.includes('inventory_view')) labels.push('Inventory');
    if (permissions.includes('sales_pos')) labels.push('Sales');
    if (permissions.includes('batches_view')) labels.push('Batches');
    if (permissions.includes('reports_access')) labels.push('Reports');
    if (permissions.includes('users_manage')) labels.push('Users');
    if (permissions.includes('settings_modify')) labels.push('Settings');
    return labels.join(', ') || `${permissions.length} permissions`;
  };

  if (loading) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage system users and permissions</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <UserPlus size={18} />
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Username</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Permissions</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{user.username}</div>
                  {user.id === currentUser?.id && (
                    <span className="text-xs text-blue-600">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                    user.role === 'cashier' ? 'bg-green-100 text-green-700' : 
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {getPermissionLabels(user.permissions)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEditModal(user)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Pencil size={16} />
                  </button>
                  {user.id !== currentUser?.id && (
                    <button
                      onClick={() => setShowDeleteConfirm(user)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg ml-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="p-8 text-center text-gray-500">No users found</div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <h2 className="text-lg font-semibold">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Enter username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingUser && <span className="text-gray-400">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder={editingUser ? 'Enter new password' : 'Enter password (min 6 characters)'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                <p className="text-xs text-gray-500 mb-3">Select permissions for this user. Admin-only sections are locked.</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {PERMISSION_GROUPS.map(group => (
                    <PermissionGroup
                      key={group.id}
                      group={group}
                      selectedPermissions={formData.permissions}
                      onPermissionChange={handlePermissionChange}
                      disabled={group.adminOnly && !isAdmin}
                    />
                  ))}
                </div>
                {formData.permissions.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">No permissions selected. User will need at least one permission.</p>
                )}
              </div>

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-semibold mb-2">Delete User?</h3>
              <p className="text-gray-500 text-sm mb-6">
                Are you sure you want to delete <strong>{showDeleteConfirm.username}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}