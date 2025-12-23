import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, HelpCircle, Menu, ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { IconTrader, IconBot, IconReports, IconCashier } from "@/components/DerivIcons";

interface DerivHeaderProps {
    toggleSidebar?: () => void;
}

export default function DerivHeader({ toggleSidebar }: DerivHeaderProps) {
    const { isAuthenticated, currentAccount, balance, accounts, switchAccount, isDemo } = useAuth();
    const [location] = useLocation();

    const isBot = location.includes('bot');

    return (
        <header className="h-16 bg-[#151717] border-b border-[#333] flex items-center justify-between px-6 fixed top-0 right-0 left-0 lg:left-[240px] z-30 transition-all">
            {/* Left Section (Platform Switcher) */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="lg:hidden text-gray-400" onClick={toggleSidebar}>
                    <Menu className="w-6 h-6" />
                </Button>

                {/* Deriv-style Platform Switcher */}
                <div className="relative group">
                    <button className="flex items-center gap-2 hover:bg-[#262626] p-2 rounded transition-colors outline-none">
                        <div className="flex items-center gap-2">
                            {isBot ? <IconBot className="w-6 h-6 text-[#FF444F]" /> : <IconTrader className="w-6 h-6 text-[#FF444F]" />}
                            <h1 className="text-xl font-bold text-white max-sm:text-sm">{isBot ? 'DBot' : 'DTrader'}</h1>
                        </div>
                        <ChevronDown className="w-4 h-4 text-white group-hover:rotate-180 transition-transform" />
                    </button>

                    {/* Platform Dropdown Menu */}
                    <div className="absolute top-full left-0 mt-2 w-60 bg-[#151717] border border-[#333] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                        <div className="p-2">
                            <Link href="/trading">
                                <a className="flex items-center gap-3 p-3 hover:bg-[#262626] rounded-lg group/item">
                                    <IconTrader className="w-6 h-6 text-[#FF444F]" />
                                    <div>
                                        <div className="text-white font-bold group-hover/item:text-[#FF444F] transition-colors">DTrader</div>
                                        <div className="text-xs text-gray-400">Trade options & multipliers</div>
                                    </div>
                                </a>
                            </Link>
                            <Link href="/bot-builder">
                                <a className="flex items-center gap-3 p-3 hover:bg-[#262626] rounded-lg group/item">
                                    <IconBot className="w-6 h-6 text-[#FF444F]" />
                                    <div>
                                        <div className="text-white font-bold group-hover/item:text-[#FF444F] transition-colors">DBot</div>
                                        <div className="text-xs text-gray-400">Automate your trading</div>
                                    </div>
                                </a>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs (Desktop) */}
                <div className="hidden lg:flex items-center gap-6 ml-6 h-16">
                    <Link href={isBot ? "/bot-builder" : "/trading"}>
                        <a className={`h-full flex items-center border-b-2 px-2 font-medium transition-colors ${['/trading', '/bot-builder'].some(p => location === p) ? 'border-[#FF444F] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
                            {isBot ? 'Dashboard' : 'Trader'}
                        </a>
                    </Link>
                    <Link href="/reports">
                        <a className={`h-full flex items-center border-b-2 px-2 font-medium transition-colors ${location === '/reports' ? 'border-[#FF444F] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
                            Reports
                        </a>
                    </Link>
                    <Link href="/cashier">
                        <a className={`h-full flex items-center border-b-2 px-2 font-medium transition-colors ${location === '/cashier' ? 'border-[#FF444F] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
                            Cashier
                        </a>
                    </Link>
                </div>
            </div>

            {/* Right Section (Account Controls) */}
            <div className="flex items-center gap-4">
                {isAuthenticated && currentAccount ? (
                    <>
                        {/* Balance Display */}
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <span className="text-white font-bold text-lg">
                                {Number(balance || 0).toFixed(2)} <span className="text-sm font-normal text-white">USD</span>
                            </span>
                        </div>

                        {/* Account Switcher */}
                        <Select
                            value={currentAccount.loginid}
                            onValueChange={switchAccount}
                        >
                            <SelectTrigger className="w-[140px] bg-[#2A2A2A] border-[#333] text-white h-10 font-bold">
                                <SelectValue>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{isDemo ? 'Demo' : 'Real'}</span>
                                    </div>
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-[#2A2A2A] border-[#333]">
                                {accounts.map((acc) => (
                                    <SelectItem
                                        key={acc.loginid}
                                        value={acc.loginid}
                                        className="text-white focus:bg-[#333]"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{acc.is_virtual ? 'Demo' : 'Real'}</span>
                                            <span className="text-xs text-gray-500 ml-auto">{acc.loginid}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Action Buttons */}
                        <Button className="bg-[#FF444F] hover:bg-[#D43E47] text-white font-bold hidden sm:block">
                            Deposit
                        </Button>
                    </>
                ) : (
                    <Button className="bg-[#FF444F] hover:bg-[#D43E47] text-white font-bold" onClick={() => window.location.href = '/login'}>
                        Log In
                    </Button>
                )}

                {/* Utilities */}
                <div className="flex items-center gap-2 border-l border-[#333] pl-4 ml-2">
                    {/* TODO: Add utility icons */}
                    <Button variant="ghost" size="icon" className="text-white hover:bg-[#333]">
                        <Bell className="w-5 h-5" />
                    </Button>
                </div>
            </div>
        </header>
    );
}
