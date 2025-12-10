import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, TrendingUp, Bot, DollarSign, BarChart2, Activity, BookOpen, Users } from 'lucide-react';
import Footer from '@/components/Footer';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { isAuthenticated, currentAccount, balance, accounts, switchAccount, logout, isDemo } = useAuth();

  const navItems = [
    { path: '/trading', label: 'Trading', icon: TrendingUp },
    { path: '/bot', label: 'Bot', icon: Bot },
    { path: '/charts', label: 'Charts', icon: BarChart2 },
    { path: '/scanner', label: 'Scanner', icon: Activity },
    { path: '/journal', label: 'Journal', icon: BookOpen },
    { path: '/copy-trading', label: 'Copy Trading', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/">
              <a className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-[#D600AA] to-[#A021B3] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">P</span>
                </div>
                <span className="text-white font-bold text-xl">ProfitDock</span>
              </a>
            </Link>

            {/* Navigation */}
            {isAuthenticated && (
              <nav className="flex items-center space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.path;

                  return (
                    <Link key={item.path} href={item.path}>
                      <a
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive
                          ? 'bg-[#C026D3] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-[#3A3A3A]'
                          }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </a>
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Account Info */}
            <div className="flex items-center space-x-4">
              {isAuthenticated && currentAccount ? (
                <>
                  {/* Balance */}
                  <div className="bg-[#1A1A1A] px-4 py-2 rounded-lg flex items-center space-x-2">
                    <DollarSign className="w-5 h-5 text-[#C026D3]" />
                    <div>
                      <p className="text-xs text-gray-400">Balance</p>
                      <p className="text-white font-semibold">
                        {balance.toFixed(2)} {currentAccount.currency}
                      </p>
                    </div>
                  </div>

                  {/* Account Switcher */}
                  <Select
                    value={currentAccount.loginid}
                    onValueChange={switchAccount}
                  >
                    <SelectTrigger className="w-48 bg-[#1A1A1A] border-gray-700 text-white">
                      <SelectValue>
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-2 h-2 rounded-full ${isDemo ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                          />
                          <span>{isDemo ? 'Demo' : 'Real'} - {currentAccount.loginid}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-[#2A2A2A] border-gray-700">
                      {accounts.map((account) => (
                        <SelectItem
                          key={account.loginid}
                          value={account.loginid}
                          className="text-white hover:bg-[#3A3A3A]"
                        >
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-2 h-2 rounded-full ${account.is_virtual ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                            />
                            <span>
                              {account.is_virtual ? 'Demo' : 'Real'} - {account.loginid}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Logout */}
                  <Button
                    onClick={logout}
                    variant="outline"
                    className="border-gray-700 text-white hover:bg-[#3A3A3A]"
                  >
                    <LogOut className="w-5 h-5" />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer with Social Media */}
      <Footer />
    </div>
  );
}
