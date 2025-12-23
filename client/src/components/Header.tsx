import { Link, useLocation } from "wouter";
import { Bell, ChevronDown, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DerivLogo, IconReports, IconCashier, IconHub } from "./DerivIcons";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export default function Header() {
    const [location] = useLocation();
    const { isAuthenticated, currentAccount, displayBalance, isDemo } = useAuth();

    // Deriv compact header is exactly 48px
    const HEADER_HEIGHT = "h-[48px]";
    const BORDER_COLOR = "border-[#2A3647]";
    const BG_COLOR = "bg-[#0E1C2F]";

    return (
        <header className={`${HEADER_HEIGHT} ${BG_COLOR} border-b ${BORDER_COLOR} flex items-center justify-between px-4 z-50 sticky top-0 font-sans shadow-sm`}>
            {/* Left Section: Logo & Platform Switcher */}
            <div className="flex items-center gap-4 h-full">
                <div className="flex items-center gap-2 mr-2">
                    <Link href="/" className="flex items-center gap-2 group">
                        <DerivLogo className="w-6 h-6" />
                        <span className="text-white font-bold text-lg hidden md:block tracking-tight group-hover:text-gray-200 transition-colors">Deriv</span>
                    </Link>
                    {/* Platform Switcher Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="focus:outline-none">
                            <div className="hidden md:flex items-center gap-1 cursor-pointer hover:bg-[#151E2D] px-2 py-1 rounded transition-colors group">
                                <span className="text-[11px] font-bold text-white group-hover:text-gray-200 uppercase tracking-wide">
                                    {location.includes("bot") ? "DBot" : "DTrader"}
                                </span>
                                <ChevronDown className="w-3 h-3 text-white" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#151E2D] border-[#2A3647] text-white min-w-[200px] mt-1">
                            <Link href="/trading">
                                <DropdownMenuItem className="cursor-pointer hover:bg-[#1D2736] focus:bg-[#1D2736] py-3">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm">DTrader</span>
                                        <span className="text-xs text-gray-400">A whole new trading experience</span>
                                    </div>
                                </DropdownMenuItem>
                            </Link>
                            <Link href="/bot-builder">
                                <DropdownMenuItem className="cursor-pointer hover:bg-[#1D2736] focus:bg-[#1D2736] py-3">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm">DBot</span>
                                        <span className="text-xs text-gray-400">Automated trading at your fingertips</span>
                                    </div>
                                </DropdownMenuItem>
                            </Link>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Navigation Tabs - 1:1 Match */}
                <nav className="hidden lg:flex items-center h-full gap-6">
                    <Link href="/">
                        <a className={cn("text-[13px] font-bold transition-colors h-full flex items-center border-b-2 px-1",
                            location === "/" ? "text-white border-[#ff444f]" : "text-[#999999] border-transparent hover:text-white")}>
                            Trader's Hub
                        </a>
                    </Link>
                    <Link href="/reports">
                        <a className={cn("text-[13px] font-bold transition-colors h-full flex items-center border-b-2 px-1",
                            location === "/reports" ? "text-white border-[#ff444f]" : "text-[#999999] border-transparent hover:text-white")}>
                            Reports
                        </a>
                    </Link>
                    <Link href="/cashier">
                        <a className={cn("text-[13px] font-bold transition-colors h-full flex items-center border-b-2 px-1",
                            location === "/cashier" ? "text-white border-[#ff444f]" : "text-[#999999] border-transparent hover:text-white")}>
                            Cashier
                        </a>
                    </Link>
                </nav>
            </div>

            {/* Right Section: Balance & Profile */}
            <div className="flex items-center gap-2 h-full">
                {isAuthenticated ? (
                    <>
                        {/* Balance Dropdown - Compact */}
                        <div className="flex items-center bg-[#151E2D] hover:bg-[#1D2736] rounded-[4px] px-3 py-1 cursor-pointer border border-[#2A3647] transition-colors gap-2 h-8 mr-2">
                            <div className="flex flex-col items-end leading-none">
                                <span className="text-[13px] font-bold text-white">{displayBalance}</span>
                                <div className="flex items-center gap-1">
                                    <span className={cn("w-1.5 h-1.5 rounded-full", isDemo ? "bg-[#00a79e]" : "bg-[#ff444f]")}></span>
                                    <span className="text-[9px] text-[#999999] font-bold uppercase tracking-wider">{isDemo ? "Demo" : "Real"}</span>
                                </div>
                            </div>
                            <ChevronDown className="w-3 h-3 text-white" />
                        </div>

                        <Button className="h-8 bg-[#ff444f] hover:bg-[#eb343f] text-white font-bold text-[13px] px-4 rounded-[4px] shadow-none border-none">
                            Deposit
                        </Button>

                        <div className="relative cursor-pointer hover:bg-[#151E2D] w-8 h-8 flex items-center justify-center rounded-[4px] transition-colors">
                            <Bell className="w-4 h-4 text-white" />
                            <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-[#ff444f] rounded-full border border-[#0E1C2F]"></span>
                        </div>

                        <div className="w-8 h-8 rounded-full bg-[#f9f9f9] text-[#0E1C2F] flex items-center justify-center font-bold text-xs cursor-pointer border border-[#2A3647]">
                            {currentAccount?.loginid?.charAt(0) || "U"}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <Link href="/login">
                            <Button variant="ghost" className="text-white hover:text-white hover:bg-[#212424] h-8 text-xs font-bold">Log in</Button>
                        </Link>
                        <Button className="bg-[#ff444f] hover:bg-[#eb343f] text-white font-bold h-8 text-xs px-4 rounded-[4px]">Sign up</Button>
                    </div>
                )}
                <div className="cursor-pointer hover:bg-[#212424] p-2 rounded transition-colors md:hidden ml-1">
                    <Menu className="w-5 h-5 text-white" />
                </div>
            </div>
        </header>
    );
}
