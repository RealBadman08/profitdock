import { Link, useLocation } from "wouter";
import {
    BarChart3,
    Settings,
    LogOut,
    User,
    ScanSearch,
} from "lucide-react";
import { IconTrader, IconBot, IconReports, IconCashier, DerivLogo, IconDashboard, IconChart, IconTutorials } from "@/components/DerivIcons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export default function Sidebar() {
    const [location] = useLocation();
    const { logout } = useAuth();

    // OsamTradingHub Navigation Structure
    const navItems = [
        { label: "Free Bots", path: "/free-bots", icon: IconBot },
        { label: "Bot Settings", path: "/bot-settings", icon: Settings },
        { label: "Charts", path: "/charts", icon: BarChart3 },
        { label: "Dcircles", path: "/dcircles", icon: ScanSearch },
        { label: "Analysis", path: "/analysis", icon: BarChart3 },
        { label: "Tools", path: "/tools", icon: Settings },
        { label: "Copytrading", path: "/copytrading", icon: User },
        { label: "Strategy", path: "/strategy", icon: IconTrader },
        { label: "Signals", path: "/signals", icon: IconDashboard },
        { label: "Tutorials", path: "/tutorials", icon: IconTutorials },
    ];

    return (
        <div className="w-[240px] h-screen bg-[#151E2D] border-r border-[#2A3647] flex flex-col fixed left-0 top-0 z-40">
            <div className="h-16 flex items-center px-6 border-b border-[#2A3647] bg-[#0E1C2F]">
                <div className="mr-3">
                    <DerivLogo className="w-8 h-8" />
                </div>
                <span className="text-white font-bold text-lg">ProfitDock</span>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-3">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location === item.path;

                        return (
                            <Link key={item.label} href={item.path}>
                                <a className={cn(
                                    "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-[#1A2332] text-white border-l-4 border-[#00B981]"
                                        : "text-gray-400 hover:text-white hover:bg-[#1A2332]"
                                )}>
                                    <Icon className={cn("w-5 h-5", isActive ? "text-[#00B981]" : "text-gray-500")} />
                                    {item.label}
                                </a>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-[#2A3647] bg-[#0E1C2F]">
                <Link href="/settings">
                    <a className="flex items-center gap-3 px-3 py-3 text-gray-400 hover:text-white rounded-lg transition-colors">
                        <Settings className="w-5 h-5" />
                        <span className="text-sm font-medium">Settings</span>
                    </a>
                </Link>
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-3 text-red-400 hover:text-red-300 hover:bg-[#1A2332] rounded-lg transition-colors mt-1"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="text-sm font-medium">Log out</span>
                </button>
            </div>
        </div>
    );
}
