import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useUserRole = () => {
  const [userRole, setUserRole] = useState<string>('user');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchUserRole = useCallback(async () => {
    if (!user) {
      setUserRole('user');
      setLoading(false);
      return;
    }

    try {
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching role from user_roles:', error);
        setUserRole('user');
      } else if (roleData) {
        setUserRole(roleData.role);
      } else {
        // No role found in DB — default to 'user' (never trust client metadata)
        setUserRole('user');
      }
    } catch (error) {
      console.error('Error in fetchUserRole:', error);
      setUserRole('user');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const refreshRole = useCallback(async () => {
    setLoading(true);
    await fetchUserRole();
  }, [fetchUserRole]);

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const canEdit = isAdmin || isManager;
  const canDelete = isAdmin;
  const canManageUsers = isAdmin;
  const canAccessSettings = isAdmin;

  return {
    userRole,
    isAdmin,
    isManager,
    canEdit,
    canDelete,
    canManageUsers,
    canAccessSettings,
    loading,
    refreshRole
  };
};
