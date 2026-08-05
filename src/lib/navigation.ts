const pageTitles: Record<string, string> = {
  '/dashboard': 'Today',
  '/salon-control': 'Salon',
  '/inbox': 'Messages',
  '/contacts': 'Customers',
  '/settings': 'Settings',
};

export function getDashboardPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'Today';
}
