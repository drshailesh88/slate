import { AppShell } from '@/components/shell/app-shell';
import { getSessionUser } from '@/lib/auth/session';

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  return (
    <AppShell user={{ name: user.name, plan: 'Free plan' }}>
      {children}
    </AppShell>
  );
}
