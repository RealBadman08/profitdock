import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Cashier() {
    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-white mb-6">Cashier</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-[#2A2A2A] border-gray-800 flex flex-col items-center text-center p-6 h-full">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                        <ArrowDownCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Deposit</h2>
                    <p className="text-gray-400 text-sm mb-6 flex-1">
                        Deposit funds into your account via bank transfer, credit card, or e-wallet.
                    </p>
                    <Button className="w-full bg-[#D600AA] hover:bg-[#A021B3]">Deposit Now</Button>
                </Card>

                <Card className="bg-[#2A2A2A] border-gray-800 flex flex-col items-center text-center p-6 h-full">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                        <ArrowUpCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Withdraw</h2>
                    <p className="text-gray-400 text-sm mb-6 flex-1">
                        Request a withdrawal of funds from your account.
                    </p>
                    <Button variant="outline" className="w-full border-gray-700 text-white hover:bg-[#333]">Withdraw</Button>
                </Card>

                <Card className="bg-[#2A2A2A] border-gray-800 flex flex-col items-center text-center p-6 h-full">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                        <RefreshCw className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Transfer</h2>
                    <p className="text-gray-400 text-sm mb-6 flex-1">
                        Transfer funds between your accounts.
                    </p>
                    <Button variant="outline" className="w-full border-gray-700 text-white hover:bg-[#333]">Transfer</Button>
                </Card>
            </div>
        </div>
    );
}
