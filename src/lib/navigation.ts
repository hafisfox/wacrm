const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/salon-control': 'Salon Control',
  '/inbox': 'Inbox',
  '/contacts': 'Customers',
  '/settings': 'Settings',
  '/system-health': 'System Health',
};

export function getDashboardPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'Dashboard';
}
