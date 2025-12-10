import { MessageCircle, Send, Music } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="bg-[#1A1A1A] border-t border-gray-800 py-8">
            <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* About */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">
                            <span className="text-cyan-400">PROFIT</span>
                            <span className="text-fuchsia-600">DOCK</span>
                        </h3>
                        <p className="text-gray-400 text-sm">
                            Professional Deriv Trading Platform with Advanced Bot Strategies & Analysis Tools
                        </p>
                        <p className="text-gray-500 text-xs mt-2">
                            Registered Deriv App ID: 114155
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Quick Links</h4>
                        <ul className="space-y-2">
                            <li>
                                <a href="/trading" className="text-gray-400 hover:text-[#C026D3] text-sm transition-colors">
                                    Live Trading
                                </a>
                            </li>
                            <li>
                                <a href="/bot" className="text-gray-400 hover:text-[#C026D3] text-sm transition-colors">
                                    Trading Bots
                                </a>
                            </li>
                            <li>
                                <a href="/analytics" className="text-gray-400 hover:text-[#C026D3] text-sm transition-colors">
                                    Analytics
                                </a>
                            </li>
                            <li>
                                <a href="/free-bots" className="text-gray-400 hover:text-[#C026D3] text-sm transition-colors">
                                    Free Bot Templates
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Contact & Social */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Connect With Us</h4>
                        <div className="space-y-3">
                            {/* WhatsApp */}
                            <a
                                href="https://wa.me/254799371481"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 text-gray-400 hover:text-green-500 transition-colors group"
                            >
                                <div className="w-10 h-10 bg-[#2A2A2A] rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                                    <MessageCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">WhatsApp</p>
                                    <p className="text-xs">+254 799 371 481</p>
                                </div>
                            </a>

                            {/* Telegram */}
                            <a
                                href="https://t.me/DerivDigitMatch_King"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 text-gray-400 hover:text-blue-500 transition-colors group"
                            >
                                <div className="w-10 h-10 bg-[#2A2A2A] rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                    <Send className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Telegram</p>
                                    <p className="text-xs">@DerivDigitMatch_King</p>
                                </div>
                            </a>

                            {/* TikTok */}
                            <a
                                href="https://www.tiktok.com/@natobotcx5"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 text-gray-400 hover:text-pink-500 transition-colors group"
                            >
                                <div className="w-10 h-10 bg-[#2A2A2A] rounded-lg flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                                    <Music className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">TikTok</p>
                                    <p className="text-xs">@natobotcx5</p>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                    <p className="text-gray-500 text-sm">
                        © {new Date().getFullYear()} ProfitDock. All rights reserved. | Third-party Deriv Trading Application
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                        Trading derivatives carries a high level of risk. Trade responsibly.
                    </p>
                </div>
            </div>
        </footer>
    );
}
